#!/usr/bin/env node
/**
 * check-focus-ids.js — v1.5.8-dev.1
 *
 * Analisi statica dei riferimenti di navigazione col controller in
 * App.tsx: estrae ogni id dichiarato su un <Focusable> e ogni
 * riferimento dentro neighbors={{...}}/sequentialChain, e segnala i
 * riferimenti che puntano a un id mai dichiarato da nessuna parte.
 *
 * Non sostituisce un test dal vivo col controller — non sa se un id
 * ESISTE ma non è mai RAGGIUNGIBILE per un motivo di layout — ma
 * intercetta in automatico refusi, id rinominati, riferimenti
 * dimenticati: la stessa categoria di bug scovata più volte a mano in
 * questo progetto.
 *
 * Uso: node scripts/check-focus-ids.js [percorso/ad/App.tsx]
 * Default: src/App.tsx dalla cartella da cui viene lanciato.
 */

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2] || path.join(process.cwd(), 'src', 'App.tsx');
const source = fs.readFileSync(filePath, 'utf-8');

// ---------------------------------------------------------------------------
// Estrae il testo fra una posizione di apertura "{" (esclusa) e la "}" che
// la richiude, contando la profondità — necessario perché i template
// literal (`...${expr}...`) hanno graffe annidate che una singola regex
// non gestisce in modo affidabile.
// ---------------------------------------------------------------------------
function extractBalanced(text, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  return { text: text.slice(openIdx + 1, i - 1), endIdx: i };
}

// Normalizza un template literal `prefix-${expr}-suffix` in un pattern
// "prefix-*-suffix" con * al posto di ogni interpolazione — così un
// riferimento con una interpolazione diversa ma la stessa forma combacia.
function templateToPattern(tpl) {
  return tpl.replace(/\$\{[^}]*\}/g, '\u0000WILD\u0000');
}

function patternToRegex(pattern) {
  const escaped = pattern
    .split('\u0000WILD\u0000')
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + escaped + '$');
}

// ---------------------------------------------------------------------------
// Passata 1 — indicizza ogni "const NOME = <espressione>;" di primo
// livello, per poter risolvere id={variabile} / neighbors={{ down: variabile }}
// quando il valore non è scritto inline ma assegnato qualche riga prima
// (es. "const toggleId = `cloud-backup-toggle-${id}`;").
// ---------------------------------------------------------------------------
const constDeclRegex = /\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*/g;
const varInitializers = new Map(); // nome → { text, endIdx }
let m;
while ((m = constDeclRegex.exec(source))) {
  const name = m[1];
  const startIdx = constDeclRegex.lastIndex;
  // Prende il resto della riga come approssimazione dell'espressione —
  // sufficiente per i casi comuni (stringa, template literal, ternario
  // semplice su una riga). Espressioni multi-riga più complesse non
  // vengono risolte: restano segnalate come "non risolvibile
  // staticamente", non un errore.
  const lineEnd = source.indexOf('\n', startIdx);
  const expr = source.slice(startIdx, lineEnd === -1 ? undefined : lineEnd).replace(/;\s*$/, '');
  if (!varInitializers.has(name)) varInitializers.set(name, expr.trim());
}

// Estrae tutte le stringhe letterali e i pattern template da
// un'espressione (gestisce stringhe semplici, template literal,
// ternari a un livello: cond ? 'a' : 'b' / cond ? 'a' : undefined).
function extractPatternsFromExpr(expr, depth = 0) {
  const patterns = [];
  if (!expr || depth > 3) return patterns;
  expr = expr.trim();

  // Stringa fra apici singoli o doppi
  const strMatch = expr.match(/^['"]([^'"]*)['"]$/);
  if (strMatch) { patterns.push(strMatch[1]); return patterns; }

  // Template literal
  const tplMatch = expr.match(/^`([^`]*)`$/);
  if (tplMatch) { patterns.push(templateToPattern(tplMatch[1])); return patterns; }

  // undefined/null — non è un riferimento reale
  if (expr === 'undefined' || expr === 'null') return patterns;

  // Parentesi che avvolgono l'intera espressione (es. ternario annidato
  // fra parentesi) — le toglie e riprova, non è un caso a sé.
  if (expr.startsWith('(') && expr.endsWith(')')) {
    return extractPatternsFromExpr(expr.slice(1, -1), depth + 1);
  }

  // Ternario semplice: cond ? ramoA : ramoB
  const ternaryMatch = expr.match(/^.+?\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternaryMatch) {
    patterns.push(...extractPatternsFromExpr(ternaryMatch[1], depth + 1));
    patterns.push(...extractPatternsFromExpr(ternaryMatch[2], depth + 1));
    return patterns;
  }

  // Identificatore semplice — prova a risolverlo tramite le const
  // indicizzate sopra.
  const identMatch = expr.match(/^[A-Za-z_$][A-Za-z0-9_$.]*$/);
  if (identMatch && varInitializers.has(expr)) {
    return extractPatternsFromExpr(varInitializers.get(expr), depth + 1);
  }

  // Non risolvibile staticamente (espressione complessa, accesso a
  // proprietà dinamico, ecc.) — non è un errore, solo un limite di
  // questa analisi.
  return [{ unresolved: expr }];
}

// ---------------------------------------------------------------------------
// Passata 2 — dichiarazioni id="..." / id={...} su <Focusable>
// ---------------------------------------------------------------------------
const declaredPatterns = new Set();
const unresolvedDeclarations = [];

const idLiteralRegex = /\bid="([^"]+)"/g;
while ((m = idLiteralRegex.exec(source))) declaredPatterns.add(m[1]);

const idExprRegex = /\bid=\{/g;
while ((m = idExprRegex.exec(source))) {
  const { text } = extractBalanced(source, m.index + m[0].length - 1);
  const results = extractPatternsFromExpr(text);
  for (const r of results) {
    if (typeof r === 'string') declaredPatterns.add(r);
    else unresolvedDeclarations.push({ expr: r.unresolved, pos: m.index });
  }
}

// ---------------------------------------------------------------------------
// Passata 3 — riferimenti dentro neighbors={{...}} e sequentialChain
// ---------------------------------------------------------------------------
const references = []; // { key, expr, pos }

const neighborsRegex = /\bneighbors=\{\{/g;
while ((m = neighborsRegex.exec(source))) {
  const openBraceIdx = m.index + m[0].length - 1; // la seconda "{"
  const { text } = extractBalanced(source, openBraceIdx);
  const keyValRegex = /\b(up|down|left|right)\s*:\s*([^,]+?)(?=,\s*[a-z]+\s*:|\s*$)/g;
  let km;
  while ((km = keyValRegex.exec(text))) {
    references.push({ key: km[1], expr: km[2].trim(), pos: m.index });
  }
}

const chainUsage = new Map(); // nome catena → conteggio
// v1.5.9-dev.1 — scoperta reale investigando i 2 avvisi del giro
// precedente ("game-options-runner-bridge"/"game-options-retroarch-
// cores"): ENTRAMBI vivono dentro un .map() — a runtime la riga viene
// esguita una volta per elemento disponibile (runner/core), quindi può
// benissimo esserci più di un elemento con la stessa sequentialChain,
// anche se nel TESTO sorgente compare una sola volta. Un'analisi statica
// del solo testo non può sapere quante volte gira il ciclo (dipende da
// cosa l'utente ha installato). Euristica: se l'id del Focusable
// associato (cercato all'indietro entro una finestra ragionevole) usa un
// template literal con interpolazione (es. `game-runner-${runnerId}`),
// è quasi certamente dentro un ciclo — esclude dal controllo "usata una
// sola volta" invece di segnalare un falso allarme.
const loopExemptChains = new Set();
function looksLikeInsideLoop(declPos) {
  const windowStart = Math.max(0, declPos - 600);
  const before = source.slice(windowStart, declPos);
  const lastIdMatch = [...before.matchAll(/\bid=\{`[^`]*\$\{[^`]*`\}/g)].pop();
  return !!lastIdMatch;
}

const chainLiteralRegex = /\bsequentialChain="([^"]+)"/g;
while ((m = chainLiteralRegex.exec(source))) {
  chainUsage.set(m[1], (chainUsage.get(m[1]) ?? 0) + 1);
  if (looksLikeInsideLoop(m.index)) loopExemptChains.add(m[1]);
}
const chainExprRegex = /\bsequentialChain=\{/g;
while ((m = chainExprRegex.exec(source))) {
  const { text } = extractBalanced(source, m.index + m[0].length - 1);
  const resolved = extractPatternsFromExpr(text);
  for (const r of resolved) {
    if (typeof r === 'string') {
      chainUsage.set(r, (chainUsage.get(r) ?? 0) + 1);
      if (looksLikeInsideLoop(m.index)) loopExemptChains.add(r);
    }
  }
}

// ---------------------------------------------------------------------------
// Verifica: ogni riferimento deve combaciare con almeno un id dichiarato
// ---------------------------------------------------------------------------
const declaredRegexes = [...declaredPatterns].map(p => ({ pattern: p, re: patternToRegex(p) }));

function isDeclared(value) {
  return declaredRegexes.some(({ re }) => re.test(value));
}

const dangling = [];
const unresolvedRefs = [];

for (const ref of references) {
  const results = extractPatternsFromExpr(ref.expr);
  for (const r of results) {
    if (typeof r === 'string') {
      if (!isDeclared(r)) {
        const line = source.slice(0, ref.pos).split('\n').length;
        dangling.push({ key: ref.key, value: r, line });
      }
    } else {
      const line = source.slice(0, ref.pos).split('\n').length;
      unresolvedRefs.push({ key: ref.key, expr: r.unresolved, line });
    }
  }
}

// Catene con un solo utilizzo — una sequentialChain ha senso solo se
// condivisa da almeno 2 elementi (altrimenti non incatena nulla).
// Un pattern con parte variabile (es. `cloud-backup-row-${id}`) è per
// costruzione univoco per ogni istanza renderizzata (un provider, uno
// store, ecc.) — non ha senso richiedere "più di un utilizzo letterale"
// per questi: la ripetizione avviene a runtime, non nel testo sorgente.
// Il controllo "usata una sola volta" si applica solo a chi non ha
// alcuna parte variabile.
const singleUseChains = [...chainUsage.entries()]
  .filter(([name, count]) => count === 1 && !name.includes('\u0000WILD\u0000') && !loopExemptChains.has(name));

// ---------------------------------------------------------------------------
// Riepilogo
// ---------------------------------------------------------------------------
console.log(`\nAnalisi di navigazione: ${filePath}`);
console.log(`  id dichiarati (pattern unici): ${declaredPatterns.size}`);
console.log(`  riferimenti in neighbors: ${references.length}`);
console.log(`  catene sequentialChain distinte: ${chainUsage.size}\n`);

if (dangling.length > 0) {
  console.log(`❌ RIFERIMENTI A ID MAI DICHIARATI (${dangling.length}) — probabile bug di navigazione:`);
  for (const d of dangling) {
    console.log(`   riga ${d.line}: neighbors.${d.key} → "${d.value}" — nessun id dichiarato combacia`);
  }
  console.log('');
} else {
  console.log('✅ Nessun riferimento a id inesistenti trovato.\n');
}

if (singleUseChains.length > 0) {
  console.log(`⚠️  CATENE sequentialChain USATE UNA SOLA VOLTA (${singleUseChains.length}) — probabile refuso nel nome:`);
  for (const [name] of singleUseChains) {
    console.log(`   "${name}" — una sola occorrenza, una catena richiede almeno 2 elementi per avere effetto`);
  }
  console.log('');
}

if (unresolvedRefs.length > 0) {
  console.log(`ℹ️  Riferimenti non risolvibili staticamente (${unresolvedRefs.length}) — verifica manuale consigliata, non necessariamente un errore:`);
  for (const u of unresolvedRefs) {
    console.log(`   riga ${u.line}: neighbors.${u.key} → ${u.expr}`);
  }
  console.log('');
}

process.exit(dangling.length > 0 ? 1 : 0);

/**
 * wineRegistry.ts — v2.0.41-dev.4
 *
 * Parser minimale per i file .reg che Wine scrive dentro ogni prefix
 * (system.reg = HKEY_LOCAL_MACHINE, user.reg = HKEY_CURRENT_USER).
 * Formato VERIFICATO A MANO dall'utente su un prefix reale (Ubisoft
 * Connect, system.reg) prima di scrivere questo file — non un formato
 * assunto. Esempio reale:
 *
 *   [Software\\Wow6432Node\\Ubisoft\\Launcher\\Installs\\2688] 1786007968
 *   #time=1dd2584ae6ee920
 *   "InstallDir"="C:/Program Files (x86)/Ubisoft/Ubisoft Game Launcher/games/WATCH_DOGS2/"
 *   "Language"="it-IT"
 *
 * NON è lo stesso formato del parser VDF già esistente in steamPlugin.ts
 * (quello è per il KeyValue di Valve, a blocchi con parentesi graffe) —
 * qui le chiavi sono righe `[percorso] timestamp`, i valori righe
 * `"nome"="valore"`, un blocco finisce alla riga vuota o alla prossima
 * `[`. Percorsi e valori hanno backslash e virgolette con escape stile C
 * (`\\` e `\"`), stesso escaping già visto e gestito nel resto del
 * progetto per contenuti simili.
 *
 * Genereico e riusabile: qualunque launcher condiviso futuro (Fase B —
 * EA App, Battle.net, Rockstar Games Launcher) che tenga la propria
 * libreria nel registro invece che in un file di config a parte potrà
 * riusare questo stesso parser, non solo Ubisoft Connect.
 */
import { readFileSync, existsSync } from 'fs';

export interface WineRegKey {
  /** Percorso della chiave, backslash singoli (già "de-escaped" qui). */
  path: string;
  values: Record<string, string>;
}

function unescapeRegValue(raw: string): string {
  // v2.0.41-dev.17 — BUG REALE trovato con dati EA App: "Dead Space™ 2"
  // veniva scritto come "Dead Space\x2122 2" — \xHHHH è un escape
  // Unicode per caratteri fuori dall'ASCII stampabile (qui il simbolo
  // ™), diverso da \\ e \" e mai visto prima con i dati Ubisoft (nomi
  // tutti ASCII puro). Va risolto PRIMA di \\ /\": una sequenza \xHHHH
  // non contiene mai una coppia di backslash al suo interno, quindi
  // l'ordine è sicuro anche processando tutto in un solo passaggio.
  return raw
    .replace(/\\x([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\\/g, '\\')
    .replace(/\\"/g, '"');
}

/**
 * Parsa l'intero contenuto di un file .reg di Wine in un array di
 * chiavi con i relativi valori stringa. Solo valori REG_SZ (fra
 * virgolette) — dword/binary non servono per questo caso d'uso e non
 * vengono letti (nessuna riga corrispondente viene scartata con errore,
 * semplicemente ignorata: non fa parte dei dati che ci servono qui).
 */
export function parseWineReg(content: string): WineRegKey[] {
  const keys: WineRegKey[] = [];
  let current: WineRegKey | null = null;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line) { current = null; continue; } // riga vuota = fine blocco

    // Riga chiave: [percorso\con\backslash] timestamp_opzionale
    const keyMatch = line.match(/^\[(.+)\]\s*\d*$/);
    if (keyMatch) {
      current = { path: unescapeRegValue(keyMatch[1]), values: {} };
      keys.push(current);
      continue;
    }

    if (!current) continue;
    if (line.startsWith('#')) continue; // "#time=..." — metadato, non un valore

    // Riga valore: "nome"="valore con possibili \" e \\ escaped"
    const valMatch = line.match(/^"([^"]+)"="((?:[^"\\]|\\.)*)"$/);
    if (valMatch) {
      current.values[valMatch[1]] = unescapeRegValue(valMatch[2]);
    }
  }

  return keys;
}

/**
 * Legge e parsa un file .reg da disco. null se il file non esiste; se
 * esiste ma il parsing genera un'eccezione, il chiamante lo scopre dal
 * valore di ritorno `{ error }` invece che da un null indistinguibile
 * da "file assente" — v2.0.41-dev.5, bug reale: la versione precedente
 * inghiottiva silenziosamente qualunque eccezione di parsing, rendendo
 * impossibile distinguere "nessun file" da "file presente ma parsing
 * fallito" guardando i log (il chiamante vedeva solo un array vuoto in
 * entrambi i casi).
 */
export function readWineReg(filePath: string): WineRegKey[] | { error: string } | null {
  if (!existsSync(filePath)) return null;
  try {
    return parseWineReg(readFileSync(filePath, 'utf-8'));
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}

/**
 * Trova tutte le chiavi il cui percorso finisce con la sequenza di
 * segmenti richiesta (case-insensitive — Wine normalizza comunque i
 * nomi delle chiavi note in modo consistente, ma i valori dentro
 * possono variare). Confronto per SEGMENTI (split su `\`), non su
 * sottostringa grezza — evita falsi positivi tipo una chiave che
 * contiene "Installs" nel nome di un valore invece che nel path.
 */
export function findKeysEndingWith(keys: WineRegKey[], segments: string[]): WineRegKey[] {
  const wanted = segments.map(s => s.toLowerCase());
  return keys.filter(k => {
    const parts = k.path.split('\\').map(s => s.toLowerCase());
    if (parts.length < wanted.length) return false;
    const tail = parts.slice(parts.length - wanted.length);
    return tail.every((p, i) => p === wanted[i]);
  });
}

/** Ultimo segmento del percorso di una chiave (es. l'id prodotto in .../Installs/2688). */
export function lastPathSegment(key: WineRegKey): string {
  const parts = key.path.split('\\');
  return parts[parts.length - 1] ?? '';
}

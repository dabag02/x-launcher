import React from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Focusable, useFocus } from './FocusProvider';
import { Delete, Space, CornerDownLeft, ArrowBigUp, Languages, ClipboardPaste, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { Theme } from '../types';
import { InputManager } from '../input/InputManager';

// v1.1.16 — un suggerimento rapido può portare un breve commento
// contestuale (es. per i launch argument/le variabili d'ambiente più
// popolari: cosa abilita esattamente, non solo il valore grezzo).
// Facoltativo: i completamenti di default (.com, .exe, ecc.) non ne
// hanno bisogno.
export interface SuggestionItem {
  value: string;
  tip?: string;
  /**
   * Richiesta utente — per le shortcut il cui value effettivo è lungo/
   * tecnico (es. `--set-shader "/percorso/completo/shader.slangp"`),
   * un'etichetta breve da mostrare al posto del testo intero nel chip
   * della tastiera. Se assente, si mostra value com'è sempre stato —
   * questo campo non cambia nulla per le suggestion esistenti che non
   * lo impostano.
   */
  label?: string;
  // v1.1.16 — come inserire il valore nel campo: 'append' (default,
  // comportamento originale — completamenti come .exe/.com si accodano
  // al testo digitato), 'append-space' (per i launch argument: si
  // accodano separati da uno spazio, non incollati al flag precedente),
  // 'replace' (per le variabili d'ambiente: un campo rappresenta UNA
  // variabile alla volta, selezionarne una sostituisce l'intero valore
  // invece di concatenarla a quella precedente).
  insertMode?: 'append' | 'append-space' | 'replace';
}

interface VirtualKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  theme?: Theme;
  className?: string;
  // v1.1.16 — set alternativo di suggerimenti, mostrato al posto dei
  // completamenti di default SOLO quando Shift è attivo. undefined (o
  // array vuoto) → Shift si comporta come sempre (solo maiuscolo/
  // minuscolo), nessun cambiamento nei chip. Il contenuto dipende dal
  // contesto del campo in modifica (Launch Arguments vs Custom Env
  // Variables, quest'ultimo ulteriormente dipendente dal runner del
  // gioco) — calcolato dal chiamante (App.tsx), non qui: questo
  // componente non deve conoscere il concetto di "runner" o "campo di
  // gioco", resta un componente di tastiera generico.
  altSuggestions?: SuggestionItem[];
  // Notifica (per il riquadro fluttuante in App.tsx) quale tip mostrare
  // — quello del suggerimento attualmente a fuoco, o undefined se il
  // focus è altrove. Chiamato ad ogni cambio di focus, non solo alla
  // selezione: si vede il commento mentre si scorre con D-pad/stick,
  // prima ancora di premere A.
  onSuggestionFocus?: (tip: string | undefined) => void;
  // v1.5.20-dev.5 — richiesta utente: un cursore visibile nel campo,
  // spostabile, per correggere/cercare a metà stringa invece di poter
  // solo aggiungere in fondo o cancellare l'ultimo carattere. La
  // posizione vive qui (unico punto che la usa per inserire/cancellare
  // davvero), notificata al chiamante SOLO per disegnarla nel riquadro
  // fluttuante — stesso principio già usato per onSuggestionFocus sopra:
  // stato di visualizzazione, non parte del valore vero e proprio.
  onCursorChange?: (pos: number) => void;
}

/**
 * v0.99.90 — riscrittura del layout in due tempi.
 *
 * Primo giro: introdotti { normal, shifted } per tasto (prima '-'/'_'
 * erano fissi e non cambiavano con shift), due layout IT/EN-US completi,
 * chiocciola/slash/backslash. Risultato funzionalmente corretto ma
 * "pasticciato" nella forma: 4 righe di lettere + una quinta riga di
 * soli simboli + una sesta riga di controllo (shift/spazio/backspace/
 * fatto come 4 pulsanti identici) — un rettangolo irregolare, non lo
 * schema che ci si aspetta da una tastiera.
 *
 * Secondo giro (questo): schema tradizionale a 4 righe di tasti + barra
 * spaziatrice sotto, come una tastiera fisica compatta:
 *   Riga 1 — numeri, ⌫ Backspace in fondo a destra
 *   Riga 2 — QWERTYUIOP (+è per IT), / \ in fondo
 *   Riga 3 — ASDFGHJKL (+ò à per IT), ⏎ Invio in fondo a destra
 *            (Invio chiude la tastiera, come un vero tasto Invio che
 *            conferma — nessun pulsante "Fatto" separato, ridondante)
 *   Riga 4 — ⇧ Shift a sinistra, ZXCVBNM (+ù per IT), , . - @
 *   Riga 5 — solo barra spaziatrice, a tutta larghezza
 *
 * I simboli richiesti (- _ come coppia su un solo tasto, / \, @) restano
 * tutti presenti, solo redistribuiti dentro le 4 righe invece di vivere
 * in una riga a parte.
 */
type KeyDef = { normal: string; shifted: string };

const k = (normal: string, shifted?: string): KeyDef => ({ normal, shifted: shifted ?? normal });

type Layout = {
  id: 'it' | 'en';
  label: string;
  numbers: KeyDef[];                  // riga 1 (+ backspace, aggiunto a parte)
  row2: KeyDef[];                     // QWERTYUIOP (+ accenti IT) + / \
  row3: KeyDef[];                     // ASDFGHJKL (+ accenti IT) — invio aggiunto a parte
  row4: KeyDef[];                     // ZXCVBNM (+ accenti IT) + , . - @ — shift aggiunto a parte
};

const LAYOUT_IT: Layout = {
  id: 'it',
  label: 'ITA',
  numbers: [k('1','!'), k('2','"'), k('3','£'), k('4','$'), k('5','%'), k('6','&'), k('7','/'), k('8','('), k('9',')'), k('0','=')],
  row2: [k('Q'), k('W'), k('E'), k('R'), k('T'), k('Y'), k('U'), k('I'), k('O'), k('P'), k('è','É'), k('/'), k('\\')],
  row3: [k('A'), k('S'), k('D'), k('F'), k('G'), k('H'), k('J'), k('K'), k('L'), k('ò','Ò'), k('à','À')],
  // Richiesta utente — apostrofo mancante fra i caratteri speciali:
  // aggiunto qui, stesso posto degli altri simboli non-lettera di questa
  // riga (nessun tasto shiftato per lui, un solo carattere sempre uguale
  // come già "," e ".").
  row4: [k('Z'), k('X'), k('C'), k('V'), k('B'), k('N'), k('M'), k('ù','Ù'), k(','), k('.'), k('-','_'), k('@'), k("'")],
};

const LAYOUT_EN: Layout = {
  id: 'en',
  label: 'EN/US',
  numbers: [k('1','!'), k('2','@'), k('3','#'), k('4','$'), k('5','%'), k('6','^'), k('7','&'), k('8','*'), k('9','('), k('0',')')],
  row2: [k('Q'), k('W'), k('E'), k('R'), k('T'), k('Y'), k('U'), k('I'), k('O'), k('P'), k('/'), k('\\')],
  row3: [k('A'), k('S'), k('D'), k('F'), k('G'), k('H'), k('J'), k('K'), k('L')],
  row4: [k('Z'), k('X'), k('C'), k('V'), k('B'), k('N'), k('M'), k(','), k('.'), k('-','_'), k('@'), k("'")],
};

const LAYOUTS: Record<'it' | 'en', Layout> = { it: LAYOUT_IT, en: LAYOUT_EN };

// Persistenza minima della lingua scelta per la sessione corrente — modulo,
// non state locale del componente: la tastiera virtuale viene montata/
// smontata ad ogni apertura su un campo diverso, uno state locale
// resetterebbe la scelta di lingua ogni volta. Non serve persistenza
// lato server per una preferenza cosi minore — sopravvive per la
// sessione corrente (finché la pagina non viene ricaricata).
let lastLayoutId: 'it' | 'en' = 'it';

// v0.99.90 — chip di completamento rapido: stringhe intere inserite in
// un colpo solo invece di dover digitare ogni carattere, per le
// estensioni/domini più comuni quando si edita un path o un account.
const QUICK_SUGGESTIONS = ['.com', '.net', '.org', '.it', '.exe', '.ini', '.bak'];

const isLetter = (s: string) => /^[a-zà-ú]$/i.test(s);

// v0.99.90 — id condiviso tra rendering e mappa dei vicini: costruito una
// sola volta qui, non duplicato come stringa letterale in due punti
// diversi (rischio concreto di far divergere i due se uno viene
// modificato senza l'altro).
const keyId = (rowIndex: number, keyDef: KeyDef, i: number) => `key-${rowIndex}-${keyDef.normal}-${i}`;

type NeighborMap = Record<string, Partial<Record<'up' | 'down' | 'left' | 'right', string>>>;

/**
 * v0.99.90 — fix: la riga ASDFGHJKL (row3) risultava irraggiungibile in
 * qualunque direzione col controller nel layout italiano. Causa più
 * probabile: lo scoring geometrico di FocusProvider.moveFocus valuta la
 * distanza tra i CENTRI degli elementi su tutto il pool, e le tre righe
 * di lettere hanno lunghezze diverse tra loro (13/12/13 per l'italiano,
 * per via degli accenti e di Invio/Backspace/Shift che si aggiungono a
 * fianco) — una riga più corta, centrata, può finire per non essere mai
 * il candidato più vicino rispetto alla riga successiva quando la
 * geometria reale a schermo (misure che non posso verificare da qui)
 * produce un allineamento sfavorevole.
 *
 * Invece di continuare a rincorrere la causa esatta nello scoring
 * geometrico, costruiamo qui una mappa di vicini ESPLICITA e
 * deterministica per l'intera tastiera — lo stesso meccanismo già
 * previsto in FocusProvider proprio per questi casi (vedi il commento
 * su `neighbors` in moveFocus). Ogni tasto conosce il proprio vicino
 * per riga/colonna logica, indipendentemente da qualunque misura reale
 * a schermo: la navigabilità non dipende più dalla geometria.
 *
 * Il mapping riga-a-riga usa una proporzione (colonna equivalente nella
 * riga adiacente, che può avere una lunghezza diversa) invece di un
 * indice 1:1, cosi anche righe di lunghezza diversa restano allineate
 * in modo sensato invece di sfasarsi progressivamente verso un lato.
 *
 * v1.1.79 — richiesta utente: navigazione ciclica in entrambi gli assi,
 * non solo entro i confini. Da bordo a bordo opposto — sia in
 * orizzontale (fine riga → inizio stessa riga) sia in verticale (l'intera
 * tastiera come un unico ciclo, righe suggerimenti incluse in cima).
 */
function buildNeighborMap(rows: string[][]): NeighborMap {
  const map: NeighborMap = {};
  rows.forEach((row, rowIdx) => {
    row.forEach((id, colIdx) => {
      const n: NeighborMap[string] = {};
      // Richiesta utente — navigazione ciclica: dal bordo si riparte dal
      // lato opposto invece di restare "bloccati" o cadere nello scoring
      // geometrico generico. Sostituisce i vecchi guard `if (colIdx > 0)`/
      // `if (rowIdx > 0)` (che lasciavano il vicino non impostato ai
      // bordi) con l'aritmetica modulo, che avvolge sempre a un valore
      // valido — sia in orizzontale (dentro la stessa riga) sia in
      // verticale (fra le righe, l'intera tastiera come un ciclo).
      n.left  = row[(colIdx - 1 + row.length) % row.length];
      n.right = row[(colIdx + 1) % row.length];

      const proportionalCol = (targetRow: string[]) =>
        targetRow.length > 1
          ? Math.round((colIdx * (targetRow.length - 1)) / Math.max(row.length - 1, 1))
          : 0;

      const aboveRow = rows[(rowIdx - 1 + rows.length) % rows.length];
      n.up = aboveRow[proportionalCol(aboveRow)];
      const belowRow = rows[(rowIdx + 1) % rows.length];
      n.down = belowRow[proportionalCol(belowRow)];

      map[id] = n;
    });
  });
  return map;
}

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({
  value,
  onChange,
  onClose,
  theme = 'dark',
  className,
  altSuggestions,
  onSuggestionFocus,
  onCursorChange,
}) => {
  const { focusedId } = useFocus();
  // Step 19b (v1.1.61) — namespace 'dashboard', per le sole etichette UI
  // di questo componente (pulsante Incolla, messaggi clipboard). Nessun
  // legame con `layoutId` qui sotto: quello è il LAYOUT FISICO dei tasti
  // (ITA/EN-US, quali lettere/accenti compaiono), scelto indipendentemente
  // dalla lingua dell'interfaccia — un utente può benissimo voler
  // digitare con layout italiano pur avendo scelto l'inglese come lingua
  // della UI. Richiesta esplicita dell'utente: NON accoppiare le due cose.
  const { t } = useTranslation('dashboard');
  const [isShift, setIsShift] = React.useState(false);
  const [layoutId, setLayoutId] = React.useState<'it' | 'en'>(lastLayoutId);
  const layout = LAYOUTS[layoutId];
  const isLight = theme === 'light';

  // v1.1.16 — set attivo di suggerimenti: quello alternativo SOLO se
  // Shift è premuto e ne esiste uno per questo campo, altrimenti sempre
  // i completamenti di default — Shift non smette mai di fare anche il
  // suo lavoro normale (maiuscolo/minuscolo), si limita ad aggiungere
  // questo comportamento in più quando ha senso.
  const activeSuggestions: SuggestionItem[] = (isShift && altSuggestions && altSuggestions.length > 0)
    ? altSuggestions
    : QUICK_SUGGESTIONS.map(v => ({ value: v }));

  // Notifica il tip del suggerimento attualmente a fuoco (o undefined) —
  // ricalcolato ad ogni cambio di focus o di set attivo (es. Shift
  // premuto/rilasciato cambia quale array stiamo guardando).
  React.useEffect(() => {
    const idx = activeSuggestions.findIndex((_, i) => focusedId === `key-sugg-${i}`);
    onSuggestionFocus?.(idx !== -1 ? activeSuggestions[idx].tip : undefined);
  }, [focusedId, activeSuggestions, onSuggestionFocus]);

  const setLayout = (id: 'it' | 'en') => {
    lastLayoutId = id;
    setLayoutId(id);
  };

  // v0.99.90 — righe logiche (solo id, nell'ordine reale di rendering)
  // usate per costruire la mappa dei vicini — vedi buildNeighborMap.
  // Ricalcolate solo quando cambia il layout (cambia la lingua), non ad
  // ogni render: l'ordine e il contenuto non dipendono da altro stato.
  const neighborMap = React.useMemo(() => {
    const rowNum   = [...layout.numbers.map((kd, i) => keyId(0, kd, i)), 'key-back'];
    const rowQ     = layout.row2.map((kd, i) => keyId(1, kd, i));
    const rowA     = [...layout.row3.map((kd, i) => keyId(2, kd, i)), 'key-enter'];
    const rowZ     = ['key-shift', ...layout.row4.map((kd, i) => keyId(3, kd, i))];
    // v1.1.15 — lingua e incolla non sono più pulsanti nell'header, sono
    // tasti fisici a fianco della barra spaziatrice: fanno parte della
    // stessa riga logica ai fini della mappa dei vicini, cosi sx/dx e
    // su/giù restano deterministici come per ogni altro tasto.
    const rowSpace = ['key-lang', 'key-cursor-left', 'key-space', 'key-cursor-right', 'key-paste'];
    // Richiesta utente — i suggerimenti (chip Shift) entrano anche loro
    // nel ciclo su/giù, come qualunque altra riga: dalla riga numeri si
    // sale ai suggerimenti, dai suggerimenti si scende ai numeri, e il
    // ciclo verticale dell'intera tastiera li include naturalmente senza
    // bisogno di un caso speciale. Sinistra/destra sui suggerimenti
    // restano invece governati SOLO dalla sequentialChain qui sotto
    // (chainAxis="horizontal", ordine di lettura anche a capo) — la
    // catena viene valutata prima della mappa vicini in FocusProvider,
    // quindi qualunque sinistra/destra che buildNeighborMap assegnasse a
    // questi id non avrebbe comunque effetto: nessun conflitto reale fra
    // i due meccanismi, si dividono pulitamente gli assi.
    const rowSugg  = activeSuggestions.map((_, i) => `key-sugg-${i}`);
    return buildNeighborMap([rowSugg, rowNum, rowQ, rowA, rowZ, rowSpace]);
  }, [layout, activeSuggestions]);

  // Spostata qui da App.tsx (che puntava a un pulsante "Fatto" rimosso da
  // tempo, quindi non più realmente in funzione — vedi il commento su
  // setFocusedId in App.tsx). Il focus iniziale ora atterra sulla Q
  // (richiesta utente), quindi un rimbalzo residuo del tasto fisico A
  // (comune su controller Bluetooth, letto come "appena premuto" anche
  // nel frame subito successivo all'apertura) scriverebbe altrimenti una
  // "q" indesiderata — questa finestra di grazia lo assorbe senza dover
  // evitare la Q come bersaglio iniziale.
  const mountTimeRef = React.useRef(Date.now());
  const BOUNCE_GUARD_MS = 200;

  // v1.5.20-dev.5 — richiesta utente: tenendo premuto il tasto Canc/Del
  // per 4 secondi continui, il campo si svuota del tutto invece di
  // cancellare un carattere alla volta. onEnter di Focusable scatta solo
  // al fronte "appena premuto" (singolo tap, sia gamepad che
  // mouse/touch via onClick) — non basta a misurare una pressione
  // prolungata, serve leggere lo stato continuativamente, stesso
  // identico principio già usato in App.tsx per "tieni premuto B" nel
  // test controller (GAMEPAD_TEST_EXIT_HOLD_MS): un intervallo che
  // legge lo stato ogni 50ms indipendentemente da eventuali "cambiamenti"
  // di isJustPressed. Qui unificato per DUE sorgenti di input possibili
  // sullo stesso tasto: gamepad (A tenuto premuto mentre key-back ha il
  // focus, letto da InputManager) e puntatore (mouse/touch, tracciato a
  // parte con onMouseDown/onTouchStart perché InputManager non vede
  // affatto mouse/touch — pointerHoldRef sotto).
  const CLEAR_HOLD_MS = 4000;
  const [clearHoldProgress, setClearHoldProgress] = React.useState(0);
  const clearHoldStartRef = React.useRef<number | null>(null);
  const clearHoldFiredRef = React.useRef(false);
  const pointerHoldRef = React.useRef(false);

  // v1.5.20-dev.5 — posizione del cursore: parte dalla fine del valore
  // iniziale (comportamento invariato per chi non sposta mai il cursore
  // — identico ad "append in fondo" di prima). VirtualKeyboard viene
  // smontata/rimontata ad ogni apertura per un campo diverso (App.tsx
  // condiziona il render intero su showKeyboard, non riusa mai la stessa
  // istanza per due campi) — l'inizializzatore ricalcola quindi da solo
  // ad ogni apertura, senza bisogno di un effetto di reset esplicito.
  const [cursorPos, setCursorPos] = React.useState(() => value.length);

  // Notifica il chiamante ad ogni spostamento — SOLO per disegnare il
  // cursore nel riquadro fluttuante (App.tsx), non per l'editing vero
  // (che resta interamente qui, vedi insertAtCursor/handleBackspace).
  React.useEffect(() => {
    onCursorChange?.(cursorPos);
  }, [cursorPos, onCursorChange]);

  // Difesa: se per qualunque motivo `value` arrivasse più corto della
  // posizione corrente (es. un cambiamento esterno imprevisto), riporta
  // il cursore dentro i limiti invece di lasciarlo puntare oltre la
  // fine della stringa — mai lo sposta in avanti, solo lo riduce se
  // necessario.
  React.useEffect(() => {
    setCursorPos(p => Math.min(p, value.length));
  }, [value]);

  const insertAtCursor = (text: string) => {
    const next = value.slice(0, cursorPos) + text + value.slice(cursorPos);
    onChange(next);
    setCursorPos(cursorPos + text.length);
  };

  const moveCursor = (delta: number) => {
    setCursorPos(prev => Math.max(0, Math.min(value.length, prev + delta)));
  };

  const handleClearHoldPointerStart = React.useCallback(() => {
    pointerHoldRef.current = true;
  }, []);
  const handleClearHoldPointerEnd = React.useCallback(() => {
    pointerHoldRef.current = false;
  }, []);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const gamepadHeld = focusedId === 'key-back' && InputManager.readPrimary().buttons.has('A');
      const held = gamepadHeld || pointerHoldRef.current;
      if (held && clearHoldStartRef.current === null) {
        clearHoldStartRef.current = Date.now();
        clearHoldFiredRef.current = false;
      } else if (!held && clearHoldStartRef.current !== null) {
        clearHoldStartRef.current = null;
        clearHoldFiredRef.current = false;
        setClearHoldProgress(0);
      }
      if (clearHoldStartRef.current !== null) {
        const elapsed = Date.now() - clearHoldStartRef.current;
        const progress = Math.min(1, elapsed / CLEAR_HOLD_MS);
        setClearHoldProgress(progress);
        if (progress >= 1 && !clearHoldFiredRef.current) {
          clearHoldFiredRef.current = true;
          onChange('');
          setCursorPos(0);
        }
      }
    }, 50);
    return () => clearInterval(interval);
  }, [focusedId, onChange]);

  const handleKey = (keyDef: KeyDef) => {
    if (Date.now() - mountTimeRef.current < BOUNCE_GUARD_MS) return;
    // Le lettere (nessuna coppia normal/shifted esplicita) seguono la
    // regola maiuscolo/minuscolo classica — i simboli con una coppia
    // esplicita (es. '-'/'_') usano invece direttamente il valore
    // giusto, mai una conversione di case che non avrebbe senso per loro.
    const char = keyDef.normal === keyDef.shifted && isLetter(keyDef.normal)
      ? (isShift ? keyDef.normal.toUpperCase() : keyDef.normal.toLowerCase())
      : (isShift ? keyDef.shifted : keyDef.normal);
    insertAtCursor(char);
  };

  const handleBackspace = () => {
    // v1.5.20-dev.5 — cancella il carattere PRIMA del cursore, non più
    // sempre l'ultimo della stringa (vedi cursorPos sopra). Nessun
    // effetto se il cursore è già a inizio stringa.
    if (cursorPos === 0) return;
    const next = value.slice(0, cursorPos - 1) + value.slice(cursorPos);
    onChange(next);
    setCursorPos(cursorPos - 1);
  };
  const handleSpace      = () => insertAtCursor(' ');
  const handleSuggestion = (s: SuggestionItem) => {
    if (s.insertMode === 'replace') { onChange(s.value); setCursorPos(s.value.length); return; }
    if (s.insertMode === 'append-space') {
      // Un intero nuovo argomento aggiunto in fondo alla lista esistente
      // (Launch Arguments) — resta un'aggiunta di coda concettuale, non
      // un inserimento al punto di modifica corrente, stesso
      // comportamento di sempre. Il cursore segue alla fine del nuovo
      // valore risultante.
      const next = value ? `${value} ${s.value}` : s.value;
      onChange(next);
      setCursorPos(next.length);
      return;
    }
    insertAtCursor(s.value);
  };

  // v1.1.13 — pulsante "Incolla": legge la clipboard REALE del sistema
  // (non un buffer interno alla Dashboard), utile soprattutto per valori
  // generati altrove e mai digitati a mano — API key, in primis. Segue
  // lo stesso comportamento di ogni altro tasto (append in fondo al
  // valore corrente, nessun concetto di posizione del cursore su questa
  // tastiera). `trim()` per non portarsi dietro newline/spazi accidentali
  // tipici di un copia-incolla da pagina web.
  const [pasteStatus, setPasteStatus] = React.useState<'idle' | 'error' | 'empty'>('idle');
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setPasteStatus('empty');
        setTimeout(() => setPasteStatus('idle'), 1800);
        return;
      }
      insertAtCursor(text.trim());
    } catch {
      // Permesso negato o Clipboard API non disponibile in questo
      // contesto — non un crash, solo un feedback breve per l'utente.
      setPasteStatus('error');
      setTimeout(() => setPasteStatus('idle'), 1800);
    }
  };

  const renderKeyLabel = (keyDef: KeyDef) => {
    if (keyDef.normal === keyDef.shifted && isLetter(keyDef.normal)) {
      return isShift ? keyDef.normal.toUpperCase() : keyDef.normal.toLowerCase();
    }
    return isShift ? keyDef.shifted : keyDef.normal;
  };

  const keyClass = (isFocused: boolean) => cn(
    'w-full aspect-square md:w-11 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center text-xs md:text-sm font-black transition-all touch-none',
    isFocused
      ? 'bg-blue-600 text-white scale-110 shadow-lg shadow-blue-500/20'
      : isLight
        ? 'bg-gray-100 text-gray-800 border border-gray-200 opacity-80'
        : 'bg-white/5 opacity-80'
  );

  const wideKeyClass = (isFocused: boolean, accent: 'red' | 'green' | 'blue' | 'neutral') => cn(
    'h-full aspect-square md:w-11 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center transition-all touch-none shrink-0',
    isFocused
      ? accent === 'red'   ? 'bg-red-600 text-white scale-110 shadow-lg shadow-red-500/20'
      : accent === 'green' ? 'bg-green-600 text-white scale-110 shadow-lg shadow-green-500/20'
      : accent === 'blue'  ? 'bg-blue-600 text-white scale-110 shadow-lg shadow-blue-500/20'
      : 'bg-blue-600/50 text-white scale-110 shadow-lg'
      : isLight
        ? 'bg-gray-100 text-gray-700 border border-gray-200 opacity-80'
        : 'bg-white/5 opacity-80'
  );

  const renderLetterKey = (rowIndex: number, keyDef: KeyDef, i: number) => {
    const id = keyId(rowIndex, keyDef, i);
    return (
      <Focusable
        key={id}
        id={id}
        group="keyboard"
        onEnter={() => handleKey(keyDef)}
        neighbors={neighborMap[id]}
        className="flex-1 max-w-[44px]"
      >
        {(isFocused: boolean) => (
          <div className={keyClass(isFocused)}>{renderKeyLabel(keyDef)}</div>
        )}
      </Focusable>
    );
  };

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      className={cn(
        'backdrop-blur-3xl rounded-[1.5rem] md:rounded-[2rem] p-4 md:p-6 shadow-2xl flex flex-col gap-2 md:gap-3 w-[95vw] md:w-full max-w-4xl border',
        isLight
          ? 'bg-white/95 border-gray-200'
          : 'bg-[#12141a]/95 border-white/10',
        className
      )}
    >
      {/* v1.1.15 — l'header con etichetta/valore/lingua/incolla è stato
          rimosso: l'unico punto dove leggere/scrivere il testo è ora il
          riquadro fluttuante sopra la tastiera (vedi App.tsx), più
          leggibile dal divano e capace di andare a capo su stringhe
          lunghe (path, variabili d'ambiente, opzioni di lancio) invece di
          troncare con un puntino su una sola riga stretta. Lingua e
          Incolla sono diventati tasti fisici accanto alla barra
          spaziatrice, più sotto. */}

      {/* Chip di completamento rapido — v1.1.16: mostrano activeSuggestions
          (default, oppure l'alternativa se Shift è premuto e il campo ne
          fornisce una).
          v1.1.17 — sequentialChain in modalità 'flow': con suggerimenti
          lunghi (variabili d'ambiente) la riga va a capo in modo non
          uniforme (elementi di larghezza variabile), rendendo lo scoring
          geometrico imprevedibile fra le righe — la stessa lista si
          comporta ora come un'unica sequenza in ordine di lettura,
          indipendente da dove il testo va effettivamente a capo.
          FIX (segnalato dall'utente): 'flow' intercetta OGNI direzione
          (vedi FocusProvider.tsx, directionMatchesChainAxis — 'flow'
          matcha sempre, non solo sinistra/destra), quindi "giù" da un
          suggerimento veniva letto come "avanti nella catena" invece di
          scendere verso i tasti sotto — restava intrappolato finché non
          si raggiungeva l'ultimo elemento dell'array, e per uscire dal
          primo bisognava andare a sinistra (l'unica direzione trattata
          come "indietro" che riusciva a cadere fuori dai bordi). Con
          'horizontal', la catena cattura solo sinistra/destra (che
          restano in ordine di lettura come prima, nessuna differenza per
          quello): su/giù non vengono più intercettati da nessun
          elemento della lista, e cadono subito nello scoring/neighbor
          normale verso i tasti sotto. */}
      <div className="flex flex-wrap justify-center gap-1 md:gap-1.5">
        {activeSuggestions.map((s, i) => (
          <Focusable
            key={`${s.value}-${i}`}
            id={`key-sugg-${i}`}
            group="keyboard"
            sequentialChain="keyboard-suggestions"
            chainAxis="horizontal"
            neighbors={neighborMap[`key-sugg-${i}`]}
            onEnter={() => handleSuggestion(s)}
          >
            {(isFocused: boolean) => (
              <div className={cn(
                'px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all touch-none',
                isFocused
                  ? 'bg-blue-600 text-white scale-105'
                  : isLight
                    ? 'bg-gray-100 text-gray-500 border border-gray-200'
                    : 'bg-white/5 text-white/50'
              )}>
                {s.label ?? s.value}
              </div>
            )}
          </Focusable>
        ))}
      </div>

      {/* Griglia tradizionale: 4 righe di tasti + barra spaziatrice sotto */}
      <div className="flex flex-col gap-1 md:gap-1.5">

        {/* Riga 1 — numeri + Backspace in fondo a destra */}
        <div className="flex justify-center gap-1 md:gap-1.5">
          {layout.numbers.map((keyDef, i) => renderLetterKey(0, keyDef, i))}
          <Focusable group="keyboard" id="key-back" onEnter={handleBackspace} neighbors={neighborMap['key-back']} className="max-w-[44px]">
            {(isFocused: boolean) => (
              <div
                className={cn(wideKeyClass(isFocused, 'red'), 'relative overflow-hidden')}
                onMouseDown={handleClearHoldPointerStart}
                onMouseUp={handleClearHoldPointerEnd}
                onMouseLeave={handleClearHoldPointerEnd}
                onTouchStart={handleClearHoldPointerStart}
                onTouchEnd={handleClearHoldPointerEnd}
                onTouchCancel={handleClearHoldPointerEnd}
              >
                {/* Riempimento progressivo — cresce dal basso mentre si tiene
                    premuto, cosi si vede arrivare lo svuotamento completo
                    invece che scoprirlo di colpo dopo 4 secondi. */}
                {clearHoldProgress > 0 && (
                  <div
                    className="absolute inset-x-0 bottom-0 bg-white/30 pointer-events-none"
                    style={{ height: `${clearHoldProgress * 100}%` }}
                  />
                )}
                <Delete size={16} className="relative" />
              </div>
            )}
          </Focusable>
        </div>

        {/* Riga 2 — QWERTYUIOP (+ accenti IT) + / \ */}
        <div className="flex justify-center gap-1 md:gap-1.5">
          {layout.row2.map((keyDef, i) => renderLetterKey(1, keyDef, i))}
        </div>

        {/* Riga 3 — ASDFGHJKL (+ accenti IT) + Invio in fondo a destra
            (Invio chiude la tastiera — nessun pulsante "Fatto" a parte,
            stesso ruolo che ha un vero tasto Invio su un campo di testo). */}
        <div className="flex justify-center gap-1 md:gap-1.5">
          {layout.row3.map((keyDef, i) => renderLetterKey(2, keyDef, i))}
          <Focusable group="keyboard" id="key-enter" onEnter={onClose} neighbors={neighborMap['key-enter']} className="max-w-[44px]">
            {(isFocused: boolean) => (
              <div className={wideKeyClass(isFocused, 'green')}><CornerDownLeft size={16} /></div>
            )}
          </Focusable>
        </div>

        {/* Riga 4 — Shift a sinistra + ZXCVBNM (+ accenti IT) + , . - @ */}
        <div className="flex justify-center gap-1 md:gap-1.5">
          <Focusable group="keyboard" id="key-shift" onEnter={() => setIsShift(s => !s)} neighbors={neighborMap['key-shift']} className="max-w-[44px]">
            {(isFocused: boolean) => (
              <div className={cn(
                'w-full aspect-square md:w-11 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center transition-all touch-none',
                isShift
                  ? 'bg-blue-600 text-white shadow-lg'
                  : isFocused
                    ? 'bg-blue-600/50 text-white scale-110 shadow-lg'
                    : isLight
                      ? 'bg-gray-100 text-gray-700 border border-gray-200 opacity-80'
                      : 'bg-white/5 opacity-80'
              )}>
                <ArrowBigUp size={16} />
              </div>
            )}
          </Focusable>
          {layout.row4.map((keyDef, i) => renderLetterKey(3, keyDef, i))}
        </div>

        {/* Riga 5 — lingua e incolla ora tasti fisici ai lati della
            spaziatrice (prima pulsanti nell'header, rimosso — vedi sopra).
            Feedback di "Incolla" mostrato come didascalia transitoria
            sopra la riga, non permanente: non sposta il layout quando
            non serve. */}
        {pasteStatus !== 'idle' && (
          <p className="text-center text-[9px] font-black uppercase tracking-widest text-red-400 -mb-0.5">
            {pasteStatus === 'empty' ? t('dashboard:keyboard.clipboardEmpty') : t('dashboard:keyboard.clipboardUnavailable')}
          </p>
        )}
        <div className="flex justify-center items-stretch gap-1 md:gap-1.5 mt-0.5">
          <Focusable group="keyboard" id="key-lang" onEnter={() => setLayout(layoutId === 'it' ? 'en' : 'it')} neighbors={neighborMap['key-lang']} className="w-1/6">
            {(isFocused: boolean) => (
              <div className={cn(
                'w-full h-10 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all touch-none',
                isFocused
                  ? 'bg-blue-600 text-white scale-y-105 shadow-lg shadow-blue-500/20'
                  : isLight
                    ? 'bg-gray-100 text-gray-700 border border-gray-200 opacity-80'
                    : 'bg-white/5 opacity-80'
              )}>
                <Languages size={13} />
                {layout.label}
              </div>
            )}
          </Focusable>
          {/* v1.5.20-dev.5 — richiesta utente: spostamento del cursore, non
              solo scrittura/cancellazione sempre in fondo alla stringa.
              Tasti dedicati (non D-pad sinistra/destra, già impegnato a
              navigare fra i TASTI stessi) — ogni conferma sposta di UNA
              posizione, stesso schema "un'azione per pressione" di
              qualunque altro tasto di questa tastiera (nessun key-repeat
              automatico da nessuna parte, coerente col resto). */}
          <Focusable group="keyboard" id="key-cursor-left" onEnter={() => moveCursor(-1)} neighbors={neighborMap['key-cursor-left']} className="w-1/6">
            {(isFocused: boolean) => (
              <div className={cn(
                'w-full h-10 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center transition-all touch-none',
                isFocused
                  ? 'bg-blue-600 text-white scale-y-105 shadow-lg shadow-blue-500/20'
                  : isLight
                    ? 'bg-gray-100 text-gray-700 border border-gray-200 opacity-80'
                    : 'bg-white/5 opacity-80'
              )}>
                <ChevronLeft size={16} />
              </div>
            )}
          </Focusable>
          <Focusable group="keyboard" id="key-space" onEnter={handleSpace} neighbors={neighborMap['key-space']} className="flex-1">
            {(isFocused: boolean) => (
              <div className={cn(
                'w-full h-10 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center transition-all touch-none',
                isFocused
                  ? 'bg-blue-600 text-white scale-y-105 shadow-lg shadow-blue-500/20'
                  : isLight
                    ? 'bg-gray-100 text-gray-700 border border-gray-200 opacity-80'
                    : 'bg-white/5 opacity-80'
              )}>
                <Space size={16} />
              </div>
            )}
          </Focusable>
          <Focusable group="keyboard" id="key-cursor-right" onEnter={() => moveCursor(1)} neighbors={neighborMap['key-cursor-right']} className="w-1/6">
            {(isFocused: boolean) => (
              <div className={cn(
                'w-full h-10 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center transition-all touch-none',
                isFocused
                  ? 'bg-blue-600 text-white scale-y-105 shadow-lg shadow-blue-500/20'
                  : isLight
                    ? 'bg-gray-100 text-gray-700 border border-gray-200 opacity-80'
                    : 'bg-white/5 opacity-80'
              )}>
                <ChevronRight size={16} />
              </div>
            )}
          </Focusable>
          <Focusable group="keyboard" id="key-paste" onEnter={handlePaste} neighbors={neighborMap['key-paste']} className="w-1/6">
            {(isFocused: boolean) => (
              <div className={cn(
                'w-full h-10 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center gap-1.5 text-[9px] font-black uppercase tracking-widest transition-all touch-none',
                isFocused
                  ? 'bg-blue-600 text-white scale-y-105 shadow-lg shadow-blue-500/20'
                  : isLight
                    ? 'bg-gray-100 text-gray-700 border border-gray-200 opacity-80'
                    : 'bg-white/5 opacity-80'
              )}>
                <ClipboardPaste size={13} />
                {t('dashboard:keyboard.paste')}
              </div>
            )}
          </Focusable>
        </div>
      </div>
    </motion.div>
  );
};

// spacesGate.ts — v2.6.7-dev.1 (Step 21, gate dell'input nella sessione Openbox "Shell").
//
// Funzione PURA (nessun accesso a DOM, rete o React: testabile da sola) che decide
// se l'input della Dashboard deve essere CONGELATO (isFocusFrozen) mentre un gioco
// tracciato e' in esecuzione, tenendo conto degli SPAZI del gestore (spaces.py).
//
// Contesto: nella sessione XFCE/Kiosk il congelamento scatta al lancio del gioco e
// termina solo quando il gioco chiude, perche' la Dashboard resta viva sotto il
// gioco e senza gate reagirebbe ai tasti destinati al gioco. Nella sessione "Shell"
// la Dashboard e il gioco stanno in spazi (desktop) diversi, quindi il congelamento
// ha senso SOLO quando la Dashboard non e' lo spazio corrente: quando ci si torna
// (Select + D-pad, Select + L1 + R1) deve essere di nuovo utilizzabile, ad esempio
// per lanciare un secondo gioco.
//
// Regole (in ordine):
//  1. Nessun gestore degli spazi attivo o nessun gioco tracciato in esecuzione:
//     non decide nulla (freeze = null) e il comportamento resta quello di sempre.
//  2. Subito dopo un lancio ("in attesa del passaggio"): finche' la Dashboard e'
//     ancora lo spazio corrente il gate NON la libera (la splash e' a schermo e il
//     gioco sta per comparire); appena il gestore porta in uno spazio di gioco
//     il passaggio e' avvenuto. Se entro SPACES_SWITCH_TIMEOUT_MS il gioco non e'
//     comparso in nessuno spazio (es. finestra mai creata) la Dashboard viene
//     LIBERATA, cosi' non resta bloccata fino al kill del processo.
//  3. Dashboard non e' lo spazio corrente: CONGELATA.
//  4. Dashboard e' lo spazio corrente e il gioco sta in un altro spazio: LIBERA.
//  5. Dashboard e' lo spazio corrente e non esiste alcuno spazio di gioco: non
//     decide (es. gioco senza slot, o Steam via URI non indicizzato).

export const SPACES_SWITCH_TIMEOUT_MS = 45_000;

export interface SpacesInfo {
  active: boolean;
  /** Spazio corrente: 0 = Dashboard, 1..3 = giochi. */
  current: number;
  /** Quanti spazi di gioco risultano occupati. */
  gameSpaces: number;
}

export interface SpacesGateInput {
  gameRunning: boolean;
  awaitingSwitch: boolean;
  awaitingSinceMs: number;
  nowMs: number;
  info: SpacesInfo | null;
}

export interface SpacesGateOutput {
  /** true = congela, false = libera, null = non toccare lo stato attuale. */
  freeze: boolean | null;
  awaitingSwitch: boolean;
  reason: string;
}

export function evaluateSpacesGate(i: SpacesGateInput): SpacesGateOutput {
  if (!i.info || !i.info.active || !i.gameRunning) {
    return { freeze: null, awaitingSwitch: false, reason: 'nessun gestore degli spazi o nessun gioco tracciato in esecuzione' };
  }
  const { current, gameSpaces } = i.info;

  if (i.awaitingSwitch) {
    if (current !== 0) {
      return { freeze: true, awaitingSwitch: false, reason: 'il gestore ha portato in uno spazio di gioco' };
    }
    if (i.nowMs - i.awaitingSinceMs > SPACES_SWITCH_TIMEOUT_MS) {
      return { freeze: false, awaitingSwitch: false, reason: 'il gioco non e\' comparso in nessuno spazio entro il timeout: Dashboard liberata' };
    }
    return { freeze: null, awaitingSwitch: true, reason: 'attendo il passaggio allo spazio del gioco' };
  }

  if (current !== 0) {
    return { freeze: true, awaitingSwitch: false, reason: 'la Dashboard non e\' lo spazio corrente' };
  }
  if (gameSpaces > 0) {
    return { freeze: false, awaitingSwitch: false, reason: 'la Dashboard e\' lo spazio corrente e il gioco e\' in un altro spazio' };
  }
  return { freeze: null, awaitingSwitch: false, reason: 'nessuno spazio di gioco occupato' };
}

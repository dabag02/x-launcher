/**
 * activeDisplay.ts — v2.2.19-dev.2
 *
 * BUG REALE CONFERMATO (non ipotizzato): con la sessione Kiosk
 * indipendente (Step 20, gamescope standalone) funzionante, i giochi
 * lanciati dalla Dashboard partivano (PID assegnato, poi rilevati
 * chiusi) ma non comparivano mai a schermo. Causa isolata leggendo il
 * codice sorgente, non solo i log: xdash.service (systemd, avviato su
 * multi-user.target, PRIMA di qualunque login — vedi il suo stesso
 * commento in cima al file) porta con sé `Environment=DISPLAY=:0`
 * fisso. Quel valore era corretto SOLO nell'unico caso finora testato
 * (sessione XFCE dedicata, sempre su :0) — ma ogni processo di gioco
 * (spawnDetached in runners/implementations.ts, unico punto reale di
 * lancio per Wine/Proton/legendary/ecc.) eredita `process.env` del
 * daemon, quindi quel :0 fisso, ANCHE quando la sessione realmente
 * attiva è la Kiosk gamescope — la cui Xwayland interna gira su un
 * DISPLAY diverso (es. :1). Il gioco si apriva quindi, invisibile,
 * sulla sessione XFCE (se ancora viva in background su un altro VT),
 * non su quella che l'utente stava effettivamente guardando.
 *
 * Fix: invece di un valore statico deciso all'avvio del daemon (prima
 * ancora che una sessione grafica esista), ogni sessione (kiosk-launch.sh
 * per XFCE/CASO 2, gamescope-session.sh per la Kiosk) segnala al daemon
 * — via POST /api/system/active-display, vedi server.ts — il proprio
 * DISPLAY reale nel momento in cui diventa quella attiva. Questo modulo
 * tiene solo quel valore in memoria (nessuna persistenza: si azzera ad
 * ogni riavvio del daemon, tornando al fallback statico finché una
 * sessione non lo segnala di nuovo — comportamento identico a oggi per
 * chi non ha ancora la sessione Kiosk, nessuna regressione).
 */

let activeDisplay: string | undefined;
let activeWaylandDisplay: string | undefined;

// v2.2.19-dev.7 — Step 20 seguito: il pulsante "Modalità Gamescope" nel
// menu della Dashboard deve mostrare se la sessione Kiosk è DAVVERO
// attiva (non un mock) e a quale risoluzione. kind/resolution viaggiano
// sullo stesso canale di segnalazione del DISPLAY (gamescope-session.sh e
// kiosk-launch.sh chiamano comunque questo endpoint ad ogni cambio
// sessione) — nessun meccanismo nuovo, solo due campi in più sullo stesso
// POST. Stesso non-persistere del DISPLAY: si azzera ad ogni riavvio del
// daemon, tornando 'desktop' finché una sessione non si segnala di nuovo.
export type SessionKind = 'desktop' | 'kiosk';
let activeSessionKind: SessionKind = 'desktop';
let activeGamescopeResolution: string | undefined;

export function setActiveDisplay(display?: string, waylandDisplay?: string, kind?: SessionKind, resolution?: string): void {
  activeDisplay = display && display.trim() !== '' ? display.trim() : undefined;
  activeWaylandDisplay = waylandDisplay && waylandDisplay.trim() !== '' ? waylandDisplay.trim() : undefined;
  if (kind === 'kiosk' || kind === 'desktop') {
    activeSessionKind = kind;
  }
  activeGamescopeResolution = kind === 'kiosk' && resolution ? resolution : undefined;
}

/** Stato per il pulsante "Modalità Gamescope" — non per lo spawn dei giochi (vedi getActiveDisplayEnv per quello). */
export function getActiveSessionInfo(): { kind: SessionKind; resolution?: string } {
  return { kind: activeSessionKind, ...(activeGamescopeResolution ? { resolution: activeGamescopeResolution } : {}) };
}

/**
 * DISPLAY/WAYLAND_DISPLAY da usare per QUALUNQUE spawn che apra una
 * finestra (giochi, wine, winetricks, xset, wmctrl/xprop...). Fallback
 * al vecchio comportamento (process.env.DISPLAY statico, poi ':0') se
 * nessuna sessione ha ancora chiamato setActiveDisplay.
 *
 * v2.2.19-dev.4 — BUG REALE CONFERMATO (regressione introdotta da
 * questo stesso modulo in dev.2): WAYLAND_DISPLAY veniva sempre incluso
 * nell'oggetto restituito, con fallback a stringa vuota '' quando non
 * c'era nulla da riportare. Nello spawn del gioco questo valore viene
 * impostato ESPLICITAMENTE nell'ambiente del processo — una variabile
 * impostata-ma-vuota non equivale ad assente per molti toolkit (SDL2 in
 * primis): alcuni giochi vedevano WAYLAND_DISPLAY "presente" e
 * tentavano comunque il backend Wayland invece di quello X11 della
 * sessione XFCE, fallendo nel creare una finestra e uscendo quasi
 * subito. Prima di dev.2, WAYLAND_DISPLAY non veniva mai toccato — se
 * assente in process.env (il caso normale), restava assente anche
 * nell'ambiente del gioco. Ora la chiave viene OMESSA del tutto quando
 * non c'è un valore reale, invece di essere impostata vuota: chi fa
 * `{ ...process.env, ...getActiveDisplayEnv() }` senza un valore
 * segnalato si comporta quindi esattamente come prima di dev.2.
 */
export function getActiveDisplayEnv(): { DISPLAY: string; WAYLAND_DISPLAY?: string } {
  const waylandDisplay = activeWaylandDisplay ?? process.env.WAYLAND_DISPLAY;
  return {
    DISPLAY: activeDisplay ?? process.env.DISPLAY ?? ':0',
    ...(waylandDisplay ? { WAYLAND_DISPLAY: waylandDisplay } : {}),
  };
}

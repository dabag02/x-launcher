// useGamepad — hook React che wrappa InputManager
// Mantiene la stessa API pubblica (GamepadState, isJustPressed) per compatibilità
// con tutto il codice esistente in App.tsx
import { useEffect, useRef, useState } from 'react';
import { InputManager } from '../input/InputManager';
import { ButtonName, InputState } from '../input/types';

// Re-export dei tipi per compatibilità con il codice esistente
export type GamepadButton = ButtonName;
export type GamepadState  = InputState;

export function useGamepad() {
  const [state, setState] = useState<GamepadState>({
    buttons: new Set<ButtonName>(),
    axes: [0, 0, 0, 0],
  });

  // Due ref separati per edge detection affidabile:
  // - prevRef:    stato dei pulsanti nel frame PRECEDENTE
  // - currentRef: stato dei pulsanti nel frame CORRENTE
  // isJustPressed legge da questi ref (sincroni) invece che dallo state React
  // (asincrono), eliminando la race condition in cui prevRef veniva sovrascritto
  // nello stesso tick del polling prima che il re-render avesse luogo.
  const prevRef    = useRef<Set<ButtonName>>(new Set());
  const currentRef = useRef<Set<ButtonName>>(new Set());
  const rafRef     = useRef<number>(0);

  // FIX: il loop RAF (60fps fisso) e il ciclo di render/effect di React
  // (frequenza variabile, può bufferizzare più aggiornamenti) sono due
  // orologi indipendenti. Se l'useEffect che chiama isJustPressed in
  // App.tsx scatta in ritardo o più volte rispetto a una singola pressione
  // fisica, il vecchio confronto "currentRef.has(btn) && !prevRef.has(btn)"
  // può ritornare true più volte per lo stesso evento fisico, perché non
  // teneva traccia di "questo fronte è già stato letto da qualcuno".
  // consumedRef tiene traccia dei pulsanti il cui fronte "appena premuto" è
  // già stato consumato: una volta letto, isJustPressed ritorna false per
  // quel pulsante finché non viene fisicamente rilasciato e ripremuto.
  const consumedRef = useRef<Set<ButtonName>>(new Set());

  // v1.1.9 — prima confrontava solo i pulsanti: muovere UNO stick da solo
  // (nessun pulsante cambia, e lo stick sinistro sintetizza Left/Right/
  // Up/Down solo oltre una soglia di deflessione — vedi XInputPlugin.ts)
  // non faceva mai scattare setState, quindi gli assi restavano fermi
  // nello stato React finché non cambiava anche qualche pulsante.
  // Sintomo osservato: lo stick destro sembrava "funzionare" solo se
  // mosso insieme al sinistro, perché solo quest'ultimo, oltre soglia,
  // sintetizza un pulsante e quindi fa scattare l'aggiornamento — che a
  // quel punto porta con sé anche gli assi correnti, incluso il destro.
  // Soglia 0.03 per ignorare il rumore hardware dello stick a riposo
  // (quasi mai esattamente 0) senza perdere reattività al movimento reale.
  const prevAxesRef = useRef<[number, number, number, number]>([0, 0, 0, 0]);
  const AXIS_CHANGE_EPSILON = 0.03;

  const poll = () => {
    const next = InputManager.readPrimary();

    const buttonsChanged =
      next.buttons.size !== currentRef.current.size ||
      [...next.buttons].some(b => !currentRef.current.has(b));
    const axesChanged = next.axes.some((v, i) => Math.abs(v - prevAxesRef.current[i]) > AXIS_CHANGE_EPSILON);

    // Aggiorna se cambia qualcosa — pulsanti O assi (prima solo pulsanti)
    const changed = buttonsChanged || axesChanged;

    if (changed) {
      prevRef.current    = currentRef.current; // il frame corrente diventa "prev"
      currentRef.current = next.buttons;        // il nuovo frame diventa "current"
      // Pulisce dal set "consumati" ogni pulsante che è stato rilasciato:
      // un nuovo ciclo pressione->rilascio deve poter generare un nuovo
      // fronte "appena premuto" valido.
      consumedRef.current.forEach(btn => {
        if (!next.buttons.has(btn)) consumedRef.current.delete(btn);
      });
      prevAxesRef.current = next.axes as [number, number, number, number];
      setState({ buttons: next.buttons, axes: next.axes });
    }

    rafRef.current = requestAnimationFrame(poll);
  };

  useEffect(() => {
    InputManager.loadConfig();

    const onConnect    = () => InputManager.refreshDevices();
    const onDisconnect = () => InputManager.refreshDevices();
    window.addEventListener('gamepadconnected',    onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);

    // v0.99.35 — Chromium, a differenza di Firefox, NON smette di
    // processare il Gamepad API quando la finestra è semplicemente
    // coperta da un'altra (es. un gioco Wine in primo piano) — solo
    // quando document.hidden diventa true (finestra minimizzata o
    // nascosta via window manager, vedi tray.py che usa wmctrl per
    // questo scopo specifico). Senza questo controllo, l'input del
    // controller durante una partita raggiungeva comunque la
    // dashboard sottostante, causando navigazione e azioni
    // indesiderate (osservato: download di runner non richiesti).
    // Si ferma/riavvia il loop RAF stesso, non solo la lettura dei
    // pulsanti, per evitare qualunque lavoro superfluo mentre nascosta.
    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafRef.current);
      } else {
        rafRef.current = requestAnimationFrame(poll);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    rafRef.current = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('gamepadconnected',    onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  /**
   * Ritorna true solo nel frame in cui il tasto è stato premuto, e SOLO
   * la prima volta che viene letto per quella pressione fisica: una volta
   * consumato il fronte, ritorna false finché il tasto non viene rilasciato
   * e ripremuto, anche se chiamato più volte di seguito (es. da un effect
   * React che si ri-esegue più volte per lo stesso frame di input).
   */
  const isJustPressed = (btn: ButtonName): boolean => {
    const justPressed = currentRef.current.has(btn) && !prevRef.current.has(btn);
    if (!justPressed) return false;
    if (consumedRef.current.has(btn)) return false;
    consumedRef.current.add(btn);
    return true;
  };

  return { state, isJustPressed, gamepadState: state };
}

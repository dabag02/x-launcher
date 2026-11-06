import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { InputState, ButtonName } from '../input/types';
import { Theme } from '../types';

interface GamepadTesterProps {
  state: InputState;
  connected: boolean;
  theme?: Theme;
  // v1.1.8 — quando true, l'area di test ha il focus della Dashboard e
  // sta catturando tutti gli input (la navigazione normale è sospesa,
  // vedi App.tsx). Mostra un bordo distinto e il suggerimento di uscita —
  // senza, un utente potrebbe restare bloccato senza capire come tornare
  // alla navigazione normale.
  captureActive?: boolean;
  // Percentuale 0-1 di avanzamento della pressione prolungata di B
  // richiesta per uscire — usata per un piccolo indicatore di progresso,
  // così l'utente vede che la pressione sta venendo effettivamente
  // registrata invece di sembrare che il tasto non risponda.
  exitHoldProgress?: number;
}

// Schema SVG di un gamepad standard (layout XInput-style, neutro rispetto a
// Xbox/PlayStation). Ogni elemento interattivo è disegnato come forma
// indipendente che cambia colore/opacità in base allo stato live ricevuto
// da InputState — nessuna lettura separata del gamepad: il widget consuma
// esattamente lo stesso `state` che già alimenta tutta la navigazione,
// garantendo che "quello che vedi qui" sia sempre coerente con "quello che
// l'app sta effettivamente leggendo".
export const GamepadTester: React.FC<GamepadTesterProps> = ({ state, connected, theme = 'dark', captureActive = false, exitHoldProgress = 0 }) => {
  // Step 19b (v1.1.42) — mancava qui: componente separato da App.tsx,
  // saltato nella migrazione della tab Input perché le sue stringhe non
  // comparivano nel grep fatto direttamente su App.tsx. Stesso namespace
  // 'settings', sezione 'input' — le chiavi vivono logicamente insieme al
  // resto della tab che lo ospita, anche se il componente è in un file
  // diverso.
  const { t } = useTranslation('settings');
  const pressed = (btn: ButtonName) => state.buttons.has(btn);

  // Deflessione stick: piccolo offset visivo proporzionale al valore
  // dell'asse (-1..1), con un fattore di scala ridotto per restare dentro
  // l'area dello stick senza farlo "uscire" dal suo alloggiamento grafico.
  const [lx, ly, rx, ry] = state.axes;
  const stickOffset = (v: number) => Math.max(-6, Math.min(6, v * 6));

  // v3.1.7-dev.6 — colori del disegno dal tema (themes/<id>.json, pad-*). Passati come stile
  // (non come attributo fill/stroke): var() negli attributi SVG non è garantito fuori da
  // Chromium. Il secondo argomento di var() è il valore del tema scuro di prima.
  const litFill    = 'var(--xl-pad-lit, #3b82f6)';                    // blue-500, accent del progetto
  const litLabel   = 'var(--xl-pad-lit-label, #ffffff)';
  const idleFill   = 'var(--xl-pad-idle-fill, rgba(255,255,255,0.08))';
  const idleStroke = 'var(--xl-pad-idle-stroke, rgba(255,255,255,0.18))';
  const labelColor = 'var(--xl-pad-label, rgba(255,255,255,0.35))';
  const stickCap   = 'var(--xl-pad-stick, rgba(255,255,255,0.45))';
  const bodyFill   = 'var(--xl-pad-body, rgba(255,255,255,0.03))';

  const faceBtn = (btn: ButtonName, cx: number, cy: number, label: string) => (
    <g key={btn}>
      <circle
        cx={cx} cy={cy} r={11}
        strokeWidth={1.5}
        style={{ fill: pressed(btn) ? litFill : idleFill, stroke: pressed(btn) ? litFill : idleStroke, transition: 'fill 60ms linear, stroke 60ms linear' }}
      />
      <text
        x={cx} y={cy + 4} textAnchor="middle"
        fontSize="9" fontWeight="900"
        style={{ fill: pressed(btn) ? litLabel : labelColor, transition: 'fill 60ms linear', pointerEvents: 'none' }}
      >
        {label}
      </text>
    </g>
  );

  const shoulderBtn = (btn: ButtonName, x: number, y: number, w: number, h: number, label: string) => (
    <g key={btn}>
      <rect
        x={x} y={y} width={w} height={h} rx={4}
        strokeWidth={1.5}
        style={{ fill: pressed(btn) ? litFill : idleFill, stroke: pressed(btn) ? litFill : idleStroke, transition: 'fill 60ms linear, stroke 60ms linear' }}
      />
      <text
        x={x + w / 2} y={y + h / 2 + 3} textAnchor="middle"
        fontSize="7.5" fontWeight="900"
        style={{ fill: pressed(btn) ? litLabel : labelColor, pointerEvents: 'none' }}
      >
        {label}
      </text>
    </g>
  );

  const stick = (cx: number, cy: number, ox: number, oy: number, l3: ButtonName) => (
    <g key={`stick-${cx}`}>
      <circle cx={cx} cy={cy} r={15} strokeWidth={1.5} style={{ fill: idleFill, stroke: idleStroke }} />
      <circle
        cx={cx + ox} cy={cy + oy} r={9}
        style={{ fill: pressed(l3) ? litFill : stickCap, transition: 'fill 60ms linear' }}
      />
    </g>
  );

  return (
    <div className={cn(
      "p-5 rounded-2xl border flex items-center gap-5 transition-all",
      captureActive
        // v1.1.8 — colore distinto (ambra, non il blu standard usato per
        // "questo è un normale stop di navigazione"): segnala che qui la
        // Dashboard si comporta diversamente dal solito, non solo che
        // l'elemento ha il focus.
        ? "ring-2 ring-xl-notice-400 " + ('bg-xl-notice-tint border-xl-notice-tint-border-soft')
        : 'bg-xl-box border-xl-border-subtle'
    )}>
      {/* v1.1.8 — schema ridisegnato più alto (viewBox 140→190px) per
          risolvere l'affollamento segnalato. La sagoma del corpo è
          ottenuta scalando SOLO le coordinate Y del path originale per un
          fattore 1.35 (le curve di Bézier sono affini-invarianti: scalare
          uniformemente tutti i punti di controllo produce esattamente la
          stessa curva "stirata", non un'approssimazione). I controlli
          (D-pad, tasti, stick) sono stati riposizionati con margini
          verticali più generosi nello spazio così liberato, invece di
          essere semplicemente scalati insieme al corpo. */}
      <svg width="220" height="190" viewBox="0 0 220 190" className="shrink-0">
        {/* Corpo del gamepad — sagoma neutra a farfalla, scalata in altezza */}
        <path
          d="M 40 74 Q 10 74 8 122 Q 6 169 30 173 Q 50 176 58 142 L 162 142 Q 170 176 190 173 Q 214 169 212 122 Q 210 74 180 74 Q 165 54 140 57 L 80 57 Q 55 54 40 74 Z"
          strokeWidth={1.5}
          style={{ fill: bodyFill, stroke: idleStroke }}
        />

        {/* Dorsali alti L1/R1 */}
        {shoulderBtn('L1', 28, 25, 40, 13, 'L1')}
        {shoulderBtn('R1', 152, 25, 40, 13, 'R1')}

        {/* Dorsali bassi L2/R2 */}
        {shoulderBtn('L2', 28, 8, 40, 13, 'L2')}
        {shoulderBtn('R2', 152, 8, 40, 13, 'R2')}

        {/* Select / Start, subito sotto il bordo superiore del corpo */}
        {shoulderBtn('Select', 88, 64, 26, 13, 'SELECT')}
        {shoulderBtn('Start',  122, 64, 26, 13, 'START')}

        {/* Home, tra Select/Start e il gruppo D-pad/face buttons */}
        {faceBtn('Home', 110, 92, '◆')}

        {/* D-Pad (sx) — croce con margini più ampi fra le frecce */}
        {shoulderBtn('Up',    34, 98,  16, 16, '↑')}
        {shoulderBtn('Down',  34, 132, 16, 16, '↓')}
        {shoulderBtn('Left',  17, 115, 16, 16, '←')}
        {shoulderBtn('Right', 51, 115, 16, 16, '→')}

        {/* Face buttons (dx): layout a rombo Y/X/B/A, raggio aumentato */}
        {faceBtn('Y', 180, 100, 'Y')}
        {faceBtn('X', 162, 118, 'X')}
        {faceBtn('B', 198, 118, 'B')}
        {faceBtn('A', 180, 136, 'A')}

        {/* Stick analogici — riga più in basso, ora con spazio dedicato */}
        {stick(75, 158, stickOffset(lx), stickOffset(ly), 'L3')}
        {stick(145, 138, stickOffset(rx), stickOffset(ry), 'R3')}
      </svg>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          {/* v1.1.10 — rimosso il pallino "connesso" qui: duplicava il LED
              a tre stati sotto, generando confusione (due indicatori,
              uno sempre verde). Il testo stesso comunica già la
              connessione; lo stato di navigazione ha un solo LED,
              quello sotto. */}
          <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50">
            {connected ? t('input.testInputLive') : t('input.noControllerDetected')}
          </span>
        </div>
        <p className={cn("text-[10px] leading-relaxed", 'text-xl-fg-40')}>
          {captureActive
            ? t('input.testModeActive')
            : connected
              ? t('input.testInstructions')
              : t('input.connectControllerPrompt')}
        </p>
        {/* v1.1.9 — sostituita la barra di avanzamento (troppo lunga,
            visibilmente coperta solo a metà) con un LED a tre stati, più
            leggibile a colpo d'occhio: rosso = modalità test attiva
            (input catturati), giallo = pressione di B in corso (uscita
            imminente), verde = controlli sbloccati / navigazione
            normale. */}
        <div className="flex items-center gap-2 mt-3">
          <div className={cn(
            "w-2.5 h-2.5 rounded-full shrink-0 transition-colors",
            !captureActive
              ? "bg-xl-success-500"
              : exitHoldProgress > 0
                ? "bg-xl-warning-400"
                : "bg-xl-danger-500"
          )} />
          <span className={cn(
            "text-[9px] font-black uppercase tracking-widest",
            !captureActive ? "text-xl-success-400" : exitHoldProgress > 0 ? "text-xl-warning-400" : "text-xl-danger-400"
          )}>
            {!captureActive ? t('input.navNormal') : exitHoldProgress > 0 ? t('input.exitInProgress') : t('input.testModeHint')}
          </span>
        </div>
      </div>
    </div>
  );
};

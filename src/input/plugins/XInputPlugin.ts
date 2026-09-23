// Plugin per controller Xbox / standard XInput (layout più comune)
// Copre: Xbox 360, Xbox One, Xbox Series, controller generici XInput
import { InputPlugin, InputState, ButtonName } from '../types';

const BUTTON_MAP: Record<number, ButtonName> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y',
  4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
  8: 'Select', 9: 'Start', 10: 'L3', 11: 'R3',
  12: 'Up', 13: 'Down', 14: 'Left', 15: 'Right',
  16: 'Home',
};

export class XInputPlugin implements InputPlugin {
  readonly id = 'xinput';
  readonly name = 'Xbox / XInput';
  readonly description = 'Xbox 360, Xbox One, Xbox Series e controller XInput generici';
  readonly vendorIds = [0x045E]; // Microsoft
  enabled = true;

  mapButtons(gp: Gamepad): InputState {
    const buttons = new Set<ButtonName>();
    gp.buttons.forEach((btn, i) => {
      if (btn.pressed && BUTTON_MAP[i]) buttons.add(BUTTON_MAP[i]);
    });
    // Analog stick → D-pad con deadzone 0.5
    const LX = gp.axes[0], LY = gp.axes[1];
    if (LX < -0.5) buttons.add('Left');
    if (LX >  0.5) buttons.add('Right');
    if (LY < -0.5) buttons.add('Up');
    if (LY >  0.5) buttons.add('Down');
    return { buttons, axes: [gp.axes[0], gp.axes[1], gp.axes[2] ?? 0, gp.axes[3] ?? 0] };
  }

  rumble(gamepadIndex: number, strong: number, weak: number, duration = 200) {
    const gp = navigator.getGamepads()[gamepadIndex];
    // vibrationActuator.playEffect è nei tipi DOM standard (lib.dom.d.ts di
    // questa versione di TS) — nessun cast necessario. La chiamata resta
    // opzionale (?.) per sicurezza a runtime su browser/ambienti che non
    // la supportano davvero, anche se il tipo la dichiara sempre presente.
    gp?.vibrationActuator?.playEffect?.('dual-rumble', {
      startDelay: 0, duration, weakMagnitude: weak, strongMagnitude: strong,
    });
  }
}

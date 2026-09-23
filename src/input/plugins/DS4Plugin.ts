// Plugin DualShock 4 (PlayStation 4)
// Mapping diverso da XInput: Cross/Circle/Square/Triangle e L2/R2 come assi
import { InputPlugin, InputState, ButtonName } from '../types';

const BUTTON_MAP: Record<number, ButtonName> = {
  0: 'A',      // Cross
  1: 'B',      // Circle
  2: 'X',      // Square
  3: 'Y',      // Triangle
  4: 'L1', 5: 'R1',
  6: 'L2', 7: 'R2',
  8: 'Select', // Share
  9: 'Start',  // Options
  10: 'L3', 11: 'R3',
  12: 'Up', 13: 'Down', 14: 'Left', 15: 'Right',
  16: 'Home',  // PS button
};

export class DS4Plugin implements InputPlugin {
  readonly id = 'ds4';
  readonly name = 'DualShock 4';
  readonly description = 'Controller PlayStation 4 (via USB o Bluetooth)';
  readonly vendorIds = [0x054C]; // Sony
  enabled = true;

  mapButtons(gp: Gamepad): InputState {
    const buttons = new Set<ButtonName>();
    gp.buttons.forEach((btn, i) => {
      if (btn.pressed && BUTTON_MAP[i]) buttons.add(BUTTON_MAP[i]);
    });
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

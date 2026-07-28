// Plugin DualSense (PlayStation 5)
// Layout identico al DS4 ma VID/PID diversi e supporto haptic avanzato
import { InputPlugin, InputState, ButtonName } from '../types';

const BUTTON_MAP: Record<number, ButtonName> = {
  0: 'A', 1: 'B', 2: 'X', 3: 'Y',
  4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2',
  8: 'Select', 9: 'Start', 10: 'L3', 11: 'R3',
  12: 'Up', 13: 'Down', 14: 'Left', 15: 'Right',
  16: 'Home',
};

export class DS5Plugin implements InputPlugin {
  readonly id = 'ds5';
  readonly name = 'DualSense';
  readonly description = 'Controller PlayStation 5 (via USB o Bluetooth)';
  readonly vendorIds = [0x054C]; // Sony — PID: 0x0CE6
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
    (gp as any)?.vibrationActuator?.playEffect?.('dual-rumble', {
      startDelay: 0, duration, weakMagnitude: weak, strongMagnitude: strong,
    });
  }
}

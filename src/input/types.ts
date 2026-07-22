// =============================================================================
//  X-Launcher — Input Plugin System
// =============================================================================

export type ButtonName =
  | 'A' | 'B' | 'X' | 'Y'
  | 'L1' | 'R1' | 'L2' | 'R2'
  | 'Select' | 'Start' | 'L3' | 'R3'
  | 'Up' | 'Down' | 'Left' | 'Right'
  | 'Home';

export interface InputState {
  buttons: Set<ButtonName>;
  axes: [number, number, number, number]; // LX, LY, RX, RY
}

export interface InputPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly vendorIds: number[];
  enabled: boolean;
  mapButtons(gp: Gamepad): InputState;
  rumble?(gamepadIndex: number, strong: number, weak: number, duration?: number): void;
}

export interface ConnectedDevice {
  index: number;
  id: string;
  vendorId?: number;
  productId?: number;
  pluginId: string;
  connected: boolean;
}

export interface InputPluginConfig {
  pluginId: string;
  enabled: boolean;
  remapping?: Partial<Record<ButtonName, ButtonName>>;
}

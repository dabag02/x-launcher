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

// Sottoinsieme di InputPlugin usato dalla UI (tab Input in Impostazioni):
// solo i campi mostrati/attivabili a schermo, mai mapButtons/rumble (mai
// invocati dal componente — la UI attiva/disattiva il plugin tramite
// InputManager.setPluginEnabled, non chiamando i metodi direttamente).
export type InputPluginSummary = Pick<InputPlugin, 'id' | 'name' | 'description' | 'vendorIds' | 'enabled'>;

export function toInputPluginSummary(p: InputPlugin): InputPluginSummary {
  return { id: p.id, name: p.name, description: p.description, vendorIds: p.vendorIds, enabled: p.enabled };
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

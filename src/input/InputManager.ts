// =============================================================================
//  InputManager — registro centrale dei plugin input
//  Gestisce rilevamento dispositivi, assegnazione plugin, polling stato
// =============================================================================
import { InputPlugin, InputState, ConnectedDevice, ButtonName } from './types';
import { XInputPlugin }   from './plugins/XInputPlugin';
import { DS4Plugin }      from './plugins/DS4Plugin';
import { DS5Plugin }      from './plugins/DS5Plugin';
import { GenericPlugin }  from './plugins/GenericPlugin';

/** Estrae vendor ID dalla stringa id del browser (es. "Vendor: 054c Product: 0ce6") */
function extractVendorId(id: string): number | undefined {
  const m = id.match(/vendor:\s*([0-9a-f]{4})/i) || id.match(/([0-9a-f]{4}):[0-9a-f]{4}/i);
  return m ? parseInt(m[1], 16) : undefined;
}

/** Sceglie il plugin più appropriato per un gamepad */
function matchPlugin(gp: Gamepad, plugins: InputPlugin[]): InputPlugin {
  const vendorId = extractVendorId(gp.id);
  const id = gp.id.toLowerCase();

  // Prima: match per VID esplicito (escludi generic con vendorId 0)
  if (vendorId) {
    // DS5: Sony VID + "dualsense" o PID 0ce6
    if (id.includes('dualsense') || id.includes('0ce6')) {
      const p = plugins.find(p => p.id === 'ds5' && p.enabled);
      if (p) return p;
    }
    // DS4: Sony VID + "dualshock" o "wireless controller"
    if (id.includes('dualshock') || (vendorId === 0x054C && id.includes('wireless'))) {
      const p = plugins.find(p => p.id === 'ds4' && p.enabled);
      if (p) return p;
    }
    // Xbox / XInput
    if (id.includes('xbox') || id.includes('xinput') || vendorId === 0x045E) {
      const p = plugins.find(p => p.id === 'xinput' && p.enabled);
      if (p) return p;
    }
  }

  // Fallback: primo plugin abilitato con vendorId 0 (generic)
  return plugins.find(p => p.vendorIds.includes(0) && p.enabled) ?? plugins[0];
}

class InputManagerClass {
  /** Registro di tutti i plugin disponibili */
  readonly plugins: InputPlugin[] = [
    new XInputPlugin(),
    new DS4Plugin(),
    new DS5Plugin(),
    new GenericPlugin(),
  ];

  /** Dispositivi fisici attualmente connessi */
  private _devices: ConnectedDevice[] = [];

  get devices(): ConnectedDevice[] { return this._devices; }

  /** Carica lo stato enabled dei plugin da localStorage */
  loadConfig() {
    try {
      const raw = localStorage.getItem('x-launcher-input-plugins');
      if (!raw) return;
      const configs: Record<string, { enabled: boolean }> = JSON.parse(raw);
      for (const plugin of this.plugins) {
        if (configs[plugin.id] !== undefined) {
          plugin.enabled = configs[plugin.id].enabled;
        }
      }
    } catch {}
  }

  /** Persiste lo stato enabled dei plugin su localStorage */
  saveConfig() {
    try {
      const configs: Record<string, { enabled: boolean }> = {};
      for (const p of this.plugins) configs[p.id] = { enabled: p.enabled };
      localStorage.setItem('x-launcher-input-plugins', JSON.stringify(configs));
    } catch {}
  }

  setPluginEnabled(id: string, enabled: boolean) {
    const plugin = this.plugins.find(p => p.id === id);
    if (plugin) { plugin.enabled = enabled; this.saveConfig(); }
  }

  /** Aggiorna la lista dispositivi connessi — chiamato da useInputManager */
  refreshDevices() {
    const gamepads = Array.from(navigator.getGamepads()).filter(Boolean) as Gamepad[];
    this._devices = gamepads.map(gp => {
      const plugin = matchPlugin(gp, this.plugins);
      return {
        index:     gp.index,
        id:        gp.id,
        vendorId:  extractVendorId(gp.id),
        pluginId:  plugin.id,
        connected: gp.connected,
      };
    });
  }

  /**
   * Legge lo stato del gamepad primario (index 0) applicando il plugin corretto.
   * Restituisce uno stato vuoto se nessun controller è connesso o tutti i plugin
   * compatibili sono disabilitati.
   */
  readPrimary(): InputState {
    const gp = navigator.getGamepads()[0];
    if (!gp) return { buttons: new Set<ButtonName>(), axes: [0, 0, 0, 0] };
    const plugin = matchPlugin(gp, this.plugins);
    return plugin.mapButtons(gp);
  }

  /** Vibrazione sul dispositivo primario */
  rumblePrimary(strong = 0.5, weak = 0.3, duration = 150) {
    const gp = navigator.getGamepads()[0];
    if (!gp) return;
    const plugin = matchPlugin(gp, this.plugins);
    plugin.rumble?.(0, strong, weak, duration);
  }
}

// Singleton
export const InputManager = new InputManagerClass();

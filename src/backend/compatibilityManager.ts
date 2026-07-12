import { Game, CompatibilityProfile } from '../types';
import { execSync, exec } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

export interface CommunityFix {
  id: string;
  gameId: string;
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
}

/**
 * CompatibilityManager — versione Linux reale.
 *
 * La versione originale aveva solo mock data. Questa implementazione:
 * - Scansiona le cartelle Proton/GE reali sull'FS
 * - Scarica Proton-GE tramite ProtonUp-Qt CLI (protonup) se disponibile,
 *   altrimenti via curl + tar come fallback
 * - Rileva tool di sistema (mangohud, gamescope, gamemode)
 */

class CompatibilityManager {
  // Cartelle dove Steam installa i build Proton
  private readonly protonDirs = [
    `${homedir()}/.steam/steam/steamapps/common`,
    `${homedir()}/.local/share/Steam/steamapps/common`,
    // Proton-GE via ProtonUp-Qt
    `${homedir()}/.local/share/Steam/compatibilitytools.d`,
  ];

  private communityFixes: CommunityFix[] = [
    {
      id: 'fix-cp-audio',
      gameId: 'gog-cp77',
      title: 'Fix Audio Crackling',
      description: 'Imposta PULSE_LATENCY_MSEC=60 per un audio più fluido con PulseAudio.',
      impact: 'Medium',
    },
    {
      id: 'fix-elden-anticheat',
      gameId: 'steam-er',
      title: 'EasyAntiCheat Bypass (offline)',
      description: 'Rinomina start_protected_game.exe → eldenring.exe per la modalità offline.',
      impact: 'High',
    },
    {
      id: 'fix-dxvk-async',
      gameId: 'bnet-diablo4',
      title: 'DXVK Async Pipeline',
      description: 'DXVK_ASYNC=1 riduce gli stutter durante la compilazione shader.',
      impact: 'High',
    },
  ];

  /** Scansiona l'FS e restituisce i build Proton effettivamente installati */
  getAvailableRunners(): Array<{ id: string; version: string; status: string }> {
    const found: Array<{ id: string; version: string; status: string }> = [];
    const seen = new Set<string>();

    for (const dir of this.protonDirs) {
      if (!existsSync(dir)) continue;
      try {
        const entries = readdirSync(dir) as string[];
        for (const entry of entries) {
          if (!entry.toLowerCase().includes('proton')) continue;
          if (seen.has(entry)) continue;
          seen.add(entry);
          const protonBin = path.join(dir, entry, 'proton');
          if (existsSync(protonBin)) {
            found.push({ id: entry, version: entry, status: 'installed' });
          }
        }
      } catch { /* directory non leggibile */ }
    }

    return found;
  }

  /**
   * Scarica Proton-GE.
   * Strategia:
   *   1. Se protonup CLI è disponibile → `protonup -i <version>`
   *   2. Altrimenti: download diretto da GitHub Releases via curl + tar
   */
  async downloadProton(id: string, onLogging: (msg: string) => void) {
    onLogging(`[COMPAT] Avvio download per ${id}...`);

    // Strategia 1: ProtonUp-Qt CLI
    if (this.binaryExists('protonup')) {
      onLogging(`[COMPAT] ProtonUp CLI trovato. Invocando protonup -i ${id}...`);
      return new Promise<void>((resolve, reject) => {
        exec(`protonup -i "${id}"`, (err, stdout, stderr) => {
          if (err) {
            onLogging(`[COMPAT] protonup fallito: ${stderr}`);
            reject(err);
          } else {
            onLogging(`[COMPAT] ${id} installato con successo via ProtonUp.`);
            resolve();
          }
        });
      });
    }

    // Strategia 2: download manuale da GitHub
    const geVersion = id.replace('Proton-GE-', 'GE-Proton');
    const tarName = `${geVersion}.tar.gz`;
    const url = `https://github.com/GloriousEggroll/proton-ge-custom/releases/download/${geVersion}/${tarName}`;
    const destDir = `${homedir()}/.local/share/Steam/compatibilitytools.d`;

    onLogging(`[COMPAT] Fetching: ${url}`);
    onLogging(`[COMPAT] Destinazione: ${destDir}`);

    return new Promise<void>((resolve, reject) => {
      exec(
        `mkdir -p "${destDir}" && curl -L "${url}" | tar -xz -C "${destDir}"`,
        (err, stdout, stderr) => {
          if (err) {
            onLogging(`[COMPAT] Download fallito: ${stderr}`);
            reject(err);
          } else {
            onLogging(`[COMPAT] ${id} estratto in ${destDir}. Riavvia Steam per rilevarlo.`);
            resolve();
          }
        }
      );
    });
  }

  getSuggestedFixes(gameId: string): CommunityFix[] {
    return this.communityFixes.filter(f => f.gameId === gameId);
  }

  /**
   * Disinstalla un runner Proton-GE rimuovendo la sua cartella da
   * compatibilitytools.d. Vincolo di sicurezza: rifiuta esplicitamente di
   * procedere se il runner non si trova in quella cartella specifica —
   * in particolare non tocca mai steamapps/common, dove Steam gestisce
   * direttamente le proprie versioni ufficiali di Proton. Rimuovere quei
   * file manualmente romperebbe l'integrità della libreria Steam, che non
   * è compito né responsabilità di questo comando.
   */
  async uninstallProton(id: string, onLogging: (msg: string) => void) {
    const compatDir = `${homedir()}/.local/share/Steam/compatibilitytools.d`;
    const target = path.join(compatDir, id);

    if (!existsSync(target)) {
      const msg = `${id} non trovato in compatibilitytools.d — impossibile disinstallare (potrebbe essere un runner Steam ufficiale, gestito da Steam stesso, non da X-Launcher).`;
      onLogging(`[COMPAT] ${msg}`);
      throw new Error(msg);
    }

    onLogging(`[COMPAT] Rimozione ${id} da ${compatDir}...`);
    return new Promise<void>((resolve, reject) => {
      exec(`rm -rf "${target}"`, (err, stdout, stderr) => {
        if (err) {
          onLogging(`[COMPAT] Disinstallazione fallita: ${stderr}`);
          reject(err);
        } else {
          onLogging(`[COMPAT] ${id} disinstallato con successo.`);
          resolve();
        }
      });
    });
  }

  getAutoMapping(gameTitle: string): string {
    if (gameTitle.includes('Cyberpunk')) return 'Proton-GE-8.25';
    if (gameTitle.includes('Diablo')) return 'Wine-Lutris';
    return 'Proton 8.0-4';
  }

  getDefaultProfile(): CompatibilityProfile {
    return {
      dxvk: true,
      vkd3d: true,
      fsr: false,
      gameMode: this.binaryExists('gamemoderun'),
      mangohud: this.binaryExists('mangohud'),
    };
  }

  /** Rileva tool di sistema utili per la UI Settings */
  detectSystemTools(): Record<string, boolean | string> {
    // EAC runtime — cerca nelle path standard di Steam/Proton
    const eacPath = (() => {
      try {
        const r = execSync(
          'find /usr/share/steam /home -name "eac_runtime" -type d 2>/dev/null | head -1',
          { encoding: 'utf-8', timeout: 3000 }
        ).trim();
        return r || null;
      } catch { return null; }
    })();

    // BattlEye runtime
    const bePath = (() => {
      try {
        const r = execSync(
          'find /usr/share/steam /home -name "battleye_runtime" -type d 2>/dev/null | head -1',
          { encoding: 'utf-8', timeout: 3000 }
        ).trim();
        return r || null;
      } catch { return null; }
    })();

    // FSR — disponibile se il driver Mesa/AMDGPU >= 21.x o DXVK >= 1.10
    // Verifica pratica: presenza di variabile FSR nel wine installato
    const fsrAvailable = (() => {
      try {
        const wineVer = execSync('wine --version 2>/dev/null', { encoding: 'utf-8', timeout: 3000 }).trim();
        // FSR via Wine funziona con wine >= 7.x
        const match = wineVer.match(/wine-(\d+)\./);
        return match ? parseInt(match[1]) >= 7 : false;
      } catch { return false; }
    })();

    return {
      gamescope: this.binaryExists('gamescope'),
      mangohud:  this.binaryExists('mangohud'),
      gamemode:  this.binaryExists('gamemoderun'),
      protonup:  this.binaryExists('protonup'),
      lutris:    this.binaryExists('lutris'),
      steam:     this.binaryExists('steam'),
      retroarch: this.binaryExists('retroarch'),
      scummvm:   this.binaryExists('scummvm'),
      dosbox:    this.binaryExists('dosbox-staging') || this.binaryExists('dosbox'),
      wine:      this.binaryExists('wine'),
      fsr:       fsrAvailable,
      eac:       !!eacPath,
      battleye:  !!bePath,
      eacPath:   eacPath ?? '',
      bePath:    bePath  ?? '',
    };
  }

  private binaryExists(bin: string): boolean {
    try {
      execSync(`which ${bin}`, { stdio: 'ignore' });
      return true;
    } catch { return false; }
  }

  /**
   * Recupera le ultime versioni Proton-GE installabili.
   * Strategia:
   *   1. Se `protonup` è disponibile → `protonup -l` per le versioni disponibili
   *   2. Altrimenti → GitHub Releases API (ultimi 10 tag)
   * Filtra quelle già installate localmente.
   */
  async getInstallableRunners(): Promise<Array<{ id: string; version: string; source: 'protonup' | 'github'; installed: boolean }>> {
    const installed = new Set(this.getAvailableRunners().map(r => r.id));

    // Strategia 1: protonup --available (o -l secondo la versione)
    if (this.binaryExists('protonup')) {
      try {
        // protonup -l lists installable versions
        const raw = execSync('protonup -l 2>/dev/null || protonup --available 2>/dev/null', {
          encoding: 'utf-8', timeout: 10000, shell: true,
        });
        const versions = raw.split('\n')
          .map(l => l.trim())
          .filter(l => /^GE-Proton|^Proton-GE/i.test(l))
          .slice(0, 10);
        if (versions.length > 0) {
          return versions
            .map(v => ({
              id:        v,
              version:   v,
              source:    'protonup' as const,
              installed: installed.has(v),
            }))
            .filter(r => !r.installed);
        }
      } catch { /* fallthrough a GitHub */ }
    }

    // Strategia 2: GitHub Releases API
    try {
      const raw = execSync(
        'curl -sf --max-time 8 "https://api.github.com/repos/GloriousEggroll/proton-ge-custom/releases?per_page=10"',
        { encoding: 'utf-8', timeout: 12000 }
      );
      const releases: Array<{ tag_name: string }> = JSON.parse(raw);
      return releases
        .slice(0, 8)
        .map(r => ({
          id:        r.tag_name,
          version:   r.tag_name,
          source:    'github' as const,
          installed: installed.has(r.tag_name),
        }))
        .filter(r => !r.installed);
    } catch {
      return [];
    }
  }

  /**
   * Calcola lo spazio usato da ~/Games/ (dove X-Launcher installa i giochi).
   * Usa `du -sb` per la dimensione in byte, con timeout breve.
   */
  getDiskUsage(): {
    gamesDir: string;
    usedBytes: number; usedHuman: string;
    totalBytes: number; totalHuman: string;
    freeBytes: number;  freeHuman: string;
    usedPercent: number;
  } {
    const { join } = require('path') as typeof import('path');
    const gamesDir = join(homedir(), 'Games');

    const fmt = (b: number) =>
      b > 1e12 ? `${(b / 1e12).toFixed(2)} TB`
      : b > 1e9  ? `${(b / 1e9).toFixed(1)} GB`
      : b > 1e6  ? `${(b / 1e6).toFixed(0)} MB`
      :             `${(b / 1e3).toFixed(0)} KB`;

    // Spazio usato da ~/Games (0 se la cartella non esiste ancora)
    let usedBytes = 0;
    try {
      const raw = execSync(`du -sb "${gamesDir}" 2>/dev/null`, { encoding: 'utf-8', timeout: 8000 });
      usedBytes = parseInt(raw.split('\t')[0]) || 0;
    } catch { /* cartella non ancora creata */ }

    // Spazio totale/libero della partizione home via df (non fallisce mai)
    let totalBytes = 0, freeBytes = 0;
    try {
      // df -B1 restituisce byte esatti; usiamo homedir() come punto di mount certo
      const df = execSync(`df -B1 --output=size,avail "${homedir()}" 2>/dev/null | tail -1`, {
        encoding: 'utf-8', timeout: 5000,
      });
      const parts = df.trim().split(/\s+/);
      totalBytes = parseInt(parts[0]) || 0;
      freeBytes  = parseInt(parts[1]) || 0;
    } catch { /* fallback — tutto a zero */ }

    const usedPercent = totalBytes > 0 ? Math.round(((totalBytes - freeBytes) / totalBytes) * 100) : 0;

    return {
      gamesDir,
      usedBytes,  usedHuman:  usedBytes  > 0 ? fmt(usedBytes)  : '—',
      totalBytes, totalHuman: totalBytes > 0 ? fmt(totalBytes) : '—',
      freeBytes,  freeHuman:  freeBytes  > 0 ? fmt(freeBytes)  : '—',
      usedPercent,
    };
  }
}

export const compatibilityManager = new CompatibilityManager();

// Step 19a — Info Hardware in Gestisci Account, richiesta dall'utente:
// Motherboard, CPU, GPU, RAM, HDD, OS. Verificato con una ricerca reale
// prima di scrivere questo file (non indovinato): tutti i valori qui
// sotto sono leggibili SENZA permessi elevati — a differenza di
// dmidecode (che richiede root per leggere le DMI info dalla BIOS
// direttamente), il kernel Linux espone già le stesse informazioni base
// (vendor/nome scheda madre) via sysfs in /sys/class/dmi/id/, leggibili
// da qualunque utente — solo il numero di serie lì dentro richiede root,
// e non ci serve per questa funzione.
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';
import { writeLog } from './logger';

function readFileTrim(path: string): string | null {
  try {
    const content = fs.readFileSync(path, 'utf-8').trim();
    return content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

function getMotherboard(): string {
  const vendor = readFileTrim('/sys/class/dmi/id/board_vendor');
  const name = readFileTrim('/sys/class/dmi/id/board_name');
  if (vendor && name) return `${vendor} ${name}`;
  return vendor || name || 'Non disponibile';
}

// os.cpus() è un'API Node nativa, multipiattaforma — nessun comando di
// sistema da eseguire, nessun problema di permessi possibile.
function getCPU(): string {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return 'Non disponibile';
  // Il model name di Linux include spesso spazi multipli e il clock
  // base fra parentesi — ripulito qui per una resa più compatta.
  const model = cpus[0].model.replace(/\s+/g, ' ').trim();
  return `${model} (${cpus.length} thread)`;
}

// os.totalmem() è anch'essa un'API Node nativa — stessa considerazione.
function getRAM(): string {
  const totalGB = os.totalmem() / (1024 ** 3);
  return `${totalGB.toFixed(1)} GB`;
}

function getGPU(): string {
  // nvidia-smi prima, se disponibile — informazione più ricca (nome
  // preciso + VRAM) per le GPU NVIDIA, il caso più comune per questo
  // progetto (HTPC gaming). Non richiede root.
  try {
    const out = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', {
      timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    const firstLine = out.split('\n')[0]?.trim();
    if (firstLine) return firstLine;
  } catch {
    // nvidia-smi assente o nessuna GPU NVIDIA — prova lspci sotto.
  }
  // Fallback universale (AMD/Intel/NVIDIA senza driver proprietario):
  // lspci elenca il controller video, non richiede root per la sola
  // lettura dell'elenco dispositivi PCI.
  try {
    const out = execSync("lspci | grep -iE 'vga|3d controller'", {
      timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    const firstLine = out.split('\n')[0];
    if (firstLine) {
      // Formato tipico: "01:00.0 VGA compatible controller: NVIDIA Corporation GA104 [GeForce RTX 3070] (rev a1)"
      // — tiene solo la parte dopo l'ultimo ':' prima della descrizione.
      const parts = firstLine.split(': ');
      return parts.length > 1 ? parts.slice(1).join(': ').trim() : firstLine;
    }
  } catch {
    // lspci assente o nessun risultato.
  }
  return 'Non disponibile';
}

function getStorage(): string {
  // Solo il filesystem radice ("/") — un riassunto a una riga, non un
  // dump completo di df -h per ogni mount (troppo per una singola voce
  // nella tab Info Hardware).
  try {
    const out = execSync('df -h / | tail -1', {
      timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    // Formato tipico: "/dev/nvme0n1p2  475G  210G  241G  47% /"
    const parts = out.split(/\s+/);
    if (parts.length >= 5) {
      return `${parts[2]} usati / ${parts[1]} totali (${parts[4]} pieno)`;
    }
    return out || 'Non disponibile';
  } catch {
    return 'Non disponibile';
  }
}

function getOS(): string {
  const osRelease = readFileTrim('/etc/os-release');
  let prettyName: string | null = null;
  if (osRelease) {
    const match = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    if (match) prettyName = match[1];
  }
  const kernel = os.release();
  return prettyName ? `${prettyName} — kernel ${kernel}` : `Linux — kernel ${kernel}`;
}

export interface SystemInfo {
  motherboard: string;
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  os: string;
}

let cached: SystemInfo | null = null;

/**
 * L'hardware non cambia durante l'esecuzione del demone — calcolato una
 * sola volta e tenuto in cache in memoria per il resto della sessione,
 * invece di rieseguire lspci/nvidia-smi/df ad ogni apertura della tab.
 */
export function getSystemInfo(): SystemInfo {
  if (cached) return cached;
  cached = {
    motherboard: getMotherboard(),
    cpu: getCPU(),
    gpu: getGPU(),
    ram: getRAM(),
    storage: getStorage(),
    os: getOS(),
  };
  writeLog('info', `[SYSTEM-INFO] ${JSON.stringify(cached)}`);
  return cached;
}

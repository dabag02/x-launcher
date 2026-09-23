#!/usr/bin/env node
/**
 * setup-steam-shortcut.js — Aggiunge X-Launcher come Non-Steam Game in
 * Steam, con artwork dedicata (grid/hero/logo), per renderlo raggiungibile
 * da Big Picture come un titolo qualunque della libreria.
 *
 * v0.99.32/33 — Parte D dell'integrazione Steam. Eseguito UNA TANTUM, non
 * ad ogni avvio della Dashboard (a differenza di session-launch.sh) — è
 * uno script di setup, non parte del flusso normale.
 *
 * LIMITE NOTO E CONFERMATO (issue ufficiale ValveSoftware/steam-for-linux
 * #9463): l'AppID "canonico" di uno shortcut non-Steam (quello scritto qui
 * in shortcuts.vdf, usato per l'artwork) resta calcolabile in modo
 * deterministico via CRC32 — lo generiamo e scriviamo noi. Il BPID (l'id
 * specifico richiesto per steam://rungameid/<BPID>, necessario per un
 * lancio "programmatico" dall'esterno di Steam) NON è più prevedibile a
 * priori dalla versione recente del client Steam — Steam lo assegna in
 * modo casuale al momento dell'aggiunta, leggibile solo DOPO aver lanciato
 * lo shortcut almeno una volta (da screenshots.vdf). Questo script quindi
 * NON produce un comando "steam://rungameid/X-Launcher" riutilizzabile: la
 * card va cliccata manualmente da dentro Big Picture, come qualunque altro
 * Non-Steam Game — è il limite reale della piattaforma, non una scelta di
 * design di questo progetto.
 *
 * Uso:
 *   node scripts/setup-steam-shortcut.js [path/a/kiosk-launch.sh]
 *
 * Se l'argomento non è fornito, punta a kiosk-launch.sh nella cartella
 * padre di questo script (funziona sia da /opt/x-launcher/scripts/ sia
 * dalla cartella di sviluppo, nessun path hardcoded).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const PROJECT_DIR = path.resolve(__dirname, '..');
const EXE_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(PROJECT_DIR, 'kiosk-launch.sh');
const APP_NAME = 'X-Launcher';

function log(msg) { console.log(`[SETUP-STEAM] ${msg}`); }
function fail(msg) { console.error(`[SETUP-STEAM] ERRORE: ${msg}`); process.exit(1); }

// ---------------------------------------------------------------------------
// 1. Trova lo SteamID dell'utente corrente leggendo loginusers.vdf (testo,
//    formato KeyValues semplice — non richiede un parser binario).
// ---------------------------------------------------------------------------
function findSteamUserdataDir() {
  const steamRoot = [
    path.join(os.homedir(), '.steam', 'steam'),
    path.join(os.homedir(), '.local', 'share', 'Steam'),
  ].find(p => fs.existsSync(p));

  if (!steamRoot) {
    fail('Cartella Steam non trovata (~/.steam/steam o ~/.local/share/Steam). Steam è installato e avviato almeno una volta?');
  }

  const loginUsersPath = path.join(steamRoot, 'config', 'loginusers.vdf');
  if (!fs.existsSync(loginUsersPath)) {
    fail(`${loginUsersPath} non trovato — accedi a Steam almeno una volta prima di eseguire questo script.`);
  }

  const content = fs.readFileSync(loginUsersPath, 'utf-8');
  // Ogni blocco utente è tipo: "76561198xxxxxxxxx" { ... "MostRecent" "1" ... }
  // Cerchiamo il blocco con MostRecent="1" — è l'ultimo utente loggato,
  // quello la cui sessione Steam -silent (session-launch.sh) sta usando.
  const blocks = content.split(/(?="\d{17}")/g);
  let longUserId = null;
  for (const block of blocks) {
    const idMatch = block.match(/^"(\d{17})"/);
    if (!idMatch) continue;
    if (/"MostRecent"\s*"1"/.test(block)) {
      longUserId = idMatch[1];
      break;
    }
  }
  if (!longUserId) {
    fail('Nessun utente con MostRecent=1 trovato in loginusers.vdf — specifica manualmente lo SteamID o accedi di nuovo a Steam.');
  }

  // Short UserID = Long UserID & 0xFFFFFFFF (stesso metodo usato da
  // steamtinkerlaunch per derivare la cartella userdata/<shortId>/).
  const shortUserId = (BigInt(longUserId) & 0xFFFFFFFFn).toString();
  const userdataDir = path.join(steamRoot, 'userdata', shortUserId);
  if (!fs.existsSync(userdataDir)) {
    fail(`Cartella userdata non trovata: ${userdataDir} — l'utente ha effettivamente fatto login in Steam su questo sistema?`);
  }
  log(`SteamID rilevato: ${longUserId} → cartella userdata: ${shortUserId}`);
  return userdataDir;
}

// ---------------------------------------------------------------------------
// 2. AppID canonico — CRC32('"' + exe + '"' + appname) | 0x80000000.
//    Formula confermata da più fonti indipendenti (steamgrid/Ice,
//    UWPHook, steam-shortcut-manager) per lo shortcut id "classico" usato
//    nel campo appid di shortcuts.vdf e nei nomi file della cartella grid.
// ---------------------------------------------------------------------------
function generateAppId(exePathQuoted, appName) {
  const key = `${exePathQuoted}${appName}`;
  const crc = (zlib.crc32 ? zlib.crc32(Buffer.from(key, 'utf-8')) : crc32Fallback(key)) >>> 0;
  return (crc | 0x80000000) >>> 0;
}

// Fallback per versioni di Node senza zlib.crc32 nativo (aggiunto in Node 21+).
function crc32Fallback(str) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

// ---------------------------------------------------------------------------
// 3. Binary VDF — scrittura minimale per shortcuts.vdf.
//    Formato (confermato da Corecii/steam-binary-vdf-ts, Skizzium/
//    binary-vdf-parser, Valve Developer Wiki):
//      0x00 = inizio mappa (preceduto dal nome chiave, terminato da 0x08)
//      0x01 = stringa (nome chiave + valore, entrambi terminati da 0x00)
//      0x02 = intero a 32 bit LE (nome chiave terminato da 0x00, poi 4 byte)
//      0x08 = fine mappa
// ---------------------------------------------------------------------------
function vdfString(key, value) {
  return Buffer.concat([
    Buffer.from([0x01]),
    Buffer.from(key, 'utf-8'), Buffer.from([0x00]),
    Buffer.from(String(value), 'utf-8'), Buffer.from([0x00]),
  ]);
}
function vdfInt(key, value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return Buffer.concat([
    Buffer.from([0x02]),
    Buffer.from(key, 'utf-8'), Buffer.from([0x00]),
    buf,
  ]);
}
function vdfMapStart(key) {
  return Buffer.concat([Buffer.from([0x00]), Buffer.from(key, 'utf-8'), Buffer.from([0x00])]);
}
const VDF_MAP_END = Buffer.from([0x08]);

/**
 * Legge shortcuts.vdf esistente (se presente) come buffer grezzo, e
 * verifica se contiene già un'entry con lo stesso AppName — per evitare
 * duplicati ad esecuzioni successive di questo script. Non implementiamo
 * un parser completo (fuori scope per un setup eseguito una tantum): se il
 * file esiste già con altri shortcut, li PRESERVIAMO inserendo la nostra
 * nuova entry prima del footer finale, senza toccare gli shortcut
 * esistenti — un controllo di bytes grezzo basta per il solo scopo di
 * evitare un doppione del nostro stesso shortcut.
 */
function buildShortcutEntry(index, appId, appName, exePath, startDir) {
  const exeQuoted = `"${exePath}"`;
  const startDirQuoted = `"${startDir}"`;
  const entry = Buffer.concat([
    vdfMapStart(String(index)),
    vdfInt('appid', appId),
    vdfString('AppName', appName),
    vdfString('Exe', exeQuoted),
    vdfString('StartDir', startDirQuoted),
    vdfString('icon', ''),
    vdfString('ShortcutPath', ''),
    vdfString('LaunchOptions', ''),
    vdfInt('IsHidden', 0),
    vdfInt('AllowDesktopConfig', 1),
    vdfInt('AllowOverlay', 1),
    vdfInt('OpenVR', 0),
    vdfInt('Devkit', 0),
    vdfString('DevkitGameID', ''),
    vdfInt('DevkitOverrideAppID', 0),
    vdfInt('LastPlayTime', 0),
    vdfString('FlatpakAppID', ''),
    vdfMapStart('tags'),
    VDF_MAP_END,
    VDF_MAP_END,
  ]);
  return entry;
}

function writeShortcutsVdf(vdfPath, appId, appName, exePath, startDir) {
  let existingEntries = Buffer.alloc(0);
  let nextIndex = 0;
  let alreadyExists = false;

  if (fs.existsSync(vdfPath)) {
    const raw = fs.readFileSync(vdfPath);
    // Controllo grezzo: se l'AppName compare già nel file come stringa,
    // assumiamo che lo shortcut sia già presente da un'esecuzione
    // precedente di questo script (o aggiunto manualmente con lo stesso
    // nome) — non aggiungiamo un doppione.
    if (raw.includes(Buffer.from(appName, 'utf-8'))) {
      alreadyExists = true;
    } else {
      // Preserva il contenuto esistente: tutto tranne i due 0x08 finali
      // (fine "shortcuts" map + fine root map), dove inseriamo la nuova
      // entry prima di richiuderli.
      if (raw.length >= 2 && raw[raw.length - 1] === 0x08 && raw[raw.length - 2] === 0x08) {
        existingEntries = raw.slice(0, raw.length - 2);
        // Conta gli indici "0", "1", "2"... già presenti per calcolare il
        // prossimo indice libero (i nomi delle entry shortcuts sono
        // stringhe numeriche sequenziali a partire da "0").
        const matches = raw.toString('latin1').match(/\x00(\d+)\x00\x02appid\x00/g) || [];
        nextIndex = matches.length;
      } else {
        log('shortcuts.vdf esistente non riconosciuto come valido (footer inatteso) — verrà sovrascritto con un nuovo file contenente solo lo shortcut X-Launcher. ATTENZIONE: backup consigliato prima di procedere se questo file conteneva altri shortcut.');
      }
    }
  }

  if (alreadyExists) {
    log(`Uno shortcut con nome "${appName}" esiste già in ${vdfPath} — nessuna modifica effettuata. Rimuovilo manualmente da Steam prima di rieseguire questo script se vuoi rigenerarlo.`);
    return false;
  }

  const newEntry = buildShortcutEntry(nextIndex, appId, appName, exePath, startDir);
  // v0.99.32 FIX: la mappa ROOT del file non ha un proprio type-byte
  // dichiarato (non ha una chiave che la preceda, essendo la radice) — il
  // file comincia direttamente con il type-byte+nome del suo primo figlio
  // ("shortcuts", una mappa, quindi 0x00 + "shortcuts" + 0x00). Avevo
  // scritto erroneamente un byte 0x00 aggiuntivo PRIMA di quello, come se
  // la root stessa avesse un proprio header — verificato con un parser di
  // controllo scritto appositamente, che falliva esattamente su questo
  // doppio 0x00 consecutivo all'inizio del file.
  const finalBuffer = existingEntries.length > 0
    ? Buffer.concat([existingEntries, newEntry, VDF_MAP_END, VDF_MAP_END])
    : Buffer.concat([vdfMapStart('shortcuts'), newEntry, VDF_MAP_END, VDF_MAP_END]);

  fs.mkdirSync(path.dirname(vdfPath), { recursive: true });
  fs.writeFileSync(vdfPath, finalBuffer);
  log(`Scritto ${vdfPath} (indice shortcut: ${nextIndex}, appid: ${appId}).`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(EXE_PATH)) {
    fail(`${EXE_PATH} non trovato — passa il path corretto come argomento: node setup-steam-shortcut.js /path/a/kiosk-launch.sh`);
  }
  log(`Eseguibile target: ${EXE_PATH}`);

  const userdataDir = findSteamUserdataDir();
  const configDir = path.join(userdataDir, 'config');
  const gridDir = path.join(configDir, 'grid');
  const vdfPath = path.join(configDir, 'shortcuts.vdf');

  const appId = generateAppId(`"${EXE_PATH}"`, APP_NAME);
  log(`AppID generato (CRC32, canonico): ${appId}`);

  const startDir = path.dirname(EXE_PATH);
  const written = writeShortcutsVdf(vdfPath, appId, APP_NAME, EXE_PATH, startDir);

  if (written) {
    fs.mkdirSync(gridDir, { recursive: true });
    const assetsDir = path.join(PROJECT_DIR, 'assets', 'steam-grid');
    const targets = [
      { src: 'boxart.png',   dest: `${appId}.png` },
      { src: 'hero.png',     dest: `${appId}_hero.png` },
      { src: 'logo.png',     dest: `${appId}_logo.png` },
      { src: 'capsule.png',  dest: `${appId}p.png` },
    ];
    let copiedAny = false;
    for (const t of targets) {
      const srcPath = path.join(assetsDir, t.src);
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, path.join(gridDir, t.dest));
        copiedAny = true;
      } else {
        log(`Asset ${t.src} non trovato in ${assetsDir} — questo specifico file artwork non verrà copiato.`);
      }
    }
    if (copiedAny) {
      log(`Artwork copiata in ${gridDir}`);
    }
    log('');
    log('=== IMPORTANTE ===');
    log('Steam legge shortcuts.vdf solo all\'avvio del client — riavvia Steam (chiudi completamente e rilancia, o "steam -shutdown" seguito da un nuovo avvio) perché lo shortcut e l\'artwork compaiano in libreria/Big Picture.');
    log('Limite noto: non è possibile generare un link "steam://rungameid/..." valido per X-Launcher in anticipo — Steam assegna l\'id di lancio (BPID) in modo casuale al momento dell\'aggiunta, leggibile solo dopo aver lanciato lo shortcut almeno una volta da dentro Steam stesso. La card va cliccata manualmente da Big Picture, come qualunque altro Non-Steam Game.');
  }
}

main();

# X-Launcher — Installazione

> ⚠️ Non riutilizzare mai `node_modules` o `dist` da versioni precedenti.
> Estrai/clona sempre in una cartella nuova e segui questa procedura dall'inizio.

---

## 1. Dipendenze richieste

X-Launcher è un demone Node.js + una finestra browser + un'icona tray Python, che si appoggia a diversi strumenti di sistema. Alcuni sono necessari solo per **compilare**, altri servono a **runtime** per specifiche funzionalità (uno store, un tipo di gioco, un desktop environment).

> **Nota sulla distribuzione**: da `v1.5.0-Venus`, `setup-linux.sh` rileva automaticamente Arch/derivate (`pacman`), Debian/Ubuntu/derivate (`apt`) e Fedora/RHEL/derivate (`dnf`), installando le dipendenze fondamentali con il nome pacchetto giusto per ciascuna famiglia. **Stato di verifica onestamente dichiarato**: Arch è verificato su hardware reale in tutta la sessione di sviluppo di questo progetto; i nomi pacchetto per Debian/Fedora sono verificati sulla documentazione ufficiale di ciascuna distro (non indovinati) ma non ancora testati su una macchina reale — se qualcosa non funziona lì, segnalalo con l'errore esatto. I comandi manuali qui sotto restano in sintassi `pacman` per Arch; per le altre due famiglie usa `setup-linux.sh` oppure consulta la mappatura pacchetto all'inizio dello script stesso.

### Per compilare (obbligatorie)

```bash
sudo pacman -S nodejs-lts-jod npm base-devel python
```

- **Node.js v22 LTS** e **npm**
- **base-devel** (gcc/make) — necessario per compilare `better-sqlite3`, un modulo nativo
- **python3** — usato sia dal build (verifica/creazione ambiente) sia dalla tray a runtime

### Per la tray dell'icona di sistema (gestita automaticamente da `build.sh`)

Nessuna azione manuale richiesta: `build.sh` crea da solo un virtualenv Python dedicato (`.venv-tray/`) e vi installa `pystray`, `pillow`, `python-xlib`. Serve solo che `python3 -m venv` funzioni sul sistema (pacchetto `python` sopra è sufficiente su Arch; su Debian/Ubuntu potrebbe servire anche `python3-venv`).

### Per la gestione delle finestre (kiosk mode, tutti i desktop environment)

```bash
sudo pacman -S wmctrl xorg-xprop
```

- **wmctrl** — nascondere/mostrare/massimizzare la finestra della Dashboard durante il gioco (protocollo EWMH, funziona su qualunque window manager conforme: xfwm4, Mutter, KWin, Marco)
- **xprop** (pacchetto `xorg-xprop` su Arch, `x11-utils` su Debian/Ubuntu, `xorg-x11-utils` su Fedora) — rimozione della decorazione della finestra via `_MOTIF_WM_HINTS`, il meccanismo cross-desktop usato quando il trucco specifico di XFCE non è disponibile

### Solo su XFCE (opzionale, migliora l'aspetto ma non è essenziale)

`xfconf-query` fa già parte di un'installazione XFCE standard — nessun pacchetto aggiuntivo da installare. Su MATE/GNOME/Plasma questi comandi vengono automaticamente saltati (rilevamento del desktop via `$XDG_CURRENT_DESKTOP`), senza errori.

### Cursore del mouse nascosto (opzionale)

```bash
sudo pacman -S unclutter-xfixes
```

Senza questo pacchetto, il cursore viene comunque nascosto ma solo dopo il primo focus della finestra (fallback JavaScript lato client).

### Browser (almeno uno dei due)

```bash
sudo pacman -S chromium
# oppure
sudo pacman -S firefox
```

Entrambi supportati e testati in modo equivalente (finestra a schermo intero senza decorazione, nessuna barra indirizzi). Scelta a runtime: `./kiosk-launch.sh firefox` o `./build.sh start firefox` per forzare Firefox, altrimenti Chromium ha la priorità di default se entrambi sono installati.

### Store e librerie di gioco — FONDAMENTALI per chi usa quello store

| Store | Pacchetto/strumento | Note |
|---|---|---|
| Steam | `steam` | Lettura libreria via file manifest locali + Steam Web API (opzionale, per il tempo di gioco ufficiale) |
| GOG | [`lgogdownloader`](https://github.com/Sude-/lgogdownloader) | Arch: AUR. Debian/Ubuntu: pacchetto ufficiale. **Fedora: pacchetto ufficiale diretto** (`sudo dnf install lgogdownloader`, verificato — nessun COPR necessario). Scraping libreria, download, dimensione prevista di installazione |
| Epic Games | [`legendary`](https://github.com/derrod/legendary) | `pip install --user legendary-gl` funziona su qualunque distro (via `setup-linux.sh` o a mano) — più affidabile del pacchetto di sistema, che non tutte le distro hanno |
| Amazon Games — **RACCOMANDATO** | [`nile`](https://github.com/imLinguin/nile) | Nessun pacchetto pulito su nessuna distro, nemmeno PyPI (il nome "nile" su PyPI è un progetto Python estraneo, non installarlo). Via cross-distro: `pip install --user git+https://github.com/imLinguin/nile.git`. Su Arch, l'AUR `nile-git` è l'alternativa nativa |
| Classic Console (ROM) | [`RetroArch`](https://www.retroarch.com/) + core libretro necessari, [`ScummVM`](https://www.scummvm.org/) (giochi punta-e-clicca), [`DOSBox Staging`](https://dosbox-staging.github.io/) (giochi DOS) | Nessun account richiesto — legge direttamente `~/Roms/` (percorso configurabile, vedi `.env`). Sistemi CD/DVD (PSX, Saturn, Dreamcast, PS2) supportati come `.zip`/`.7z` (richiede `unzip` e `p7zip`, estrazione automatica persistente al primo avvio) o come cartella già estratta, con qualunque combinazione di `.cue`/`.bin`/`.gdi`/`.chd`/`.iso`. Titoli multi-disco riconosciuti automaticamente (tag `(Disc N)`/`(CD N)` nel nome) e uniti in un `.m3u` generato per il cambio disco da RetroArch |

### Compatibilità Windows (Wine/Proton) — FONDAMENTALE

```bash
sudo pacman -S wine winetricks
```

**`winetricks` non è opzionale**: senza, il widget "Dipendenze Wine" dell'overlay non può installare nessuna delle dipendenze redistribuibili (vcrun, dxvk, corefonts, d3dcompiler, dotnet...) — Wine da solo non basta a far partire molti giochi. Proton viene invece rilevato automaticamente se già installato tramite Steam, oppure via GE-Proton — vedi sotto.

### Gestione build Proton-GE — RACCOMANDATO

```bash
pip install --user protonup-ng
# oppure ProtonUp-Qt da Flathub (interfaccia grafica)
```

Alternativa se non disponibili: Steam stesso installato serve anche come fonte per i runner Proton "ufficiali" (non GE), oltre al proprio ruolo di store.

### EasyAntiCheat / BattlEye — RACCOMANDATO (solo se giochi con questi anti-cheat)

```bash
sudo pacman -S lutris   # Debian/Ubuntu/Fedora: vedi lutris.net per repository dedicato
```

### Overlay prestazioni — RACCOMANDATI

```bash
sudo pacman -S mangohud gamemode
```

**FSR non richiede alcuna installazione separata**: è una capacità della versione di Wine installata (>= 7.x, verificato nel codice), non un pacchetto a sé.

### AI Advisor — RACCOMANDATO

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Le schede AI cloud (Gemini/ChatGPT/DeepSeek/Claude) non richiedono nulla da installare, solo una chiave API inserita dall'interfaccia.

### Rilevamento hardware (tab Info Hardware) — FONDAMENTALE

```bash
sudo pacman -S pciutils
```

Serve per `lspci`, usato per identificare la GPU. Se la GPU è NVIDIA, serve anche il driver proprietario NVIDIA (per `nvidia-smi`, controllato per primo se presente).

### Solo per la sessione dedicata (Gamescope) — attualmente incompleta

```bash
sudo pacman -S gamescope
```

La modalità "sessione dedicata senza desktop sotto" è **oggi incompleta e non consigliata** — l'uso previsto e testato è l'installazione entro un desktop environment esistente (XFCE/MATE/GNOME/Plasma).

---

## 2. Compilazione

```bash
cd x-launcher
mkdir -p ~/.local/share/x-launcher
cp .env.example ~/.local/share/x-launcher/.env      # poi modifica .env con le tue chiavi (vedi sezione 5)
chmod +x build.sh kiosk-launch.sh install.sh
npm install
./build.sh compile
```

`npm install` scarica le dipendenze Node (inclusa la compilazione nativa di `better-sqlite3`, per cui serve `base-devel`/gcc). `./build.sh compile` produce `dist/` (backend) e `dist/assets/` (frontend).

> **npm 12 o superiore**: se dopo `npm install` l'avvio fallisce con un errore tipo `Could not locate the bindings file`, gli script di installazione dei pacchetti nativi sono stati bloccati nonostante siano già autorizzati in `package.json` (`allowScripts`) — capita tipicamente reinstallando su un `node_modules` non vuoto (es. dopo un aggiornamento di npm). Basta lanciare `npm rebuild` una volta. Chi usa `setup-linux.sh` non deve fare nulla: lo script lo esegue già in automatico.

---

## 3. Uso locale (senza installazione di sistema)

Il progetto funziona perfettamente lanciato direttamente dalla propria cartella, senza alcuna installazione:

```bash
./build.sh              # compila E avvia
./build.sh start        # avvia senza ricompilare (demone già compilato)
./build.sh start firefox   # avvia forzando Firefox invece di Chromium
./build.sh dev           # modalità sviluppo, con hot module reload
```

Utile durante lo sviluppo attivo o per provare X-Launcher senza impegnarsi in un'installazione permanente.

---

## 4. Installazione di sistema (opzionale)

Per rendere X-Launcher disponibile come **sessione di login dedicata** (selezionabile dalla schermata LightDM) o **raggiungibile da riga di comando** con un nome breve da qualunque cartella:

```bash
sudo ./install.sh
```

Cosa fa, nel dettaglio:
- Copia il progetto (già compilato — esegui prima `./build.sh compile`) in `/opt/x-launcher/` (percorso FHS standard per software non pacchettizzato dalla distro)
- Crea un link `x-launcher` in `/usr/local/bin/`, eseguibile da qualunque cartella
- Installa la sessione LightDM (`xlauncher.desktop`) per l'avvio come sessione di login dedicata
- Registra il protocollo `xlaunch://<id-gioco>` a livello di sistema (per lanciare un gioco da link esterni — script, automazioni, integrazioni di terze parti — senza dover aprire la Dashboard)

Le impostazioni, il database, i log e tutto ciò che è specifico dell'utente restano sempre in `~/.local/share/x-launcher/` (mai in `/opt`), e sopravvivono a reinstallazioni/aggiornamenti.

Per disinstallare:
```bash
sudo ./install.sh --uninstall
```

Rimuove `/opt/x-launcher`, il link e le registrazioni di sistema. **Non tocca** `~/.local/share/x-launcher/` (dati per-utente).

Integrazione Steam opzionale (aggiunge X-Launcher come Non-Steam Game, con artwork dedicata — richiede Steam già autenticato almeno una volta):
```bash
node /opt/x-launcher/scripts/setup-steam-shortcut.cjs
```

---

## 5. Variabili d'ambiente (`.env`)

Il file vive in `~/.local/share/x-launcher/.env` — **non** nella cartella del progetto: così è sempre nello stesso posto qualunque sia il modo in cui avvii il daemon (`npm run dev`, `./kiosk-launch.sh`, o il servizio systemd `xdash.service`), sopravvive agli aggiornamenti del progetto, e con un'installazione di sistema (`/opt`) non richiede sudo per essere modificato. `.env.example` resta invece nel repository, solo come template da copiare.

Tutte le variabili sono opzionali — X-Launcher funziona anche senza `.env`, con funzionalità ridotte dove manca una chiave.

| Variabile | Descrizione |
|---|---|
| `STEAM_API_KEY` | Steam Web API key, per il tempo di gioco ufficiale Steam. Ottienila su https://steamcommunity.com/dev/apikey |
| `STEAM_ID` | Il tuo SteamID64 — rilevato automaticamente se vuoto |
| `ROMS_PATH` | Cartella ROM per Classic Console (default `~/Roms/`) — struttura attesa: `~/Roms/SNES/`, `~/Roms/N64/`, `~/Roms/PSX/`, `~/Roms/SATURN/`, `~/Roms/DREAMCAST/`, `~/Roms/PS2/`, ecc. Per i sistemi a cartuccia, file `.zip`; per i sistemi CD/DVD, anche `.7z`, o una cartella già estratta con dentro `.cue`/`.bin`/`.gdi`/`.chd`/`.iso` |
| `STEAMGRIDDB_API_KEY` | Cover art per GOG/Epic/Classic Console. Chiave su https://www.steamgriddb.com/profile/preferences/api |
| `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | Rating, generi, descrizione, data di uscita. Registra un'app su https://dev.twitch.tv/console |

---

## 6. Log

```bash
tail -f ~/.local/share/x-launcher/daemon.log     # demone Node, in tempo reale
tail -f ~/.local/share/x-launcher/tray.log       # icona tray Python
```

Per condividere un log a supporto di una segnalazione:
```bash
cat ~/.local/share/x-launcher/daemon.log
```

---

## 7. Dati persistiti

```
~/.local/share/x-launcher/
  ├── .env                    # variabili d'ambiente (vedi sezione 5)
  ├── x-launcher.db          # database SQLite (libreria, config di gioco, tempo di gioco,
  │                          #   credenziali provider AI Advisor, ecc.)
  ├── tokens.json             # token OAuth (permessi 600)
  ├── app.conf                # preferenze persistite (display mode, lingua, ecc.)
  ├── daemon.log              # log del demone Node
  ├── tray.log                # log dell'icona tray
  ├── game-logs/               # stdout/stderr dell'ultimo lancio per gioco (diagnosi avvio)
  ├── firefox-profile/        # profilo Firefox dedicato (solo se usi Firefox)
  └── avatars/                # immagini avatar caricate dall'utente
```

Questi file sopravvivono agli aggiornamenti del pacchetto e non vengono mai toccati da `install.sh --uninstall`.

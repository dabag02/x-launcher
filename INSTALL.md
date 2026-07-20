# X-Launcher — Installazione

> ⚠️ Non riutilizzare mai `node_modules` o `dist` da versioni precedenti.
> Estrai/clona sempre in una cartella nuova e segui questa procedura dall'inizio.

---

## 1. Dipendenze richieste

X-Launcher è un demone Node.js + una finestra browser + un'icona tray Python, che si appoggia a diversi strumenti di sistema. Alcuni sono necessari solo per **compilare**, altri servono a **runtime** per specifiche funzionalità (uno store, un tipo di gioco, un desktop environment).

> **Nota sulla distribuzione**: i comandi qui sotto usano `pacman` (Arch Linux), l'unica distro su cui il progetto è stato sviluppato e testato finora. Il supporto ai desktop environment (XFCE/MATE/GNOME/Plasma) è multipiattaforma per costruzione, ma `install.sh` non fa ancora rilevamento automatico del gestore pacchetti di altre distro (`apt`/`dnf`/`zypper`) — su Debian/Ubuntu/Fedora/openSUSE dovrai tradurre i nomi pacchetto manualmente (generalmente molto simili).

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

### Store e librerie di gioco (installa solo quelli che usi)

| Store | Pacchetto/strumento | Note |
|---|---|---|
| Steam | `steam` | Lettura libreria via file manifest locali + Steam Web API (opzionale, per il tempo di gioco ufficiale) |
| GOG | [`lgogdownloader`](https://github.com/Sude-/lgogdownloader) (AUR) | Scraping libreria, download, dimensione prevista di installazione |
| Epic Games | [`legendary`](https://github.com/derrod/legendary) (AUR: `legendary`) | Stesso ruolo di lgogdownloader, per Epic |
| Classic Console (ROM) | [`RetroArch`](https://www.retroarch.com/) + core libretro necessari | Nessun account richiesto — legge direttamente `~/Roms/` (percorso configurabile, vedi `.env`). Per ROM PSX (immagini CD `.cue`/`.bin`), richiede anche `unzip` — estrazione automatica del pacchetto compresso al primo avvio del gioco (`sudo pacman -S unzip`, quasi certamente già presente) |

### Compatibilità Windows (Wine/Proton, opzionale)

```bash
sudo pacman -S wine winetricks
```

Proton viene invece rilevato automaticamente se già installato tramite Steam (o Proton-GE via ProtonUp), nessuna azione manuale necessaria.

### Solo per la sessione dedicata (Gamescope) — attualmente incompleta

```bash
sudo pacman -S gamescope
```

La modalità "sessione dedicata senza desktop sotto" è **oggi incompleta e non consigliata** — l'uso previsto e testato è l'installazione entro un desktop environment esistente (XFCE/MATE/GNOME/Plasma).

---

## 2. Compilazione

```bash
cd x-launcher
cp .env.example .env      # poi modifica .env con le tue chiavi (vedi sezione 5)
chmod +x build.sh kiosk-launch.sh install.sh
npm install
./build.sh compile
```

`npm install` scarica le dipendenze Node (inclusa la compilazione nativa di `better-sqlite3`, per cui serve `base-devel`/gcc). `./build.sh compile` produce `dist/` (backend) e `dist/assets/` (frontend).

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

Tutte opzionali — X-Launcher funziona anche a `.env` vuoto, con funzionalità ridotte dove manca una chiave.

| Variabile | Descrizione |
|---|---|
| `STEAM_API_KEY` | Steam Web API key, per il tempo di gioco ufficiale Steam. Ottienila su https://steamcommunity.com/dev/apikey |
| `STEAM_ID` | Il tuo SteamID64 — rilevato automaticamente se vuoto |
| `ROMS_PATH` | Cartella ROM per Classic Console (default `~/Roms/`) — struttura attesa: `~/Roms/SNES/`, `~/Roms/N64/`, ecc., solo file `.zip` |
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
  ├── x-launcher.db          # database SQLite (libreria, config di gioco, tempo di gioco, ecc.)
  ├── tokens.json             # token OAuth (permessi 600)
  ├── daemon.log              # log del demone Node
  ├── tray.log                # log dell'icona tray
  ├── firefox-profile/        # profilo Firefox dedicato (solo se usi Firefox)
  └── avatars/                # immagini avatar caricate dall'utente
```

Questi file sopravvivono agli aggiornamenti del pacchetto e non vengono mai toccati da `install.sh --uninstall`.

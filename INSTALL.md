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
curl -fsSL -o /tmp/ollama-install.sh https://ollama.com/install.sh
less /tmp/ollama-install.sh      # leggilo prima di eseguirlo
sh /tmp/ollama-install.sh
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

### Solo per la sessione Openbox "Shell" (opzionale)

La sessione standalone **Xorg + Openbox** (Dashboard e giochi in spazi separati, vedi §4.1) richiede, oltre a quanto sopra:

| Strumento | Arch | Debian/Ubuntu |
|---|---|---|
| Window manager | `openbox` | `openbox` |
| Gestione finestre da riga di comando | `wmctrl`, `xdotool` | `wmctrl`, `xdotool` |
| Layout dei monitor | `xorg-xrandr` | `x11-xserver-utils` |

Il gestore degli spazi usa il venv `.venv-tray` creato da `./build.sh compile` (`python-xlib` incluso) e legge il controller da `/dev/input/event*` (accessibile all'utente della sessione grafica, senza permessi particolari).

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
./build.sh start --local-server   # avvia su una porta dedicata (3001),
                                   # senza toccare un xdash.service già
                                   # attivo in /opt — utile per testare
                                   # modifiche locali in parallelo a
                                   # un'installazione di sistema esistente
```

Con `--local-server` un badge rosso compare sotto il numero di versione
nel quick-menu, per non confondere mai quale istanza si sta guardando.

Le opzioni si possono combinare (`./build.sh start --local-server --spaces-mode`). `--spaces-mode` ha senso nella sessione Openbox "Shell" (§4.1): vedi lì.

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
- Installa in `/opt` anche `spaces.py` e la cartella `openbox/` (sessione Openbox "Shell", §4.1), crea il link `x-launcher-spaces` in `/usr/local/bin/` e prepara, **per l'utente che ha lanciato `sudo`**, le cartelle e i symlink di una sessione Openbox pulita (vedi §4.1)
- Registra il protocollo `xlaunch://<id-gioco>` a livello di sistema (per lanciare un gioco da link esterni — script, automazioni, integrazioni di terze parti — senza dover aprire la Dashboard)

Le impostazioni, il database, i log e tutto ciò che è specifico dell'utente restano sempre in `~/.local/share/x-launcher/` (mai in `/opt`), e sopravvivono a reinstallazioni/aggiornamenti.

Per disinstallare:
```bash
sudo ./install.sh --uninstall
```

Rimuove `/opt/x-launcher`, il link e le registrazioni di sistema. **Non tocca** `~/.local/share/x-launcher/` (dati per-utente).

### 4.1 Sessione Openbox "Shell" (Dashboard e giochi in spazi separati)

Seconda sessione standalone, accanto alla Kiosk gamescope (che resta invariata): **Xorg + Openbox**, nessun desktop sotto. La Dashboard sta nello **spazio 0** (desktop 1), ogni gioco lanciato prende uno **spazio** libero (fino a 3, desktop 2-4) e ci passa da solo. Si seleziona come **"Openbox"** dal greeter LightDM (voce fornita dal pacchetto `openbox`).

**Controller** (letto direttamente da `/dev/input`, funziona qualunque finestra sia in primo piano):
- **Select + D-pad destra / sinistra** — spazio successivo / precedente (ciclico sugli spazi occupati)
- **Select + L1 + R1** — torna alla Dashboard

**Tastiera** (scorciatoie di sviluppo): `Ctrl+Alt+Destra` / `Ctrl+Alt+Sinistra` / `Ctrl+Alt+Su` = successivo / precedente / Dashboard; `Ctrl+Alt+Q` = esci dalla sessione.

**Riga di comando**: `x-launcher-spaces state | next | prev | dashboard | switch N | clients | freeze [on|off|status] | thaw [scope] | overlay [open|close|status|on|off|key K]` (`clients` elenca ogni finestra con la classificazione e il desktop reale: utile per diagnosticare un gioco che non compare).

**Cosa prepara `install.sh`** — per l'utente reale (quello che ha lanciato `sudo`, mai per root):

| Percorso | Contenuto |
|---|---|
| `~/.config/openbox/rc.xml` | symlink → `/opt/x-launcher/openbox/rc.xml` |
| `~/.config/openbox/autostart` | symlink → `/opt/x-launcher/openbox/autostart` |
| `~/.config/openbox/spaces-ctl` | symlink → `/opt/x-launcher/openbox/spaces-ctl` |
| `~/.config/x-launcher/shell-display.conf.example` | copia dell'esempio per il layout dei monitor (la `shell-display.conf` attiva non viene mai creata né toccata) |
| `~/.config/x-launcher/spaces-nofreeze.conf.example` | copia dell'esempio dei giochi da non congelare (la `spaces-nofreeze.conf` attiva non viene mai creata né toccata) |
| `~/.local/share/x-launcher/` | log della sessione (`openbox-session.log`, `display.log`, `tray.log`) |

Se esiste già un `rc.xml` o `autostart` personale viene salvato come `*.bak-<data>`, mai cancellato. Un symlink che punta altrove (tipicamente a una copia di sviluppo): da `v3.0.1-Mars`, in un terminale l'installer **chiede** se ripuntarlo a `/opt` (invio = sì); senza terminale lo lascia com'è. Per ripuntarlo sempre, senza domande: `sudo ./install.sh --relink-openbox`. I link `/usr/local/bin/x-launcher` e `/usr/local/bin/x-launcher-spaces` vengono sempre ripuntati a `/opt`. Passaggi per portare una milestone in `/opt` partendo da una copia di sviluppo: `./build.sh compile` (crea/aggiorna `.venv-tray` con pillow e python-xlib), poi `sudo ./install.sh --relink-openbox`, poi riavvia la sessione Openbox. L'installer avvisa se il venv di `/opt` non può importare `overlay.py`. Per non toccare `~/.config` dell'utente: `sudo ./install.sh --no-openbox`. La disinstallazione rimuove solo i symlink che puntano a `/opt/x-launcher/openbox`.

**Monitor**: nella sessione si lavora col **solo monitor principale**, gli altri vengono spenti (a ogni avvio `openbox/display.sh` applica un layout deterministico: l'output principale è primario e sta a `+0+0`). Senza configurazione sceglie da solo (l'output già primario, altrimenti il più grande). Per scegliere esplicitamente: copia `~/.config/x-launcher/shell-display.conf.example` in `shell-display.conf` e imposta `MAIN_OUTPUT`; `SECONDARY="keep"` tiene accesi gli altri monitor (con `XRANDR_ARGS` per il layout; `bash /opt/x-launcher/openbox/display.sh --capture`, lanciato in XFCE col layout desiderato, stampa la riga pronta). Esito e verifica in `~/.local/share/x-launcher/display.log` (`VERIFY=OK solo il monitor principale … è attivo`).

**Modalità spazi** (`kiosk-launch.sh --spaces-mode`, passata di default da `openbox/autostart`): la Dashboard congela l'input solo quando **non** è lo spazio corrente e torna libera quando ci si ritorna (si può lanciare un secondo gioco con il primo in un altro spazio); se un gioco non compare in nessuno spazio entro 45 s la Dashboard viene comunque liberata. Un badge azzurro "Modalità spazi · spazio N · giochi M" sotto il numero di versione nel quick-menu è una nota di sviluppo: da `v3.2.0-Mars` compare solo nella copia di sviluppo (`--localdev`); nella sessione stabile è spento, si riaccende con `X_LAUNCHER_SPACES_BADGE=1` in `~/.config/openbox/environment` (`0` lo spegne anche in sviluppo); `[SPACES-DIAG]` in `daemon.log` registra visibilità, focus e i bottoni che la Dashboard riceve davvero. Si disattiva con `X_LAUNCHER_SPACES_MODE=0` in `~/.config/openbox/environment`. `openbox/autostart` e `kiosk-launch.sh` vanno aggiornati **insieme**: `autostart` passa l'opzione solo se `kiosk-launch.sh` la conosce, e lo script ignora le opzioni `--…` sconosciute.

**Congelamento dei giochi** (da v2.7.1-Mercury): i giochi che non stanno nello spazio corrente vengono **congelati** (`systemctl --user freeze <scope>.scope`): non ricevono input dal controller e non consumano CPU; tornando nel loro spazio vengono scongelati prima di mostrarli. Non si congelano i giochi Steam lanciati via URI e il quarto gioco. Al riavvio del demone e all'uscita gli scope congelati vengono scongelati. Controllo: `X_LAUNCHER_SPACES_FREEZE=0` (in `~/.config/openbox/environment`) lo disattiva; `~/.config/x-launcher/spaces-nofreeze.conf` (uno scope o prefisso per riga, ad es. `xlauncher-game-minecraft`; copia l'esempio `spaces-nofreeze.conf.example` che l'installer mette nella stessa cartella) esclude dei giochi; a runtime `x-launcher-spaces freeze on|off|status` e `x-launcher-spaces thaw [scope]`. In caso di emergenza: `systemctl --user thaw <scope>.scope`.

**Congelamento della Dashboard** (da v3.2.1-Mars): in modalità spazi `kiosk-launch.sh` avvia il browser in uno scope `xlauncher-dashboard-<ts>` e `spaces.py` lo congela quando lo spazio corrente non è lo 0 (con 2 s di ritardo), scongelandolo prima di tornarci, anche dall'overlay. `X_LAUNCHER_SPACES_FREEZE_DASHBOARD=0` lo spegne (il blocco in pagina resta); `x-launcher-spaces freeze off` scongela tutto.

**Overlay degli spazi e dei servizi** (da v2.7.2-dev.1, `kiosk-launch.sh --spaces-overlay`, passata di default da `openbox/autostart`): Select + D-pad destra/sinistra apre una schermata a schermo intero (disegnata da `overlay.py`, nessuna dipendenza oltre a Pillow e python-xlib del venv del tray) con gli spazi aperti e, in alto a destra, i servizi. Dentro: D-pad o levetta sinistra spostano, **A** conferma/attiva, **B** annulla; **su** porta ai servizi (Bluetooth, Wi-Fi, LAN, − volume +), **giù** torna agli spazi; su − e + A cambia il volume (tenuto premuto si ripete). Mentre è aperta, il gioco corrente è congelato e il pad è in esclusiva. Bluetooth, Wi-Fi e LAN mostrano per ora solo lo stato (`X_LAUNCHER_OVERLAY_TOGGLES=bt,wifi,lan` li rende attivabili: non ancora provato su hardware). Servono, per i servizi, `wpctl` (o `pactl`), `bluetoothctl`, `nmcli` (quelli che mancano risultano "Non disponibile"). Per tornare al cambio diretto: `X_LAUNCHER_SPACES_OVERLAY=0` in `~/.config/openbox/environment`, oppure `x-launcher-spaces overlay off`. Select + L1 + R1 (Dashboard) resta sempre diretto. Le copertine dei giochi sono copie locali in `~/.local/share/x-launcher/covers/` (riempite dal backend; `X_LAUNCHER_OVERLAY_ART=auto|hero|cover|off`). Dopo A/B il gioco resta congelato e il pad in esclusiva per 0,6 s (`X_LAUNCHER_OVERLAY_THAW_DELAY_S`, 0 = subito). `overlay.py` va aggiornato insieme a `spaces.py`, `kiosk-launch.sh` e `openbox/autostart`.

**Copia di sviluppo**: se i symlink puntano a una cartella diversa da `/opt/x-launcher`, la sessione avvia il backend **di quella copia** sulla porta 3001 (serve `./build.sh compile`) e lascia in pace `xdash` di sistema sulla 3000; `X_LAUNCHER_LOCAL_SERVER=1` (sempre) o `=0` (mai) in `~/.config/openbox/environment` per forzarlo. Il log `~/.local/share/x-launcher/openbox-session.log` riporta la scelta fatta.

Integrazione Steam opzionale (aggiunge X-Launcher come Non-Steam Game, con artwork dedicata — richiede Steam già autenticato almeno una volta):
```bash
node /opt/x-launcher/scripts/setup-steam-shortcut.cjs
```

---

### 4.2 Temi e font (da v3.2.0-Mars)

**Temi.** I temi della Dashboard sono file indipendenti nella cartella `themes/` (radice del progetto, copiata in `/opt/x-launcher/themes/` da `install.sh`): `dark.json` e `light.json`. Ogni file contiene i colori con nome della Dashboard (`colors`) e la tavolozza dell'overlay degli spazi (`overlay`, colori `#rrggbb`). Il tema scelto dal quick-menu si salva in `app.conf` (`theme=dark` o `theme=light`); l'overlay degli spazi lo rilegge a ogni apertura, insieme alla lingua, quindi Dashboard e overlay hanno sempre lo stesso aspetto e la stessa lingua. Il supporto a temi aggiuntivi è predisposto nel codice ma non è ancora esposto: il quick-menu alterna solo Scuro e Chiaro. Chi modifica i colori può verificare i file con `python3 scripts/check-themes.py` (esce con errore se un colore usato dal frontend manca in un tema).

**Font.** Dashboard e overlay usano lo stesso font, **Noto Sans**, dai file in `assets/fonts/` (nove file: `NotoSans-Regular`, `-Italic`, `-Medium`, `-MediumItalic`, `-Bold`, `-BoldItalic`, `-Black`, `-BlackItalic`, `-LightItalic`, tutti `.ttf`, più la licenza `OFL.txt`). La cartella non è nel pacchetto sorgente: `setup-linux.sh` copia i file mancanti dai font Noto installati nel sistema (pacchetto `noto-fonts` su Arch, `fonts-noto-core` su Debian/Ubuntu, `google-noto-sans-fonts` su Fedora); in alternativa si copiano a mano con gli stessi nomi. `install.sh` controlla che ci siano e avvisa se ne manca qualcuno (non blocca l'installazione). Senza i file la Dashboard ricade sui font di sistema e l'overlay su DejaVu Sans: funziona tutto, cambia solo l'aspetto del testo.

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
| `X_LAUNCHER_BIND` | (da v3.0.2-dev.2) Indirizzo su cui il demone ascolta. Default `127.0.0.1`: raggiungibile solo da questo computer. Per usare la Dashboard da un altro dispositivo della rete metti `0.0.0.0` (o l'IP della LAN): da un altro dispositivo servirà anche il token (vedi «Accesso e token» qui sotto); all'avvio scrive un avviso nel log. |
| `X_LAUNCHER_ALLOWED_HOSTS` | (da v3.0.2-dev.2) Nomi host aggiuntivi accettati nell'header `Host`, separati da virgola (es. `htpc.local,192.168.1.50`). Di default sono ammessi solo `localhost`, `127.0.0.1` e `::1`. Serve insieme a `X_LAUNCHER_BIND` per l'accesso da LAN: richieste con altri `Host` ricevono 403. |
| `X_LAUNCHER_AUTH` | (da v3.0.2-dev.3) `off` spegne l'autenticazione con token: solo per diagnosi (il demone torna aperto a qualunque processo che raggiunga la porta; scrive un avviso nel log). Default: attiva. |

---

---

### Accesso e token (da v3.0.2-dev.3)

Le rotte `/api` e `/avatars` del demone richiedono un token segreto, così nessun altro programma o utente può farsi avviare giochi o leggere la libreria.

- Il token è nel file `~/.local/share/x-launcher/api-token` (permessi `0600`), creato dal demone al primo avvio. Non cambia finché non cancelli il file: se lo cancelli, al riavvio ne nasce uno nuovo.
- **Non devi fare nulla** per `kiosk-launch.sh`, `gamescope-session.sh`, `xlaunch-handler.sh`, `test-game.sh`, `tray.py`: leggono il file da soli. Il browser lanciato dagli script riceve un codice monouso (60 secondi) e tiene un cookie di sessione.
- **Dopo l'aggiornamento** riavvia tutto: demone, tray (`pkill -f tray.py`) e la finestra della Dashboard. Una Dashboard rimasta aperta dalla versione precedente, o un tray vecchio, riceveranno errore 401 finché non vengono riavviati.
- **Browser aperto a mano** (Chromium/Firefox normale, o un altro dispositivo della rete con `X_LAUNCHER_BIND`): senza cookie vedrai una pagina «Accesso richiesto». Leggi il token con `cat ~/.local/share/x-launcher/api-token` e apri una volta sola `http://<indirizzo>:3000/?xl_token=<token>`: il browser ricorda l'accesso e ripulisce l'indirizzo.
- **Script tuoi:** `curl -H "X-XLauncher-Token: $(cat ~/.local/share/x-launcher/api-token)" http://localhost:3000/api/...`. Solo `GET /api/status` resta libero (serve a sapere se il demone è acceso).
- Il token non va condiviso né committato; il `.gitignore` non lo riguarda perché sta fuori dal progetto.

### Permessi e Cloud Backup (da v3.0.2-dev.4)

- All'avvio il demone porta `~/.local/share/x-launcher` a `0700` e il database, `.env`, `tokens.json` e `api-token` a `0600`: sono leggibili solo dal tuo utente.
- Il Cloud Backup salva e ripristina del `.env` solo le chiavi `STEAM_API_KEY`, `STEAM_ID`, `ROMS_PATH`, `STEAMGRIDDB_API_KEY`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`; il ripristino le unisce al `.env` locale e non tocca le altre righe (`X_LAUNCHER_*` ecc.).
- Nei profili di compatibilità ripristinati, variabili come `LD_PRELOAD`, `PATH`, `NODE_OPTIONS` vengono scartate (riaggiungile a mano dalla card del gioco se servono).
- Il bundle su Drive non è cifrato: contiene le chiavi API. Proteggi l'account Google con la verifica in due passaggi.

---

### Opzioni di X-Launcher per singolo gioco (negli argomenti di lancio)

Si scrivono nel campo **argomenti di lancio** della card del gioco (non nel percorso dell'eseguibile), anche insieme agli argomenti del gioco. X-Launcher le toglie prima di avviare il gioco, che non le riceve.

| Opzione | Effetto |
|---|---|
| `--no-splash` | (da v3.0.2-dev.1) il gioco parte senza splash di lancio e senza rilevamento della finestra né timeout di sicurezza di 10 minuti. Utile con i launcher condivisi (Ubisoft Connect, EA app) quando la splash non riconosce la finestra del gioco e resta aperta. Perdi la barra di avanzamento e l'annullamento dalla splash; un gioco bloccato all'avvio si chiude dal Process Manager. Esempio: `--no-splash -windowed`. |

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
  ├── app.conf                # preferenze persistite (display mode, lingua, tema, ecc.)
  ├── daemon.log              # log del demone Node
  ├── tray.log                # log dell'icona tray
  ├── game-logs/               # stdout/stderr dell'ultimo lancio per gioco (diagnosi avvio)
  ├── firefox-profile/        # profilo Firefox dedicato (solo se usi Firefox)
  └── avatars/                # immagini avatar caricate dall'utente
```

Questi file sopravvivono agli aggiornamenti del pacchetto e non vengono mai toccati da `install.sh --uninstall`.

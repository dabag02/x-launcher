# Linux Deployment Guide: X-Dash HTPC & Gaming

Questa guida spiega come trasformare un PC Linux in una console di gioco dedicata utilizzando questa dashboard come interfaccia principale (HTPC Mode).

## 1. Prerequisiti

Assicurati di avere installato un sistema basato su Debian/Ubuntu (es. Linux Mint, Pop!_OS, o ChimeraOS) o Arch Linux.

### Installazione Node.js e NPM
```bash
# Su Ubuntu/Debian/Pop!_OS
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

# Su Arch Linux
sudo pacman -S nodejs npm base-devel
```

## 2. Installazione Dashboard

1. **Scarica il progetto** sul tuo PC locale.
2. **Installa le dipendenze**:
   ```bash
   cd x-dash-project
   npm install
   ```
3. **Crea il file di configurazione**:
   Copia `.env.example` in `.env` e configura le tue chiavi API se necessario.
   ```bash
   cp .env.example .env
   ```

## 3. Compilazione e Avvio

Per ottenere le massime prestazioni, compila l'app in modalità produzione:

```bash
npm run build
npm start
```

La dashboard sarà ora accessibile su `http://localhost:3000`.

## 4. Configurazione HTPC (Modalità Kiosk)

Per utilizzare la dashboard come una vera console, deve avviarsi a tutto schermo all'accensione del PC.

### A. Creazione del Servizio Systemd
Crea un file per gestire il processo in background:
`sudo nano /etc/systemd/system/xdash.service`

```ini
[Unit]
Description=X-Dash Game Launcher
After=network.target

[Service]
Type=simple
User=tuo_utente
WorkingDirectory=/percorso/della/tua/app
ExecStart=/usr/bin/npm start
Restart=always

[Install]
WantedBy=multi-user.target
```

Attiva il servizio:
```bash
sudo systemctl enable xdash --now
```

### B. Avvio Automatico del Browser (Fullscreen)
Se usi un ambiente desktop come GNOME o KDE, aggiungi `kiosk-launch.sh` alle "Applicazioni d'avvio".

Lo script rileva automaticamente il browser disponibile: **Firefox ha la priorità**, seguito da `firefox-esr`, `chromium`, `chromium-browser` e `google-chrome`. Non è necessario installare Chromium.

```bash
# Avvio kiosk automatico (Firefox o Chromium)
./kiosk-launch.sh
```

Per lanciarlo manualmente con Firefox:
```bash
firefox --kiosk --private-window --new-instance http://localhost:3000
```

Per lanciarlo manualmente con Chromium:
```bash
chromium --kiosk --app=http://localhost:3000 --noerrdialogs --disable-infobars
```

## 5. Integrazione Gaming (Pro-Tips)

### Driver Video
Assicurati di avere i driver proprietari per le prestazioni 3D:
- **Nvidia**: `sudo apt install nvidia-driver-535`
- **AMD/Intel**: I driver Mesa sono solitamente pre-installati e raccomandati.

### Proton & Steam
Se usi la dashboard per lanciare giochi Windows su Linux:
1. Installa Steam.
2. Abilita **Steam Play** per tutti i titoli nelle impostazioni di Steam.
3. Lo script di backend della dashboard proverà a invocare `steam steam://run/<id>` per i giochi compatibili.

## 6. Risoluzione Problemi
- **ERR_CONNECTION_REFUSED su localhost:3000**: il daemon non è in esecuzione. Lancia prima `npm run build && npm start` in un terminale, oppure usa direttamente `./kiosk-launch.sh` che avvia il daemon automaticamente.
- **NODE_ENV nel .env sovrascrive tutto**: assicurati che il tuo `.env` abbia `NODE_ENV=production` e non `development`, altrimenti il server prova a caricare Vite invece di servire i file `dist/`.
- **Audio non funzionante**: assicurati che `pulseaudio` o `pipewire` siano attivi.
- **Lentezza UI**: Disabilita le animazioni pesanti nel menu "Engine Tuning" della dashboard.
- **Permessi Porta 3000**: Se la porta è occupata, puoi cambiarla nel file `server.ts` e ricompilare.

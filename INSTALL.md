# X-Launcher — Installazione da zero

> ⚠️ Non riutilizzare mai `node_modules` o `dist` da versioni precedenti.
> Estrai sempre in una cartella nuova e segui questa procedura dall'inizio.

---

## Requisiti

- **Node.js v22 LTS** (`nodejs-lts-jod` su Arch)
- **npm**, **gcc**, **python3** (per better-sqlite3)

```bash
sudo pacman -S nodejs-lts-jod npm base-devel python
```

---

## Installazione e avvio

```bash
cd x-launcher
cp .env.example .env
chmod +x build.sh kiosk-launch.sh setup-linux.sh
npm install
./build.sh
```

`build.sh` compila e avvia automaticamente. Per opzioni:

```bash
./build.sh compile          # solo compilazione
./build.sh start            # avvia senza ricompilare
./build.sh start chromium   # avvia con Chromium
./build.sh start firefox    # avvia con Firefox
./build.sh dev              # modalità sviluppo (HMR)
```

---

## Applicare una patch

Le patch sono script nella cartella `patches/`:

```bash
bash patches/patch-step2-001.sh
```

Ogni patch modifica solo i file necessari e ricompila da sola.

---

## Log

Il daemon scrive i log in:
```
~/.local/share/x-launcher/daemon.log
```

Per monitorare in tempo reale:
```bash
tail -f ~/.local/share/x-launcher/daemon.log
```

Per girare il log a chi supporta il progetto:
```bash
cat ~/.local/share/x-launcher/daemon.log
```

---

## Variabili opzionali (.env)

| Variabile       | Descrizione                                              |
|-----------------|----------------------------------------------------------|
| `STEAM_API_KEY` | Steam Web API key per le ore di gioco (opzionale)        |
| `STEAM_ID`      | SteamID64 (opzionale, rilevato automaticamente)          |

API key: https://steamcommunity.com/dev/apikey

---

## Dati persistiti

```
~/.local/share/x-launcher/
  ├── x-launcher.db    # database SQLite
  ├── tokens.json      # token OAuth (permessi 600)
  └── daemon.log       # log del daemon
```

Questi file sopravvivono agli aggiornamenti del pacchetto.

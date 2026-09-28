# Changelog — v2.2.17-dev.1 in poi

Prosegue da `CHANGELOG-6.md` (chiuso alla milestone v2.2.16-Mercury).

---

## v2.2.17-dev.1 — Fix bug reale: PROJECT_DIR sbagliato quando lanciato tramite il comando `x-launcher`

Segnalato dall'utente: installando in `/opt/x-launcher/`, il demone
systray (`tray.py`) non partiva mai lanciando la Dashboard col comando
da terminale, pur con `.venv-tray` presente e corretto sia nel checkout
di sviluppo sia in `/opt/x-launcher/` — funzionava invece lanciando
dalla cartella home (il checkout di sviluppo, path diretto).

**Causa**: `install.sh` crea un symlink (`ln -sf`) in
`/usr/local/bin/x-launcher` che punta a `/opt/x-launcher/kiosk-launch.sh`
— il modo previsto per lanciare l'app da terminale dopo l'installazione.
Sia `kiosk-launch.sh` sia `xlaunch-handler.sh` calcolavano `PROJECT_DIR`
con `dirname "$0"`, che **non risolve i symlink**: invocando il comando
`x-launcher`, `$0` vale `/usr/local/bin/x-launcher`, quindi
`PROJECT_DIR` diventava `/usr/local/bin` invece del vero
`/opt/x-launcher` — da cui la ricerca di `.venv-tray` (e in generale di
qualunque path relativo al progetto, incluso `dist/server.cjs` nel ramo
fallback) nel posto sbagliato. Lanciando invece lo script per path
diretto (non tramite il symlink) `$0` è già il percorso reale, quindi
tutto funzionava.

**Fix**: `PROJECT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"`
in entrambi gli script — `readlink -f` risolve il symlink fino al file
reale prima di calcolare la cartella, corretto sia lanciato per path
diretto sia tramite il comando in `/usr/local/bin`.

`bash -n` pulito su entrambi i file.

**Da confermare su hardware reale**: che il systray parta correttamente
lanciando `x-launcher` da terminale sull'installazione in
`/opt/x-launcher/`.

**Resta aperto, non ancora diagnosticato**: il problema separato
segnalato dallo stesso utente — chiudendo e riaprendo la Dashboard,
`xdash` (o il server che risponde su :3000) smette di rispondere e
serve un `systemctl restart xdash` manuale prima di riaprire. Nessun
punto del codice risulta fermare il servizio esplicitamente alla
chiusura; in attesa di `systemctl status xdash` / `journalctl -u xdash`
catturati nel momento esatto del problema (prima del restart manuale)
per capire se il servizio muore davvero o resta attivo ma non
risponde.

## v2.2.17-dev.2 — Diagnosticato e risolto il problema aperto in dev.1, più una nuova opzione `--local-server`

**Diagnosi**, confermata dall'utente con `systemctl status xdash` +
`journalctl` catturati sul momento: il servizio risultava `inactive
(dead)`, uscito con **status 0/SUCCESS** dopo circa un minuto di vita —
non un crash, un'uscita pulita e intenzionale. Causa: il pulsante
"Chiudi la Dashboard" (`handleExit` in `App.tsx`) chiama
`POST /api/system/exit`, che in `server.ts` chiama incondizionatamente
`process.exit(0)` — corretto nel modello originale (nessun demone
persistente, `kiosk-launch.sh` ne rilancia uno nuovo ad ogni apertura),
ma mai aggiornato da quando esiste `xdash.service`: lo stesso pulsante
termina anche il demone persistente in `/opt`, che poi resta morto
perché un'uscita pulita (status 0) non fa scattare `Restart=on-failure`.
Alla riapertura, il fallback di `kiosk-launch.sh` partiva a sua volta —
e combinato col bug di dev.1 (non ancora applicato sul pacchetto in uso
dall'utente al momento della segnalazione), risolveva dal posto
sbagliato: da qui il `server.cjs` locale invece di quello in `/opt`
osservato dall'utente.

**Fix 1 — `server.ts`**: `/api/system/exit` ora controlla
`process.env.INVOCATION_ID`, impostata automaticamente da systemd per i
processi che avvia (assente per fallback manuale/dev). Se presente
(xdash gestito da systemd): non termina né il processo né il tray
Python — solo la finestra del browser si chiude (`window.close()`, lato
client, già esistente). Se assente (fallback locale, `--local-server`):
comportamento invariato, terminazione completa — corretto anche lì,
serve poter testare le modifiche senza dover riavviare nulla a mano.

**Fix 2 — nuova opzione `--local-server`** (richiesta dell'utente):
`./kiosk-launch.sh --local-server` (o `./build.sh start --local-server`,
già funzionante gratis — `build.sh` inoltra il secondo argomento senza
bisogno di modifiche) avvia un'istanza dedicata sulla porta **3001**,
separata e indipendente da xdash sulla 3000 — non serve più fermarlo per
testare le modifiche locali. Aggiunto anche un indicatore visivo in-app
(badge rosso in basso a destra, "Server locale · :3001") passato via
query param `?localdev=1`: necessario perché in modalità kiosk/app la
barra indirizzi è nascosta, quindi la porta da sola non sarebbe visibile
guardando la finestra. Il controllo di rientro da Steam Big Picture
viene saltato in questa modalità (riguarda l'istanza principale, non una
sessione di test dedicata).

`tsc --noEmit` pulito, `check-focus-ids.cjs` invariato (109 id — il
badge non ha focus/id, `pointer-events-none`), `bash -n` pulito su
`kiosk-launch.sh`.

**Da confermare su hardware reale**: che "Chiudi la Dashboard" lasci
davvero `xdash` attivo quando gestito da systemd, e che
`--local-server` funzioni in parallelo senza toccarlo.

## v2.2.17-dev.3 — Due correzioni richieste dall'utente sul lavoro di dev.2

**Badge server locale spostato**: da badge fisso in basso a destra
(slegato dal resto dell'interfaccia) a una riga sotto il numero di
versione nel quick-menu ("X-Launcher Core vX.Y.Z"), stesso scopo ma
integrato nel posto dove l'utente già guarda per sapere che versione sta
girando.

**Bug reale**: chiudendo la Dashboard con `xdash` gestito da systemd, il
tray Python non veniva più terminato — regressione introdotta proprio
dal fix di dev.2: il `pkill -f "tray.py"` era finito dentro lo stesso
ramo "solo se non gestito da systemd" della terminazione del processo
node, ma il tray è un demone indipendente (lo avvia `kiosk-launch.sh`,
non `xdash`) — la sua chiusura non ha motivo di dipendere da quella del
backend. Spostato fuori da quel ramo: il tray termina **sempre** alla
richiesta di uscita, il processo node solo se non gestito da systemd.
Verificato che `kiosk-launch.sh` lo riavvia correttamente al prossimo
lancio (controlla `pgrep -f "tray.py"` prima di avviarne uno nuovo, già
esistente, nessuna modifica necessaria lì).

`tsc --noEmit` pulito, `check-focus-ids.cjs` invariato (109 id). **Da
confermare su hardware reale**: badge nella posizione giusta, tray
terminato alla chiusura anche con xdash attivo.

---

## Congelato — MILESTONE STABILE v2.2.18-Mercury

Ciclo chiuso qui (dev.1→dev.3), tutto confermato funzionante
dall'utente. Riepilogo: risolto un bug reale di path (`PROJECT_DIR`
sbagliato quando lanciato tramite il symlink `/usr/local/bin/x-launcher`
creato da `install.sh` — impediva l'avvio del systray sull'installazione
in `/opt`) e un bug reale più consistente per cui "Chiudi la Dashboard"
terminava anche `xdash.service`, il demone persistente pensato per
restare sempre attivo, costringendo a un `systemctl restart` manuale ad
ogni riapertura — risolto distinguendo il caso "gestito da systemd" da
quello "fallback locale" (`INVOCATION_ID`). Aggiunta anche una nuova
opzione di sviluppo, `--local-server` (porta dedicata 3001 + badge
visivo nel quick-menu), per testare modifiche locali senza dover fermare
un'installazione di sistema attiva. `INSTALL.md` aggiornato con la nuova
opzione.

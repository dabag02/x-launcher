# CHANGELOG-17 — da v3.2.12-Mars (CHIUSO su MILESTONE STABILE v3.2.16-Mars)

Prosegue da CHANGELOG-16.md (chiuso su MILESTONE STABILE v3.2.12-Mars). Ciclo chiuso con la MILESTONE STABILE v3.2.16-Mars (ultima voce in fondo); la serie continua in CHANGELOG-18.md.

Voci in ordine: la prima del ciclo sarà `## v3.2.13-dev.1` (o la patch che sceglie l'utente). Ad ogni consegna reale si incrementa `-dev.N` in `package.json` E nel fallback letterale di `src/App.tsx`, oltre alla voce corrispondente qui. Regola fissa: l'installer ha `--devel` accanto a `--relink-openbox`; tenerlo presente in ogni release.

Punti aperti ereditati dalla milestone: vedi «Resta aperto» nella voce della milestone in CHANGELOG-16.md.

---

## v3.2.13-dev.1 — massimo 2 giochi contemporanei

Richiesta dell'utente (regola 1 fra le tre proposte): nella sessione Openbox con gli spazi, al lancio di un **terzo** gioco la Dashboard non lo avvia e mostra una notifica, in italiano o in inglese secondo la lingua della Dashboard, che ricorda il massimo di 2 giochi contemporanei. Esclusi i giochi Steam e Steam Big Picture, che si aprono sempre nello spazio 3.

Prima della regola il terzo gioco partiva ma restava senza spazio: Openbox lo apriva sul desktop corrente (di solito lo spazio 0, sopra la Dashboard), spaces.py non lo congelava mai e non compariva nell'overlay, quindi contendeva il controller alla Dashboard e, negli spazi 1-2, al gioco in primo piano.

**`src/backend/gameSpacesLimit.ts`** (nuovo) — `GAME_SPACES_MAX = 2` (gli spazi 1-2 di spaces.py). Conta i giochi che occupano uno spazio (stato del gestore degli spazi) più quelli lanciati da meno di 60 s che non hanno ancora una finestra, così due lanci ravvicinati non passano entrambi. Non blocca il rilancio di un gioco già in esecuzione. Fuori dalla sessione Openbox (gestore degli spazi assente) nessun limite. Calcolo separato in `limitReached()` per i test.

**`server.ts`** — `POST /api/launch`: prima del lancio, per i giochi con runner diverso da `Steam Native`, se il limite è raggiunto risponde `{ success: false, limited: true }`, emette la notifica e scrive nel log `[SPACES] Launch of <id> refused`. Steam Big Picture passa da una rotta a parte e non è toccata.

**`src/backend/notificationEngine.ts`** — nuovo tipo `launch-limit` (avviso): titolo "Avvio non possibile — <gioco>" / "Launch not possible — <game>"; testo che indica il massimo, invita a chiudere uno dei giochi aperti e ricorda che i giochi Steam e Steam Big Picture non rientrano nel conteggio.

**`src/App.tsx`** — `handlePlay` legge la risposta del lancio: con `limited` chiude subito la splash e non congela la Dashboard (prima la risposta veniva ignorata). Versione 3.2.13-dev.1.

**Verificato**: `tsc --noEmit` (anche server.ts) con gli stessi 7 errori preesistenti; `check-focus-ids.cjs` invariato (111 id); `limitReached()` con stati finti: 0 o 1 gioco → si lancia; 2 giochi negli spazi → bloccato; 1 nello spazio più 1 in avvio da 10 s → bloccato; 1 nello spazio più uno scope vecchio senza finestra → si lancia; rilancio di uno dei due aperti → non bloccato; lo spazio 3 di Steam non conta. **Da provare su hardware reale**: con due giochi negli spazi 1-2, terzo gioco non Steam dalla Dashboard → nessun avvio, splash chiusa, notifica nella lingua della Dashboard; con due giochi aperti, gioco Steam o card Big Picture → partono nello spazio 3.

---

## v3.2.13-dev.2 — avviso quando si rilancia un gioco già aperto

Domanda dell'utente: rilanciando un gioco già aperto c'è un messaggio? Sì, ma il controllo in `gameManager.launchGame` guardava solo l'**ultimo gioco lanciato** (`isLastLaunchedGameRunning()`): con due giochi aperti, rilanciare il primo sfuggiva e partiva una seconda istanza sulla stessa prefix. Il messaggio, quando c'era, arrivava come errore generico ("Avvio fallito") e solo in italiano, e la Dashboard apriva la splash e si congelava come per un lancio vero. Scelta dell'utente: **solo un avviso nelle notifiche, in italiano o in inglese**, nessuna azione automatica (niente passaggio allo spazio del gioco): decide il giocatore se tornarci, chiuderlo o terminarlo.

**`src/backend/gameManager.ts`** — il controllo usa lo scope attivo del gioco (`processManager.findActiveScope('game', id)`), quindi vale per tutti i giochi aperti; l'ultimo lancio resta come ripiego per i lanci senza scope. Risposta `{ success: false, alreadyRunning: true }`; riga di log come avviso con lo scope trovato.

**`src/backend/notificationEngine.ts`** — nuovo tipo `launch-already-running` (avviso): "Già in esecuzione — <gioco>" / "Already running — <game>", con il testo: il gioco è già aperto e non è stato avviato una seconda volta; si può tornarci oppure chiuderlo dal gioco stesso o dal Gestore dei processi.

**`server.ts`** — `POST /api/launch`: con `alreadyRunning` emette `launch-already-running` invece di `launch-error`.

**`src/App.tsx`** — con `alreadyRunning` (come con `limited`) la splash si chiude subito e la Dashboard non si congela. Versione 3.2.13-dev.2.

I giochi Steam restano gestiti da Steam (nessuno scope di gioco): un rilancio passa a Steam come prima.

**Verificato**: `tsc --noEmit` (anche server.ts) con gli stessi 7 errori preesistenti; `check-focus-ids.cjs` invariato (111 id). **Da provare su hardware reale**: con due giochi aperti, rilancio del primo e del secondo dalla Dashboard → nessuna seconda istanza, splash chiusa, avviso nella lingua della Dashboard.

**Confermato su hardware reale (9 novembre 2026)**: v3.2.13-dev.2 — con due giochi negli spazi 1-2 un terzo gioco non parte e la Dashboard mostra l'avviso del limite; i giochi Steam partono comunque nello spazio 3 anche con gli spazi 1 e 2 occupati; il rilancio di un gioco già aperto dà solo l'avviso.

---

## v3.2.16-Mars — MILESTONE STABILE (9 novembre 2026)

Numero di patch scelto dall'utente (v3.2.13-dev.2 → v3.2.16-Mars). Nessun cambiamento di codice in questa voce: solo il congelamento (versione in `package.json` e nel letterale di `src/App.tsx`, changelog, roadmap, `INSTALL.md`, pacchetto completo).

**Riepilogo del ciclo (dev.1 → dev.2), confermato su hardware reale**
- **Massimo 2 giochi contemporanei** nella sessione Openbox con gli spazi (`src/backend/gameSpacesLimit.ts`): il terzo gioco non parte, la splash si chiude, la Dashboard non si congela e arriva l'avviso "Avvio non possibile" / "Launch not possible" nella lingua della Dashboard. Contano anche i giochi lanciati da meno di 60 s ancora senza finestra. Esclusi Steam Big Picture e i giochi Steam, che vanno sempre nello spazio 3. Fuori dalla sessione Openbox nessun limite.
- **Rilancio di un gioco già aperto**: il controllo guarda lo scope di tutti i giochi aperti, non più solo l'ultimo lanciato; nessuna seconda istanza, solo l'avviso "Già in esecuzione" / "Already running". Nessuna azione automatica: il giocatore decide se tornarci, chiuderlo o terminarlo.
- **Installer `--devel` da cartelle con spazi e simboli** (arrivato con la v3.2.12-Mars): confermato sull'HTPC, il collegamento `/opt/x-launcher-devel` viene creato.

**Installer e setup**: nessuna modifica necessaria (il file nuovo `src/backend/gameSpacesLimit.ts` entra nella build di `./build.sh compile` come il resto di `src/backend/`). Valgono `--devel` e `--relink-openbox` come nella v3.2.12-Mars.

**Resta aperto (per il prossimo ciclo, CHANGELOG-18.md)**
- **Steam in background** a inizio sessione (`X_LAUNCHER_STEAM_PRESTART=1`, spento di default): implementato e provato con dati finti, mai provato sull'HTPC.
- Avviso di gamescope `No CAP_SYS_NICE` (priorità normale): lasciato così.
- Timeout di `d3ddriverquery64.exe` all'avvio di Steam con GE-Proton: non tocca i giochi, non indagato.

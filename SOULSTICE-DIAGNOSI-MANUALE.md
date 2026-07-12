# Installazione manuale di Soulstice (Epic) — diagnosi passo-passo

Replica esatta di quello che `installEpic` in `downloadManager.ts` esegue,
nello stesso ordine, con gli stessi parametri — utile per isolare in quale
step esatto si inceppa il meccanismo automatizzato.

## Variabili comuni

Sostituisci `APP_NAME` con il nome interno Epic di Soulstice (verifica con
il comando del Passo 0 se non lo conosci già):

```bash
APP_NAME="Soulstice"   # verifica al Passo 0, potrebbe essere diverso
GAME_ID="epic-${APP_NAME}"   # solo per riferimento, non serve per i comandi
BASE_PATH="$HOME/Games/Epic/<ID_INTERNO>/files"
PREFIX_PATH="$HOME/Games/Epic/<ID_INTERNO>/prefix"
```

`<ID_INTERNO>` è l'hash che X-Launcher genera per ogni gioco (es. quello
visto nei log precedenti: `d366ae16e31b41869cf26c6ee309e7f3`). Se non lo
ricordi, recuperalo così, **prima di iniziare**:

```bash
ls ~/Games/Epic/
```

Sostituisci `BASE_PATH`/`PREFIX_PATH` sopra con il path reale trovato, poi
crea le variabili d'ambiente per tutto il resto della procedura:

```bash
export BASE_PATH="$HOME/Games/Epic/<ID_INTERNO>/files"
export PREFIX_PATH="$HOME/Games/Epic/<ID_INTERNO>/prefix"
mkdir -p "$BASE_PATH" "$PREFIX_PATH"
```

---

## Passo 0 — Verifica che legendary conosca il gioco

```bash
legendary list-installed
legendary info "$APP_NAME"
```

Se `legendary info` fallisce con "not found", il nome esatto è diverso —
cerca con:

```bash
legendary list | grep -i soulstice
```

Usa il nome (`App name`) esatto restituito qui come `APP_NAME` per tutti i
comandi successivi.

---

## Passo 1 — Download + installazione file (corrisponde a Step 1 del codice)

```bash
legendary install "$APP_NAME" \
  --base-path "$BASE_PATH" \
  --yes \
  --skip-sdl
```

**Cosa osservare**: il comando dovrebbe scaricare e mostrare una barra di
progresso. Al termine, verifica che i file siano davvero presenti:

```bash
ls -la "$BASE_PATH"
```

Se questo passo fallisce o la cartella resta vuota, il problema è qui (in
`legendary` stesso o nelle credenziali Epic), non in Wine — fermati e
riportami l'errore esatto prima di proseguire.

---

## Passo 2 — Creazione prefix Wine (corrisponde a Step 2 — il punto del timeout)

Esattamente gli stessi env del codice, **incluso** il fix `WINEDLLOVERRIDES`
già applicato:

```bash
WINEPREFIX="$PREFIX_PATH" \
WINEDEBUG=-all \
WINEDLLOVERRIDES="mscoree,mshtml=" \
wine wineboot --init
echo "Exit code: $?"
```

**Cosa osservare**: tempo di esecuzione. Se torna al prompt in pochi
secondi (come nei test precedenti su prefix nuove/Soulstice stessa fuori
dal daemon), il problema è confermato specifico al *contesto* in cui gira
(daemon vs terminale) — non al comando in sé. Se invece **questa volta**
si blocca anche a mano, abbiamo una nuova informazione: qualcosa è
cambiato dall'ultimo test (es. residui lasciati da tentativi precedenti
nella stessa prefix). In tal caso prova a cancellare e ricreare la prefix
da zero prima di insistere oltre:

```bash
rm -rf "$PREFIX_PATH"
mkdir -p "$PREFIX_PATH"
# poi ripeti il comando wineboot sopra
```

---

## Passo 3 — Dipendenze winetricks (corrisponde a Step 3)

Verb di default usati dal codice, uno alla volta — esegui ciascuno e
osserva singolarmente se uno specifico si blocca o fallisce (il codice li
esegue in sequenza, ma a mano puoi isolare quale, se uno solo, è
problematico):

```bash
for VERB in vcrun2022 dxvk vkd3d corefonts; do
  echo "=== Verb: $VERB ==="
  WINEPREFIX="$PREFIX_PATH" \
  WINEDEBUG=-all \
  WINETRICKS_GUI=none \
  winetricks --unattended "$VERB"
  echo "Exit code: $?"
done
```

Se hai personalizzato i verb per questo gioco dall'overlay (diversi dai 4
di default sopra), usa quelli — puoi vederli aprendo l'overlay opzioni del
gioco in dashboard prima di iniziare questa procedura.

---

## Passo 4 — Risoluzione dell'eseguibile (corrisponde alla fase successiva nel codice)

Il codice usa `legendary info` per trovare l'eseguibile reale e gli
eventuali argomenti di lancio — verifichiamolo a mano:

```bash
legendary info "$APP_NAME" --json | python3 -m json.tool | grep -i "executable\|launch"
```

Oppure, se preferisci il formato leggibile invece di JSON:

```bash
legendary info "$APP_NAME"
```

Annota il percorso eseguibile (`executable`) che trovi qui — dovrebbe
coincidere con un file reale dentro `$BASE_PATH`:

```bash
ls -la "$BASE_PATH"/<percorso relativo trovato sopra>
```

---

## Passo 5 — Lancio manuale di prova (verifica finale)

Se tutti i passi precedenti sono andati a buon fine, prova ad avviare
davvero il gioco con lo stesso meccanismo che X-Launcher userebbe (Wine
diretto sulla prefix appena creata):

```bash
WINEPREFIX="$PREFIX_PATH" wine "$BASE_PATH/<percorso eseguibile trovato al Passo 4>"
```

Se il gioco si avvia, la catena manuale è completamente funzionante — il
problema nel meccanismo automatizzato sarebbe quindi isolato a *come*
X-Launcher orchestra questi stessi passaggi (timing, gestione eventi,
ambiente del processo daemon), non ai passaggi in sé.

---

## Cosa riportarmi al termine

Per ciascun passo: tempo impiegato, exit code, ed eventuali messaggi di
errore o warning anomali (anche se sembrano innocui — meglio includerli e
scartarli insieme che ometterli). Se un passo specifico si comporta
diversamente da come si è comportato nei test isolati precedenti di
questa sessione di lavoro, è il dato più interessante di tutti.

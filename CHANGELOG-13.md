# CHANGELOG-13 — da v3.1.6-Mars

Prosegue da CHANGELOG-12.md (chiuso su MILESTONE STABILE v3.1.6-Mars).

Ciclo chiuso con la MILESTONE STABILE v3.2.0-Mars (voce qui sotto); la serie continua in CHANGELOG-14.md. Voci: la milestone in cima, poi dev.1→dev.9 in ordine. Ad ogni consegna reale si incrementa `-dev.N` in `package.json` E nel fallback letterale di `src/App.tsx`, oltre alla voce corrispondente qui.

Punti aperti ereditati dalla milestone: vedi «Resta aperto» in fondo alla voce della milestone in CHANGELOG-12.md (cifratura del bundle Drive e delle chiavi API, interruttori Bluetooth/Wi-Fi/LAN dell'overlay, scelta rete Wi-Fi, «chiudi il gioco» dall'overlay, indicatore del congelamento, regola sul quarto lancio, Fase 5, bug `process-manager/list`).

## MILESTONE STABILE v3.2.0-Mars — temi come file, aspetto unificato di Dashboard e overlay (ciclo dev.1→dev.9)

Congelato. Raccoglie tutto il ciclo v3.1.7 (dev.1→dev.9, voci qui sotto), confermato dall'utente dev per dev su hardware reale per Dashboard e overlay, più le modifiche della milestone.

### Cosa contiene il ciclo

- **Temi come file** (dev.1): `themes/dark.json` e `themes/light.json`, registro `src/theme/themes.ts`, chiave `theme=` in `app.conf` (con `themeIsUserSet` in `GET /api/config`). Temi aggiuntivi predisposti (`registerTheme`), non esposti.
- **Dashboard interamente ai colori con nome** (dev.2→dev.6): quick-menu, libreria, Impostazioni, modali, scheda del gioco, opzioni, tastiera virtuale, tester del controller. Confronto stile per stile con la v3.1.6-Mars in tutte le scene raggiungibili, nei due temi: nessuna differenza.
- **Font comune** (dev.2): Noto Sans da `assets/fonts/` per Dashboard (famiglia "X-Launcher Sans") e overlay.
- **Overlay con i colori, il tema chiaro e il font della Dashboard** (dev.7): tavolozza ricavata dai colori della Dashboard, titolo "Spazi/Spaces" nel font dell'intestazione "Collezione/Collection", tutti i testi in italiano/inglese secondo la lingua della Dashboard.
- **Splash nella lingua della Dashboard, nome del tema tradotto, antialias nell'overlay** (dev.8).
- **Testi fissi del frontend tradotti** (dev.9).

### Cosa cambia con la milestone

- **Badge "Modalità spazi" spento nella sessione stabile**: è una nota di sviluppo. In `App.tsx` compare solo con `localdev=1` (copia di sviluppo) o con `spacesbadge=1` nell'URL; `spacesbadge=0` lo spegne anche in sviluppo. `kiosk-launch.sh`, in modalità spazi, aggiunge `spacesbadge=1`/`0` se `X_LAUNCHER_SPACES_BADGE` vale `1|true|on|yes` / `0|false|off|no` (in `~/.config/openbox/environment`). Il redirect dell'autenticazione conserva il parametro.
- **Crediti sotto il numero di versione** nel quick-menu: "ideato e sviluppato con Claude Code da Daniele Bagaglini" / "conceived and developed with Claude Code by Daniele Bagaglini" (`quickMenu:credits`, segue la lingua della Dashboard).
- **`install.sh`**: dopo la copia controlla `themes/dark.json`, `themes/light.json` e i nove file Noto Sans in `assets/fonts/`; se mancano avvisa (non blocca). Nota nel riepilogo su temi e `X_LAUNCHER_SPACES_BADGE`.
- **`setup-linux.sh`**: nuova sezione che copia in `assets/fonts/` i file Noto Sans mancanti dai font di sistema (`/usr/share/fonts/{noto,truetype/noto,google-noto,google-noto-vf,TTF}`) con la licenza `OFL.txt`; se ne mancano ancora indica il pacchetto per distribuzione.
- **`scripts/check-themes.py`** (nuovo): controlla che ogni colore usato nel frontend sia in tutti i temi e in `src/index.css`, che i temi abbiano le stesse chiavi e che `overlay` contenga solo `#rrggbb`. Esce con 1 se trova problemi.
- **Documentazione**: `INSTALL.md` §4.1 (badge), nuova §4.2 "Temi e font", §7 (`app.conf` contiene il tema); nota nella Roadmap.
- Versione `3.2.0-Mars` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Fatto**: build completa, `tsc` (resta solo `ignoreDeprecations`, già presente), `check-themes.py`, `bash -n` di `install.sh`, `setup-linux.sh` e `kiosk-launch.sh`; sezione font di `setup-linux.sh` provata in una cartella di prova. In Chromium headless: sessione stabile senza badge e con i crediti (italiano e inglese), copia di sviluppo con badge "Server locale" e "Modalità spazi", sessione stabile con `spacesbadge=1` di nuovo con badge.
- **Non fatto (hardware reale)**: sessione Openbox stabile installata da `/opt` con la milestone (atteso: niente badge degli spazi, crediti sotto la versione; con `X_LAUNCHER_SPACES_BADGE=1` il badge torna).

### Resta aperto

- **Messaggi generati dal backend** (121, solo in italiano): servono codici di messaggio inviati dal backend e tradotti nel frontend.
- Scelte lasciate di proposito nel codice: due ternari della sola opacità e l'icona Sole/Luna dipendono ancora dallo schema (`theme`), non da un colore del tema.
- Temi aggiuntivi: predisposti ma non selezionabili dal quick-menu.
- Tema chiaro: il colore `item` (sfondo delle righe del pannello opzioni) è il bianco al 5% come prima, quasi invisibile su bianco; da rivedere quando si rifinisce il tema chiaro.
- Ereditati: interruttori Bluetooth/Wi-Fi/LAN dell'overlay, scelta della rete Wi-Fi, "chiudi il gioco" dall'overlay, indicatore del congelamento, regola sul quarto lancio, Fase 5, bug `GET /api/process-manager/list`, cifratura del bundle Drive e delle chiavi API.

## v3.1.7-dev.1 — temi come file (passo 1: infrastruttura, nessun cambiamento visivo)

Apre il lavoro sui temi: dark e light diventano file indipendenti dal codice della Dashboard, e l'overlay degli spazi usa lo stesso tema. In questo passo i due temi sono trascritti **identici** a com'erano: non cambia nulla di visibile, né nella Dashboard né nell'overlay. La possibilità di aggiungere temi nuovi è predisposta ma non esposta (il quick-menu alterna solo Scuro e Chiaro).

### Cosa cambia

- **`themes/dark.json`, `themes/light.json`** (nuovi, cartella `themes/` nella radice del progetto): un tema = un file `<id>.json`. `scheme` (dark | light), `name` (IT/EN), `colors` (colori con nome della Dashboard) e `overlay` (tavolozza dell'overlay, `#rrggbb`). Nel tema chiaro la sezione `overlay` è per ora la tavolozza scura di sempre: l'overlay non ha mai avuto un tema chiaro, arriva in un passo successivo.
- **`src/theme/themes.ts`** (nuovo): registro dei temi. I due built-in sono inclusi nella build; `applyTheme()` imposta le variabili `--xl-<nome>` su `<html>` (più `data-theme` e `color-scheme`); `registerTheme()` accetta temi aggiuntivi (id e valori validati), non usato per ora.
- **`src/index.css`**: blocco `@theme inline` con le classi `bg-xl-*`, `text-xl-*`, `border-xl-*` legate alle variabili (con il tema scuro come valore prima del JavaScript). Le vecchie `--color-bg-*` (usate da `body`) restano invariate.
- **`src/App.tsx`**: lo stato è ora `themeId` (il tema attivo); `theme` resta lo **schema** del tema, quindi i ~166 `theme === 'dark' ? … : …` non ancora migrati, e i componenti che ricevono `theme`, funzionano come prima anche con un tema futuro. Migrati ai colori con nome il contenitore principale e l'header (sfondo, bordo, scritta LAUNCHER). Il tema è applicato prima del paint (`useLayoutEffect`).
- **`app.conf`: nuova chiave `theme=`** (`src/backend/appConfig.ts`, id validato con `^[a-z0-9][a-z0-9-]{0,31}$`, rifiutato se non valido anche nel ripristino da Cloud Backup). Prima il tema stava solo nel `localStorage` del browser. `GET /api/config` espone `theme` e `themeIsUserSet`; al primo avvio dopo l'aggiornamento la Dashboard copia in `app.conf` il tema che aveva nel browser. La riga `theme=` viene scritta solo quando il tema è stato scelto (scrivere un'altra preferenza non la crea). Un id senza file ricade su `dark`.
- **`overlay.py`**: legge `theme=` da `app.conf` all'avvio e a ogni apertura (come la lingua), carica `themes/<id>.json` (max 64 KB; cartella sovrascrivibile con `X_LAUNCHER_THEMES` per i test) e applica la sezione `overlay`. Le chiavi mancanti si ricavano da `colors` (se `#rrggbb`), poi dalla tavolozza interna, che resta come riserva se il file manca o non si legge. Riga di log `overlay: theme is now <id>` al cambio.
- Versione `3.1.7-dev.1` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Fatto**: build completa (`vite` + `esbuild`) e `tsc` (nessun errore nuovo: resta solo `ignoreDeprecations` già presente); confronto pixel per pixel della Dashboard prima/dopo in Chromium headless, temi scuro e chiaro, identica; overlay disegnato con il codice della Mars e con quello nuovo (zona spazi e zona servizi) con `theme=dark`, `light`, assente e sconosciuto: identico al pixel; un tema di prova con colori diversi viene applicato davvero; sincronizzazione con `/api/config` simulato (tema da `app.conf`, copia iniziale dal browser, id sconosciuto → scuro); `app.conf` con id non validi (a-capo, `../`, spazi) rifiutati, anche in ripristino.
- **Non fatto (hardware reale)**: Dashboard e overlay sull'HTPC. Atteso: nessuna differenza visibile; dopo il primo avvio `~/.local/share/x-launcher/app.conf` contiene `theme=` e cambiando tema dal quick-menu la riga cambia.

### Prossimi passi

Migrazione di `App.tsx` ai colori con nome per zone (quick-menu, libreria, card del gioco, impostazioni, modali), sempre a parità di aspetto; poi tema chiaro dell'overlay e unificazione dei colori dell'overlay con quelli della Dashboard; font comune a Dashboard e overlay (file `.ttf` nel progetto).

## v3.1.7-dev.2 — font comune (Noto Sans dal progetto) e quick-menu ai colori con nome

Secondo passo dei temi, sempre senza cambiamenti visibili. La Dashboard e l'overlay prendono Noto Sans dalla cartella del progetto invece che da fontconfig, e il quick-menu passa ai colori con nome.

### Font

- **`assets/fonts/`** (nuova cartella, file copiati dall'utente dal pacchetto `noto-fonts` di Arch, non inclusi nel pacchetto della dev): `NotoSans-{Regular,Italic,Medium,MediumItalic,Bold,BoldItalic,Black,BlackItalic,LightItalic}.ttf` e `OFL.txt` (licenza, da `/usr/share/licenses/noto-fonts/LICENSE`).
- **Perché Noto Sans**: la Dashboard non aveva un font suo. Usava `ui-sans-serif, system-ui, sans-serif…` di Tailwind: Chromium non riconosce `ui-sans-serif` e passa a `system-ui`, che sull'HTPC fontconfig risolve a Noto Sans (`fc-match system-ui` → `NotoSans-Regular.ttf`). L'overlay chiedeva a fontconfig `sans` e `sans:bold`, cioè gli stessi file. Ora entrambi li prendono dal progetto: l'aspetto non dipende più dalla configurazione dei font del sistema.
- **`src/index.css`**: 9 `@font-face` della famiglia `X-Launcher Sans` (`font-display: block`), messa in testa a `--font-sans` (il resto dell'elenco resta come ripiego). Pesi: 400, 500, 700, 900 normale e corsivo, 300 corsivo. Il **200 corsivo** (titolo della libreria, `font-extralight italic`) non esiste nel pacchetto Arch: con i font di sistema Chromium usava il Light (300); il Light corsivo è dichiarato per 200-300 perché il CSS, da solo, avrebbe scelto il Thin (più sottile, visibile nel confronto). Per questo il Thin corsivo non serve.
- **`overlay.py`**: `_find_font_path()` cerca prima `assets/fonts/NotoSans-Regular.ttf` / `NotoSans-Bold.ttf` (dopo `X_LAUNCHER_OVERLAY_FONT`), poi fontconfig e DejaVu come prima.
- **Se i file mancano**: la build passa (Vite avvisa che i `url()` non sono risolti) e la Dashboard ricade sul font di sistema; l'overlay su fontconfig.

### Quick-menu

- Pannello, icona del titolo, pulsante di chiusura, righe di `OptionItem` (normale, con focus, in conferma rossa di Esci), badge "Server locale", "Modalità spazi" e countdown di gamescope ora usano i colori con nome. Nuovi colori in `themes/*.json` e `index.css`: `panel` (scuro `#0b0c0f`, chiaro bianco), `item`, `accent-border`, `on-accent`, `danger`, `danger-border`, `danger-text`, `info-text`, con gli stessi valori di Tailwind usati prima. `item` è il bianco al 5% anche nel tema chiaro, come prima (quasi invisibile su bianco): da rivedere quando si rifinisce il tema chiaro.
- Versione `3.1.7-dev.2` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Ambiente di prova come l'HTPC**: Noto Sans come font di sistema (stessi pesi del pacchetto Arch, senza ExtraLight), `fc-match system-ui` e `sans-serif:weight=black:slant=italic` con lo stesso risultato dell'HTPC. Nota: la macchina di prova aveva una regola fontconfig che preferiva Inter; il primo confronto (falsato) l'ha rivelata ed è stato rifatto senza.
- **Fatto**: build completa e `tsc` (nessun errore nuovo), anche senza `assets/fonts/` (solo avvisi); confronto pixel per pixel con la dev.1 (font di sistema) di libreria e quick-menu, temi scuro e chiaro: identici, salvo il numero di versione; stati attivi (riga con focus, conferma di Esci, chiusura, badge) confrontati a parte con il CSS della dev.1 e della dev.2: identici; overlay con i font di sistema e con quelli del progetto: identico al pixel; i 6 pesi effettivamente usati dalla pagina risultano caricati dal progetto.
- **Non fatto (hardware reale)**: Dashboard e overlay sull'HTPC con i file copiati da `noto-fonts`. I file di prova venivano dal repository `notofonts` e possono essere di una versione diversa da quella installata: sull'HTPC i file sono quelli di sistema, quindi il risultato atteso è identico.

## v3.1.7-dev.3 — libreria ai colori con nome

Terzo passo dei temi, senza cambiamenti visibili: header (barra degli store, nome host, avatar), griglia della libreria con ricerca e filtri, pannello laterale del gioco (con il log), footer con i suggerimenti dei tasti, e i componenti `Hint` e `ToggleItem`.

### Regole della migrazione (valgono anche per i passi successivi)

- **Ruoli** (cambiano tra scuro e chiaro) → colori con nome. Nuovi: `contrast` (bianco su scuro, nero su chiaro: anello dell'avatar, testo dei suggerimenti), `field` / `field-border` (campo di ricerca), `control` / `control-text` / `control-border` (menu dell'ordinamento), `border-subtle`, `well` / `well-border` (riquadro del log), `ink` (il bianco delle sovrapposizioni semitrasparenti, `bg-xl-ink/5` al posto di `bg-white/5`).
- **Colori di stato e del marchio** → scale con i valori di Tailwind: `primary` (blu), `danger` (rosso), `success` (verde), `warning` (giallo), `special` (viola), `info` (azzurro), `neutral` (grigio), con le sfumature usate (es. `bg-xl-primary-600`, `text-xl-neutral-700`).
- **Restano fissi**: i colori disegnati sopra le copertine e le immagini (titolo bianco sulla card, sfumature nere, pulsante play sull'immagine del pannello), i colori dei marchi (blu di Steam), le ombre colorate scritte come `rgba(...)` e le differenze di sola opacità tra i temi (icona delle notifiche).
- I nomi della dev.2 sono stati allineati alle scale: `accent` → `primary-600`, `accent-border` → `primary-500`, `danger` → `danger-600`, `danger-border` / `danger-text` → `danger-500`, `info-text` → `info-400`. Restano `accent-text` (blu-400 su scuro, blu-600 su chiaro) e `on-accent`.
- `themes/dark.json` e `themes/light.json` ora elencano 38 colori ciascuno, con le stesse chiavi; `src/index.css` li dichiara tutti (`@theme inline`). Restano 159 righe con confronti `theme === 'dark'` nelle zone non ancora migrate.
- Versione `3.1.7-dev.3` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Fatto**: build completa e `tsc` (nessun errore nuovo); tutte le classi nuove presenti nel CSS compilato. Confronto pixel per pixel con la dev.2 in Chromium headless, nell'ambiente con Noto Sans come l'HTPC, con una libreria di prova (i 6 giochi di `mockData.ts`, copertine generate in locale): libreria, ricerca aperta con filtri e ordinamento, card con il focus e pannello laterale del gioco, splash di avvio dopo il clic, temi scuro e chiaro: **identici**. Quick-menu e stati attivi (righe con focus, conferma di Esci, chiusura, badge) ricontrollati dopo il cambio dei nomi: identici, salvo il numero di versione.
- **Non coperto dal confronto**: stati che lo scenario di prova non raggiunge (gioco con aggiornamento disponibile o in errore, log con righe, notifiche non lette, download in corso, `ToggleItem` nelle impostazioni). Lì la sostituzione è la stessa, classe per classe, con valori identici.
- **Non fatto (hardware reale)**: Dashboard sull'HTPC. Atteso: nessuna differenza visibile.

## v3.1.7-dev.4 — Impostazioni ai colori con nome

Quarto passo dei temi, senza cambiamenti visibili: tutta la finestra delle Impostazioni (schede Account Store, Sistema, Plugin, Input, AI Advisor, Info Hardware).

### Cosa cambia

- **69 confronti `theme === 'dark' ? … : …`** sostituiti con colori con nome. Si riducevano a 28 coppie scuro/chiaro distinte, ognuna diventata un colore: `modal` (finestra), `scrim` (velo dietro la finestra), `inset` (riquadri delle chiavi API e dei campi), `box` (riquadri delle voci), `box-faint`, `fill-5`, `fill-10`, `hover-fill`, `button` / `button-text` (pulsanti non selezionati; `button-text` nel tema scuro è `currentColor`, cioè eredita, come prima), `border-strong`, `primary-tint` / `primary-tint-border` e `special-tint` / `special-tint-border` (riquadri evidenziati blu e viola), `accent-text-soft`, `icon-muted`, e la scala dei testi secondari **`fg-20`…`fg-80`** (nel tema scuro bianco al 20…80%, nel chiaro il grigio che c'era prima). Riusati `border`, `border-subtle`, `control-border`.
- **Classi fisse** (126 righe) convertite con le regole della dev.3; nuova scala `caution` (arancione) e sfumature 300/600 di quelle esistenti; `shade` = il nero delle sovrapposizioni (due riquadri di comandi `yay -S …`), come `ink` per il bianco.
- **`border` nel tema scuro** ora è scritto come lo scrive Tailwind (`color-mix(in oklab, #fff 10%, transparent)`) invece di `rgb(255 255 255 / 0.1)`. Stesso colore, ma Chromium disegnava con un percorso diverso il riquadro arrotondato della finestra e il suo contenuto (differenze di anti-aliasing sui bordi di testi e riquadri). Header e footer, che lo usano dalla dev.1, risultano identici anche così.
- `themes/*.json`: 74 colori ciascuno. Restano 90 righe con confronti `theme === 'dark'` (modali, scheda del gioco, opzioni e compatibilità).
- Versione `3.1.7-dev.4` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Fatto**: build completa e `tsc` (nessun errore nuovo); ogni colore usato è definito in entrambi i temi; i valori della dev.3 sono invariati. **Stili calcolati confrontati elemento per elemento** (colore, sfondo, bordo, ombra, opacità, posizione, trasformazione) in ogni scheda, temi scuro e chiaro: **0 differenze** su 25–151 elementi per scheda. Confronto pixel per pixel con la dev.3 con sfocatura, animazioni e transizioni spente in entrambe le build (la sfocatura a 64 px dello sfondo rendeva diversi anche due scatti della stessa build): identico, salvo punti che cambiano anche tra due scatti della stessa build (tasto "A" del footer, una riga della scheda Account). Libreria e quick-menu ricontrollati dopo il cambio di `border`: identici.
- **Non coperto**: la scheda AI Advisor (compare solo con i provider configurati, che lo scenario di prova non ha) e gli stati che richiedono dati reali (account collegati, runner installati, backup su Drive). Lì le sostituzioni sono le stesse coppie, verificate nelle altre schede.
- **Non fatto (hardware reale)**: Impostazioni sull'HTPC. Atteso: nessuna differenza visibile.

## v3.1.7-dev.5 — modali, scheda del gioco, opzioni: `App.tsx` interamente ai colori con nome

Quinto passo dei temi, senza cambiamenti visibili. Con questo passo in `App.tsx` non restano colori legati al tema scritti nel codice: splash di avvio e conferme, download, notifiche, process manager, libreria avatar, scheda e opzioni del gioco (runner, profilo di compatibilità, dipendenze Wine, variabili, AI), tastiera virtuale e messaggi a schermo.

### Cosa cambia

- **84 confronti `theme === 'dark'`** convertiti (42 coppie scuro/chiaro, metà già con un nome). Nuovi colori: `veil` (sfondo delle schermate a tutta pagina), `notice-tint` / `notice-tint-border` / `notice-text` (riquadri d'avviso ambra), `inset-soft`, `console` / `console-border` (blocchi di comandi), `fill-5-strong`, `fill-10-strong`, `fill-20`, `box-primary`, `pane`, `pane-3`, `primary-border`, `primary-border-soft`, `primary-text-dim`, `border-heavy`, `alt-text-700`, `fg-25-alt`, `fg-50-alt`, `fg-70`, `chip-text`, e i colori dell'etichetta del runner Wine-Lutris (`lutris-text`, `lutris-badge`, `lutris-badge-text`, `lutris-badge-border`). Nuove scale: `notice` (ambra), `emerald` e `cyan` (livelli di log "RUN" e "DL") e sfumature 200/700.
- **Classi fisse** (169 righe) convertite con le regole della dev.3. I neri semitrasparenti che non stanno sopra immagini (veli, tracce delle barre di avanzamento, messaggi a schermo) usano `shade/N`.
- **Esadecimali con opacità** (`bg-[#0b0c0f]/98`, `bg-[#12141a]/90`): Tailwind li scrive come valore fisso (`#0b0c0ffa`, `#12141ae6`), non come `color-mix`. `veil` e `sidebar-glass` hanno esattamente quei valori. La barra laterale della libreria (dev.3) era passata a `color-mix`: identica a pixel, ma non nel valore calcolato. Ora coincide con l'originale.
- **Restano 3 confronti `theme === 'dark'`, voluti**: due cambiano l'opacità e non il colore (icona delle notifiche; una riga delle notifiche che sul tema scuro è al 30% di opacità e sul chiaro grigia), uno sceglie l'icona sole/luna del quick-menu.
- **Non ancora migrati**: i componenti `VirtualKeyboard.tsx` e `GamepadTester.tsx`, che hanno i propri confronti (`isLight`) e colori dentro i disegni SVG del controller. Prossimo passo.
- `themes/*.json`: 111 colori ciascuno.
- Versione `3.1.7-dev.5` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Errore trovato e corretto prima della consegna**: togliendo dallo script di generazione un colore inutilizzato era sparita anche la riga di `border-heavy` (il bordo del pulsante con il focus nelle opzioni del gioco), quindi la classe non veniva generata e il bordo prendeva il colore del testo. L'ha rivelato il confronto degli stili calcolati. Ora un controllo verifica, dopo ogni rigenerazione, che ogni colore usato sia definito in entrambi i temi e in `index.css`.
- **Fatto**: build completa e `tsc` (nessun errore nuovo). **Confronto con la v3.1.6-Mars originale** (compilata dal pacchetto della Mars), stili calcolati elemento per elemento (colore, sfondo, bordi, ombra, opacità, `fill`/`stroke`, posizione e dimensioni), temi scuro e chiaro: libreria, quick-menu, opzioni del gioco (tre punti di scorrimento), download con conferma di disinstallazione, notifiche, process manager, libreria avatar, tastiera virtuale, splash, e tutte le schede delle Impostazioni: **0 differenze**, da 25 a 381 elementi per scena.
- **Non coperto**: stati che lo scenario di prova non raggiunge (download in corso, notifiche con contenuto, giochi in errore, finestra della compatibilità con un profilo salvato, AI Advisor con provider).
- **Non fatto (hardware reale)**: Dashboard sull'HTPC. Atteso: nessuna differenza visibile.

## v3.1.7-dev.6 — tastiera virtuale e tester del controller ai colori con nome

Sesto passo dei temi, senza cambiamenti visibili. Con questo passo tutta la Dashboard prende i colori dai file dei temi.

### Cosa cambia

- **`src/components/VirtualKeyboard.tsx`**: 11 confronti `isLight ? … : …` convertiti, più 16 righe di classi fisse. Nuovo colore `keyboard-glass` (sfondo della tastiera: `#12141af2` nel tema scuro, come lo scriveva Tailwind, bianco al 95% nel chiaro). Nel tema chiaro i tasti hanno un bordo, nello scuro no: la presenza del bordo cambia la dimensione del tasto, quindi resta legata allo schema (`isLight ? ' border border-xl-border' : ''`), mentre il colore viene dal tema.
- **`src/components/GamepadTester.tsx`**: il disegno del controller (corpo, tasti, dorsali, levette, etichette) prende i colori da sette nuovi colori del tema, `pad-lit`, `pad-lit-label`, `pad-idle-fill`, `pad-idle-stroke`, `pad-label`, `pad-stick`, `pad-body`, con i valori di prima. Sono passati come stile (`style={{ fill: 'var(--xl-pad-…)' }}`) invece che come attributi `fill`/`stroke`: le variabili CSS negli attributi SVG funzionano in Chromium ma non sono garantite altrove (la Dashboard può girare anche in Firefox). Riquadro e testo del tester convertiti come il resto; nuovo `notice-tint-border-soft`. `isLight` non serve più nel componente.
- Il controllo di copertura verifica ora anche le variabili usate direttamente (`var(--xl-…)`), oltre alle classi.
- `themes/*.json`: 120 colori ciascuno. Nel codice restano solo le scelte legate allo schema che non sono colori: i tre confronti di `App.tsx` della dev.5 e il bordo dei tasti della tastiera.
- Versione `3.1.7-dev.6` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Fatto**: build completa e `tsc` (nessun errore nuovo). Confronto degli stili calcolati con la **v3.1.6-Mars originale**, temi scuro e chiaro: tastiera virtuale (381 elementi), scheda Input con il tester (151 elementi, compresi `fill` e `stroke` del disegno), libreria, quick-menu e le altre schede delle Impostazioni: **0 differenze**. Un primo confronto aveva trovato il colore del bordo dei tasti cambiato nel tema scuro, dove il bordo non c'è (invisibile); il colore è stato spostato nel ramo chiaro per avere la corrispondenza esatta.
- **Non coperto**: tasti del controller premuti (colore acceso `#3b82f6` ed etichetta bianca, uguali nei due temi) e le varianti della tastiera con suggerimenti attivi.
- **Non fatto (hardware reale)**: tastiera virtuale e tester sull'HTPC. Atteso: nessuna differenza visibile.

## v3.1.7-dev.7 — overlay degli spazi con i colori della Dashboard e tema chiaro

Primo passo dei temi con un cambiamento visibile, scelto dall'utente su un confronto (oggi / proposta scura / proposta chiara, accanto alla Dashboard). Riguarda solo l'overlay; la Dashboard non cambia.

### Cosa cambia

- **Tavolozza dell'overlay ricavata dalla Dashboard** (`themes/*.json`, sezione `overlay`): sfondo = `bg`; riquadri dei servizi e carte = `surface` (il colore dell'header); carta selezionata = `card`; bordi = `border`; testo = `text`; testo secondario = `fg-50`; selezione = `primary-500` (il blu dei focus della Dashboard, al posto dell'azzurro di prima); tasti A/B = `success-500` / `danger-500` (il verde e il rosso esatti della legenda della Dashboard, prima erano quelli di una versione precedente di Tailwind); stato non disponibile = `neutral-500`; avvisi = `notice-400` nel tema scuro, `notice-text` (ambra scuro) nel chiaro, perché l'ambra chiaro sul bianco non si legge. I colori semitrasparenti della Dashboard sono composti sullo sfondo, dato che l'overlay disegna in RGB pieno.
- **Tema chiaro dell'overlay** (nuovo): prima l'overlay restava scuro anche con la Dashboard chiara. Ora sfondo grigio chiaro, carte e riquadri bianchi con bordo grigio, testi scuri, come la Dashboard chiara.
- **Riquadro della Dashboard nelle carte degli spazi**: il blu del logo "X" (`primary-600`) con le iniziali bianche, al posto del quasi nero con le iniziali azzurre. I riquadri colorati dei giochi senza copertina restano come prima in entrambi i temi.
- **Titolo** nello stile dell'intestazione "COLLEZIONE" della Dashboard: Noto Sans Light corsivo (`assets/fonts/NotoSans-LightItalic.ttf`, già presente dalla dev.2), maiuscolo, 24 px sulla base di 1280 dell'overlay (= i 36 px di `text-4xl` sulla base di 1920 della Dashboard), centrato in altezza sui riquadri dei servizi. Il testo viene dalla traduzione (`SPAZI` / `SPACES`); senza il file del Light corsivo si usa il regolare. Non è riprodotta la spaziatura stretta delle lettere (`tracking-tight`): Pillow non la gestisce.
- **Lingua**: controllato che tutti i 29 testi dell'overlay (compresi i messaggi a comparsa) esistano in italiano e in inglese, sia interni sia in `public/locales/{it,en}/overlay.json`; la lingua è quella di `app.conf`, riletta a ogni apertura come il tema.
- **Tavolozza di riserva** in `overlay.py` (usata se il file del tema manca o non si legge) = il nuovo tema scuro.
- Versione `3.1.7-dev.7` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Fatto**: overlay disegnato con il renderer vero in tema scuro e chiaro, italiano e inglese (titolo `SPAZI` / `SPACES` col Light corsivo, riquadro della Dashboard blu, messaggio a comparsa leggibile in entrambi); tavolozza di riserva identica al tema scuro; senza il Light corsivo il titolo usa il regolare; `py_compile`; build completa; controllo di copertura dei colori.
- **Non fatto (hardware reale)**: overlay sull'HTPC sopra un gioco, con le copertine vere, e cambio di tema dalla Dashboard seguito dall'apertura dell'overlay (atteso: l'overlay segue il tema; nel log `overlay: theme is now light`).

## v3.1.7-dev.8 — lingua della splash, nome del tema tradotto, antialias nell'overlay

Tre incongruenze segnalate dall'utente dopo il test della dev.7 (confermato: l'overlay eredita tema e lingua della Dashboard).

### Cosa cambia

- **Splash di avvio dei giochi nella lingua della Dashboard** (`src/App.tsx`): i testi delle fasi (avvio, avvio da uno store, verifica dell'ambiente, pronto, non riuscito, tempo scaduto, annullato) erano scritti in italiano nel codice; ora vengono da `dashboard:splash.*` in `public/locales/{it,en}/dashboard.json`. Il dettaglio che arriva dal backend (nome dello store o del verbo winetricks) resta com'è: non è testo da tradurre.
- **Nome del tema nel quick-menu nella lingua della Dashboard**: al posto dell'id (`dark` / `light`) si vede il nome dal file del tema (`Scuro` / `Chiaro`, `Dark` / `Light`). Nuova `themeDisplayName()` in `src/theme/themes.ts`: lingua esatta, poi lingua principale, poi inglese, poi l'id (vale anche per i temi futuri).
- **Antialias delle forme nell'overlay** (`overlay.py`): Pillow disegna riquadri arrotondati, cerchi, frecce e icone senza antialias (solo il testo è sfumato), da cui i bordi seghettati rispetto alla Dashboard. Ora ogni forma è disegnata come maschera a 4× la risoluzione, ridotta con una media e usata per incollare il colore: riquadri e carte (riempimento e bordo), pallini di stato, tasti A/B della legenda, frecce, icone (Bluetooth, Wi-Fi, LAN, +, −) e angoli delle copertine. Le maschere restano in memoria per geometria (fino a 400): le misure si ripetono a ogni fotogramma, quindi il costo pesa solo la prima volta.
- Versione `3.1.7-dev.8` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Fatto**: Dashboard in Chromium headless con lingua inglese e italiana, temi scuro e chiaro: splash "Launching..." / "Avvio in corso...", tema nel quick-menu "Dark"/"Light" / "Scuro"/"Chiaro". Overlay a 2560×1440 prima e dopo: bordi sfumati (ingrandimenti di angoli, icone, tasti), stessa disposizione (differenze forti solo su 2.097 pixel di bordo su 3,7 milioni); tempi sulla macchina di prova: primo fotogramma ~0,4 s (comprende il caricamento dei font), i successivi 22-35 ms (prima 11-28 ms). `py_compile`, `tsc` (nessun errore nuovo), build completa.
- **Non fatto (hardware reale)**: overlay sull'HTPC (fluidità del movimento col controller, aspetto dei bordi sul monitor) e splash in inglese con un gioco vero.

## v3.1.7-dev.9 — testi della Dashboard scritti in italiano nel codice, ora tradotti

Dopo la splash della dev.8, una ricerca su tutto il frontend dei testi italiani scritti direttamente nel codice (non passati dalle traduzioni). Ora seguono la lingua della Dashboard; la frase italiana nel codice resta come ripiego dove c'era già.

### Cosa cambia

- **Suggerimenti della tastiera virtuale** (argomenti di lancio, RetroArch, variabili Wine e Proton): le 24 spiegazioni e l'etichetta "📺 Filtro CRT" vengono da `dashboard:keyboard.tips.<chiave>` e `dashboard:keyboard.crtFilter`. Ogni suggerimento ha una chiave (`SUGGESTION_TIP_KEYS`, dal valore); la traduzione si applica quando la lista viene passata alla tastiera (`localizeSuggestions`), il componente `VirtualKeyboard.tsx` non cambia.
- **Descrizione di Steam Big Picture** nel pannello del gioco: passa da `dashboard:launcherDescriptions` come quelle dei launcher EA e Ubisoft.
- **Account degli store**: messaggi di stato (avvio autenticazione, connesso, autenticato, disconnessione in corso, errore di rete, errore sconosciuto, timeout) → `settings:accounts.status.*`.
- **Runner**: avvio download/disinstallazione ed errori di ripiego → `settings:system.runnerProgress.*`.
- **Pannello del log** (Ctrl+H): suggerimenti dei pulsanti (pausa/riprendi, copia, scarica), "Nessun log", conteggio delle voci (singolare/plurale) e "filtro attivo" → `dashboard:logPanel.*`.
- **Opzioni del gioco**: "Nessun runner trovato…" → `gameOptions:noRunnerFound` (in italiano ora dice "Apri Sistema → Runner", come si chiama la scheda).
- **Badge del quick-menu** "Server locale" e "Modalità spazi" → `quickMenu:localServerBadge`, `spacesBadge`, `spacesBadgeUnreachable`.
- **AI Advisor e plugin**: "Nessuna risposta", "Richiesta fallita…" (`useAiAdvisorProviders.ts`) e l'errore di caricamento dei plugin (`useStorePluginRegistry.ts`) via `i18n.t`.
- Le note dei provider AI e la descrizione del plugin "Controller generico" erano già tradotte (chiavi esistenti, il testo nel codice è il ripiego).
- **Non toccati, di proposito**: log e diagnostica (`[SPACES-DIAG]`, motivazioni del gate degli spazi), gli strumenti di debug della navigazione (`NavDebugOverlay`, `FocusProvider`), commenti, e gli avvisi di lingua non supportata (già scritti nelle rispettive lingue).
- **Resta aperto**: 121 messaggi in italiano generati dal **backend** (account degli store, installazioni, launcher condivisi, backup, avvio dei giochi) arrivano al frontend come frasi già fatte e non si possono tradurre lì. Serve un passo a parte: il backend manda un codice (più eventuali valori) e il frontend lo traduce.
- Versione `3.1.7-dev.9` in `package.json` e nel fallback di `src/App.tsx`.

### Verifica fatta e non fatta

- **Fatto**: tutte le 326 chiavi statiche usate in `App.tsx` esistono in italiano e in inglese; i file di traduzione hanno le stesse chiavi nelle due lingue; i 24 suggerimenti hanno chiave e traduzione. In Chromium headless con Dashboard in inglese e in italiano: badge "Local server · :8771" / "Server locale · :8771" e "Spaces mode · manager unreachable" / "Modalità spazi · gestore non raggiungibile"; pannello del log ("Pause auto-scroll", "No logs.", "0 entries" e gli equivalenti italiani); descrizione di Steam Big Picture. `tsc` (nessun errore nuovo), build completa.
- **Non provato dal vivo**: la spiegazione dei suggerimenti (compare con Shift sulla tastiera virtuale e il focus del controller) e i messaggi degli account e dei runner (servono store e runner veri).


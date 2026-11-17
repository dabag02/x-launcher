# CHANGELOG-20 — da v3.3.17-Mars

Prosegue da CHANGELOG-19.md (chiuso su MILESTONE STABILE v3.3.17-Mars).

Voci in ordine: la prima del ciclo sarà `## v3.3.18-dev.1` (o la patch che sceglie l'utente). Ad ogni consegna reale si incrementa `-dev.N` in `package.json` E nel fallback letterale di `src/App.tsx`, oltre alla voce corrispondente qui. Regola fissa: l'installer ha `--devel` accanto a `--relink-openbox`; tenerlo presente in ogni release.

Punti aperti ereditati dalla milestone: vedi «Resta aperto» nella voce della milestone in CHANGELOG-19.md.

---

## v3.3.18-dev.1 — environment di Openbox nell'installer (17/11/2026)

Richiesta utente: ricreare `~/.config/openbox/environment` con tutte le variabili del progetto, attive e disattive, e farlo installare dall'installer.

- **Nuovo `openbox/environment.example`**: tutte le variabili lette dalla sessione Shell (autostart, kiosk-launch.sh, tray.py, spaces.py, overlay.py), raggruppate per area (Sessione e Dashboard, Overlay, Congelamento, Multimedia, Sfondi, Percorsi di sviluppo) e commentate in italiano. Le righe `export` attive riportano i valori predefiniti del codice, quindi il file non cambia il comportamento; le opzioni facoltative sono commentate. Esclusi: `ALWAYS_ON_TOP`, `FORCE_BORDERLESS`, `DEDICATED_SESSION` (riscritte da kiosk-launch.sh), `START_HIDDEN` e `SESSION_DEBUG` (non passano dalla sessione Openbox), `XL_SPACES_TEST_*` e `XL_OVERLAY_DUMP` (prove e debug). `X_LAUNCHER_URL` resta commentata: la imposta kiosk-launch.sh (3000 o 3001 col server locale). `X_LAUNCHER_CLIPS_DIR` commentata con avviso: deve coincidere con il calcolo del demone. Chiavi API e `X_LAUNCHER_SCREENSHOT_QUALITY` restano nel `.env` del demone.
- **`install.sh`, `setup_openbox_session()`**: copia sempre l'esempio in `~/.config/openbox/environment.example`; crea `~/.config/openbox/environment` dall'esempio **solo se manca**; un environment esistente non viene mai toccato, l'installer elenca soltanto le variabili dell'esempio che non contiene (log `[INSTALL]   ℹ variabili disponibili…`). Vale anche con `--devel` e `--relink-openbox`.
- **`INSTALL.md`**: paragrafo sul file environment.
- Versione: `package.json` e fallback di `src/App.tsx` a `v3.3.18-dev.1`.

Prova: `sudo ./install.sh` (o `--devel`) con e senza `~/.config/openbox/environment`, poi nuovo login nella sessione Openbox e controllo di `openbox-session.log` / `tray.log`.

---

## Piano — presentazioni automatiche degli screenshot (concordato il 17/11/2026)

Gli screenshot non si condividono direttamente:
- la sezione Artwork di Steam non ha un'API di caricamento;
- Instagram richiede un account professionale e un indirizzo pubblico per le immagini.

Al loro posto: **presentazioni automatiche** degli screenshot di una galleria, con transizioni, effetti e musica, salvate come clip. Così ereditano visore, salvataggio, condivisione su YouTube, filigrana e badge «Condiviso».

Fattibilità verificata con un prototipo `ffmpeg`:
- 6 screenshot, zoom lento, 5 transizioni `xfade` e musica con dissolvenze: MP4 1080p da 19 s in 17,6 s su 2 core con x264;
- sull'HTPC con NVENC la codifica è molto più veloce (lo zoom resta sul processore);
- `xfade` offre più di 50 transizioni.

Decisioni dell'utente:
- **musica**:
  - brani **CC0** inclusi nei template standard;
  - oppure musica locale scelta dalla cartella **Musica** della home (cartella `MUSIC` di `xdg-user-dir`, con le sottocartelle);
- **titolo**: per ora solo nella prima slide; quello predefinito è il titolo del gioco, modificabile prima della creazione (VirtualKeyboard);
- **formati**: **16:9** e **9:16** (reel e short); nel 9:16 lo screenshot al centro su fondo sfocato;
- **durata della presentazione scelta dall'utente** fra **7, 15, 30 e 45 s** (al massimo 45 s; richiesta del 17/11/2026), accanto al template, in base a quanti screenshot vuole usare:
  - la durata è quella dell'intera presentazione, titolo e transizioni compresi;
  - la slide del titolo dura 1,5 s nella presentazione da 7 s e 3 s nelle altre;
  - il tempo che resta si divide in parti uguali fra gli screenshot scelti, quindi le slide sono più corte o più lunghe secondo quante foto si aggiungono; il template stabilisce solo il ritmo (lunghezza delle transizioni ed effetti), non la durata;
  - minimo 2 s per slide: se gli screenshot sono troppi per la durata scelta entrano solo i primi, e la finestra lo dice prima della creazione («N screenshot · X s per slide · M esclusi: scegli una durata più lunga»);
  - con poche foto e una durata lunga le slide durano di più (lo zoom lento le tiene in movimento); la finestra mostra comunque i secondi per slide;
  - transizioni accorciate se la slide è breve (al massimo un terzo della slide);
  - la musica viene tagliata alla durata della presentazione, con la dissolvenza finale;
- **template**:
  - 3 standard (mock: Classico, Dinamico, Cinema);
  - possibilità di aggiungerne di personalizzati, una cartella per template.

Regole di sicurezza: `template.json` sceglie solo da un elenco controllato (nomi delle transizioni ed effetti, numeri entro limiti, colori, file dentro la cartella del template). Nessun filtro ffmpeg scritto a mano: il comando lo costruisce il demone.

Step proposti:
1. generatore nel demone (un template fisso, 16:9 e 9:16), prova dal terminale;
2. formato dei template e validazione, 3 template standard con brani CC0 (licenze verificate e citate), scelta della musica locale;
3. Dashboard: «Crea presentazione» nella scheda Screenshot (template, formato, screenshot da usare, titolo, musica), avanzamento, risultato fra le clip da rivedere;
4. template personalizzati in `~/.local/share/x-launcher/slideshow-templates/`, anteprime dei template, documentazione.

/**
 * thirdPartyLaunchers.ts — registro dichiarativo dei launcher di terze
 * parti richiesti da alcuni giochi (Ubisoft Connect, EA App, Battle.net,
 * Rockstar Games Launcher). Solo dati, nessuna logica specifica per
 * singolo launcher: bootstrap/lancio comune vive in
 * sharedLauncherManager.ts, che riusa questi campi indipendentemente dal
 * launcher — nessun `if (launcher === 'ubisoft')` sparso nel codice.
 *
 * Ubisoft Connect ed EA App compilati con dati reali. Battle.net e
 * Rockstar Games Launcher restano placeholder (`libraryReader: 'unknown'`)
 * finché non verificati con dati reali.
 */

import { StoreType } from '../../types';

export interface ThirdPartyLauncherDefinition {
  id: string;
  displayName: string;

  /**
   * v1.5.20-dev.10 — collega questo launcher al proprio StorePlugin (es.
   * 'Ubisoft' per UbisoftConnectPlugin) — un solo punto dove tradurre fra
   * i due spazi di id distinti (lo `store` su cui gira ogni Game riga, e
   * il `launcherId` usato da sharedLauncherManager.ts/thirdPartyLaunchers
   * stesso), invece di stringhe duplicate sparse in gameManager.ts/
   * downloadManager.ts. Nessun launcher-plugin unico (deciso esplicitamente
   * con l'utente: ogni launcher resta un proprio StorePlugin per le
   * proprie particolarità — card, switch, libreria interna) — questo
   * campo è solo il ponte fra i due registri, non un accorpamento.
   */
  storeId: StoreType;

  /**
   * Pagina ufficiale di download — MAI un URL di file binario diretto.
   * Verificato per Ubisoft Connect: la pagina reale
   * (ubisoft.com/en-us/ubisoft-connect/download) triggera il download
   * solo via JavaScript verso uno short-link (ubi.li/...), non un .exe
   * con URL stabile che si possa scaricare via curl in automatico senza
   * rischiare di rompersi silenziosamente a un cambio di redirect. Il
   * bootstrap apre questa pagina in Firefox (stesso meccanismo già usato
   * per i login GOG/Epic via browser integrato) — l'utente scarica ed
   * esegue l'installer manualmente la prima volta.
   */
  installerUrl: string;

  /**
   * Path atteso dell'eseguibile dentro <prefix>/pfx/drive_c/... dopo
   * un'installazione reale — hint per pre-compilare il campo nell'UI di
   * bootstrap, NON una garanzia: l'utente conferma/corregge il path
   * reale dopo aver installato, non viene mai assunto ciecamente.
   */
  executableRelPathHint: string;

  /**
   * Come si legge la libreria interna del launcher per popolare i giochi
   * installati come card proprie (Fase 2, non ancora implementata).
   * 'unknown' finché non verificato su un caso reale con un gioco vero
   * dentro il prefix condiviso.
   */
  libraryReader: 'registry' | 'manifest-file' | 'unknown';

  /**
   * Template di lancio diretto stile steam://rungameid/<id>, se esiste
   * per questo launcher — {id} viene sostituito con l'id gioco specifico
   * del launcher (non l'id X-Launcher). MAI trattato come garantito: un
   * report reale mostra uplay://launch/.../0 restare bloccato su
   * "initializing" pur sembrando eseguire — serve sempre un fallback
   * esplicito (apri il launcher stesso, l'utente clicca Play da lì).
   * null = nessun protocollo noto/verificato per questo launcher.
   */
  directLaunchUriTemplate: string | null;

  /** Winetricks verbs noti necessari al funzionamento del launcher stesso
   *  (non dei giochi che ci girano dentro) — vuoto finché non scoperti
   *  da un bootstrap reale. */
  requiredWinetricksVerbs: string[];

  /**
   * v1.5.20-dev.10 — pattern (case-insensitive, sintassi `find -iname`)
   * per riconoscere l'installer di QUESTO launcher già scaricato in
   * ~/Downloads — prima hardcoded dentro findInstallerInDownloads()
   * (solo `*ubisoft*`/`*uplay*`), ora dato dichiarativo per launcher,
   * stesso principio del resto del file. Vuoto finché non verificato con
   * un download reale del vero installer (stesso principio di verified
   * sotto — mai indovinato).
   */
  installerFilenameHints: string[];

  /**
   * false finché non testato con un bootstrap completo + almeno un gioco
   * reale installato dentro, su hardware reale. Non un flag decorativo:
   * governa se la Fase 2 (lettura libreria interna) può fidarsi delle
   * assunzioni sopra o deve ripartire da zero con verifica.
   */
  verified: boolean;

  /**
   * v2.0.41-dev.15 — richiesta utente: capitalizzare l'esperienza reale
   * accumulata installando/avviando ogni launcher condiviso, per aiutare
   * proattivamente un futuro utente che si trovi nelle stesse difficoltà
   * già superate. Mostrati quando l'utente risponde "Non ha funzionato"
   * alla notifica di verifica post-chiusura per QUESTO gioco/launcher (o
   * per un gioco che lo richiede) — vedi resolveNotification() in
   * useNotifications.ts e l'evento 'launcher-troubleshooting-tips' in
   * notificationEngine.ts. Bilingue, stesso pattern di solution/
   * solution_en già in uso per la Knowledge Base (knowledgeBase.ts) —
   * `textEn` opzionale, ricade su `text` se assente. Un breve elenco di
   * consigli concreti (runner collaudato, interruttore Umu-launcher,
   * argomenti da passare), non un'automazione — l'utente resta libero di
   * applicarli o meno, nessun "Apply" a un click per non rischiare di
   * sovrascrivere una configurazione che l'utente ha già personalizzato
   * di proposito. Vuoto/assente finché non c'è esperienza reale da
   * riportare — mai un consiglio generico/indovinato scritto qui.
   */
  troubleshootingTips?: { text: string; textEn?: string }[];

  /**
   * v2.0.41-dev.18 — richiesta utente: quando un gioco lancia questo
   * launcher come propria dipendenza (requiresLauncher, vedi
   * launchSharedLauncher in sharedLauncherManager.ts), la SUA finestra
   * non deve rubare il focus al gioco appena avviato — passati come
   * argomenti extra al lancio SOLO in quel percorso automatico, mai
   * quando l'utente apre il launcher a mano dalla propria card (lì
   * l'utente lo vuole visibile, è esattamente quello che ha chiesto).
   * Vuoto/assente finché non c'è un argomento verificato per quel
   * launcher specifico — mai indovinato.
   */
  silentLaunchArgs?: string[];

  /**
   * v2.0.41-dev.33 — richiesta utente: nome noto del titolo della
   * finestra di questo launcher (es. EA App → "EA", Ubisoft Connect →
   * "Ubisoft Connect", sempre uguale secondo osservazione diretta
   * dell'utente — da riverificare al primo utilizzo reale con
   * `wmctrl -lx`, mai dato per scontato oltre quella prima conferma).
   * Usato per due scopi distinti: (1) escludere la finestra del
   * launcher dalla cattura del window_class di un gioco che lo
   * richiede (evita l'ambiguità "sono comparse due finestre nuove
   * insieme, quale delle due è il gioco?"); (2) lo stesso filtro
   * applicato dalla splash di lancio quando "launcher condiviso" è
   * attivo per il gioco in corso di avvio.
   */
  knownWindowTitle?: string;
}

export const THIRD_PARTY_LAUNCHERS: ThirdPartyLauncherDefinition[] = [
  {
    id: 'ubisoft-connect',
    displayName: 'Ubisoft Connect',
    storeId: 'Ubisoft',
    installerUrl: 'https://www.ubisoft.com/en-us/ubisoft-connect/download',
    executableRelPathHint: 'Program Files (x86)/Ubisoft/Ubisoft Game Launcher/UbisoftConnect.exe',
    // v2.0.41-dev.6 — da 'unknown' a 'registry': scanInstalledUbisoftGames
    // (ubisoftConnectPlugin.ts) legge la libreria interna dal registro
    // Wine (system.reg, chiavi Software\Ubisoft\Launcher\Installs\<id>),
    // verificato su hardware reale con due giochi (Watch Dogs 2,
    // Assassin's Creed Syndicate).
    libraryReader: 'registry',
    directLaunchUriTemplate: 'uplay://launch/{id}/0',
    requiredWinetricksVerbs: [],
    installerFilenameHints: ['*ubisoft*', '*uplay*'],
    // v2.0.41-dev.6 — da false a true: bootstrap, lancio (leggero e
    // container pieno) e ora anche lettura libreria interna, tutti
    // confermati dall'utente su hardware reale con due giochi distinti.
    verified: true,
    // v2.0.41-dev.15 — esperienza reale accumulata (MILESTONE v1.5.20-Venus
    // e sessioni successive, vedi CHANGELOG.md "saga finestra nera" e
    // CHANGELOG-2.md): il problema storico più segnalato per Ubisoft
    // Connect è la finestra completamente nera dal secondo avvio in poi
    // — causa reale, confermata nel sorgente Proton: il container Steam
    // Linux Runtime mancante quando Ubisoft Connect (o un gioco che lo
    // richiede) parte senza passare da `umu-run`.
    troubleshootingTips: [
      {
        text: 'Se Ubisoft Connect si apre con una finestra completamente nera (tipicamente dal secondo avvio in poi), attiva l\'interruttore "Umu-launcher" in Compatibility Layer per questo gioco/launcher — manca il container Steam Linux Runtime richiesto per il rendering corretto.',
        textEn: 'If Ubisoft Connect opens with a completely black window (typically from the second launch onward), enable the "Umu-launcher" switch in Compatibility Layer for this game/launcher — it\'s missing the Steam Linux Runtime container needed for correct rendering.',
      },
    ],
    // v2.0.41-dev.33 — richiesta utente, osservazione diretta: la
    // finestra di Ubisoft Connect si chiama sempre "Ubisoft Connect" —
    // da riverificare con wmctrl -lx al primo utilizzo reale, non
    // ancora confermato da noi.
    knownWindowTitle: 'Ubisoft Connect',
  },
  {
    id: 'ea-app',
    displayName: 'EA App',
    storeId: 'EA App',
    // v2.0.41-dev.11 — verificato con web_fetch: link diretto presente
    // come <a href> semplice nell'HTML della pagina ufficiale
    // (ea.com/ea-app, sezione "Download the EA app" → "Windows"), NON
    // dietro un trigger JavaScript come la pagina Ubisoft Connect —
    // risolve direttamente a binary/octet-stream, nessun redirect verso
    // login/HTML, final_url identico a destination_url. Confermato anche
    // da una seconda fonte indipendente (script di installazione del
    // pacchetto Chocolatey "ea-app", stesso identico URL).
    installerUrl: 'https://origin-a.akamaihd.net/EA-Desktop-Client-Download/installer-releases/EAappInstaller.exe',
    // v2.0.41-dev.13 — CONFERMATO su hardware reale (era solo un'ipotesi
    // in dev.11): questo percorso funziona davvero, ma con una premessa
    // fondamentale — l'installer EA usa CreateSymbolicLinkW per popolare
    // "EA Desktop/EA Desktop/" (la cartella "stabile" che questo path
    // referenzia) come collegamento simbolico verso la vera cartella
    // versionata (es. "13.768.x.xxxx-.../EA Desktop/"). Quella funzione
    // è uno STUB VUOTO in Wine (ritorna sempre successo senza creare
    // nulla, verificato leggendo il sorgente Wine) — quindi dopo
    // l'installazione questa cartella "stabile" resta vuota/incompleta
    // finché non si copia a mano il contenuto reale da quella versionata
    // (ricorrerà a ogni aggiornamento di EA Desktop, non solo alla prima
    // installazione — comportamento noto e documentato anche altrove per
    // lo stesso identico limite Wine). Vedi ipotesi di automazione
    // discussa con l'utente, non ancora implementata.
    executableRelPathHint: 'Program Files/Electronic Arts/EA Desktop/EA Desktop/EADesktop.exe',
    libraryReader: 'unknown',
    // origin2://game/launch?offerIds={id} segnalato in community
    // (BoilR/Steam launch options), mai verificato per questo progetto —
    // lasciato null finché non testato, non copiato per assunzione.
    directLaunchUriTemplate: null,
    // v2.0.41-dev.12 — richiesta utente: installer fallito con
    // INST-14-1603 ("errore fatale generico"). Causa più ricorrente
    // secondo fonti multiple, incluse le guide di risoluzione ufficiali
    // EA (help.ea.com/en-tr/help/pc/troubleshoot-vc-dll-errors/,
    // citata in un thread di supporto EA per questo stesso codice
    // errore): Visual C++ Redistributable mancanti o corrotti.
    // vcrun2022 (superset, stessa scelta già in uso come default
    // generico del progetto — DEFAULT_WINETRICKS_VERBS in
    // downloadManager.ts) + corefonts (baseline comune per qualunque
    // app con UI, già nello stesso default). Deliberatamente NON copiati
    // dxvk/vkd3d/dotnet48/mono/nine visti in un thread Arch Linux
    // sull'installazione di EA App sotto Wine — quel thread riguardava
    // un codice errore diverso (INST-14-12157) e l'autore non ha mai
    // confermato quale dei tanti verb tentati risolvesse davvero il
    // problema; aggiungerli qui sarebbe stata un'assunzione, non un
    // dato verificato.
    //
    // v2.0.41-dev.13 — questi verb da soli NON bastavano: la causa reale
    // del fallimento INST-14-1603 era altrove (custom action .NET
    // "JunoInitializeSession" dell'installer, non i verb) — risolta
    // dall'argomento EAX_LAUNCH_CLIENT=0 passato all'installer stesso
    // (trovato negli script installer ufficiali Lutris per EA App,
    // 24080 utenti — vedi Launch Arguments impostato a mano dall'utente
    // nell'overlay, non ancora un default automatico qui). I verb
    // restano comunque corretti/utili come base, solo non sufficienti da
    // soli per questo specifico errore.
    requiredWinetricksVerbs: ['vcrun2022', 'corefonts'],
    installerFilenameHints: ['*eaapp*', '*ea-app*', '*ea_app*', '*origin*'],
    // v2.0.41-dev.13 — CONFERMATO dall'utente su hardware reale:
    // bootstrap, installazione (con EAX_LAUNCH_CLIENT=0 nei Launch
    // Arguments), fix manuale della cartella simlink, login e interfaccia
    // EA App tutti funzionanti con runner GE-Proton11-3. Necessario anche
    // l'interruttore "Umu-launcher" attivo in Compatibility Layer per
    // questo gioco/launcher — senza, l'interfaccia resta congelata dopo
    // il login (stesso identico problema già risolto una volta per
    // Ubisoft Connect, container Steam Linux Runtime mancante — vedi
    // MILESTONE v1.5.20-Venus in CHANGELOG.md). Non forzato per codice,
    // stessa scelta già fatta per Ubisoft Connect: resta un interruttore
    // per l'utente, non un default automatico.
    verified: true,
    // v2.0.41-dev.15 — esperienza reale accumulata durante l'intera saga
    // di bootstrap EA App (vedi CHANGELOG-3.md per il dettaglio completo
    // di ogni causa/fix, tutti verificati su hardware reale in questa
    // stessa sessione).
    troubleshootingTips: [
      {
        text: 'Se l\'installazione fallisce con un codice INST-14-160x, aggiungi EAX_LAUNCH_CLIENT=0 nei Launch Arguments dell\'installer prima di riprovare — l\'installer EA usa una custom action .NET che senza questo argomento fallisce quasi sempre sotto Wine.',
        textEn: 'If installation fails with an INST-14-160x code, add EAX_LAUNCH_CLIENT=0 to the installer\'s Launch Arguments before retrying — EA\'s installer uses a .NET custom action that almost always fails under Wine without this argument.',
      },
      {
        text: 'Se l\'app resta bloccata sulla schermata "Connessione a EA App" dopo il login, prova un runner GE-Proton (es. GE-Proton11-3) con l\'interruttore "Umu-launcher" attivo in Compatibility Layer — senza il container Steam Linux Runtime, il controllo di connettività di rete di EA App non riceve mai risposta sotto Wine.',
        textEn: 'If the app stays stuck on the "Connecting to EA App" screen after login, try a GE-Proton runner (e.g. GE-Proton11-3) with the "Umu-launcher" switch enabled in Compatibility Layer — without the Steam Linux Runtime container, EA App\'s network connectivity check never gets a response under Wine.',
      },
      {
        text: 'Se l\'installazione sembra completarsi ma l\'app non parte più, la cartella "EA Desktop/EA Desktop" potrebbe essere vuota (bug noto di Wine: EA la popola con un collegamento simbolico che Wine non crea mai davvero) — X-Launcher prova a correggerla da solo a ogni chiusura, ma se il problema persiste segnalalo.',
        textEn: 'If installation seems to complete but the app no longer starts, the "EA Desktop/EA Desktop" folder may be empty (known Wine bug: EA populates it via a symbolic link that Wine never actually creates) — X-Launcher tries to fix this automatically on every close, but let us know if the problem persists.',
      },
    ],
    // v2.0.41-dev.18 — richiesta utente: quando un gioco EA lancia EA App
    // come propria dipendenza, la finestra di EA App ruba il focus al
    // gioco appena avviato (bisogna alt-tab per tornare al gioco).
    // "-silentOs" NON è indovinato — è l'argomento REALE che Windows usa
    // per avviare EA App silenziosamente al login (verificato nel
    // registro dell'utente: chiave Run, valore "EADM" =
    // "...\EALauncher.exe" -silentOs). Ragionevole (non certificato da
    // documentazione EA ufficiale) che serva a evitare che la finestra
    // rubi il focus a un avvio automatico — esattamente lo scopo di
    // questo campo. Da confermare su hardware reale.
    silentLaunchArgs: ['-silentOs'],
    // v2.0.41-dev.33 — richiesta utente, osservazione diretta: la
    // finestra di EA App si chiama sempre "EA" — da riverificare con
    // wmctrl -lx al primo utilizzo reale, non ancora confermato da noi.
    knownWindowTitle: 'EA',
  },
  {
    id: 'battlenet',
    displayName: 'Battle.net',
    storeId: 'Battle.net',
    installerUrl: '',
    executableRelPathHint: '',
    libraryReader: 'unknown',
    directLaunchUriTemplate: null,
    requiredWinetricksVerbs: [],
    installerFilenameHints: [],
    verified: false,
  },
  {
    id: 'rockstar-launcher',
    displayName: 'Rockstar Games Launcher',
    storeId: 'Rockstar Games Launcher',
    installerUrl: '',
    executableRelPathHint: '',
    libraryReader: 'unknown',
    directLaunchUriTemplate: null,
    requiredWinetricksVerbs: [],
    installerFilenameHints: [],
    verified: false,
  },
];

export function getThirdPartyLauncherDefinition(id: string): ThirdPartyLauncherDefinition | undefined {
  return THIRD_PARTY_LAUNCHERS.find(l => l.id === id);
}

/**
 * v1.5.20-dev.10 — l'altro verso del ponte: dato lo `store` di una riga
 * `games` (o di un DownloadTask), trova la definizione del launcher terzo
 * corrispondente — un solo punto invece di ripetere `store === 'Ubisoft'`
 * in gameManager.ts/downloadManager.ts. Restituisce undefined per
 * qualunque store che non sia un launcher condiviso (Steam, GOG, ecc.) —
 * il chiamante lo usa già così, come "non è uno di questi", non come
 * errore.
 */
export function getThirdPartyLauncherByStoreId(storeId: string): ThirdPartyLauncherDefinition | undefined {
  return THIRD_PARTY_LAUNCHERS.find(l => l.storeId === storeId);
}

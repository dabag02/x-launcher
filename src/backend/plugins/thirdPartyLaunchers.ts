/**
 * thirdPartyLaunchers.ts — Step 19d, Fase 1
 *
 * Registro dichiarativo dei launcher di terze parti richiesti da alcuni
 * giochi (Ubisoft Connect, EA App, Battle.net, Rockstar Games Launcher).
 * Nessuna logica specifica per singolo launcher qui: solo dati. La logica
 * di bootstrap/lancio comune vive in sharedLauncherManager.ts e riusa
 * questi campi indipendentemente da quale launcher è coinvolto — nessun
 * `if (launcher === 'ubisoft')` sparso nel codice.
 *
 * Un solo launcher compilato sul serio per ora: Ubisoft Connect
 * (`verified: false` finché non testato su hardware reale con un
 * bootstrap + almeno un gioco vero). Gli altri tre restano placeholder
 * con `libraryReader: 'unknown'` — un launcher alla volta, verificato con
 * dati reali prima di scrivere qualunque parser, stesso principio già
 * seguito per Amazon/nile (Step 19c).
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
}

export const THIRD_PARTY_LAUNCHERS: ThirdPartyLauncherDefinition[] = [
  {
    id: 'ubisoft-connect',
    displayName: 'Ubisoft Connect',
    storeId: 'Ubisoft',
    installerUrl: 'https://www.ubisoft.com/en-us/ubisoft-connect/download',
    executableRelPathHint: 'Program Files (x86)/Ubisoft/Ubisoft Game Launcher/UbisoftConnect.exe',
    libraryReader: 'unknown',
    directLaunchUriTemplate: 'uplay://launch/{id}/0',
    requiredWinetricksVerbs: [],
    installerFilenameHints: ['*ubisoft*', '*uplay*'],
    verified: false,
  },
  {
    id: 'ea-app',
    displayName: 'EA App',
    storeId: 'EA App',
    // Da compilare quando affrontato — nessun URL/path indovinato ora.
    installerUrl: '',
    executableRelPathHint: '',
    libraryReader: 'unknown',
    // origin2://game/launch?offerIds={id} segnalato in community
    // (BoilR/Steam launch options), mai verificato per questo progetto —
    // lasciato null finché non testato, non copiato per assunzione.
    directLaunchUriTemplate: null,
    requiredWinetricksVerbs: [],
    installerFilenameHints: [],
    verified: false,
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

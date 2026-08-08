import { Game, StoreType } from '../../types';

export abstract class StorePlugin {
  abstract readonly id: StoreType;
  abstract readonly name: string;
  /** Se true, i giochi non richiedono il client attivo per essere avviati */
  abstract readonly drmFree: boolean;
  /** Descrizione breve per il plugin manager UI */
  abstract readonly description: string;
  /** Tool CLI richiesto (es. 'lgogdownloader', 'legendary') — '' se nessuno */
  abstract readonly requiredTool: string;

  readonly isPublic: boolean = false;
  protected authenticated: boolean = false;

  /**
   * Se true, getLibrary() esegue una scansione locale esaustiva e affidabile
   * (es. file system) — un titolo non presente nel risultato significa con
   * certezza che non esiste più, quindi gameManager può rimuoverlo dal DB
   * in sicurezza ad ogni refreshLibrary(). Default false: per gli store
   * online (Steam/Epic/GOG) un risultato vuoto o parziale può derivare da
   * un errore di rete/auth temporaneo, non da una libreria realmente svuotata
   * — in quel caso cancellare sarebbe distruttivo, quindi resta false.
   */
  readonly isExhaustiveLocalScan: boolean = false;

  /** Abilitato/disabilitato dall'utente — persistito su DB */
  enabled: boolean = true;

  async isAuthenticated(): Promise<boolean> {
    return this.isPublic || this.authenticated;
  }

  async login(credentials?: any): Promise<{
    success: boolean;
    message: string;
    authUrl?: string;
    waitForBrowser?: boolean;
  }> {
    this.authenticated = true;
    return { success: true, message: `Connected to ${this.name}` };
  }

  /**
   * Disconnette l'account. Default: non supportato — non tutti gli store
   * hanno un vero concetto di logout (Steam, ad esempio, rileva solo se il
   * client è installato localmente, non un account OAuth). I plugin che
   * supportano un logout reale (Epic, GOG) sovrascrivono questo metodo.
   */
  async logout(): Promise<{ success: boolean; message: string }> {
    return { success: false, message: `${this.name} non supporta la disconnessione da questa interfaccia.` };
  }

  abstract getLibrary(): Promise<Game[]>;
  abstract installGame(gameId: string): Promise<{ success: boolean; progress?: number }>;
  abstract uninstallGame(gameId: string): Promise<{ success: boolean }>;

  /**
   * v1.5.20-dev.10 — richiesta esplicita dell'utente: NON un plugin unico
   * per i launcher terzi, ogni plugin gestisce le proprie particolarità.
   * Questo hook opzionale sposta fuori da gameManager.ts (dove prima era
   * un `if (game.store === 'Ubisoft' && ...)` centrale, hardcoded) la
   * logica "il processo appena chiuso era l'installer del MIO launcher,
   * ricontrolla se è stato bootstrappato" — gameManager.ts resta il
   * coordinatore generico (calcola tempo di gioco, notifiche), delega
   * solo questa parte specifica al plugin giusto via
   * `this.plugins.find(p => p.id === game.store)?.onLauncherProcessClosed?.(game)`.
   * Default: no-op — la maggioranza dei plugin (Steam, GOG, Epic...) non
   * ha alcun concetto di "processo del launcher stesso da rilevare",
   * solo chi rappresenta un launcher condiviso (UbisoftConnectPlugin, e
   * in futuro EA App/Battle.net/Rockstar) lo sovrascrive.
   */
  async onLauncherProcessClosed(_game: Game): Promise<void> {
    // no-op di default
  }

  /**
   * v1.5.20-dev.14 — richiesta utente: alcuni titoli (es. Ubisoft
   * riscattati su Epic, vedi CHANGELOG.md) non hanno MAI file scaricabili
   * tramite questo store — il tool CLI lo scopre solo durante il
   * tentativo di installazione stesso, non prima (nessun modo economico
   * di saperlo in anticipo per l'intera libreria). Questo hook lascia a
   * CIASCUN plugin la propria frase/pattern di riconoscimento nell'output
   * reale del proprio tool (catturato da spawnWithProgress — vedi
   * downloadManager.ts) — nessuna logica specifica di un singolo store
   * sparsa altrove. Default: mai riconosciuto (la maggioranza degli
   * store non ha questo concetto — un download fallito è sempre e solo
   * un errore transitorio da poter ritentare).
   */
  detectUnrecoverableInstallFailure(_recentOutput: string): boolean {
    return false;
  }
}

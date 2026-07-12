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
}

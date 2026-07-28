/**
 * cloudBackup/base.ts — v1.1.120-dev.1
 *
 * Interfaccia condivisa per i provider di backup su cloud (Google Drive
 * per primo, altri in futuro — stesso principio dei plugin store e dei
 * provider AI Advisor già in questo progetto). Un solo provider attivo
 * alla volta (mutua esclusività applicata in
 * db.upsertCloudBackupCredential, non qui).
 *
 * Cosa viene incluso nel backup — deciso con l'utente, NON tutto il DB:
 *   - compat_profiles (verb winetricks, mangohud, fsr, ecc.)
 *   - Knowledge Base dell'AI Advisor
 *   - app.conf
 *   - cartella avatars/ (le immagini vere e proprie, non solo la scelta)
 *   - .env (chiavi scraping IGDB/SteamGridDB/Steam + percorso Roms)
 *
 * Cosa NON viene mai incluso:
 *   - libreria/percorsi installazione/prefix (si ricostruiscono da soli)
 *   - config di legendary/lgogdownloader/nile (l'utente si riautentica)
 *   - tokens.json e credenziali provider AI Advisor (dati sensibili)
 *   - lingua e scelta avatar corrente (preferenze, rifatte in un attimo)
 *
 * Meccanismo: backup/ripristino ESPLICITI, mai sincronizzazione
 * automatica in background — a discrezione dell'utente.
 */

export interface CloudBackupProvider {
  readonly id: string;
  readonly name: string;
  readonly description: string;

  /** true se le credenziali OAuth sono valide e pronte all'uso. */
  isAuthenticated(): Promise<boolean>;

  /**
   * Avvia il login OAuth. A differenza dei plugin store (GOG/Epic/Amazon,
   * che delegano a un tool CLI esterno), qui il backend stesso orchestra
   * il flusso — non esiste un tool CLI equivalente per Google Drive.
   * Ritorna appena il flusso è AVVIATO (browser aperto, server locale in
   * ascolto), non appena è completato: il chiamante fa polling su
   * isAuthenticated() per sapere quando l'utente ha approvato.
   */
  login(): Promise<{ success: boolean; message: string }>;

  logout(): Promise<{ success: boolean; message: string }>;

  /** Carica bundle (già pronto, vedi cloudBackup/bundle.ts) sul cloud. */
  uploadBackup(bundle: Buffer, filename: string): Promise<{ success: boolean; message: string }>;

  /** Scarica l'ultimo backup disponibile, se esiste. */
  downloadLatestBackup(): Promise<{ success: boolean; message: string; data?: Buffer }>;
}

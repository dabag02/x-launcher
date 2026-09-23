/**
 * cloudBackup/base.ts — interfaccia condivisa per i provider di backup
 * su cloud (Google Drive per primo, altri in futuro — stesso principio
 * dei plugin store e dei provider AI Advisor). Un solo provider attivo
 * alla volta (mutua esclusività applicata in
 * db.upsertCloudBackupCredential, non qui).
 *
 * Cosa viene incluso/escluso nel backup: vedi bundle.ts (unica fonte di
 * verità sul contenuto reale).
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

/**
 * share/base.ts — v3.2.29-dev.11 — interfaccia dei servizi di condivisione della sezione Multimedia.
 *
 * Un servizio = un file in share/providers/ che implementa ShareProvider, più una riga in registry.ts.
 * Le rotte (/api/share/*), lo stato dell'accesso e l'interfaccia della Dashboard sono comuni: aggiungere
 * un servizio non tocca né server.ts né il frontend.
 *
 * Accesso: solo col «codice dal telefono» (OAuth 2.0 Device Authorization Grant, RFC 8628; deviceFlow.ts).
 * Sull'HTPC non si digita mai una password: la Dashboard mostra un indirizzo e un codice, l'utente li
 * inserisce sul telefono. I token restano sull'HTPC (db.saveToken → tokens.json 0600, cifrati a riposo).
 *
 * Testi per l'utente: il demone restituisce solo codici (`notes`, `code` degli errori); la Dashboard li
 * traduce (namespace i18n `multimedia`). I log sono in inglese.
 *
 * v3.2.29-dev.13 — upload(): invio del contenuto, con l'avanzamento in byte; i lavori in corso, gli
 * eventi e le notifiche li gestisce registry.ts.
 */
import type { FileHandle } from 'fs/promises';
import type { DeviceCodeGrant } from './deviceFlow';

export type ShareMediaKind = 'video' | 'image';

export interface ShareAccount {
  id: string;
  name: string;
}

/** Esito del completamento dell'accesso (attesa dell'approvazione sul telefono). */
export type LoginOutcome =
  | { kind: 'done'; account: ShareAccount }
  | { kind: 'denied' }
  | { kind: 'expired' }
  | { kind: 'cancelled' }
  | { kind: 'error'; code: string; detail?: string };

export interface ShareProvider {
  readonly id: string;
  readonly name: string;
  /** Tipi di contenuto accettati: il pulsante Condividi compare solo per questi. */
  readonly accepts: ShareMediaKind[];
  /** Lunghezze massime dei campi del post; titleMax assente = il servizio non ha un titolo. */
  readonly titleMax?: number;
  readonly textMax: number;
  /** v3.2.29-dev.13 — limite del servizio in byte UTF-8, se diverso dai caratteri (YouTube: descrizione 5000 byte). */
  readonly textMaxBytes?: number;
  /** Visibilità del contenuto pubblicato, mostrata (bloccata) nella finestra del post. */
  readonly visibility: 'private' | 'public';
  /** Codici delle note da mostrare accanto al servizio (tradotti dalla Dashboard). */
  readonly notes: string[];

  /** Credenziali del client presenti? `missing` = nomi delle variabili del .env mancanti. */
  configured(): { ok: boolean; missing: string[] };

  /**
   * Account collegato, null se non collegato. Con `verify` controlla anche che l'accesso sia ancora
   * valido (rinnovo del token): un accesso revocato o scaduto viene scollegato e restituisce null.
   * Un errore di rete non scollega (l'HTPC può essere offline).
   */
  account(verify: boolean): Promise<ShareAccount | null>;

  /** Primo passo dell'accesso: chiede al servizio il codice da mostrare all'utente. */
  startLogin(): Promise<DeviceCodeGrant>;

  /** Attende l'approvazione sul telefono (si interrompe con `signal`) e salva l'accesso. */
  completeLogin(grant: DeviceCodeGrant, signal: AbortSignal): Promise<LoginOutcome>;

  /** Revoca l'accesso presso il servizio (se raggiungibile) e cancella i token locali. */
  logout(): Promise<void>;

  /**
   * Invia il contenuto. `file` è già aperto (una clip temporanea cancellata nel frattempo dalla cache resta
   * leggibile fino alla fine); `onProgress` riceve i byte confermati dal servizio. Titolo e testo sono già
   * ripuliti e tagliati da registry.ts secondo titleMax/textMax.
   */
  upload(req: ShareUploadRequest, onProgress: (sentBytes: number) => void, signal: AbortSignal): Promise<ShareUploadResult>;
}

export interface ShareUploadRequest {
  file: FileHandle;
  size: number;
  mime: string;
  kind: ShareMediaKind;
  title: string;
  text: string;
}

export type ShareUploadResult =
  | { ok: true; id: string; url: string }
  | { ok: false; code: string; detail?: string };

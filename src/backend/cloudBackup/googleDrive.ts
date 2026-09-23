/**
 * cloudBackup/googleDrive.ts — provider Cloud Backup per Google Drive.
 *
 * Flusso OAuth: redirect loopback (`http://127.0.0.1:<porta>/...`),
 * l'unico dei tre possibili che funziona qui — Device Flow NON supporta
 * gli scope di Drive (errore "invalid_scope"); il flusso "out-of-band"
 * (copia-incolla codice) è dismesso da Google dal 2022. Il loopback è
 * deprecato solo per client Android/iOS/Chrome-app, resta raccomandato
 * per client "Desktop app" (questo caso) — qualunque porta è accettata
 * per specifica RFC 8252, nessuna registrazione anticipata richiesta.
 *
 * Scope: `drive.appdata` — cartella nascosta dedicata all'app, non
 * visibile nel Drive "vero" dell'utente.
 *
 * Client ID/Secret: creati dall'utente sulla Google Cloud Console
 * (OAuth "Desktop app") — mai hardcoded, ogni utente usa le proprie
 * credenziali. Refresh token in tokens.json (permessi 600), non nel DB.
 */

import { CloudBackupProvider } from './base';
import { writeLog } from '../logger';
import * as db from '../db';
import { execSync, spawn } from 'child_process';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { BACKUP_FILENAME } from './bundle';

const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_SCOPE       = 'https://www.googleapis.com/auth/drive.appdata';
const OAUTH_TIMEOUT_MS  = 5 * 60_000; // 5 minuti per completare il consenso nel browser

function binaryExists(bin: string): boolean {
  try { execSync(`which ${bin}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
}

/** Apre l'URL nel browser disponibile — Firefox (già integrato nella
 *  dashboard) se presente, altrimenti xdg-open come fallback generico. */
function openInBrowser(url: string): void {
  if (binaryExists('firefox')) {
    spawn('firefox', [url], { detached: true, stdio: 'ignore' }).unref();
  } else if (binaryExists('xdg-open')) {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    writeLog('warning', '[CloudBackup/GoogleDrive] Nessun browser trovato (firefox/xdg-open) — apri manualmente: ' + url);
  }
}

interface StoredTokenSet {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: number; // epoch ms
}

function loadTokenSet(): StoredTokenSet | undefined {
  const raw = db.loadToken('google-drive');
  if (!raw) return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

function saveTokenSet(tokens: StoredTokenSet): void {
  db.saveToken('google-drive', JSON.stringify(tokens));
}

export class GoogleDriveProvider implements CloudBackupProvider {
  readonly id = 'google-drive';
  readonly name = 'Google Drive';
  readonly description = 'Backup su Google Drive (cartella dati dedicata all\'app, non visibile nel tuo Drive)';

  async isAuthenticated(): Promise<boolean> {
    const tokens = loadTokenSet();
    return !!tokens?.refreshToken;
  }

  /**
   * Scambia il refresh token per un access token valido — chiamato prima
   * di ogni operazione reale su Drive (upload/download), non memorizzato
   * a lungo termine: gli access token Google scadono dopo ~1h, più
   * semplice richiederne uno fresco ogni volta che serve piuttosto che
   * tracciare la scadenza con precisione.
   */
  private async getAccessToken(): Promise<string | null> {
    const cred = db.getCloudBackupCredential(this.id);
    const tokens = loadTokenSet();
    if (!cred?.clientId || !cred?.clientSecret || !tokens?.refreshToken) return null;

    try {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     cred.clientId,
          client_secret: cred.clientSecret,
          refresh_token: tokens.refreshToken,
          grant_type:    'refresh_token',
        }),
      });
      if (!res.ok) {
        writeLog('warning', `[CloudBackup/GoogleDrive] Refresh token fallito (${res.status}): ${await res.text()}`);
        return null;
      }
      const data = await res.json();
      return data.access_token ?? null;
    } catch (err) {
      writeLog('error', `[CloudBackup/GoogleDrive] Errore refresh access token: ${err}`);
      return null;
    }
  }

  /**
   * Avvia il flusso OAuth loopback. Ritorna appena il browser è aperto e
   * il server locale è in ascolto — NON aspetta il completamento (il
   * chiamante fa polling su isAuthenticated()). Lo scambio codice→token
   * avviene in background quando il redirect arriva.
   */
  async login(): Promise<{ success: boolean; message: string }> {
    const cred = db.getCloudBackupCredential(this.id);
    if (!cred?.clientId || !cred?.clientSecret) {
      return {
        success: false,
        message: 'Configura prima Client ID e Client Secret (creati su Google Cloud Console, tipo client "Desktop app").',
      };
    }

    const server = http.createServer();
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        writeLog('warning', '[CloudBackup/GoogleDrive] Login OAuth scaduto (5 minuti) — nessun consenso ricevuto.');
        server.close();
      }
    }, OAUTH_TIMEOUT_MS);

    server.on('request', async (req, res) => {
      if (settled) { res.end(); return; }
      const url = new URL(req.url ?? '', 'http://127.0.0.1');
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error || !code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body><h2>Accesso non concesso.</h2><p>Puoi chiudere questa scheda e riprovare dalla Dashboard.</p></body></html>');
        writeLog('warning', `[CloudBackup/GoogleDrive] Consenso negato o mancante: ${error ?? 'nessun code nel redirect'}`);
        settled = true;
        clearTimeout(timer);
        server.close();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h2>Fatto!</h2><p>Puoi chiudere questa scheda e tornare alla Dashboard.</p></body></html>');

      // v1.1.120-dev.1 — scambio codice→token. redirect_uri qui DEVE
      // combaciare esattamente con quello usato nella richiesta di
      // autorizzazione sotto (stessa porta, stesso path) — requisito
      // OAuth standard, non specifico di Google.
      // server.address() è tipizzato string | AddressInfo | null (il caso
      // string si applica solo ai socket Unix, mai qui: listen(0, '127.0.0.1', ...)
      // restituisce sempre un AddressInfo).
      const address = server.address() as AddressInfo | null;
      const port = address?.port;
      try {
        const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id:     cred.clientId!,
            client_secret: cred.clientSecret!,
            code,
            grant_type:    'authorization_code',
            redirect_uri:  `http://127.0.0.1:${port}/callback`,
          }),
        });
        if (!tokenRes.ok) {
          writeLog('error', `[CloudBackup/GoogleDrive] Scambio codice→token fallito (${tokenRes.status}): ${await tokenRes.text()}`);
        } else {
          const data = await tokenRes.json();
          if (data.refresh_token) {
            saveTokenSet({ refreshToken: data.refresh_token });
            writeLog('info', '[CloudBackup/GoogleDrive] Login completato, refresh token salvato.');
          } else {
            // v1.1.120-dev.1 — Google non ritorna un nuovo refresh_token
            // se l'utente ha già autorizzato quest'app in passato, a meno
            // di richiedere esplicitamente prompt=consent (già fatto
            // sotto) — se manca comunque, logghiamo per capire perché
            // invece di fallire in silenzio.
            writeLog('warning', '[CloudBackup/GoogleDrive] Risposta token senza refresh_token — vedi output grezzo per capire perché.');
            writeLog('info', `[CloudBackup/GoogleDrive] Risposta token grezza: ${JSON.stringify(data).slice(0, 1000)}`);
          }
        }
      } catch (err) {
        writeLog('error', `[CloudBackup/GoogleDrive] Errore scambio codice→token: ${err}`);
      }

      settled = true;
      clearTimeout(timer);
      server.close();
    });

    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as AddressInfo | null)?.port;
        const authUrl = `${GOOGLE_AUTH_URL}?` + new URLSearchParams({
          client_id:     cred.clientId!,
          redirect_uri:  `http://127.0.0.1:${port}/callback`,
          response_type: 'code',
          scope:         DRIVE_SCOPE,
          access_type:   'offline',
          prompt:        'consent', // forza un nuovo refresh_token anche se già autorizzato in passato
        }).toString();

        writeLog('info', `[CloudBackup/GoogleDrive] Server OAuth locale in ascolto su porta ${port}, apertura browser...`);
        openInBrowser(authUrl);

        resolve({
          success: true,
          message: 'Completa l\'accesso nel browser appena aperto. Questa card si aggiornerà da sola al termine.',
        });
      });
    });
  }

  async logout(): Promise<{ success: boolean; message: string }> {
    try {
      db.saveToken('google-drive', JSON.stringify({}));
      return { success: true, message: 'Disconnesso da Google Drive.' };
    } catch (err) {
      return { success: false, message: `Errore durante la disconnessione: ${err}` };
    }
  }

  /**
   * Cerca un file già esistente con questo nome dentro appDataFolder —
   * un solo file di backup mantenuto e aggiornato (PATCH), non un nuovo
   * file ad ogni backup: niente accumulo da gestire/ripulire.
   */
  private async findExistingFileId(accessToken: string, filename: string): Promise<string | null> {
    const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
      spaces: 'appDataFolder',
      q:      `name = '${filename}' and trashed = false`,
      fields: 'files(id,name)',
    });
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      writeLog('warning', `[CloudBackup/GoogleDrive] Ricerca file esistente fallita (${res.status}): ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    return data.files?.[0]?.id ?? null;
  }

  /**
   * Upload multipart/related — metadata JSON + contenuto binario in un
   * unico corpo, separati da un boundary. Stesso principio già usato nel
   * resto del progetto per le chiamate HTTP dirette (niente SDK Google).
   * Crea il file se non esiste (POST), altrimenti lo aggiorna sul posto
   * (PATCH) invece di duplicarlo.
   */
  async uploadBackup(bundle: Buffer, filename: string): Promise<{ success: boolean; message: string }> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return { success: false, message: 'Non autenticato — connetti prima Google Drive.' };

    try {
      const existingId = await this.findExistingFileId(accessToken, filename);
      const boundary = `xlauncher-${Date.now()}`;
      const metadata = existingId ? {} : { name: filename, parents: ['appDataFolder'] };

      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\n` +
          `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
          `${JSON.stringify(metadata)}\r\n` +
          `--${boundary}\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`
        ),
        bundle,
        Buffer.from(`\r\n--${boundary}--`),
      ]);

      const uploadUrl = existingId
        ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

      const res = await fetch(uploadUrl, {
        method: existingId ? 'PATCH' : 'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      if (!res.ok) {
        const errText = await res.text();
        writeLog('error', `[CloudBackup/GoogleDrive] Upload fallito (${res.status}): ${errText}`);
        return { success: false, message: `Upload fallito (${res.status}): ${errText.slice(0, 300)}` };
      }

      db.upsertCloudBackupCredential({
        ...(db.getCloudBackupCredential(this.id) ?? { providerId: this.id, enabled: true }),
        lastBackupAt: new Date().toISOString(),
      });
      writeLog('info', `[CloudBackup/GoogleDrive] Backup caricato (${(bundle.length / 1024).toFixed(0)} KB, ${existingId ? 'aggiornato' : 'nuovo file'}).`);
      return { success: true, message: 'Backup caricato su Google Drive.' };
    } catch (err) {
      writeLog('error', `[CloudBackup/GoogleDrive] Errore upload: ${err}`);
      return { success: false, message: `Errore upload: ${err}` };
    }
  }

  async downloadLatestBackup(): Promise<{ success: boolean; message: string; data?: Buffer }> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) return { success: false, message: 'Non autenticato — connetti prima Google Drive.' };

    try {
      const fileId = await this.findExistingFileId(accessToken, BACKUP_FILENAME);
      if (!fileId) {
        return { success: false, message: 'Nessun backup trovato su Google Drive.' };
      }
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const errText = await res.text();
        writeLog('error', `[CloudBackup/GoogleDrive] Download fallito (${res.status}): ${errText}`);
        return { success: false, message: `Download fallito (${res.status}): ${errText.slice(0, 300)}` };
      }
      const data = Buffer.from(await res.arrayBuffer());
      writeLog('info', `[CloudBackup/GoogleDrive] Backup scaricato (${(data.length / 1024).toFixed(0)} KB).`);
      return { success: true, message: 'Backup scaricato.', data };
    } catch (err) {
      writeLog('error', `[CloudBackup/GoogleDrive] Errore download: ${err}`);
      return { success: false, message: `Errore download: ${err}` };
    }
  }
}

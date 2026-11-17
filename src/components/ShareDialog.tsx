// v3.2.29-dev.12 — condivisione dalla sezione Multimedia (CHANGELOG-19, step 2d.3).
//
// Finestra sopra il visore di MediaLibrary, group "share-dialog", in tre passi:
//   scelta     un servizio alla volta (src/backend/share/registry.ts): stato del collegamento, note del
//              servizio, «Scollega» accanto a un servizio collegato (con «Conferma con A»)
//   accesso    codice dal telefono: QR dell'indirizzo, codice grande, scadenza, attesa dell'approvazione
//              (polling di GET /api/share/:id/login ogni 2 s più l'evento SSE share-updated)
//   post       miniatura del contenuto, titolo (se il servizio lo prevede) e testo, visibilità bloccata,
//              Annulla / Condividi. I campi si modificano con la VirtualKeyboard della Dashboard
//              (openKeyboardForField di App.tsx, la stessa dei campi di Game Options e Impostazioni):
//              A su un campo la apre; con la tastiera fisica basta iniziare a scrivere.
// v3.2.29-dev.13 — invio (step 2d.4): Condividi → POST /api/share/:id/upload; passo «caricamento» con barra,
//   MB, tempo stimato (evento SSE share-progress + polling ogni 2 s), «Annulla caricamento» (con «Conferma con
//   A») e «In background» (chiude la finestra, l'invio continua e l'esito arriva come notifica); esito con il
//   QR del link al video. QrModal (in fondo) mostra lo stesso QR dall'azione «Mostra QR del link» delle notifiche.
// v3.2.29-dev.14 — interruttore «Filigrana» nel post (solo video; ultima scelta ricordata nel browser):
//   il demone prepara una copia con «Condiviso con X-Launcher» in basso a destra prima dell'invio (passo
//   «preparazione» con la sua barra). Avviso «Già condiviso su <servizio> il <data>» nella scelta e nel post.
// B torna indietro di un passo (back() via ref), dalla scelta chiude la finestra.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import QRCode from 'qrcode';
import { Share2, Loader2, Lock, Play, LogOut, AlertTriangle, Plus, Check } from 'lucide-react';
import { Focusable, useFocus } from './FocusProvider';
import { useAudio } from './AudioProvider';
import { cn } from '../lib/utils';

export type ShareSource =
  | { scope: 'tmp'; file: string }
  | { scope: 'saved'; folder: string; sub: 'Screenshot' | 'Clip'; name: string };

export interface ShareItem {
  kind: 'image' | 'video';
  thumb: string;
  label: string;        // titolo del gioco
  sub: string;          // durata/risoluzione/data come nel visore
  date: number;         // ms, per il titolo proposto
  duration?: number;    // s
  shared?: { provider: string; providerName: string; url?: string; at: number }[];   // condivisioni precedenti
  source: ShareSource;
}

export interface ShareProviderInfo {
  id: string; name: string; accepts: string[]; titleMax?: number; textMax: number; textMaxBytes?: number;
  visibility: 'private' | 'public'; notes: string[];
  configured: boolean; missing: string[];
  connected: boolean; account: { id: string; name: string } | null;
}

type LoginState =
  | { state: 'pending'; userCode: string; verificationUrl: string; verificationUrlComplete?: string; expiresAt: number }
  | { state: 'done'; account: { id: string; name: string } }
  | { state: 'denied' | 'expired' | 'cancelled' }
  | { state: 'error'; code: string };

type Step =
  | { step: 'pick' }
  | { step: 'login'; provider: ShareProviderInfo; login: LoginState | null; startError?: string }
  | { step: 'compose'; provider: ShareProviderInfo }
  | { step: 'progress'; provider: ShareProviderInfo; job: ShareJob }
  | { step: 'result'; provider: ShareProviderInfo; ok: boolean; code?: string; url?: string };

export interface ShareJob {
  id: string; provider: string; providerName: string; title: string;
  state: 'uploading' | 'done' | 'error' | 'cancelled'; sent: number; size: number;
  startedAt: number; finishedAt?: number; url?: string; code?: string;
  phase?: 'preparing' | 'uploading'; prepared?: number; watermark?: boolean; uploadStartedAt?: number;
}

const WATERMARK_KEY = 'xl-share-watermark';
function readWatermarkPref(): boolean {
  try { return localStorage.getItem(WATERMARK_KEY) !== '0'; } catch { return true; }   // predefinito: attiva
}

function fmtMB(b: number): string { return (b / 1048576).toFixed(b >= 100 * 1048576 ? 0 : 1); }

/** QR in SVG (bianco e nero, margine minimo) — anche per QrModal. */
function useQr(text: string | null | undefined): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    if (!text) { setSvg(null); return; }
    let alive = true;
    QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then(v => { if (alive) setSvg(v); }).catch(() => { if (alive) setSvg(null); });
    return () => { alive = false; };
  }, [text]);
  return svg;
}
function QrBox({ svg, size = 240 }: { svg: string | null; size?: number }) {
  return (
    <div className="rounded-2xl bg-white p-3 shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
      {svg ? <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
        : <Loader2 size={28} className="animate-spin text-black/40" />}
    </div>
  );
}

export interface ShareDialogHandle {
  /** B: torna indietro di un passo; false se la finestra va chiusa. */
  back: () => boolean;
}

type OpenKeyboard = (id: string, label: string, value: string, onCommit: (val: string) => void, returnGroup?: string,
  opts?: { rows?: number; maxLength?: number }) => void;

const GROUP = 'share-dialog';

function fmtClock(s: number): string {
  const v = Math.max(0, Math.floor(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

// Glifo di un tasto del controller: lettera centrata nel cerchio (flex + leading-none, senza
// spostamenti dovuti all'interlinea del font) — come Hint del footer di App.tsx.
function PadGlyph({ k }: { k: 'A' | 'B' | 'X' | 'Y' }) {
  const color = k === 'A' ? 'bg-xl-success-500' : k === 'B' ? 'bg-xl-danger-500' : k === 'X' ? 'bg-xl-primary-500' : 'bg-xl-warning-500';
  return (
    <span className={cn('w-7 h-7 rounded-full text-black inline-flex items-center justify-center text-xs font-black leading-none shrink-0', color)}>
      {k}
    </span>
  );
}
function PadHint({ k, label }: { k: 'A' | 'B' | 'X' | 'Y'; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <PadGlyph k={k} />
      <span className="text-[10px] font-black uppercase tracking-[0.2em] italic text-xl-fg-50">{label}</span>
    </span>
  );
}

export const ShareDialog = forwardRef<ShareDialogHandle, {
  item: ShareItem;
  onClose: () => void;
  openKeyboard: OpenKeyboard;
}>(function ShareDialog({ item, onClose, openKeyboard }, ref) {
  const { t, i18n } = useTranslation('multimedia');
  const { setFocusedId, setActiveGroup, focusedId, activeGroup } = useFocus();
  const { play } = useAudio();
  const [providers, setProviders] = useState<ShareProviderInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ step: 'pick' });
  const [armedLogout, setArmedLogout] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [armedCancel, setArmedCancel] = useState(false);
  const [watermark, setWatermark] = useState<boolean>(readWatermarkPref);
  const toggleWatermark = () => {
    setWatermark(v => {
      try { localStorage.setItem(WATERMARK_KEY, v ? '0' : '1'); } catch { /* resta per questa sessione */ }
      return !v;
    });
    play('select');
  };
  /** Ultima condivisione di questo contenuto sul servizio, se c'è. */
  const sharedOn = (providerId: string) => {
    const list = (item.shared ?? []).filter(r => r.provider === providerId);
    return list.length ? Math.max(...list.map(r => r.at)) : null;
  };
  const fmtWhen = (ms: number) => {
    try { return new Date(ms).toLocaleString(i18n.language === 'en' ? 'en-GB' : 'it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };
  const [now, setNow] = useState(Date.now());

  const usable = (p: ShareProviderInfo) => p.accepts.includes(item.kind);

  const loadProviders = useCallback(async (verify: boolean) => {
    try {
      const r = await fetch(`/api/share/providers${verify ? '?verify=1' : ''}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.code || 'error');
      const list = (j.providers as ShareProviderInfo[]).filter(usable);
      setProviders(list);
      setLoadError(null);
      return list;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setProviders([]);
      return [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.kind]);

  // apertura: elenco con il controllo dell'accesso (un accesso scaduto risulta scollegato)
  useEffect(() => {
    setActiveGroup(GROUP);
    loadProviders(true).then(list => {
      const first = list.find(p => p.connected) ?? list.find(p => p.configured) ?? list[0];
      setTimeout(() => setFocusedId(first ? `share-p-${first.id}` : 'share-cancel'), 60);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // la conferma di «Scollega» si annulla spostandosi
  useEffect(() => {
    if (armedLogout && focusedId !== `share-p-${armedLogout}-logout`) setArmedLogout(null);
  }, [focusedId, armedLogout]);

  const focusLater = (id: string) => setTimeout(() => setFocusedId(id), 60);

  // ---- titolo proposto: «<gioco> · <data>»
  const defaultTitle = useCallback((p: ShareProviderInfo) => {
    if (!p.titleMax) return '';
    let d = '';
    try { d = new Date(item.date).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'it-IT'); } catch { /* data non valida */ }
    return `${item.label}${d ? ` · ${d}` : ''}`.slice(0, p.titleMax);
  }, [item, i18n.language]);

  const goCompose = (p: ShareProviderInfo) => {
    setTitle(prev => prev || defaultTitle(p));
    setStep({ step: 'compose', provider: p });
    focusLater('share-f-text');
  };

  // ---- accesso
  const startLogin = async (p: ShareProviderInfo) => {
    setStep({ step: 'login', provider: p, login: null });
    focusLater('share-l-cancel');
    try {
      const r = await fetch(`/api/share/${p.id}/login`, { method: 'POST' });
      const j = await r.json();
      if (!j.success) { setStep({ step: 'login', provider: p, login: null, startError: j.code || 'error' }); focusLater('share-l-retry'); return; }
      setStep({ step: 'login', provider: p, login: j.login });
    } catch {
      setStep({ step: 'login', provider: p, login: null, startError: 'network' });
      focusLater('share-l-retry');
    }
  };
  const cancelLogin = async (p: ShareProviderInfo) => {
    try { await fetch(`/api/share/${p.id}/login`, { method: 'DELETE' }); } catch { /* il demone la chiude comunque alla scadenza */ }
  };

  const loginProvider = step.step === 'login' ? step.provider : null;
  const pending = step.step === 'login' && step.login?.state === 'pending' ? step.login : null;

  // QR dell'indirizzo di verifica (con il codice già inserito, se il servizio lo fornisce)
  const qr = useQr(pending ? (pending.verificationUrlComplete || pending.verificationUrl) : null);
  // QR del link al video condiviso
  const resultQr = useQr(step.step === 'result' && step.ok ? step.url : null);

  // attesa dell'approvazione: polling ogni 2 s + evento SSE, orologio della scadenza
  useEffect(() => {
    if (!loginProvider || !pending) return;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(`/api/share/${loginProvider.id}/login`);
        const j = await r.json();
        const l: LoginState | null = j.login;
        if (!alive || !l || l.state === 'pending') return;
        if (l.state === 'done') {
          play('select');
          const list = await loadProviders(false);
          const p = list.find(x => x.id === loginProvider.id) ?? { ...loginProvider, connected: true, account: l.account };
          if (alive) goCompose(p);
        } else {
          play('back');
          setStep({ step: 'login', provider: loginProvider, login: l });
          focusLater('share-l-retry');
        }
      } catch { /* demone momentaneamente irraggiungibile: si riprova al giro dopo */ }
    };
    const iv = window.setInterval(check, 2000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    const onSse = () => { check(); };
    window.addEventListener('xl-share-updated', onSse);
    return () => { alive = false; window.clearInterval(iv); window.clearInterval(clock); window.removeEventListener('xl-share-updated', onSse); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginProvider?.id, pending?.userCode]);

  // ---- scelta
  const choose = (p: ShareProviderInfo) => {
    if (!p.configured) { play('back'); return; }
    play('select');
    if (p.connected) goCompose(p);
    else startLogin(p);
  };
  const logout = async (p: ShareProviderInfo) => {
    setArmedLogout(null);
    try { await fetch(`/api/share/${p.id}/logout`, { method: 'POST' }); } catch { /* l'elenco ricaricato mostra lo stato vero */ }
    play('back');
    await loadProviders(false);
    focusLater(`share-p-${p.id}`);
  };

  // ---- post
  const editField = (which: 'title' | 'text', p: ShareProviderInfo, initial?: string) => {
    const max = which === 'title' ? (p.titleMax ?? 100) : p.textMax;
    openKeyboard(
      which === 'title' ? 'share-f-title' : 'share-f-text',
      which === 'title' ? t('shareFieldTitle') : t('shareFieldText'),
      initial ?? (which === 'title' ? title : text),
      (val) => {
        // YouTube rifiuta < e > nel titolo; il limite di lunghezza vale per ogni servizio
        const clean = Array.from(which === 'title' ? val.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim() : val).slice(0, max).join('');
        if (which === 'title') setTitle(clean); else setText(clean);
      },
      GROUP,
      // v3.2.29-dev.13 — riquadro del testo del post a 5 righe (barra di scorrimento oltre), limite applicato mentre si scrive
      which === 'text' ? { rows: 5, maxLength: max } : { maxLength: max },
    );
  };

  // tastiera fisica: con un campo selezionato e la VirtualKeyboard chiusa, il primo tasto la apre
  // con quel carattere già scritto (poi la VirtualKeyboard riceve da sola i tasti successivi)
  useEffect(() => {
    if (step.step !== 'compose') return;
    const p = step.provider;
    const onKey = (e: KeyboardEvent) => {
      if (activeGroup !== GROUP || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
      if (focusedId !== 'share-f-title' && focusedId !== 'share-f-text') return;
      e.preventDefault();
      e.stopPropagation();
      const which = focusedId === 'share-f-title' ? 'title' : 'text';
      editField(which, p, (which === 'title' ? title : text) + e.key);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, focusedId, activeGroup, title, text]);

  const submit = async (p: ShareProviderInfo) => {
    if (busy) return;
    setBusy(true);
    play('select');
    try {
      const r = await fetch(`/api/share/${p.id}/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: item.source, title: p.titleMax ? title : undefined, text, watermark: item.kind === 'video' && watermark }),
      });
      let j: any = null;
      try { j = await r.json(); } catch { /* risposta non JSON */ }
      if (j?.success && j.job) {
        setArmedCancel(false);
        setStep({ step: 'progress', provider: p, job: j.job });
        focusLater('share-u-bg');
      } else {
        setStep({ step: 'result', provider: p, ok: false, code: j?.code || `http-${r.status}` });
        focusLater('share-r-close');
      }
    } catch {
      setStep({ step: 'result', provider: p, ok: false, code: 'network' });
      focusLater('share-r-close');
    } finally {
      setBusy(false);
    }
  };

  // ---- caricamento: evento SSE share-progress (inoltrato da App.tsx) + polling di riserva ogni 2 s
  const progressJobId = step.step === 'progress' ? step.job.id : null;
  const applyJob = useCallback((job: ShareJob) => {
    setStep(prev => {
      if (prev.step !== 'progress' || prev.job.id !== job.id) return prev;
      if (job.state === 'uploading') return { ...prev, job };
      if (job.state === 'done') { play('select'); focusLater('share-r-close'); return { step: 'result', provider: prev.provider, ok: true, url: job.url }; }
      if (job.state === 'cancelled') { focusLater('share-c-submit'); return { step: 'compose', provider: prev.provider }; }
      play('back'); focusLater('share-r-close');
      return { step: 'result', provider: prev.provider, ok: false, code: job.code || 'error' };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);
  useEffect(() => {
    if (!progressJobId) return;
    const onEv = (e: Event) => { const job = (e as CustomEvent).detail as ShareJob | undefined; if (job?.id === progressJobId) applyJob(job); };
    window.addEventListener('xl-share-progress', onEv);
    const iv = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/share/jobs/${progressJobId}`);
        const j = await r.json();
        if (j.success && j.job) applyJob(j.job);
      } catch { /* si riprova al giro dopo */ }
    }, 2000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.removeEventListener('xl-share-progress', onEv); window.clearInterval(iv); window.clearInterval(clock); };
  }, [progressJobId, applyJob]);
  useEffect(() => { if (armedCancel && focusedId !== 'share-u-cancel') setArmedCancel(false); }, [focusedId, armedCancel]);
  const cancelUpload = async (id: string) => {
    setArmedCancel(false);
    try { await fetch(`/api/share/jobs/${id}`, { method: 'DELETE' }); } catch { /* lo stato arriva comunque dal polling */ }
    play('back');
  };

  useImperativeHandle(ref, () => ({
    back: () => {
      if (armedLogout) { setArmedLogout(null); return true; }
      if (armedCancel) { setArmedCancel(false); return true; }
      if (step.step === 'progress') return false;      // B = «In background»: la finestra si chiude, l'invio continua
      if (step.step === 'login') {
        if (pending) cancelLogin(step.provider);
        setStep({ step: 'pick' });
        loadProviders(false);
        focusLater(`share-p-${step.provider.id}`);
        return true;
      }
      if (step.step === 'compose') {
        setStep({ step: 'pick' });
        focusLater(`share-p-${step.provider.id}`);
        return true;
      }
      if (step.step === 'result' && !step.ok) {
        setStep({ step: 'compose', provider: step.provider });
        focusLater('share-c-submit');
        return true;
      }
      return false;
    },
  }));

  // chiusura con un accesso in attesa: lo annulla anche nel demone
  const pendingRef = useRef<{ id: string } | null>(null);
  pendingRef.current = pending && loginProvider ? { id: loginProvider.id } : null;
  useEffect(() => () => {
    if (pendingRef.current) fetch(`/api/share/${pendingRef.current.id}/login`, { method: 'DELETE' }).catch(() => {});
  }, []);

  // ---- stili (come i pulsanti di MediaLibrary)
  const btn = (focused: boolean, primary = false, danger = false) => cn(
    'flex items-center justify-center gap-2 h-11 px-5 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap',
    focused
      ? (danger ? 'bg-xl-danger-600 border-xl-danger-600 text-xl-on-accent scale-105' : 'bg-xl-primary-600 border-xl-primary-600 text-xl-on-accent scale-105')
      : primary ? 'border-xl-primary-500 text-xl-primary-400 bg-xl-primary-500/10' : 'border-xl-control-border text-xl-fg-50-alt',
  );
  const errText = (code: string) => t(`shareErr.${code}`, { defaultValue: t('shareErr.generic', { code }) });

  const panel = 'w-[980px] max-w-[92%] rounded-3xl border bg-xl-modal border-xl-border shadow-2xl p-10 flex flex-col gap-7';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-[95] flex justify-center bg-xl-scrim"
      style={{ alignItems: step.step === 'compose' ? 'flex-start' : 'center', paddingTop: step.step === 'compose' ? 40 : 0 }}>

      {/* ---------------- scelta del servizio ---------------- */}
      {step.step === 'pick' && (
        <div className={panel}>
          <div>
            <div className="text-2xl font-black italic uppercase tracking-tighter">{t('shareTitle')}</div>
            <div className="text-[11px] font-mono text-xl-fg-40 mt-1">{item.label} · {item.sub}</div>
          </div>
          <div className="flex flex-col gap-3">
            {providers === null && <div className="flex items-center gap-3 text-sm text-xl-fg-50"><Loader2 size={16} className="animate-spin" />{t('shareLoading')}</div>}
            {providers && !providers.length && (
              <div className="text-sm text-xl-fg-50">{loadError ? errText(loadError) : t('shareNoProviders')}</div>
            )}
            {providers?.map((p, i) => {
              const up = i > 0 ? `share-p-${providers[i - 1].id}` : undefined;
              const down = i < providers.length - 1 ? `share-p-${providers[i + 1].id}` : 'share-cancel';
              return (
                <div key={p.id} className="flex items-stretch gap-3">
                  <Focusable group={GROUP} id={`share-p-${p.id}`} className="flex-1"
                    neighbors={{ up, down, ...(p.connected ? { right: `share-p-${p.id}-logout` } : {}) }}
                    onEnter={() => choose(p)}>
                    {(f) => (
                      <div className={cn('flex items-center gap-5 rounded-2xl border-2 px-6 py-5 transition-all',
                        f ? 'border-xl-primary-500 bg-xl-primary-500/10' : 'border-xl-border bg-xl-card',
                        !p.configured && 'opacity-60')}>
                        <div className="w-12 h-12 rounded-xl bg-xl-fill-10 flex items-center justify-center shrink-0"><Play size={22} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="text-lg font-black">{p.name}</div>
                          <div className={cn('text-xs font-mono mt-1', p.connected ? 'text-xl-success-400' : 'text-xl-fg-50')}>
                            {!p.configured ? t('shareNotConfigured', { vars: p.missing.join(', ') })
                              : p.connected ? t('shareConnected', { name: p.account?.name ?? '' })
                              : t('shareNotConnected')}
                          </div>
                          {sharedOn(p.id) !== null && (
                            <div className="text-[11px] mt-2 text-xl-success-400 flex items-start gap-2">
                              <Check size={12} className="mt-0.5 shrink-0" />{t('alreadyShared', { name: p.name, date: fmtWhen(sharedOn(p.id)!) })}
                            </div>
                          )}
                          {p.notes.map(n => (
                            <div key={n} className="text-[11px] mt-2 text-xl-warning-400 flex items-start gap-2">
                              <AlertTriangle size={12} className="mt-0.5 shrink-0" />{t(`shareNotes.${n}`, { defaultValue: n })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Focusable>
                  {p.connected && (
                    <Focusable group={GROUP} id={`share-p-${p.id}-logout`} className="flex shrink-0" neighbors={{ left: `share-p-${p.id}`, up, down }}
                      onEnter={() => { if (armedLogout === p.id) logout(p); else { setArmedLogout(p.id); play('select'); } }}>
                      {(f) => (
                        <button className={cn(btn(f, false, true), '!h-auto self-stretch', armedLogout === p.id && 'bg-xl-danger-600 border-xl-danger-600 text-xl-on-accent')}>
                          <LogOut size={14} />{armedLogout === p.id ? t('confirmA') : t('shareLogout')}
                        </button>
                      )}
                    </Focusable>
                  )}
                </div>
              );
            })}
            <div className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-xl-border px-6 py-4 text-xl-fg-40">
              <Plus size={18} />
              <span className="text-xs">{t('shareMore')}</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6"><PadHint k="A" label={t('hintChoose')} /><PadHint k="B" label={t('hintCancel')} /></div>
            <Focusable group={GROUP} id="share-cancel" fallbackPriority={-1}
              neighbors={providers?.length ? { up: `share-p-${providers[providers.length - 1].id}` } : undefined}
              onEnter={() => { play('back'); onClose(); }}>
              {(f) => <button className={btn(f)}>{t('shareCancel')}</button>}
            </Focusable>
          </div>
        </div>
      )}

      {/* ---------------- accesso col codice dal telefono ---------------- */}
      {step.step === 'login' && (
        <div className={panel}>
          <div>
            <div className="text-2xl font-black italic uppercase tracking-tighter">{t('loginTitle', { name: step.provider.name })}</div>
            <div className="text-[11px] font-mono text-xl-fg-40 mt-1">{t('loginSub')}</div>
          </div>

          {pending ? (
            <div className="flex items-center gap-10">
              <QrBox svg={qr} />
              <div className="flex flex-col gap-6 flex-1 min-w-0">
                <div className="flex gap-4 items-start">
                  <span className="w-8 h-8 rounded-full bg-xl-fill-10 inline-flex items-center justify-center font-black leading-none shrink-0">1</span>
                  <span className="text-lg leading-snug">
                    {t('loginStep1a')} <strong className="font-mono text-xl-primary-400">{pending.verificationUrl.replace(/^https?:\/\/(www\.)?/, '')}</strong> {t('loginStep1b')}
                  </span>
                </div>
                <div className="flex gap-4 items-start">
                  <span className="w-8 h-8 rounded-full bg-xl-fill-10 inline-flex items-center justify-center font-black leading-none shrink-0">2</span>
                  <span className="flex flex-col gap-3">
                    <span className="text-lg">{t('loginStep2')}</span>
                    <span className="font-mono text-5xl font-bold tracking-[0.15em] px-6 py-3 rounded-2xl bg-xl-field border border-xl-field-border self-start">{pending.userCode}</span>
                    <span className="text-[11px] font-mono text-xl-fg-40">{t('loginExpires', { time: fmtClock((pending.expiresAt - now) / 1000) })}</span>
                  </span>
                </div>
                <div className="flex gap-4 items-start">
                  <span className="w-8 h-8 rounded-full bg-xl-fill-10 inline-flex items-center justify-center font-black leading-none shrink-0">3</span>
                  <span className="text-lg leading-snug">{t(`loginStep3.${step.provider.id}`, { defaultValue: t('loginStep3.default') })}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="min-h-[120px] flex items-center gap-4 text-lg">
              {!step.login && !step.startError && <><Loader2 size={20} className="animate-spin text-xl-primary-400" />{t('loginStarting')}</>}
              {(step.startError || (step.login && step.login.state !== 'done')) && (
                <><AlertTriangle size={22} className="text-xl-danger-400 shrink-0" />
                  <span>{step.startError ? errText(step.startError)
                    : step.login?.state === 'error' ? errText(step.login.code)
                    : step.login?.state === 'denied' ? t('loginDenied')
                    : step.login?.state === 'expired' ? t('loginExpired')
                    : t('loginCancelled')}</span></>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-5 border-t border-xl-border-subtle">
            <span className="flex items-center gap-3 text-sm text-xl-fg-60">
              {pending && <><Loader2 size={16} className="animate-spin text-xl-primary-400" />{t('loginWaiting')}</>}
            </span>
            <div className="flex gap-3">
              {!pending && step.login?.state !== 'done' && (step.startError || step.login) && (
                <Focusable group={GROUP} id="share-l-retry" neighbors={{ right: 'share-l-cancel' }} onEnter={() => startLogin(step.provider)}>
                  {(f) => <button className={btn(f, true)}>{t('retry')}</button>}
                </Focusable>
              )}
              <Focusable group={GROUP} id="share-l-cancel" neighbors={{ left: 'share-l-retry' }}
                onEnter={() => { play('back'); if (pending) cancelLogin(step.provider); setStep({ step: 'pick' }); loadProviders(false); focusLater(`share-p-${step.provider.id}`); }}>
                {(f) => <button className={btn(f)}>{t('shareCancel')}</button>}
              </Focusable>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- post ---------------- */}
      {step.step === 'compose' && (() => {
        const p = step.provider;
        const textId = 'share-f-text';
        return (
          <div className={cn(panel, 'w-[1240px]')}>
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="text-2xl font-black italic uppercase tracking-tighter">{t('shareOn', { name: p.name })}</div>
                <div className="text-[11px] font-mono text-xl-fg-40 mt-1">{t('shareAs', { name: p.account?.name ?? '' })}</div>
              </div>
              <span className={cn('inline-flex items-center gap-2 text-[11px] font-mono px-3 py-1.5 rounded-full shrink-0',
                p.visibility === 'private' ? 'bg-xl-warning-500/15 text-xl-warning-400' : 'bg-xl-success-500/15 text-xl-success-400')}>
                <Lock size={12} />{p.visibility === 'private' ? t('visibilityPrivate') : t('visibilityPublic')}
              </span>
            </div>

            <div className="flex gap-8">
              <div className="w-[360px] shrink-0 flex flex-col gap-3">
                <div className="relative w-[360px] aspect-video rounded-2xl overflow-hidden bg-black">
                  <img src={item.thumb} alt="" className="w-full h-full object-cover" />
                  {item.kind === 'video' && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-14 h-14 rounded-full bg-black/55 inline-flex items-center justify-center"><Play size={24} className="text-white ml-1" /></span>
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-xl-fg-50 leading-relaxed">{item.label}<br />{item.sub}</div>
              </div>

              <div className="flex-1 min-w-0 flex flex-col gap-5">
                {p.titleMax && (
                  <Focusable group={GROUP} id="share-f-title" neighbors={{ down: textId }} onEnter={() => editField('title', p)}>
                    {(f) => (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-xl-fg-50">{t('shareFieldTitle')}</span>
                        <div className={cn('min-h-12 px-4 py-3 rounded-xl border-2 bg-xl-field text-base break-words transition-all',
                          f ? 'border-xl-primary-500 ring-4 ring-xl-primary-500/20' : 'border-xl-field-border')}>
                          {title || <span className="text-xl-fg-30">{t('shareFieldEmpty')}</span>}
                        </div>
                        <span className="self-end text-[11px] font-mono text-xl-fg-40">{Array.from(title).length} / {p.titleMax}</span>
                      </div>
                    )}
                  </Focusable>
                )}
                <Focusable group={GROUP} id={textId} neighbors={{ up: p.titleMax ? 'share-f-title' : undefined, down: item.kind === 'video' ? 'share-f-watermark' : 'share-c-submit' }} onEnter={() => editField('text', p)}>
                  {(f) => (
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] text-xl-fg-50">{t('shareFieldText')}</span>
                      <div className={cn('h-36 overflow-hidden px-4 py-3 rounded-xl border-2 bg-xl-field text-base whitespace-pre-wrap break-words transition-all',
                        f ? 'border-xl-primary-500 ring-4 ring-xl-primary-500/20' : 'border-xl-field-border')}>
                        {text || <span className="text-xl-fg-30">{t('shareTextPlaceholder')}</span>}
                      </div>
                      <span className="self-end text-[11px] font-mono text-xl-fg-40">{Array.from(text).length} / {p.textMax}</span>
                      {/* v3.2.29-dev.13 — YouTube conta la descrizione in byte: le lettere accentate valgono 2 */}
                      {p.textMaxBytes && new TextEncoder().encode(text).length > p.textMaxBytes && (
                        <span className="self-end text-[11px] text-xl-warning-400 flex items-center gap-1.5">
                          <AlertTriangle size={12} />{t('textBytesOver', { name: p.name, max: p.textMaxBytes, over: new TextEncoder().encode(text).length - p.textMaxBytes })}
                        </span>
                      )}
                    </div>
                  )}
                </Focusable>
                {item.kind === 'video' && (
                  <Focusable group={GROUP} id="share-f-watermark" neighbors={{ up: textId, down: 'share-c-submit' }} onEnter={toggleWatermark}>
                    {(f) => (
                      <div className={cn('flex items-center gap-4 px-4 py-3 rounded-xl border-2 transition-all',
                        f ? 'border-xl-primary-500 ring-4 ring-xl-primary-500/20 bg-xl-primary-500/5' : 'border-xl-field-border bg-xl-field')}>
                        <span className={cn('relative w-12 h-7 rounded-full shrink-0 transition-colors', watermark ? 'bg-xl-primary-500' : 'bg-xl-fill-10-strong')   /* v3.2.29-dev.15 — blu come gli altri interruttori attivi */}>
                          <span className={cn('absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all', watermark ? 'left-6' : 'left-1')} />
                        </span>
                        <span className="flex flex-col min-w-0">
                          <span className="text-sm font-black">{t('watermarkLabel')}</span>
                          <span className="text-[11px] font-mono text-xl-fg-50">{watermark ? t('watermarkOn') : t('watermarkOff')}</span>
                        </span>
                      </div>
                    )}
                  </Focusable>
                )}
              </div>
            </div>

            {sharedOn(p.id) !== null && (
              <div className="text-[11px] text-xl-success-400 flex items-start gap-2 -mt-2">
                <Check size={12} className="mt-0.5 shrink-0" />{t('alreadySharedCompose', { name: p.name, date: fmtWhen(sharedOn(p.id)!) })}
              </div>
            )}
            {p.visibility === 'private' && p.notes.map(n => (
              <div key={n} className="text-[11px] text-xl-warning-400 flex items-start gap-2 -mt-2">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />{t(`shareNotes.${n}`, { defaultValue: n })}
              </div>
            ))}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <PadHint k="A" label={t('hintEdit')} /><PadHint k="B" label={t('hintBack')} />
                <span className="text-[11px] font-mono text-xl-fg-40">{t('shareKeyboardHint')}</span>
              </div>
              <div className="flex gap-3">
                <Focusable group={GROUP} id="share-c-cancel" neighbors={{ up: item.kind === 'video' ? 'share-f-watermark' : textId, right: 'share-c-submit' }} onEnter={() => { play('back'); onClose(); }}>
                  {(f) => <button className={btn(f)}>{t('shareCancel')}</button>}
                </Focusable>
                <Focusable group={GROUP} id="share-c-submit" neighbors={{ up: item.kind === 'video' ? 'share-f-watermark' : textId, left: 'share-c-cancel' }} onEnter={() => submit(p)}>
                  {(f) => (
                    <button className={btn(f, true)}>
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}{busy ? t('shareSending') : t('share')}
                    </button>
                  )}
                </Focusable>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ---------------- caricamento ---------------- */}
      {step.step === 'progress' && (() => {
        const { job, provider: p } = step;
        const preparing = job.phase === 'preparing';
        const pct = preparing ? Math.min(100, Math.floor((job.prepared ?? 0) * 100))
          : job.size > 0 ? Math.min(100, Math.floor((job.sent / job.size) * 100)) : 0;
        const elapsed = (now - (job.uploadStartedAt ?? job.startedAt)) / 1000;
        const rate = !preparing && elapsed > 3 && job.sent > 0 ? job.sent / elapsed : 0;
        const eta = rate > 0 ? Math.max(0, (job.size - job.sent) / rate) : null;
        return (
          <div className={cn(panel, 'w-[860px]')}>
            <div className="text-2xl font-black italic uppercase tracking-tighter">{preparing ? t('preparingTitle') : t('uploadTitle', { name: p.name })}</div>
            <div className="flex gap-5 items-center">
              <div className="w-[160px] aspect-video rounded-xl overflow-hidden bg-black shrink-0"><img src={item.thumb} alt="" className="w-full h-full object-cover" /></div>
              <div className="min-w-0">
                <div className="text-lg font-black truncate">{job.title || item.label}</div>
                <div className="text-[11px] font-mono text-xl-fg-50">{item.sub}{p.visibility === 'private' ? ` · ${t('privateShort')}` : ''}</div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-2.5 rounded-full bg-xl-fill-10 overflow-hidden">
                <div className="h-full rounded-full bg-xl-primary-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-xs font-mono text-xl-fg-60">
                {preparing ? (
                  <><span>{pct}%</span><span>{t('preparingHint')}</span></>
                ) : (
                  <><span>{pct}% · {fmtMB(job.sent)} / {fmtMB(job.size)} MB</span>
                  <span>{eta === null ? t('uploadEtaUnknown') : t('uploadEta', { time: fmtClock(eta) })}</span></>
                )}
              </div>
            </div>
            <div className="text-sm text-xl-fg-60 leading-relaxed">{t('uploadBackgroundHint')}</div>
            <div className="flex items-center justify-between">
              <PadHint k="B" label={t('uploadBackground')} />
              <div className="flex gap-3">
                <Focusable group={GROUP} id="share-u-cancel" neighbors={{ right: 'share-u-bg' }}
                  onEnter={() => { if (armedCancel) cancelUpload(job.id); else { setArmedCancel(true); play('select'); } }}>
                  {(f) => <button className={cn(btn(f, false, true), armedCancel && 'bg-xl-danger-600 border-xl-danger-600 text-xl-on-accent')}>{armedCancel ? t('confirmA') : t('uploadCancel')}</button>}
                </Focusable>
                <Focusable group={GROUP} id="share-u-bg" neighbors={{ left: 'share-u-cancel' }} onEnter={() => { play('back'); onClose(); }}>
                  {(f) => <button className={btn(f, true)}>{t('uploadBackground')}</button>}
                </Focusable>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ---------------- esito ---------------- */}
      {step.step === 'result' && (
        <div className={cn(panel, 'w-[860px]')}>
          <div className="flex items-center gap-4">
            {step.ok ? <Check size={28} className="text-xl-success-400" /> : <AlertTriangle size={28} className="text-xl-danger-400" />}
            <div className="text-2xl font-black italic uppercase tracking-tighter">{step.ok ? t('shareDone', { name: step.provider.name }) : t('shareFailed')}</div>
          </div>
          {!step.ok && <div className="text-sm text-xl-fg-60">{errText(step.code || 'generic')}</div>}
          {step.ok && step.url && (
            <div className="flex items-center gap-8">
              <QrBox svg={resultQr} size={200} />
              <div className="flex flex-col gap-3 min-w-0">
                <div className="text-base">{t('resultQrHint')}</div>
                <div className="font-mono text-xl text-xl-primary-400 break-all">{step.url.replace(/^https?:\/\//, '')}</div>
                {step.provider.visibility === 'private' && <div className="text-[11px] text-xl-warning-400">{t(`resultPrivate.${step.provider.id}`, { defaultValue: t('resultPrivate.default') })}</div>}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            {!step.ok ? <PadHint k="B" label={t('hintBack')} /> : <span />}
            <Focusable group={GROUP} id="share-r-close" onEnter={() => { play('back'); onClose(); }}>
              {(f) => <button className={btn(f, true)}>{t('shareClose')}</button>}
            </Focusable>
          </div>
        </div>
      )}
    </motion.div>
  );
});

/**
 * v3.2.29-dev.13 — QR di un link a tutto schermo, per l'azione «Mostra QR del link» delle notifiche
 * (App.tsx, handler show_qr). Group "qr-modal"; A su Chiudi o B (gestito da App.tsx) chiudono.
 */
export function QrModal({ url, title, onClose }: { url: string; title?: string; onClose: () => void }) {
  const { t } = useTranslation('multimedia');
  const svg = useQr(url);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[210] flex items-center justify-center bg-xl-scrim">
      <div className="rounded-3xl border bg-xl-modal border-xl-border shadow-2xl p-10 flex flex-col items-center gap-6">
        <div className="text-2xl font-black italic uppercase tracking-tighter">{title || t('qrTitle')}</div>
        <QrBox svg={svg} size={320} />
        <div className="font-mono text-lg text-xl-primary-400">{url.replace(/^https?:\/\//, '')}</div>
        <div className="text-sm text-xl-fg-60">{t('resultQrHint')}</div>
        <Focusable group="qr-modal" id="qr-close" onEnter={onClose}>
          {(f) => (
            <button className={cn('flex items-center justify-center h-11 px-6 rounded-xl border text-[11px] font-black uppercase tracking-widest transition-all',
              f ? 'bg-xl-primary-600 border-xl-primary-600 text-xl-on-accent scale-105' : 'border-xl-primary-500 text-xl-primary-400 bg-xl-primary-500/10')}>
              {t('shareClose')}
            </button>
          )}
        </Focusable>
      </div>
    </motion.div>
  );
}

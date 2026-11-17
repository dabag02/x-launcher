// v3.2.29-dev.7 — sezione Multimedia del quick-menu (CHANGELOG-19, punto 2, step 2c).
//
// Screenshot e clip catturati negli spazi dei giochi (spaces.py) e archiviati dal demone
// (src/backend/mediaLibrary.ts) in ~/.local/share/x-launcher/multimedia/<gioco>/{Screenshot,Clip},
// più le clip temporanee (/tmp/x-launcher-<uid>/clips, massimo 3, cancellate allo spegnimento).
//
// Struttura, tutta navigabile col controller (FocusProvider, group "media-library"):
//   intestazione        titolo, percorso (sottotitolo monospaziato come Avatar e Gestore dei processi),
//                       Ricarica, Chiudi
//   riga delle schede   «Clip da rivedere» (se ce ne sono) e una scheda per gioco, catena orizzontale
//                       ciclica; A sceglie la scheda
//   riga dei tipi       Screenshot / Clip del gioco scelto
//   griglia             miniature 16:9 come la libreria degli avatar; A apre il visore
// Visore (group "media-viewer"): immagine o video a tutto schermo, barra dei pulsanti in basso —
//   precedente/successivo, riproduci/pausa, −10 s/+10 s, per una clip temporanea «Salva» in
//   Nativa/FHD/HD (solo le risoluzioni non superiori a quella registrata) e «Scarta», per un file
//   salvato «Elimina» (con conferma), Chiudi. B chiude il visore e poi la sezione (vedi back()).
// v3.2.29-dev.10 — sotto il video una barra di avanzamento (ClipProgress): tempo trascorso a
//   sinistra, tempo rimanente a scalare a destra. Non è focalizzabile: ci si sposta con −10 s/+10 s.
// v3.2.29-dev.12 — «Condividi» nel visore (clip salvate e da rivedere, screenshot se un servizio accetta
//   immagini): apre ShareDialog sopra il visore. B chiude prima un passo della condivisione.
// v3.2.29-dev.14 — badge «Condiviso» (con il servizio) sulle miniature e nel visore per i contenuti già
//   condivisi (media-shared.json del demone): evita di condividere più volte la stessa clip.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import {
  Image as ImageIcon, Film, X, RotateCcw, ChevronLeft, ChevronRight, Play, Pause, Rewind, FastForward,
  Save, Trash2, Clock, Loader2, Share2, Check,
} from 'lucide-react';
import { ShareDialog, type ShareDialogHandle, type ShareItem } from './ShareDialog';
import { Focusable, useFocus } from './FocusProvider';
import { useAudio } from './AudioProvider';
import { cn } from '../lib/utils';

type ShareRecord = { provider: string; providerName: string; url?: string; at: number };
type MediaItem = { name: string; url: string; thumb: string; mtime: number; size: number; kind: 'image' | 'video'; shared?: ShareRecord[] };
type MediaGame = { folder: string; gameId: string; title: string; screenshots: MediaItem[]; clips: MediaItem[]; latest: number };
type TmpClip = {
  file: string; key: string; title: string; gameId: string; startedAt: number; duration: number;
  width?: number; height?: number; size: number; url: string; thumb: string; saving: boolean; shared?: ShareRecord[];
};
type Library = { root: string; clipsDir: string; tmpClips: TmpClip[]; games: MediaGame[] };

// Voce della griglia/del visore, comune a file salvati e clip temporanee
type Entry = {
  id: string; kind: 'image' | 'video'; url: string; thumb: string; label: string; sub: string; date: number;
  tmp?: TmpClip; saved?: { folder: string; sub: 'Screenshot' | 'Clip'; name: string };
  shared?: ShareRecord[];
};

/** Servizi distinti su cui il contenuto è stato condiviso, con l'ultima data per ciascuno. */
function sharedSummary(list: ShareRecord[] | undefined): { names: string; last: number } | null {
  if (!list?.length) return null;
  const names = [...new Set(list.map(r => r.providerName))].join(' · ');
  return { names, last: Math.max(...list.map(r => r.at)) };
}

export interface MediaLibraryHandle {
  /** B: chiude prima la conferma o il visore. true se gestito qui, false se la sezione va chiusa. */
  back: () => boolean;
}

const TMP_TAB = '__tmp__';
const COLS = 4;

function fmtDuration(s: number): string {
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}
// Orologio della barra: il trascorso arrotonda per difetto e il rimanente per eccesso, così
// la somma dei due torna sempre alla durata e il rimanente arriva a 0:00 solo alla fine.
function fmtClock(s: number, up: boolean): string {
  const v = Math.max(0, up ? Math.ceil(s - 0.05) : Math.floor(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}

/**
 * v3.2.29-dev.10 — barra di avanzamento della clip nel visore.
 * Il riempimento si aggiorna a ogni frame direttamente sul DOM (niente re-render di tutta la
 * sezione a 60 Hz sull'HTPC); le due etichette cambiano solo quando cambia il secondo.
 * Se il file non dichiara una durata valida (Infinity/NaN) usa quella registrata dal demone.
 */
function ClipProgress({ video, fallbackDuration }: { video: HTMLVideoElement | null; fallbackDuration: number }) {
  const fillRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const [labels, setLabels] = useState<{ el: string; rem: string }>(() => ({ el: '0:00', rem: fmtClock(fallbackDuration, true) }));

  useEffect(() => {
    if (!video) return;
    let raf = 0;
    let last = '';
    const sync = () => {
      const d = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : fallbackDuration;
      const t = Math.min(video.currentTime || 0, d || 0);
      const pct = d > 0 ? Math.max(0, Math.min(100, (t / d) * 100)) : 0;
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (knobRef.current) knobRef.current.style.left = `${pct}%`;
      const el = fmtClock(t, false);
      const rem = fmtClock(Math.max(0, d - t), true);
      const key = `${el}|${rem}`;
      if (key !== last) { last = key; setLabels({ el, rem }); }
    };
    const loop = () => { sync(); raf = requestAnimationFrame(loop); };
    const start = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(raf); sync(); };
    const evs: Array<[string, () => void]> = [
      ['play', start], ['pause', stop], ['ended', stop],
      ['seeked', sync], ['timeupdate', sync], ['loadedmetadata', sync], ['durationchange', sync],
    ];
    evs.forEach(([e, h]) => video.addEventListener(e, h));
    sync();
    if (!video.paused) start();
    return () => {
      cancelAnimationFrame(raf);
      evs.forEach(([e, h]) => video.removeEventListener(e, h));
    };
  }, [video, fallbackDuration]);

  return (
    <div className="flex items-center gap-4 px-[80px] pt-5 shrink-0" aria-hidden="true">
      <span className="w-14 text-right text-sm font-mono tabular-nums text-white/80">{labels.el}</span>
      <div className="relative flex-1 h-2 rounded-full bg-white/15">
        <div ref={fillRef} className="absolute inset-y-0 left-0 rounded-full bg-xl-primary-500" style={{ width: '0%' }} />
        <div ref={knobRef} className="absolute top-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: '0%' }} />
      </div>
      <span className="w-14 text-sm font-mono tabular-nums text-white/80">−{labels.rem}</span>
    </div>
  );
}

function fmtSize(b: number): string {
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}
function fmtDate(ms: number, lang: string): string {
  try {
    return new Date(ms).toLocaleString(lang === 'en' ? 'en-GB' : 'it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return new Date(ms).toISOString();
  }
}

type OpenKeyboard = (id: string, label: string, value: string, onCommit: (val: string) => void, returnGroup?: string,
  opts?: { rows?: number; maxLength?: number }) => void;

export const MediaLibrary = forwardRef<MediaLibraryHandle, { onClose: () => void; openKeyboard: OpenKeyboard }>(function MediaLibrary({ onClose, openKeyboard }, ref) {
  const { t, i18n } = useTranslation('multimedia');
  const { setFocusedId, setActiveGroup, focusedId } = useFocus();
  const { play } = useAudio();
  const [lib, setLib] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>(null);         // TMP_TAB o cartella del gioco
  const [kind, setKind] = useState<'shots' | 'clips'>('shots');
  const [viewer, setViewer] = useState<number | null>(null);   // indice in entries
  const [armed, setArmed] = useState<string | null>(null);     // pulsante con la conferma armata
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // v3.2.29-dev.10 — lo stesso elemento anche come stato, perché ClipProgress si agganci ai suoi eventi
  //   quando il visore passa a un'altra clip (il <video> è ricreato a ogni cambio, key={current.id})
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const bindVideo = useCallback((el: HTMLVideoElement | null) => { videoRef.current = el; setVideoEl(el); }, []);
  const armTimer = useRef<number | null>(null);
  // v3.2.29-dev.12 — condivisione: tipi accettati da almeno un servizio (il pulsante compare solo per
  //   quelli) e finestra aperta
  const [shareKinds, setShareKinds] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);
  const shareRef = useRef<ShareDialogHandle | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/media/library');
      const j = await r.json();
      if (!j.success) throw new Error(j.message || 'error');
      setLib({ root: j.root, clipsDir: j.clipsDir, tmpClips: j.tmpClips, games: j.games });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch('/api/share/providers').then(r => r.json()).then(j => {
      if (!j.success) return;
      setShareKinds(new Set((j.providers as { accepts: string[] }[]).flatMap(p => p.accepts)));
    }).catch(() => { /* senza servizi il pulsante non compare */ });
  }, []);
  // aggiornamenti dal demone (clip salvata/scartata, nuovo screenshot): App.tsx inoltra l'evento SSE
  useEffect(() => {
    const h = () => load();
    window.addEventListener('xl-media-updated', h);
    return () => window.removeEventListener('xl-media-updated', h);
  }, [load]);

  // scheda iniziale: le clip da rivedere se ci sono, altrimenti il gioco più recente
  useEffect(() => {
    if (!lib) return;
    const valid = tab === TMP_TAB ? lib.tmpClips.length > 0 : lib.games.some(g => g.folder === tab);
    if (valid) return;
    if (lib.tmpClips.length) setTab(TMP_TAB);
    else if (lib.games.length) {
      setTab(lib.games[0].folder);
      setKind(lib.games[0].screenshots.length ? 'shots' : 'clips');
    } else setTab(null);
  }, [lib, tab]);

  const game = lib && tab && tab !== TMP_TAB ? lib.games.find(g => g.folder === tab) ?? null : null;

  const entries: Entry[] = useMemo(() => {
    if (!lib || !tab) return [];
    if (tab === TMP_TAB) {
      return lib.tmpClips.map(c => ({
        id: `tmp:${c.file}`, kind: 'video' as const, url: c.url, thumb: c.thumb, label: c.title,
        sub: `${fmtDuration(c.duration)} · ${c.width && c.height ? `${c.width}×${c.height} · ` : ''}${fmtDate(c.startedAt, i18n.language)}`,
        date: c.startedAt, tmp: c, shared: c.shared,
      }));
    }
    if (!game) return [];
    const list = kind === 'shots' ? game.screenshots : game.clips;
    return list.map(it => ({
      id: `saved:${game.folder}/${it.name}`, kind: it.kind, url: it.url, thumb: it.thumb, label: game.title,
      sub: `${fmtDate(it.mtime, i18n.language)} · ${fmtSize(it.size)}`, date: it.mtime,
      saved: { folder: game.folder, sub: kind === 'shots' ? 'Screenshot' : 'Clip', name: it.name },
      shared: it.shared,
    }));
  }, [lib, tab, game, kind, i18n.language]);

  const current = viewer !== null ? entries[viewer] ?? null : null;

  // il visore si chiude da solo se il suo elemento sparisce (salvato, scartato, eliminato)
  useEffect(() => {
    if (viewer !== null && !entries[viewer]) { setSharing(false); closeViewer(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, viewer]);

  const disarm = useCallback(() => {
    setArmed(null);
    if (armTimer.current) { window.clearTimeout(armTimer.current); armTimer.current = null; }
  }, []);
  const arm = useCallback((id: string) => {
    setArmed(id);
    if (armTimer.current) window.clearTimeout(armTimer.current);
    armTimer.current = window.setTimeout(() => setArmed(null), 4000);   // come la conferma di «Esci»
  }, []);
  // spostarsi annulla la conferma
  useEffect(() => { if (armed && focusedId !== armed) disarm(); }, [focusedId, armed, disarm]);

  const openViewer = (i: number) => {
    setViewer(i);
    setPlaying(false);
    setActiveGroup('media-viewer');
    play('select');
    setTimeout(() => setFocusedId(entries[i]?.kind === 'video' ? 'media-v-play' : (entries.length > 1 ? 'media-v-next' : 'media-v-close')), 60);
  };
  const closeViewer = (silent = false) => {
    const idx = viewer;
    videoRef.current?.pause();
    setViewer(null);
    disarm();
    setActiveGroup('media-library');
    if (!silent) play('back');
    setTimeout(() => setFocusedId(idx !== null && entries[Math.min(idx, entries.length - 1)] ? `media-item-${Math.min(idx, entries.length - 1)}` : firstTabId()), 60);
  };
  const openShare = () => {
    videoRef.current?.pause();
    disarm();
    setSharing(true);
    play('select');
  };
  const closeShare = () => {
    setSharing(false);
    setActiveGroup('media-viewer');
    setTimeout(() => setFocusedId('media-v-share'), 60);
  };
  const step = (d: number) => {
    if (viewer === null || !entries.length) return;
    videoRef.current?.pause();
    setPlaying(false);
    disarm();
    setViewer((viewer + d + entries.length) % entries.length);
    play('focus');
  };
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); } else { v.pause(); }
  };
  const seek = (d: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + d));
  };

  const saveClip = async (quality: 'native' | 'fhd' | 'hd') => {
    if (!current?.tmp) return;
    setBusy(`save-${quality}`);
    try {
      const r = await fetch('/api/media/clip/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: current.tmp.file, quality }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      play('select');
      await load();
      closeViewer(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const deleteCurrent = async () => {
    if (!current) return;
    const body = current.tmp ? { scope: 'tmp', file: current.tmp.file } : { scope: 'saved', ...current.saved };
    setBusy('delete');
    try {
      const r = await fetch('/api/media/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      play('back');
      disarm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  useImperativeHandle(ref, () => ({
    back: () => {
      if (sharing) { if (!shareRef.current?.back()) closeShare(); return true; }
      if (armed) { disarm(); return true; }
      if (viewer !== null) { closeViewer(); return true; }
      return false;
    },
  }));

  // ---- id di focus
  const tabIds = useMemo(() => {
    const ids: { id: string; key: string }[] = [];
    if (lib?.tmpClips.length) ids.push({ id: 'media-tab-tmp', key: TMP_TAB });
    lib?.games.forEach((g, i) => ids.push({ id: `media-tab-g${i}`, key: g.folder }));
    return ids;
  }, [lib]);
  const activeTabId = tabIds.find(x => x.key === tab)?.id;
  function firstTabId() { return activeTabId ?? tabIds[0]?.id ?? 'media-close'; }
  const kindRowId = game ? (kind === 'shots' ? 'media-kind-shots' : 'media-kind-clips') : undefined;

  // focus iniziale: la scheda attiva appena la libreria è caricata (o Chiudi se è vuota)
  const didFocus = useRef(false);
  useEffect(() => {
    if (didFocus.current || !lib || (tabIds.length && !activeTabId)) return;
    didFocus.current = true;
    setFocusedId(activeTabId ?? 'media-close');
  }, [lib, tabIds, activeTabId, setFocusedId]);
  const firstBelowTabs = kindRowId ?? (entries.length ? 'media-item-0' : undefined);

  // ---- risoluzioni proposte per una clip temporanea (mai più alte della registrazione)
  const saveOptions = (c: TmpClip) => {
    const h = c.height ?? 0;
    const out: { q: 'native' | 'fhd' | 'hd'; label: string }[] = [
      { q: 'native', label: `${t('native')}${c.width && c.height ? ` · ${c.width}×${c.height}` : ''}` },
    ];
    if (!h || h > 1080) out.push({ q: 'fhd', label: 'FHD · 1080p' });
    if (!h || h > 720) out.push({ q: 'hd', label: 'HD · 720p' });
    return out;
  };

  // v3.2.29-dev.8 — pulsanti con testo alti quanto quelli tondi (h-10): il FocusProvider ordina una catena
  // per posizione sullo schermo (prima l'altezza del bordo superiore, oltre 4 px di differenza, poi da sinistra);
  // con altezze diverse sulla stessa riga i tondi finivano tutti prima dei pulsanti con testo e la selezione
  // a destra/sinistra saltava voci per poi ripescarle in fondo.
  const pill = (focused: boolean, active = false, danger = false) => cn(
    'flex items-center gap-2 h-10 px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap',
    focused
      ? (danger ? 'bg-xl-danger-600 border-xl-danger-600 text-xl-on-accent scale-105' : 'bg-xl-primary-600 border-xl-primary-600 text-xl-on-accent scale-105')
      : active
        ? 'border-xl-primary-500 text-xl-primary-400 bg-xl-primary-500/10'
        : 'border-xl-control-border text-xl-fg-50-alt',
  );
  const roundBtn = (focused: boolean, danger = false) => cn(
    'w-10 h-10 rounded-full border flex items-center justify-center transition-all',
    focused
      ? (danger ? 'bg-xl-danger-600 border-xl-danger-600 text-xl-on-accent scale-110' : 'bg-xl-primary-600 border-xl-primary-600 text-xl-on-accent scale-110')
      : 'border-xl-control-border',
  );

  const empty = lib && !lib.tmpClips.length && !lib.games.length;

  const shareItem = (e: Entry): ShareItem => ({
    kind: e.kind, thumb: e.thumb, label: e.label, sub: e.sub, date: e.date, duration: e.tmp?.duration, shared: e.shared,
    source: e.tmp ? { scope: 'tmp', file: e.tmp.file } : { scope: 'saved', folder: e.saved!.folder, sub: e.saved!.sub, name: e.saved!.name },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute inset-0 z-[80] flex flex-col pt-[80px] pl-[80px] pr-[80px] pb-[64px] bg-xl-veil"
    >
      {/* Intestazione */}
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-full border-2 border-xl-primary-500/40 flex items-center justify-center bg-xl-ink/5 shrink-0">
            <ImageIcon size={26} className="opacity-60" />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('title')}</h2>
            <p className="text-[10px] font-mono mt-0.5 select-all text-xl-fg-30 truncate">
              ~/.local/share/x-launcher/multimedia/ · {t('subtitle')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Focusable group="media-library" id="media-reload" neighbors={firstBelowTabs || activeTabId ? { down: activeTabId ?? firstBelowTabs! } : undefined} onEnter={() => { load(); play('select'); }}>
            {(f) => <button className={roundBtn(f)} title={t('reload')}><RotateCcw size={16} /></button>}
          </Focusable>
          <Focusable group="media-library" id="media-close" fallbackPriority={-1} neighbors={activeTabId ? { down: activeTabId } : undefined} onEnter={() => { play('back'); onClose(); }}>
            {(f) => <button className={roundBtn(f, true)}><X size={18} /></button>}
          </Focusable>
        </div>
      </div>

      {error && <div className="mb-4 text-xs font-bold text-xl-danger-400 shrink-0">{error}</div>}

      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-40">
          <ImageIcon size={64} className="mb-6" />
          <h3 className="text-xl font-black italic uppercase tracking-widest">{t('emptyTitle')}</h3>
          <p className="text-sm font-medium mt-2 text-center max-w-md">{t('emptyDesc')}</p>
        </div>
      ) : (
        <>
          {/* Schede: clip da rivedere + una per gioco */}
          <div className="flex items-center gap-2 flex-wrap mb-4 shrink-0">
            {tabIds.map(({ id, key }) => {
              const isTmp = key === TMP_TAB;
              const g = isTmp ? null : lib?.games.find(x => x.folder === key);
              const count = isTmp ? lib?.tmpClips.length ?? 0 : (g ? g.screenshots.length + g.clips.length : 0);
              return (
                <Focusable key={id} group="media-library" id={id} sequentialChain="media-tabs" chainAxis="horizontal" chainWrap
                  neighbors={{ up: 'media-reload', ...(key === tab && firstBelowTabs ? { down: firstBelowTabs } : {}) }}
                  onEnter={() => {
                    setTab(key);
                    if (g) setKind(g.screenshots.length ? 'shots' : 'clips');
                    play('select');
                  }}>
                  {(f) => (
                    <button className={pill(f, key === tab)}>
                      {isTmp ? <Clock size={13} className="text-xl-danger-400" /> : <ImageIcon size={13} />}
                      <span>{isTmp ? t('tmpTab') : g?.title}</span>
                      <span className="opacity-60">{count}</span>
                    </button>
                  )}
                </Focusable>
              );
            })}
          </div>

          {/* Tipi: Screenshot / Clip del gioco scelto */}
          {game && (
            <div className="flex items-center gap-2 mb-5 shrink-0">
              {([['shots', 'media-kind-shots', ImageIcon, game.screenshots.length, t('screenshots')],
                 ['clips', 'media-kind-clips', Film, game.clips.length, t('clips')]] as const).map(([k, id, Icon, n, label]) => (
                <Focusable key={id} group="media-library" id={id} sequentialChain="media-kinds" chainAxis="horizontal" chainWrap
                  neighbors={{ up: activeTabId ?? 'media-reload', ...(entries.length ? { down: 'media-item-0' } : {}) }}
                  onEnter={() => { setKind(k); play('select'); }}>
                  {(f) => (
                    <button className={pill(f, kind === k)}>
                      <Icon size={13} /><span>{label}</span><span className="opacity-60">{n}</span>
                    </button>
                  )}
                </Focusable>
              ))}
            </div>
          )}
          {tab === TMP_TAB && (
            <p className="mb-5 text-[10px] font-mono text-xl-fg-30 shrink-0">{t('tmpHint')}</p>
          )}

          {/* Griglia */}
          {entries.length === 0 ? (
            <div className="flex-1 flex items-center justify-center opacity-40 text-sm font-bold uppercase tracking-widest">{t('noItems')}</div>
          ) : (
            <div className="flex-1 overflow-y-auto overflow-x-visible custom-scrollbar">
              <div className="grid grid-cols-4 gap-5 px-2 pb-4 pt-2">
                {entries.map((e, i) => (
                  <Focusable key={e.id} group="media-library" id={`media-item-${i}`}
                    neighbors={i < COLS ? { up: kindRowId ?? activeTabId ?? 'media-reload' } : undefined}
                    onEnter={() => openViewer(i)}>
                    {(f) => (
                      <div onClick={() => openViewer(i)} className={cn(
                        'relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 border-[4px] bg-xl-ink/5',
                        f ? 'border-xl-ink scale-[1.04] shadow-[0_12px_32px_rgba(255,255,255,0.2)] z-10' : 'border-transparent opacity-85',
                      )}>
                        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                          <img src={e.thumb} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                          {e.kind === 'video' && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-12 h-12 rounded-full bg-xl-ink/20 flex items-center justify-center"><Play size={20} className="text-xl-on-accent" /></div>
                            </div>
                          )}
                          {e.tmp && (
                            <span className={cn('absolute top-2 left-2 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full text-xl-on-accent',
                              e.tmp.saving ? 'bg-xl-primary-600' : 'bg-xl-danger-600')}>
                              {e.tmp.saving ? t('saving') : t('toReview')}
                            </span>
                          )}
                          {e.shared?.length ? (
                            <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-xl-success-600 text-xl-on-accent">
                              <Check size={10} strokeWidth={3} />{t('sharedBadge')}
                            </span>
                          ) : null}
                        </div>
                        <div className="px-3 py-2">
                          {e.tmp && <div className="text-xs font-black truncate">{e.label}</div>}
                          <div className="text-[10px] font-mono text-xl-fg-30 truncate">{e.sub}</div>
                        </div>
                      </div>
                    )}
                  </Focusable>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Visore */}
      <AnimatePresence>
        {current && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[90] flex flex-col bg-xl-veil" style={{ background: 'rgba(0,0,0,0.94)' }}>
            <div className="flex items-center justify-between px-[80px] pt-[40px] pb-4 shrink-0">
              <div className="min-w-0">
                <div className="text-xl font-black italic uppercase tracking-tighter truncate text-white">{current.label}</div>
                <div className="text-[10px] font-mono text-white/40">{current.sub}{entries.length > 1 ? ` · ${(viewer ?? 0) + 1}/${entries.length}` : ''}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {(() => {
                  const sh = sharedSummary(current.shared);
                  return sh ? (
                    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-xl-success-600 text-xl-on-accent">
                      <Check size={11} strokeWidth={3} />{t('sharedOn', { names: sh.names, date: fmtDate(sh.last, i18n.language) })}
                    </span>
                  ) : null;
                })()}
                {current.tmp && <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-xl-danger-600 text-xl-on-accent">{t('toReview')}</span>}
              </div>
            </div>
            <div className="flex-1 min-h-0 flex items-center justify-center px-[80px]">
              {current.kind === 'image' ? (
                <img key={current.id} src={current.url} alt="" className="max-w-full max-h-full object-contain rounded-xl" />
              ) : (
                <video key={current.id} ref={bindVideo} src={current.url} className="max-w-full max-h-full rounded-xl bg-black"
                  autoPlay playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
              )}
            </div>
            {current.kind === 'video' && <ClipProgress video={videoEl} fallbackDuration={current.tmp?.duration ?? 0} />}
            {/* v3.2.29-dev.8 — una riga sola (su due righe la catena seguirebbe l'ordine delle righe) */}
            <div className="flex flex-nowrap items-center justify-center gap-3 px-[80px] pt-5 pb-[48px] shrink-0">
              {entries.length > 1 && (
                <Focusable group="media-viewer" id="media-v-prev" sequentialChain="media-vbar" chainAxis="horizontal" chainWrap onEnter={() => step(-1)}>
                  {(f) => <button className={roundBtn(f)}><ChevronLeft size={18} /></button>}
                </Focusable>
              )}
              {current.kind === 'video' && (
                <>
                  <Focusable group="media-viewer" id="media-v-back" sequentialChain="media-vbar" chainAxis="horizontal" chainWrap onEnter={() => seek(-10)}>
                    {(f) => <button className={roundBtn(f)}><Rewind size={16} /></button>}
                  </Focusable>
                  <Focusable group="media-viewer" id="media-v-play" sequentialChain="media-vbar" chainAxis="horizontal" chainWrap onEnter={togglePlay}>
                    {(f) => <button className={pill(f)}>{playing ? <Pause size={13} /> : <Play size={13} />}<span>{playing ? t('pause') : t('play')}</span></button>}
                  </Focusable>
                  <Focusable group="media-viewer" id="media-v-fwd" sequentialChain="media-vbar" chainAxis="horizontal" chainWrap onEnter={() => seek(10)}>
                    {(f) => <button className={roundBtn(f)}><FastForward size={16} /></button>}
                  </Focusable>
                </>
              )}
              {current.tmp && !current.tmp.saving && saveOptions(current.tmp).map(o => (
                <Focusable key={o.q} group="media-viewer" id={`media-v-save-${o.q}`} sequentialChain="media-vbar" chainAxis="horizontal" chainWrap
                  onEnter={() => { if (!busy) saveClip(o.q); }}>
                  {(f) => (
                    <button className={pill(f)}>
                      {busy === `save-${o.q}` ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                      <span>{t('saveAs')} {o.label}</span>
                    </button>
                  )}
                </Focusable>
              ))}
              {!(current.tmp && current.tmp.saving) && shareKinds.has(current.kind) && (
                <Focusable group="media-viewer" id="media-v-share" sequentialChain="media-vbar" chainAxis="horizontal" chainWrap onEnter={openShare}>
                  {(f) => <button className={pill(f)}><Share2 size={13} /><span>{t('share')}</span></button>}
                </Focusable>
              )}
              {!(current.tmp && current.tmp.saving) && (
                <Focusable group="media-viewer" id="media-v-delete" sequentialChain="media-vbar" chainAxis="horizontal" chainWrap
                  onEnter={() => {
                    if (busy) return;
                    if (armed === 'media-v-delete') deleteCurrent();
                    else { arm('media-v-delete'); play('select'); }
                  }}>
                  {(f) => (
                    <button className={cn(pill(f, false, true), armed === 'media-v-delete' && 'bg-xl-danger-600 border-xl-danger-600 text-xl-on-accent')}>
                      <Trash2 size={13} />
                      <span>{armed === 'media-v-delete' ? t('confirmA') : (current.tmp ? t('discard') : t('delete'))}</span>
                    </button>
                  )}
                </Focusable>
              )}
              {current.tmp?.saving && <span className="text-[10px] font-black uppercase tracking-widest text-xl-primary-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" />{t('saving')}</span>}
              {entries.length > 1 && (
                <Focusable group="media-viewer" id="media-v-next" sequentialChain="media-vbar" chainAxis="horizontal" chainWrap onEnter={() => step(1)}>
                  {(f) => <button className={roundBtn(f)}><ChevronRight size={18} /></button>}
                </Focusable>
              )}
              <Focusable group="media-viewer" id="media-v-close" sequentialChain="media-vbar" chainAxis="horizontal" chainWrap fallbackPriority={-1} onEnter={() => closeViewer()}>
                {(f) => <button className={roundBtn(f, true)}><X size={18} /></button>}
              </Focusable>
            </div>
            <AnimatePresence>
              {sharing && (
                <ShareDialog ref={shareRef} key={current.id} item={shareItem(current)} onClose={closeShare} openKeyboard={openKeyboard} />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

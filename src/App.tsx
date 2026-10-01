import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScalingContainer } from './components/ScalingContainer';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gamepad2, 
  Settings, 
  Search, 
  User, 
  Clock, 
  Play, 
  Download, 
  Info, 
  ChevronRight,
  ChevronLeft,
  Terminal,
  Activity,
  Cpu,
  Monitor,
  LayoutGrid,
  Moon,
  Sun,
  Maximize2,
  Power,
  X,
  Menu,
  Gamepad,
  Trophy,
  ArrowUp,
  ArrowDown,
  Keyboard,
  Package,
  Trash2,
  Pause,
  Copy,
  FileDown,
  Filter,
  RotateCcw,
  Bell,
  BellDot,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  BookOpen,
  ChevronDown,
  Edit3,
  HardDrive,
  CircuitBoard,
  MemoryStick,
  Laptop,
  Cloud,
  Folder,
  File,
  Home
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MOCK_STORES, MOCK_GAMES, MOCK_LOGS } from './mockData';
import { Game, StoreType, RunnerType, LogEntry, ViewState, Theme, AppNotification } from './types';
import { DEFAULT_WINE_VERBS, OPTIONAL_WINE_VERBS, OS_VERSION_VERBS } from './wineVerbs';
import { FocusProvider, Focusable, useFocus } from './components/FocusProvider';
import { NavDebugOverlay } from './components/NavDebugOverlay';
import { AudioProvider, useAudio } from './components/AudioProvider';
import { VirtualKeyboard, SuggestionItem } from './components/VirtualKeyboard';
import { GamepadTester } from './components/GamepadTester';
import { useGamepad } from './hooks/useGamepad';
import { useCloudBackupProviders } from './hooks/useCloudBackupProviders';
import { useNotifications } from './hooks/useNotifications';
import { useHostname } from './hooks/useHostname';
import { useSystemInfo } from './hooks/useSystemInfo';
import { usePredictedInstallSize } from './hooks/usePredictedInstallSize';
import { useAiAdvisorProviders } from './hooks/useAiAdvisorProviders';
import { useInputDevices } from './hooks/useInputDevices';
import { useStorePluginRegistry } from './hooks/useStorePluginRegistry';
import { InputManager } from './input/InputManager';
import { toInputPluginSummary } from './input/types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// v0.99.32 — Id stabile e riconoscibile per la card "Steam Big Picture",
// usato sia qui sia in tutti gli handler (handlePlay, openGameOptions,
// ecc.) che devono distinguerla da un titolo reale tramite
// game.isBigPictureLauncher invece di un controllo sull'id, che resta
// comunque utile per debug/log.
const STEAM_BIG_PICTURE_ID = 'steam-bigpicture-launcher';

// v1.1.16 — suggerimenti alternativi per la tastiera virtuale, mostrati
// premendo Shift al posto dei completamenti di default (.com/.exe/ecc.)
// quando si sta modificando il campo giusto. Curati per essere a basso
// rischio (un gioco che non li riconosce li ignora, non si rompe) e per
// coprire le classi di problemi più comuni per giochi Windows via
// Wine/Proton — non sono flag "universali", la loro utilità dipende dal
// motore di gioco/runner specifico, da qui il tip contestuale su ognuno.
//
// NOTA ONESTA: elenco compilato da conoscenza generale della comunità
// Linux gaming (ProtonDB e simili), non verificato con test reali in
// questo ambiente — nessun gioco/runner reale disponibile qui per
// validarli uno per uno.
const LAUNCH_ARG_SUGGESTIONS: SuggestionItem[] = [
  { value: '-windowed',  insertMode: 'append-space', tip: 'Avvia in finestra — il fix più citato per blocchi/freeze da fullscreen esclusivo sotto Wine/Proton' },
  { value: '-noborder',  insertMode: 'append-space', tip: 'Finestra senza bordi — abbinato a -windowed per un "fullscreen" senza i problemi del fullscreen esclusivo' },
  { value: '-dx9',       insertMode: 'append-space', tip: 'Forza DirectX 9 — spesso meno stranezze sotto Wine/DXVK delle versioni successive dello stesso gioco' },
  { value: '-nointro',   insertMode: 'append-space', tip: 'Salta i video di apertura — causa frequente di crash sotto Wine per problemi di codec' },
  { value: '-novid',     insertMode: 'append-space', tip: 'Come -nointro, variante Source engine (Half-Life 2, CS:S, TF2, Portal, Left 4 Dead)' },
  { value: '-high',      insertMode: 'append-space', tip: 'Priorità processo alta — suggerito per stutter su giochi Source/più datati' },
  { value: '-nojoy',     insertMode: 'append-space', tip: 'Disattiva il rilevamento joystick del gioco — utile se confligge col rilevamento controller della Dashboard' },
];

// Richiesta utente — Launch Arguments era sempre e solo la lista Wine/
// Proton sopra, anche per giochi Classic Console lanciati con RetroArch,
// dove quei flag non hanno alcun senso (RetroArch non è Wine). Il
// backend già inoltra questi argomenti a RetroArch senza bisogno di
// alcuna modifica (gameManager.ts costruisce runnerConfig.args dallo
// stesso campo per qualunque runner, RetroArchRunner.launch() li accoda
// già) — mancava solo la controparte in questa UI. RetroArch non ha un
// flag diretto tipo "--shader=" in tutte le build: --appendconfig è la
// via documentata e universale per applicare un file di configurazione
// aggiuntivo (es. uno shader CRT) per-gioco senza toccare retroarch.cfg.
// Richiesta utente — test dal vivo: --appendconfig= viene ignorato del
// tutto da RetroArch (causa non ancora capita, da investigare), l'unico
// argomento che applica davvero lo shader è --set-shader con il percorso
// diretto del file .slangp fra virgolette. Finché non si capisce perché
// la configurazione custom via file viene ignorata, questa entry sta qui
// come SHORTCUT già completa (percorso reale incluso, verificato bundled
// dal pacchetto libretro-shaders-slang su Arch) — non un flag da
// completare a mano, così l'utente non deve sapere in anticipo quale
// file appendere. Il pulsante "Filtro CRT" dedicato nell'overlay (che
// scriveva --appendconfig=, ora rimosso) è stato sostituito da questa
// voce, esattamente per lo stesso motivo.
const RETROARCH_CRT_SHADER_PATH = '/usr/share/libretro/shaders/shaders_slang/crt/crt-easymode.slangp';

// Richiesta utente — "auto-remaster": sottostringa da cercare in
// localGameConfig.libretroCore per capire se è già attivo per il sistema
// del gioco selezionato, prima ancora di premere il pulsante (il valore
// esatto del nuovo core arriva dal backend dopo il toggle, non serve
// duplicarlo qui — solo questo hint iniziale). Va tenuta in sync con
// REMASTER_PRESETS in classicPlugin.ts quando si aggiunge un sistema.
// Vale SOLO per i preset 'swap-core' (PSX, Saturn) — per i preset
// 'toggle-options' (PS2, in futuro N64) il core non cambia mai, quindi
// questa sottostringa non potrebbe mai distinguere attivo/disattivo:
// vedi REMASTER_TOGGLE_SYSTEMS sotto per quel caso.
const REMASTER_HINT_BY_SYSTEM: Record<string, string> = {
  psx:    'mednafen_psx_hw',
  saturn: 'kronos',
};

// v2.1.11-dev.2 — sistemi con preset 'toggle-options': lo stato attivo/
// disattivo NON si legge da libretroCore (resta sempre lo stesso core,
// vedi REMASTER_PRESETS.ps2 in classicPlugin.ts) ma dal campo DB dedicato
// `remasterEnabled` sul gioco stesso, scritto da setRemasterEnabled
// (gameManager.ts) proprio per questo motivo.
const REMASTER_TOGGLE_SYSTEMS = new Set(['ps2', 'dreamcast']);

const RETROARCH_LAUNCH_ARG_SUGGESTIONS: SuggestionItem[] = [
  { value: `--set-shader "${RETROARCH_CRT_SHADER_PATH}"`, label: '📺 Filtro CRT', insertMode: 'append-space', tip: 'Filtro CRT pronto all\'uso (crt-easymode) — --appendconfig= risulta ignorato da RetroArch, questo è il flag verificato funzionante' },
  { value: '-v',               insertMode: 'append-space', tip: 'Log verboso — primo passo per diagnosticare un core o una ROM che non parte' },
  { value: '--max-frames=600', insertMode: 'append-space', tip: 'Chiude RetroArch dopo N frame — utile solo per test automatizzati, non per l\'uso normale' },
];

const ENV_VAR_SUGGESTIONS_WINE: SuggestionItem[] = [
  { value: 'WINEDEBUG=-all',                          insertMode: 'replace', tip: 'Silenzia il log di debug di Wine — meno rumore, leggero overhead in meno' },
  { value: 'WINEARCH=win64',                           insertMode: 'replace', tip: 'Forza un prefix a 64 bit' },
  { value: 'WINEESYNC=1',                              insertMode: 'replace', tip: 'Abilita esync — sincronizzazione più leggera, utile su kernel meno recenti' },
  { value: 'WINEFSYNC=1',                              insertMode: 'replace', tip: 'Abilita fsync — equivalente più moderno di esync, kernel recenti' },
  { value: 'WINE_LARGE_ADDRESS_AWARE=1',               insertMode: 'replace', tip: 'Permette a giochi a 32 bit di usare più di 2GB di RAM — fix molto citato' },
  { value: 'WINEDLLOVERRIDES=winemenubuilder.exe=d',   insertMode: 'replace', tip: 'Disattiva la creazione automatica di collegamenti/voci di menu da parte di Wine' },
  { value: 'WINEDLLOVERRIDES=d3d11=n',                 insertMode: 'replace', tip: 'Forza la DLL nativa invece di quella integrata — utile per problemi grafici specifici' },
];

const ENV_VAR_SUGGESTIONS_PROTON: SuggestionItem[] = [
  { value: 'PROTON_LOG=1',                    insertMode: 'replace', tip: 'Abilita il log di Proton su file — primo passo di ogni diagnosi' },
  { value: 'PROTON_NO_ESYNC=1',                insertMode: 'replace', tip: 'Disattiva esync — a volte necessario per compatibilità' },
  { value: 'PROTON_NO_FSYNC=1',                insertMode: 'replace', tip: 'Disattiva fsync — stesso motivo di NO_ESYNC' },
  { value: 'PROTON_USE_WINED3D=1',             insertMode: 'replace', tip: 'Forza WineD3D al posto di DXVK/VKD3D — utile se DXVK dà problemi specifici' },
  { value: 'PROTON_FORCE_LARGE_ADDRESS_AWARE=1', insertMode: 'replace', tip: 'Equivalente Proton del fix RAM per giochi a 32 bit' },
  { value: 'DXVK_HUD=fps',                     insertMode: 'replace', tip: 'Overlay DXVK con FPS a schermo — diagnostica rapida, non modifica nulla' },
  { value: 'DXVK_ASYNC=1',                     insertMode: 'replace', tip: 'Riduce lo stutter da compilazione shader — uno dei fix più citati in assoluto' },
];

/**
 * v0.99.37 — Factory estratta da appendSteamBigPictureCard: prima l'oggetto
 * Game della card veniva costruito solo inline dentro quella funzione,
 * quindi esisteva SOLO nell'elenco usato per renderizzare la griglia — mai
 * nello stato `games` grezzo (che arriva da /api/games, lato server, e non
 * conosce questa card virtuale). Bug reale confermato: il pannello destro
 * (`selectedGame = games.find(...) || games[0]`) non trovava mai la card
 * qui dentro e cadeva sistematicamente sul primo gioco reale della lista
 * corrente, mostrando info di un titolo a caso invece che della card
 * selezionata. Estratta qui così la stessa identica definizione può essere
 * riusata anche per risolvere selectedGame (vedi sotto), senza duplicare i
 * campi e rischiare che i due punti divergano nel tempo.
 */
function makeSteamBigPictureCard(): Game {
  return {
    id: STEAM_BIG_PICTURE_ID,
    title: 'Steam Big Picture',
    store: 'Steam',
    runner: 'Steam Native' as RunnerType,
    isInstalled: true, // sempre "pronta", non richiede mai un'azione di installazione
    playTimeHours: 0,
    coverImage: STEAM_BIGPICTURE_COVER,
    previewImage: STEAM_BIGPICTURE_PREVIEW,
    description: 'Passa a Steam in modalità Big Picture, con la tua libreria Steam completa e l\'interfaccia controller-first nativa di Valve.',
    tags: ['Steam', 'Big Picture'],
    status: 'Ready to Launch',
    isBigPictureLauncher: true,
  };
}

/**
 * Inietta la card speciale "Steam Big Picture" nell'elenco filtrato della
 * libreria, SOLO lato frontend — mai persistita nel DB, mai restituita da
 * gameManager.getGames() (vedi commento su Game.isBigPictureLauncher in
 * types.ts). Sempre presente quando lo store attivo è 'Steam' o 'All',
 * anche con libreria Steam reale vuota o il plugin Steam disabilitato — il
 * suo scopo non è "lanciare un gioco posseduto", è offrire un modo nativo
 * di passare a Steam Big Picture dalla libreria X-Launcher (rilevante
 * soprattutto in sessione X11 dedicata, dove non esiste un altro modo
 * "ovvio" di raggiungere Steam senza uscire dalla Dashboard).
 *
 * Posizionata in coda all'elenco filtrato (dopo i titoli reali), non in
 * testa — non deve competere con la prima card reale per il fallback
 * automatico del focus (v0.99.4), che resta sulla prima card a sinistra
 * come da comportamento consolidato.
 *
 * Soggetta allo stesso filtro testuale degli altri elementi quando
 * searchQuery non è vuota: cercando "steam" o "big picture" la si trova
 * come un vero elemento, cercando il nome di un gioco specifico sparisce
 * come ci si aspetterebbe da una card che non corrisponde alla query.
 */
function appendSteamBigPictureCard(
  filteredGames: Game[],
  activeStore: StoreType | 'All',
  searchQuery: string
): Game[] {
  if (activeStore !== 'Steam' && activeStore !== 'All') return filteredGames;

  const card: Game = makeSteamBigPictureCard();

  if (searchQuery) {
    const s = searchQuery.toLowerCase();
    const matches = card.title.toLowerCase().includes(s) ||
      card.description.toLowerCase().includes(s) ||
      card.tags.some(t => t.toLowerCase().includes(s));
    if (!matches) return filteredGames;
  }

  return [...filteredGames, card];
}

// v0.99.32 — Placeholder SVG inline per la card "Steam Big Picture", in
// attesa dell'asset grafico dedicato e coerente con lo stile Steam (grid/
// hero/logo nella cartella grid/ di Steam stesso, vedi il lavoro separato
// sull'integrazione Non-Steam Game). Nessuna dipendenza da un file esterno
// per questa fase: un data URI evita un fetch di rete o un file mancante
// che romperebbe il rendering della card prima che l'asset finale sia pronto.
const STEAM_BIGPICTURE_COVER = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900">
  <rect width="600" height="900" fill="#0b1118"/>
  <circle cx="300" cy="380" r="160" fill="#171d25"/>
  <circle cx="300" cy="380" r="120" fill="#2a475e"/>
  <circle cx="300" cy="380" r="60" fill="#66c0f4"/>
  <circle cx="300" cy="380" r="28" fill="#0b1118"/>
  <text x="300" y="700" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#66c0f4" text-anchor="middle">STEAM</text>
  <text x="300" y="750" font-family="Arial, sans-serif" font-size="30" fill="#8f98a0" text-anchor="middle">BIG PICTURE</text>
</svg>
`)}`;

// v0.99.37 — Immagine dedicata per il pannello info (aspect-video, 16:9),
// invece di riusare STEAM_BIGPICTURE_COVER (pensata per la card 3/4 della
// griglia). Con object-cover, un sorgente 2:3 mostrato in un riquadro 16:9
// viene ritagliato pesantemente sull'asse verticale — il crop risultante
// avrebbe escluso proprio il testo "STEAM / BIG PICTURE" in basso,
// lasciando visibile solo il logo senza alcuna etichetta. Componendo un
// SVG nativamente 16:9 logo e testo restano sempre nell'inquadratura,
// nessun ritaglio necessario.
const STEAM_BIGPICTURE_PREVIEW = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
  <rect width="1600" height="900" fill="#0b1118"/>
  <circle cx="800" cy="380" r="180" fill="#171d25"/>
  <circle cx="800" cy="380" r="135" fill="#2a475e"/>
  <circle cx="800" cy="380" r="68" fill="#66c0f4"/>
  <circle cx="800" cy="380" r="32" fill="#0b1118"/>
  <text x="800" y="680" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="#66c0f4" text-anchor="middle">STEAM</text>
  <text x="800" y="735" font-family="Arial, sans-serif" font-size="34" fill="#8f98a0" text-anchor="middle">BIG PICTURE</text>
</svg>
`)}`;

/**
 * v0.99.90 — titolo che rivela il testo completo una volta sola se eccede
 * lo spazio disponibile, poi torna all'inizio (dove riprende ad apparire
 * come "troncato" a riposo — coerente con l'aspetto di un titolo breve
 * che invece ci sta per intero). Usato per i titoli delle notifiche,
 * spesso più lunghi dello spazio disponibile nel pannello da 384px
 * (w-96) e prima semplicemente tagliati con `truncate`, senza modo di
 * leggerli per intero senza aprire la notifica.
 *
 * Diverso dall'auto-scroll continuo del pannello info (v0.99.38): lì il
 * contenuto è lungo e la lettura richiede più tempo, qui è un titolo
 * breve — una singola rivelazione basta, non serve un loop perenne che
 * distrarrebbe in un elenco con più notifiche visibili insieme.
 */
function ScrollOnceTitle({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;
    const overflow = textEl.scrollWidth - container.clientWidth;
    setOverflowPx(overflow > 4 ? overflow : 0);
  }, [text]);

  return (
    <div ref={containerRef} className="overflow-hidden whitespace-nowrap">
      <p
        ref={textRef}
        className={cn(className, "inline-block")}
        style={overflowPx > 0 ? (() => {
          // v0.99.90 — durata proporzionale alla distanza da percorrere,
          // non fissa: con una durata fissa un titolo molto più lungo
          // doveva scorrere la stessa distanza maggiore nello stesso
          // tempo, risultando visibilmente più veloce e difficile da
          // leggere. 45px/s è una velocità di lettura comoda; il fattore
          // 0.4 riflette che nel keyframe (vedi index.css) solo il primo
          // 40% e l'ultimo 40% sono scorrimento vero e proprio (andata e
          // ritorno), il resto è la pausa alla fine. Min/max evitano sia
          // uno scatto troppo rapido su titoli di poco più lunghi dello
          // spazio disponibile sia un'attesa eccessiva su titoli enormi.
          const scrollSpeedPxPerSec = 45;
          const scrollPhaseSec = overflowPx / scrollSpeedPxPerSec;
          const durationSec = Math.min(Math.max(scrollPhaseSec / 0.4, 3), 14);
          return {
            animation: `scroll-once-reveal ${durationSec}s ease-in-out 1s 1`,
            ['--scroll-distance' as any]: `-${overflowPx}px`,
          };
        })() : undefined}
      >
        {text}
      </p>
    </div>
  );
}

// v0.99.90 — Step 15d: metadati statici dei quattro provider cloud —
// nome, se richiedono un account a pagamento fin dal primo utilizzo
// (stessa distinzione già usata per l'ordine di priorità di sviluppo:
// Gemini/DeepSeek hanno un vero utilizzo gratuito, ChatGPT/Claude no) e
// la nota specifica da mostrare all'attivazione. Non viene dal backend:
// sono fatti sui provider stessi, non configurazione dell'utente.
const CLOUD_PROVIDERS: Array<{ id: string; name: string; requiresPaidAccount: boolean; note: string }> = [
  {
    id: 'gemini', name: 'Google Gemini', requiresPaidAccount: false,
    note: 'Tier gratuito reale con limiti di frequenza. Su questo tier, prompt e risposte possono essere usati da Google per migliorare i propri modelli — per dati sensibili serve il tier a pagamento.',
  },
  {
    id: 'deepseek', name: 'DeepSeek', requiresPaidAccount: false,
    note: '5 milioni di token gratuiti alla registrazione, nessuna carta di credito richiesta.',
  },
  {
    id: 'chatgpt', name: 'ChatGPT (OpenAI)', requiresPaidAccount: true,
    note: 'Richiede una ricarica prepagata (min. $5) su platform.openai.com — nessun tier gratuito reale, anche per i modelli più economici.',
  },
  {
    id: 'claude', name: 'Claude (Anthropic)', requiresPaidAccount: true,
    note: 'Pay-as-you-go fin dal primo utilizzo su console.anthropic.com — nessun tier gratuito reale.',
  },
];

/**
 * v1.0.0 — variante di ScrollOnceTitle per campi <input> di sola lettura
 * (es. Executable Path): un <input> non supporta l'animazione via CSS
 * transform sul contenuto (il valore non è un nodo di testo manipolabile
 * come un <p>), ma supporta la manipolazione diretta di `scrollLeft` —
 * stessa identica logica di "scorri una volta, pausa, torna all'inizio"
 * di ScrollOnceTitle, riscritta per questo caso specifico. Attiva/riattiva
 * ogni volta che cambia `trigger` (tipicamente il valore stesso del
 * campo), cosi selezionare un gioco diverso o modificare il path
 * riavvia la rivelazione.
 */
function useScrollOnceOverflow(ref: React.RefObject<HTMLInputElement | null>, trigger: unknown) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth;
    el.scrollLeft = 0;
    if (overflow <= 4) return; // il testo ci sta già, nulla da fare

    let cancelled = false;
    let rafId: number | null = null;
    const scrollSpeedPxPerSec = 45; // stessa velocità di lettura di ScrollOnceTitle
    const scrollPhaseSec = overflow / scrollSpeedPxPerSec;
    const durationMs = Math.min(Math.max(scrollPhaseSec / 0.4, 3), 14) * 1000;

    const delayTimer = setTimeout(() => {
      if (cancelled) return;
      let start: number | null = null;
      const step = (ts: number) => {
        if (cancelled) return;
        if (start === null) start = ts;
        const t = Math.min((ts - start) / durationMs, 1);
        // 0-40% andata, 40-60% pausa in fondo, 60-100% ritorno — stesso
        // schema del keyframe scroll-once-reveal usato per i titoli.
        const scrollT = t < 0.4 ? t / 0.4 : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        el.scrollLeft = overflow * scrollT;
        if (t < 1) rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(delayTimer);
      if (rafId != null) cancelAnimationFrame(rafId);
    };
  }, [trigger]);
}

function MainApp() {
  // Step 19b (v1.1.38) — namespace 'settings': solo la sezione Settings è
  // stata migrata finora (vedi roadmap Step 19b per il piano di
  // migrazione sezione per sezione). Le altre stringhe dell'app restano
  // hardcoded fino alla prossima sessione dedicata.
  const { t, i18n } = useTranslation('settings');
  const [games, setGames] = useState<Game[]>([]);
  // v1.1.20 — bug confermato: la tab Store Accounts calcolava i conteggi
  // "Synced"/"Installed" per store filtrando lo stesso array `games` usato
  // dalla dashboard — che riflette QUALUNQUE filtro di navigazione attivo
  // in quel momento (store selezionato, ricerca), non l'intera libreria.
  // Navigando "Tutti i giochi" i conteggi risultavano giusti per
  // coincidenza (nessun filtro store), ma navigando un singolo store
  // (es. GOG) `games` conteneva SOLO quel sottoinsieme — gli altri store
  // mostravano sempre zero. Array dedicato, sempre non filtrato,
  // indipendente da cosa si sta navigando nella dashboard in quel momento.
  const [allGamesForAccountCounts, setAllGamesForAccountCounts] = useState<Game[]>([]);
  // Cache client-side della libreria, chiave sui parametri che ne
  // determinano il contenuto (store, ricerca, sort, genere, categoria).
  // Risolve due sintomi distinti osservati cambiando store con L1/R1/mouse:
  // - "griglia vuota per secondi" finché il fetch non risponde
  // - "resta visibile la libreria precedente" finché il fetch non risponde
  // Entrambi erano la stessa causa: nessuna cache, quindi ogni cambio
  // store doveva sempre attendere un round-trip di rete prima di mostrare
  // qualcosa di corretto. Con la cache, al cambio store mostriamo subito
  // l'ultima versione nota per quella combinazione di filtri (se esiste),
  // e la aggiorniamo silenziosamente in background quando il fetch fresco
  // risponde — nessun flash, nessun vuoto, nessuna attesa percepita per le
  // librerie già visitate in questa sessione.
  const libraryCacheRef = useRef<Map<string, Game[]>>(new Map());
  // v1.1.22 — bug reale: due percorsi indipendenti chiamano entrambi
  // `/api/games` e poi `setGames(...)` — il fetch periodico legato ad
  // activeStore/filtri (con il suo AbortController, che protegge solo
  // contro se STESSO quando i filtri cambiano) e l'handler dell'evento
  // SSE 'library-updated' (fetch separato, nessun AbortController in
  // comune con l'altro). Se il secondo fetch (avviato DOPO, con dati
  // corretti — es. appena finita un'installazione) si risolve PRIMA del
  // primo (avviato PRIMA, con dati vecchi, ma più lento a rispondere per
  // varianza di rete), il risultato vecchio sovrascrive quello corretto
  // per ultimo — e nulla lo corregge finché non arriva un ALTRO fetch,
  // che può non arrivare mai se l'utente resta sulla stessa vista.
  // Sintomo osservato: la card si aggiorna subito correttamente, poi
  // torna allo stato precedente "da sola" pochi istanti dopo, stabile
  // anche per minuti. Fix: un numero di sequenza globale — ogni fetch
  // cattura il proprio numero all'avvio, e applica il risultato a
  // `setGames` SOLO se nessun fetch più recente è stato avviato nel
  // frattempo. L'ultimo ad ESSERE AVVIATO vince sempre, non l'ultimo a
  // rispondere.
  const librarySeqRef = useRef(0);
  const buildLibraryCacheKey = useCallback((
    store: string, search: string, sort: string, order: string, genre: string, category: string
  ) => `${store}::${search}::${sort}::${order}::${genre}::${category}`, []);
  // Stato iniziale vuoto, non MOCK_STORES: usare dati finti come stato
  // iniziale di produzione causava un flash visibile all'avvio — store
  // (es. Ubisoft) che non corrispondono ai plugin realmente installati,
  // visibili per la frazione di secondo prima che /api/stores risponda
  // con l'elenco reale. I mock restano disponibili solo come fallback per
  // sviluppo/demo offline, non come default silenzioso in produzione.
  const [stores, setStores] = useState<any[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [activeStore, setActiveStore] = useState<StoreType | 'All'>('All');
  // Ref sincronizzato con activeStore: permette a cycleStore di leggere il
  // valore corrente SENZA dipendere da activeStore nel proprio useCallback.
  // Causa del bug "L1/R1 impazziti": cycleStore aveva activeStore tra le
  // dipendenze, quindi cambiava identità ad ogni cambio store; il gamepad
  // useEffect ha cycleStore tra le sue dipendenze, quindi si rimontava ad
  // ogni cambio store. Se il tasto fisico restava premuto anche solo un
  // frame in più (normale per una pressione umana), il remount dell'effect
  // poteva produrre una nuova lettura "appena premuto" prima che il rilascio
  // fisico fosse mai avvenuto — cascata di cicli fino al rilascio del tasto,
  // con direzione finale dipendente dalla durata della pressione, non
  // dall'input singolo. Con il ref, cycleStore non cambia mai identità.
  const activeStoreRef = useRef(activeStore);
  useEffect(() => { activeStoreRef.current = activeStore; }, [activeStore]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [inputDevice, setInputDevice] = useState<'controller' | 'keyboard'>('controller');
  const [viewState, setViewState] = useState<ViewState>('library');
  const [theme, setTheme] = useState<Theme>(() => {
    try { const t = localStorage.getItem('x-launcher-theme'); return (t === 'light' || t === 'dark') ? t : 'dark'; } catch { return 'dark'; }
  });
  // v2.2.17-dev.2 — richiesta utente: indicatore visivo quando si sta
  // testando col server locale invece di xdash (/opt). Necessario perché
  // in modalità kiosk/app la barra indirizzi è nascosta — la porta da
  // sola (passata da kiosk-launch.sh --local-server) non sarebbe
  // altrimenti visibile guardando la finestra. Letto una sola volta
  // all'avvio (non cambia mai durante la sessione).
  const [isLocalDevServer] = useState<boolean>(() => {
    try { return new URLSearchParams(window.location.search).get('localdev') === '1'; } catch { return false; }
  });
  // v0.99.9: isFullscreen (booleano) sostituito da displayMode a tre stati.
  // v2.1.10-dev.5 — SEMANTICA CAMBIATA: 'kiosk' ora avvia il vero --kiosk/
  // -kiosk del browser (kiosk-launch.sh, v2.1.10-dev.4) — non più
  // semplicemente una finestra massimizzata senza bordi. 'window' invariato
  // (finestra normale ridimensionabile). 'borderless' resta un valore
  // interno valido ma non più raggiungibile dal ciclo del menu (vedi
  // cycleDisplayMode più sotto) — solo per compatibilità con un vecchio
  // app.conf persistito da prima di questo cambiamento, o il flag CLI
  // --borderless: l'implementazione storica pre-dev.4 (finestra
  // massimizzata, decorazioni rimosse via trick per-DE), introdotta a
  // suo tempo per un sospetto di input lag più alto nel vero --kiosk
  // (poi confermato su hardware reale — vedi CHANGELOG-5.md — e accettato
  // consapevolmente come compromesso per il nuovo default).
  const [displayMode, setDisplayMode] = useState<'kiosk' | 'window' | 'borderless'>('kiosk');
  const [showGameOptions, setShowGameOptions] = useState(false);
  const [downloads, setDownloads] = useState<any[]>([]);
  // v0.99.35 — Set dei gameId completati che l'utente ha già "visto
  // abbastanza" — nascosti localmente dalla colonna download 6s dopo
  // il completamento, così la lista non si accumula all'infinito e
  // il messaggio di fine installazione (che funge anche da notifica,
  // vedi discussione overlay) ha il tempo di essere notato prima di
  // sparire. Il task resta comunque sul backend (storico/polling) —
  // solo la visualizzazione locale lo filtra via.
  const [hiddenCompletedIds, setHiddenCompletedIds] = useState<Set<string>>(new Set());
  // v0.99.38 — conferma a due passaggi per l'annullamento di un download:
  // cancella davvero i dati parziali su disco (vedi downloadManager.ts),
  // quindi un click singolo accidentale non deve poter buttare via ore di
  // download. null = nessuna conferma in corso, altrimenti gameId in attesa.
  const [confirmCancelDownloadId, setConfirmCancelDownloadId] = useState<string | null>(null);
  // v0.99.38 — nome macchina mostrato accanto all'avatar, al posto del
  // runner "Proton 8.0-4 Active" hardcoded che non rifletteva mai lo stato
  // reale (né il runner davvero in uso, che varia per gioco, né altro).
  // Estratto in useHostname (hooks/), vedi import in cima al file.
  const hostname = useHostname();
  const [showDownloads, setShowDownloads] = useState(false);
  // v1.5.11-dev.1 — estratto in un hook dedicato (useNotifications),
  // secondo passo di modularizzazione di App.tsx: nessun id di
  // navigazione coinvolto, solo stato e logica. Il canale SSE (che
  // gestisce anche altri eventi, non solo notifiche) resta qui sotto
  // invariato, chiama setNotifications esposto dall'hook.
  const {
    notifications,
    setNotifications,
    pushNotification,
    dismissNotification,
    resolveNotification,
    unreadCount,
  } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [expandedNotifId, setExpandedNotifId] = useState<string | null>(null);
  // Azione in attesa di conferma: { type, gameId, gameTitle }
  const [pendingAction, setPendingAction] = useState<{
    type: 'install' | 'uninstall';
    gameId: string;
    gameTitle: string;
    // v1.1.18 — snapshot delle Custom Env con switch "solo installazione"
    // spento, catturato nell'istante in cui si preme INSTALLA — non
    // ri-letto da nessuna parte al momento della conferma, a differenza
    // di winetricksVerbs/useKnownFixes (quelli hanno una copia nel DB da
    // cui ri-leggere in modo sicuro; queste variabili, per costruzione,
    // non vengono MAI scritte nel DB — l'unica copia esiste qui, nello
    // stato di questo pending action).
    installOnlyEnv?: Record<string, string>;
  } | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'engine' | 'accounts' | 'input' | 'plugins' | 'ai-models' | 'hardware'>('accounts');
  const [availableRunners, setAvailableRunners] = useState<any[]>([]);
  const [installableRunners, setInstallableRunners] = useState<any[]>([]);
  // Step 19d — stato dei launcher terzi condivisi (Ubisoft Connect/EA
  // App/Battle.net/Rockstar), usato dallo switch "Launcher condiviso" in
  // Game Options. Stesso pattern economico di availableRunners sopra:
  // /api/shared-launchers legge solo il registro dichiarativo + lo stato
  // già in DB, nessuna scansione filesystem.
  const [sharedLaunchers, setSharedLaunchers] = useState<any[]>([]);
  useEffect(() => {
    // L'endpoint restituisce già `available` (installerUrl non vuoto —
    // il launcher ha un'implementazione reale, non solo un placeholder
    // nel registro) — nessuna rimappatura necessaria qui.
    fetch('/api/shared-launchers')
      .then(r => r.ok ? r.json() : [])
      .then(data => setSharedLaunchers(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  // v0.99.90 — Step 15d: modelli Ollama disponibili sulla macchina e
  // flag di raggiungibilità. ollamaAvailable determina se la tab
  // "AI Models" compare affatto nell'header di Impostazioni — se Ollama
  // non è installato/in esecuzione non ha senso mostrare una sezione
  // vuota, "per non appesantire la navigazione di elementi inutili"
  // (richiesta esplicita). null = non ancora verificato.
  // v1.5.12-dev.1 — estratto in un hook dedicato (useAiAdvisorProviders),
  // terzo passo di modularizzazione di App.tsx: nessun id di navigazione
  // coinvolto, solo stato e logica. Stessa identica API di prima.
  const {
    ollamaAvailable,
    ollamaModels,
    activeOllamaModel,
    setActiveOllamaModel,
    ollamaEnabled,
    setOllamaEnabled,
    ollamaUsageThisMonth,
    cloudProviderState,
    setCloudProviderState,
    refreshOllamaModels,
    saveCloudProvider,
    testCloudProvider,
    removeCloudProviderKey,
  } = useAiAdvisorProviders(showSettings, CLOUD_PROVIDERS.map(p => p.id));
  // v1.1.122-dev.1 — Cloud Backup: stesso principio di cloudProviderState
  // sopra (AI Advisor), ma per i provider di backup su cloud. Un solo
  // provider oggi (Google Drive), altri in futuro — struttura già
  // generica per non doverla riscrivere quando se ne aggiunge un secondo.
  // v1.5.10-dev.1 — estratto in un hook dedicato (useCloudBackupProviders),
  // primo passo di modularizzazione di App.tsx: nessun id di navigazione
  // coinvolto, solo stato e logica. Stessa identica API di prima.
  const {
    cloudBackupProviders,
    setCloudBackupProviders,
    saveCloudBackupProvider,
    connectCloudBackupProvider,
    disconnectCloudBackupProvider,
    runCloudBackupAction,
  } = useCloudBackupProviders(showSettings);
  const [runnerInstallProgress, setRunnerInstallProgress] = useState<Record<string, string[]>>({});
  const [runnerInstalling, setRunnerInstalling] = useState<string | null>(null);
  const [runnerUninstalling, setRunnerUninstalling] = useState<string | null>(null);
  const [runnerUninstallProgress, setRunnerUninstallProgress] = useState<Record<string, string[]>>({});
  // runnerId attualmente in stato "conferma azione" (install o uninstall):
  // prima pressione di A porta qui, la seconda esegue, B annulla. Stesso
  // pattern a due tap già validato per la disconnessione store (pendingUnlink).
  const [pendingRunnerAction, setPendingRunnerAction] = useState<{ id: string; action: 'install' | 'uninstall' } | null>(null);
  // Conferma a 2 tap per la chiusura della Dashboard: stesso pattern già
  // usato per disconnessione store e disinstallazione runner — un'azione
  // distruttiva non deve mai eseguire al primo tocco.
  const [pendingExit, setPendingExit] = useState(false);
  const [systemTools, setSystemTools] = useState<Record<string, boolean | string>>({});
  const [diskUsage, setDiskUsage] = useState<{
    gamesDir: string;
    usedHuman: string; totalHuman: string; freeHuman: string; usedPercent: number;
  } | null>(null);
  const [systemTabLoaded, setSystemTabLoaded] = useState(false);
  // Store Accounts — polling OAuth
  const [authPolling, setAuthPolling] = useState<string | null>(null);   // storeId in polling
  const [authMessage, setAuthMessage] = useState<Record<string, string>>({});
  const [authUrl, setAuthUrl] = useState<Record<string, string>>({});
  // storeId attualmente in stato "conferma disconnessione": prima pressione
  // di A su una card connessa porta qui, la seconda esegue logout, B annulla.
  const [pendingUnlink, setPendingUnlink] = useState<string | null>(null);
  const [retroarchCores, setRetroarchCores] = useState<Array<{name: string; path: string}>>([]);
  // v1.0.0 — nome base (senza path/estensione) del core di default per il
  // sistema del gioco selezionato — usato per sapere a cosa "tornare"
  // quando l'utente disattiva l'override di un core alternativo.
  const [retroarchDefaultCore, setRetroarchDefaultCore] = useState<string>('');
  const [retroarchAvailable, setRetroarchAvailable] = useState<boolean | null>(null);
  // Step 4 — stato locale del profilo compat per toggle reattivi (ottimistic UI)
  const [localCompatProfile, setLocalCompatProfile] = useState<Record<string, boolean | number>>({});
  // Step 4 — stato locale config per-game per input reattivi
  const [localGameConfig, setLocalGameConfig] = useState<Record<string,string>>({});
  // Step 4 — custom env come stringa KEY=VALUE per riga
  const [customEnvText, setCustomEnvText] = useState<string>('');
  // v1.1.18 — persistenza per-riga delle Custom Env Variables. Chiave =
  // KEY della variabile (non l'indice di riga: sopravvive ad
  // aggiunta/rimozione/riordino di righe). Assente dalla mappa = true
  // (persistente) di default — comportamento identico a prima
  // dell'introduzione di questo switch per chiunque avesse già variabili
  // salvate: nessuna migrazione a sorpresa. Spento = "solo per questa
  // installazione", mai scritto nel profilo di compatibilità persistente
  // (compat_profiles), passato invece — una volta sola — al task di
  // installazione stesso, con lo stesso meccanismo già usato per
  // winetricksVerbs/useKnownFixes.
  const [customEnvPersistentFlags, setCustomEnvPersistentFlags] = useState<Record<string, boolean>>({});
  // Step 10 — dipendenze Winetricks selezionate nell'overlay
  // v1.1.119-dev.1 — spostate in wineVerbs.ts, condiviso col backend
  // (serve anche a gameManager.ts per filtrare l'output di
  // `winetricks list-installed`, vedi commento lì).
  const [winetricksVerbs, setWinetricksVerbs] = useState<string[]>(DEFAULT_WINE_VERBS);
  // v1.1.109-dev.1 — richiesta utente: vista compatta di default (solo i
  // verb consigliati) per accorciare la navigazione nell'overlay; quella
  // estesa (tutti i verb opzionali) resta disponibile a richiesta. Stato
  // puramente di visualizzazione, non salvato per-gioco — riparte
  // sempre da compatta ad ogni apertura dell'overlay, coerente con
  // l'idea che sia una scorciatoia di navigazione, non una preferenza.
  const [wineDepsExpanded, setWineDepsExpanded] = useState(false);
  // v0.99.35 — switch overlay "Disabilita sync NT veloce", persistito
  // nel compat profile come gli altri toggle (fsr/gameMode/ecc.)
  const [disableWineSync, setDisableWineSync] = useState<boolean>(false);
  // v0.99.35 — switch overlay "Usa Known Fixes (Heroic)" (v0.99.38: esteso anche a GOG)
  const [useKnownFixes, setUseKnownFixes] = useState<boolean>(false);
  // Step 11 — versione runner corrente per il gioco selezionato
  const [runnerVersion, setRunnerVersion] = useState<string>('');
  
  const [isGamescope, setIsGamescope] = useState(false);
  const [showDebugConsole, setShowDebugConsole] = useState(false); // Step 13 UI: nascosta di default
  // Step 12f — Log console avanzata
  const [logFilter, setLogFilter] = useState<Set<string>>(new Set());   // set vuoto = mostra tutto
  // Step 13 UI — avatar utente e menu profilo rapido
  // Step 19a (v1.1.86) — non più letto da localStorage all'avvio (era
  // per-browser, azzerato in Firefox da --private-window): popolato dal
  // fetch di boot di /api/config, insieme al resto della configurazione
  // persistita lato server.
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  // Richiesta utente — "auto-remaster": il core stesso è l'interruttore
  // (verificato passo per passo a mano su hardware reale, primo caso
  // PSX). Generalizzato per sistemi futuri (N64/Saturn/Dreamcast/PS2,
  // rimandati) — REMASTER_HINT_BY_SYSTEM sotto va tenuta in sync con
  // REMASTER_PRESETS in classicPlugin.ts quando se ne aggiunge uno.
  const [remasterToggling, setRemasterToggling] = useState(false);
  // Persistenza lato server, sostituisce i precedenti localStorage.setItem/
  // removeItem diretti nei quattro punti che modificano l'avatar — un solo
  // posto invece di duplicare lo stesso fetch quattro volte.
  const persistAvatarUrl = (url: string | null) => {
    fetch('/api/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarUrl: url }),
    }).catch(() => {});
  };
  const [showAvatarLibrary, setShowAvatarLibrary] = useState(false);
  const [showProcessManager, setShowProcessManager] = useState(false);
  // v2.1.10-dev.12 — splash di lancio integrata nella Dashboard (prima
  // una finestra browser separata, vedi splashOrchestrator.ts per la
  // storia completa). splashInfo è null quando la splash non è visibile
  // — un solo stato invece di showSplash+campi separati, per non poter
  // mai avere campi "vecchi" visibili un frame dopo che showSplash è
  // già tornato false.
  const [splashInfo, setSplashInfo] = useState<{
    gameId: string;
    gameTitle: string;
    phase: 'launching' | 'verifying-env' | 'done' | 'failed' | 'timeout' | 'cancelled';
    store?: string;
    index?: number;
    total?: number;
    detail?: string;
  } | null>(null);
  const splashEventSourceRef = useRef<EventSource | null>(null);
  const [processManagerList, setProcessManagerList] = useState<Array<{ unit: string; kind: 'game' | 'shared-launcher'; id: string; title: string; startedAt: number }>>([]);
  const [pendingKillUnit, setPendingKillUnit] = useState<string | null>(null);
  // v1.5.20-dev.12 — Fase A.4: file manager nativo controller-navigabile,
  // sostituisce zenity/kdialog quando inputDevice === 'controller' (quei
  // dialog nativi non rispondono affatto al gamepad). fileBrowserContext
  // porta il gameId e il filtro estensioni di CHI ha aperto l'overlay —
  // VirtualKeyboard insegna che tenere il "chi/perché" fuori dal
  // componente generico paga, stesso principio qui.
  // v2.0.41-dev.1 — richiesta utente: SECONDO chiamante reale (prima
  // "Sfoglia" per un installer in attesa era l'unico) — richiamo dalla
  // tastiera virtuale per correggere Executable Path. `purpose` distingue
  // cosa fare alla conferma di un file (vedi confirmFileBrowserSelection
  // e closeFileBrowser sotto): 'installer' invariato, 'executable' nuovo.
  const [showFileBrowser, setShowFileBrowser] = useState(false);
  const [fileBrowserPath, setFileBrowserPath] = useState<string | null>(null);
  const [fileBrowserParentPath, setFileBrowserParentPath] = useState<string | null>(null);
  const [fileBrowserEntries, setFileBrowserEntries] = useState<{ name: string; isDirectory: boolean; sizeBytes: number | null; mtimeMs: number | null }[]>([]);
  const [fileBrowserFilterOn, setFileBrowserFilterOn] = useState(true);
  const [fileBrowserQuickLinks, setFileBrowserQuickLinks] = useState<{ home: string; downloads: string | null; removableMedia: string | null }>({ home: '', downloads: null, removableMedia: null });
  const [fileBrowserContext, setFileBrowserContext] = useState<{ purpose: 'installer' | 'executable'; gameId: string; extensions: string[] } | null>(null);
  const [fileBrowserError, setFileBrowserError] = useState<string | null>(null);

  // Plugin manager
  // v1.5.14-dev.1 — estratto in un hook dedicato (useStorePluginRegistry),
  // quinto passo di modularizzazione di App.tsx: nessun id di navigazione
  // coinvolto, solo stato e logica.
  const { pluginRegistry, setPluginRegistry, pluginLoadError, loadPluginRegistry } = useStorePluginRegistry(activeSettingsTab);

  // Input manager — dispositivi connessi e plugin
  // v1.5.13-dev.1 — estratto in un hook dedicato (useInputDevices),
  // quarto passo di modularizzazione di App.tsx: nessun id di
  // navigazione coinvolto, solo stato e un effetto autonomo.
  const { inputPlugins, setInputPlugins, connectedDevices } = useInputDevices(activeSettingsTab);
  // v1.1.12 — la parte introduttiva di ogni tab (es. il banner
  // "funzione sperimentale" in AI Advisor) restava nascosta se lo scroll
  // del corpo era già avanzato da un'altra tab o da un focus profondo
  // nella stessa tab (es. focus corretto sul modello installato più in
  // basso, ma contenuto scrollato oltre l'intestazione). Il focus era
  // giusto, lo scroll visivo no — due cose distinte che devono essere
  // sincronizzate esplicitamente ad ogni cambio tab.
  const settingsBodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // v1.1.14 — 280ms non bastava: il cambio tab imposta il focus con un
    // suo setTimeout(50ms) PRIMA che l'animazione di centraggio di
    // FocusProvider parta (che a sua volta parte dopo altri 30ms e dura
    // 220ms) — il conto reale è 50+30+220=300ms dal cambio tab, non 250.
    // Margine ulteriore per sicurezza.
    const t = setTimeout(() => {
      if (settingsBodyRef.current) settingsBodyRef.current.scrollTop = 0;
    }, 400);
    return () => clearTimeout(t);
  }, [activeSettingsTab]);

  // v1.1.20 — fetch dedicato e sempre non filtrato per i conteggi reali
  // di Store Accounts, indipendente da qualunque filtro di navigazione
  // della dashboard attivo in quel momento. Si attiva quando la tab
  // Accounts diventa visibile (apertura Impostazioni su quella tab, o
  // cambio verso quella tab a modal già aperto) — non ad ogni apertura di
  // Impostazioni su una tab diversa, per non fare una fetch inutile.
  useEffect(() => {
    if (!showSettings || activeSettingsTab !== 'accounts') return;
    fetch('/api/games?store=All')
      .then(r => r.ok ? r.json() : [])
      .then(setAllGamesForAccountCounts)
      .catch(() => {});
  }, [showSettings, activeSettingsTab]);
  // v1.1.8 — modalità cattura dell'area di test controller: progresso
  // 0-1 della pressione prolungata di B necessaria per uscire, esposto a
  // GamepadTester per la barra di avanzamento. Il ref (non lo stato)
  // tiene il timestamp di inizio pressione: serve solo al calcolo interno
  // nel loop di polling, non deve causare re-render da solo.
  const [gamepadTestExitProgress, setGamepadTestExitProgress] = useState(0);
  const gamepadTestBHoldStartRef = useRef<number | null>(null);
  const GAMEPAD_TEST_EXIT_HOLD_MS = 1000;
  // v1.1.11 — breve ritardo fra "soglia raggiunta" e uscita effettiva:
  // dà il tempo di vedere il LED passare a verde prima che il focus si
  // sposti davvero fuori dall'area, invece di saltare al menu X-Launcher
  // nello stesso istante in cui il giallo termina.
  const [gamepadTestExiting, setGamepadTestExiting] = useState(false);
  const GAMEPAD_TEST_EXIT_DELAY_MS = 400;
  const [avatarFiles, setAvatarFiles] = useState<Array<{ filename: string; url: string }>>([]);
  const [avatarDir, setAvatarDir] = useState<string>('~/.local/share/x-launcher/avatars');
  const [pauseScroll, setPauseScroll] = useState(false);
  const [isFetchingLibrary, setIsFetchingLibrary] = useState(false);
  const [appVersion, setAppVersion] = useState('v2.2.19-dev.7');
  const logScrollRef = useRef<HTMLDivElement>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  // FIX v0.99.8: rimosso lo stato previousActiveStore — serviva solo al
  // rollback "torna allo store di partenza" alla chiusura della ricerca,
  // comportamento ora eliminato (vedi toggleSearch) perché impediva un
  // workflow utile: cercare un titolo cross-store con L1/R1 mentre il
  // filtro resta attivo, e chiudere la ricerca restando sullo store dove
  // il titolo è stato effettivamente trovato.
  const [sortBy, setSortBy] = useState<'title' | 'playTime' | 'rating' | 'installDate'>('title');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  // Step 13 UI — filtri per-store indipendenti
  // Struttura: Record<storeId|'All', { genre, category, onlyInstalled }>
  const [storeFilters, setStoreFilters] = useState<Record<string, { genre: string; category: string; onlyInstalled: boolean }>>({
    'All': { genre: '', category: '', onlyInstalled: true }, // default: solo installati
  });
  const currentFilter = storeFilters[activeStore] ?? { genre: '', category: '', onlyInstalled: false };
  const selectedGenre    = currentFilter.genre;
  const selectedCategory = currentFilter.category;
  const onlyInstalled    = currentFilter.onlyInstalled;

  // v1.1.24 — stesso motivo/pattern di activeStoreRef (sopra): servono
  // all'effetto SSE 'library-updated' più sotto, che deve restare una
  // connessione persistente (mai chiusa/riaperta ad ogni cambio di
  // store/filtro — vedi commento su quell'effetto) e quindi non può
  // leggere questi valori dalla propria closure di montaggio, che
  // sarebbe sempre quella iniziale. searchQuery/sortBy/sortOrder sono
  // dichiarati poco più sotto in questo stesso file — dichiarare qui il
  // ref e popolarlo nel prossimo useEffect utile dopo la loro
  // dichiarazione evita l'errore "usato prima della dichiarazione"
  // (TS2448) già visto e corretto altrove in questa sessione.
  const selectedGenreRef = useRef(selectedGenre);
  useEffect(() => { selectedGenreRef.current = selectedGenre; }, [selectedGenre]);
  const selectedCategoryRef = useRef(selectedCategory);
  useEffect(() => { selectedCategoryRef.current = selectedCategory; }, [selectedCategory]);
  const showGameOptionsRef = useRef(showGameOptions);
  useEffect(() => { showGameOptionsRef.current = showGameOptions; }, [showGameOptions]);
  const searchQueryRef = useRef(searchQuery);
  useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);
  const sortByRef = useRef(sortBy);
  useEffect(() => { sortByRef.current = sortBy; }, [sortBy]);
  const sortOrderRef = useRef(sortOrder);
  useEffect(() => { sortOrderRef.current = sortOrder; }, [sortOrder]);

  // Step 18 (v1.1.37) — punto unico di fetch per la libreria giochi.
  //
  // Prima di questa funzione, cinque punti indipendenti chiamavano
  // `/api/games` e poi `setGames(...)` per conto proprio: l'effetto
  // legato ad activeStore/filtri, l'handler SSE 'library-updated', il
  // login store, il logout store, il polling OAuth — ciascuno con la
  // propria copia della logica di guard di sequenza/cache/riconciliazione
  // selezione, a rischio di divergere ad ogni nuova modifica (vedi
  // roadmap, Step 18). login/logout/polling sono stati poi eliminati del
  // tutto come chiamanti diretti (v. sotto) perché `loginToStore`/
  // `logoutFromStore`/`POST /api/library/refresh` scatenano comunque
  // `refreshLibrary()` lato server, che a sua volta emette l'evento SSE
  // 'library-updated' — l'handler SSE (che ora passa da qui) copre già
  // quei tre casi. Restano quindi due soli chiamanti reali: l'effetto
  // filtri e l'handler SSE.
  //
  // `mergeStrategy: 'merge-by-store'` resta disponibile per un futuro
  // punto che avesse davvero bisogno di aggiornare solo le entry di uno
  // store specifico senza toccare le altre (il vecchio comportamento del
  // logout, rimosso qui perché non protegge nulla che non sia già coperto
  // da `allGamesForAccountCounts` — vedi analisi condivisa prima di
  // questo fix) — non rimosso dalla funzione condivisa per non dover
  // reintrodurlo da capo se dovesse servire altrove.
  const refreshGamesList = useCallback(async (opts: {
    store?: string;
    useCurrentFilters?: boolean;
    signal?: AbortSignal;
    mergeStrategy?: 'replace' | 'merge-by-store';
    clearCacheFirst?: boolean;
    reconcileSelection?: boolean;
    showLoadingIndicator?: boolean;
  } = {}): Promise<Game[] | null> => {
    const {
      store = activeStoreRef.current || 'All',
      useCurrentFilters = false,
      signal,
      mergeStrategy = 'replace',
      clearCacheFirst = false,
      reconcileSelection = true,
      showLoadingIndicator = false,
    } = opts;

    if (clearCacheFirst) libraryCacheRef.current.clear();

    const search   = useCurrentFilters ? (searchQueryRef.current || '') : '';
    const sortByV  = useCurrentFilters ? (sortByRef.current || 'title') : 'title';
    const orderV   = useCurrentFilters ? (sortOrderRef.current || 'asc') : 'asc';
    const genre    = useCurrentFilters ? (selectedGenreRef.current || '') : '';
    const category = useCurrentFilters ? (selectedCategoryRef.current || '') : '';

    const params = new URLSearchParams();
    params.append('store', store);
    params.append('search', search);
    params.append('sortBy', sortByV);
    params.append('order', orderV);
    if (genre)    params.append('genre', genre);
    if (category) params.append('category', category);

    // Stesso guard di sequenza già in uso da v1.1.22: ogni chiamata
    // cattura il proprio numero all'avvio, e il risultato viene applicato
    // SOLO se nessuna chiamata più recente è partita nel frattempo —
    // l'ultimo fetch AVVIATO vince sempre, non l'ultimo a rispondere.
    const mySeq = ++librarySeqRef.current;
    let newGames: Game[];
    try {
      if (showLoadingIndicator) setIsFetchingLibrary(true);
      const res = await fetch(`/api/games?${params.toString()}`, { signal });
      if (!res.ok) return null;
      newGames = await res.json();
    } catch (err: any) {
      if (err?.name === 'AbortError') return null;
      console.error('Failed to fetch library:', err);
      return null;
    } finally {
      if (showLoadingIndicator) setIsFetchingLibrary(false);
    }

    if (mySeq !== librarySeqRef.current) {
      // Un fetch più recente è già partito: questo risultato non è più
      // il più aggiornato disponibile, scartato per non sovrascrivere
      // dati più freschi con dati superati.
      return null;
    }

    if (mergeStrategy === 'merge-by-store') {
      setGames(prev => [...prev.filter(g => g.store !== store), ...newGames]);
    } else {
      setGames(newGames);
    }

    libraryCacheRef.current.set(
      buildLibraryCacheKey(store, search, sortByV, orderV, genre, category),
      newGames
    );

    if (reconcileSelection && mergeStrategy !== 'merge-by-store') {
      setSelectedGameId(prev => {
        // Overlay aperto → non toccare mai la selezione corrente
        if (showGameOptionsRef.current) return prev;
        // Nessuna selezione reale non deve produrne una finta (v0.99.38)
        if (!prev) return '';
        // La card Big Picture è virtuale, mai in newGames (v0.99.37)
        if (prev === STEAM_BIG_PICTURE_ID) return prev;
        const stillExists = newGames.some((g: any) => g.id === prev);
        return stillExists ? prev : (newGames[0]?.id || '');
      });
    }

    return newGames;
  }, [buildLibraryCacheKey]);

  const setStoreFilter = (key: 'genre' | 'category' | 'onlyInstalled', value: string | boolean) => {
    setStoreFilters(prev => ({
      ...prev,
      [activeStore]: { ...(prev[activeStore] ?? { genre: '', category: '', onlyInstalled: false }), [key]: value },
    }));
  };
  const setSelectedGenre    = (v: string)  => setStoreFilter('genre', v);
  const setSelectedCategory = (v: string)  => setStoreFilter('category', v);
  const setOnlyInstalled    = (v: boolean) => setStoreFilter('onlyInstalled', v);
  const [showSearch, setShowSearch] = useState(false);
  // Ref diretto all'input di ricerca (v0.99.4): usato da
  // openSearchWithPhysicalInput per portare il focus nativo del browser
  // sul campo reale quando l'apertura avviene da mouse/tastiera fisica,
  // senza passare dalla Virtual Keyboard.
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showKeyboard, setShowKeyboard] = useState(false);
  // v1.5.20-dev.5 — posizione del cursore riportata da VirtualKeyboard
  // (vedi onCursorChange lì) — usata SOLO per disegnare il cursore nel
  // riquadro fluttuante sotto, l'editing vero resta interamente dentro
  // VirtualKeyboard.tsx. null finché non arriva il primo report (subito
  // dopo il mount) — il fallback nel render usa comunque la fine della
  // stringa corrente in quel breve intervallo, nessun lampo visibile.
  const [vkCursorPos, setVkCursorPos] = useState<number | null>(null);

  const { focusedId, setFocusedId, moveFocus, setFocusFrozen, isFocusFrozen, activeGroup, setActiveGroup, triggerFocusedAction, focusFirstInGroup, cycleSequential, setGroupStrategy } = useFocus();
  // Ref sincronizzato con focusedId: stesso motivo di activeStoreRef.
  // L'effect gamepad principale aveva focusedId tra le proprie dipendenze,
  // ma cycleStore (e altre azioni) chiamano setFocusedId al loro interno —
  // quindi anche dopo aver stabilizzato l'identità di cycleStore, il solo
  // CAMBIO DI VALORE di focusedId rimontava comunque l'intero effect ad ogni
  // selezione, riproponendo lo stesso loop di auto-rialimentazione su
  // pressione prolungata del tasto fisico. Leggendo dal ref invece che dalla
  // dipendenza diretta, l'effect non si rimonta più per questo motivo.
  const focusedIdRef = useRef(focusedId);
  useEffect(() => { focusedIdRef.current = focusedId; }, [focusedId]);
  // v2.1.11-dev.3 — BUG UTENTE: alla chiusura del gioco la navigazione
  // restava bloccata finché non si apriva e richiudeva il quick-menu con
  // Start. Causa reale: openSplashEventSource imposta activeGroup='splash'
  // (per isolare l'overlay di caricamento dalla dashboard sottostante) ma
  // closeSplash non lo riportava MAI a null — restava 'splash' anche a
  // splash ormai smontata. moveFocus usa `activeGroup ?? 'dashboard'` come
  // pool: con activeGroup ancora 'splash' e nessun Focusable di quel group
  // più montato, il pool risultava vuoto e moveFocus non produceva alcun
  // movimento — esattamente "input che non risponde", pur con
  // isFocusFrozen già tornato false al termine reale del gioco. Aprire e
  // richiudere il quick-menu con Start "sistemava" tutto per puro
  // effetto collaterale: il ramo apertura imposta activeGroup='quick-menu'
  // (sovrascrivendo 'splash'), la chiusura lo riporta a null. Stesso ref
  // usato sopra per lo stesso motivo (closure altrimenti stale in
  // closeSplash, che è invocata da un setTimeout/listener SSE creato una
  // volta sola in openSplashEventSource).
  const activeGroupRef = useRef(activeGroup);
  useEffect(() => { activeGroupRef.current = activeGroup; }, [activeGroup]);
  // Stesso motivo dei ref precedenti: pendingUnlink cambia ad ogni
  // interazione di conferma/annulla disconnessione store, ed essendo
  // dipendenza dell'effect gamepad principale ne causerebbe il remount ad
  // ogni singola pressione di A/B su quella card.
  const pendingUnlinkRef = useRef(pendingUnlink);
  useEffect(() => { pendingUnlinkRef.current = pendingUnlink; }, [pendingUnlink]);
  // Se il focus si allontana dalla card in stato "conferma disconnessione"
  // (es. l'utente naviga con il D-pad invece di premere B), annulla
  // automaticamente la conferma pendente invece di lasciarla armata in modo
  // silenzioso e potenzialmente confuso.
  useEffect(() => {
    if (pendingUnlink && focusedId !== `store-unlink-${pendingUnlink}`) {
      setPendingUnlink(null);
    }
  }, [focusedId, pendingUnlink]);
  // Stesso motivo e stesso pattern per pendingRunnerAction (conferma
  // install/uninstall runner): ref per non rimontare l'effect gamepad ad
  // ogni singola pressione di A/B, più reset automatico se il focus si
  // allontana dalla riga del runner in questione senza che l'utente abbia
  // premuto B esplicitamente.
  const pendingRunnerActionRef = useRef(pendingRunnerAction);
  useEffect(() => { pendingRunnerActionRef.current = pendingRunnerAction; }, [pendingRunnerAction]);
  useEffect(() => {
    if (!pendingRunnerAction) return;
    const expectedId = pendingRunnerAction.action === 'install'
      ? `runner-install-${pendingRunnerAction.id}`
      : `runner-uninstall-${pendingRunnerAction.id}`;
    if (focusedId !== expectedId) {
      setPendingRunnerAction(null);
    }
  }, [focusedId, pendingRunnerAction]);
  const pendingExitRef = useRef(pendingExit);
  useEffect(() => { pendingExitRef.current = pendingExit; }, [pendingExit]);
  useEffect(() => {
    if (pendingExit && focusedId !== 'opt-exit') {
      setPendingExit(false);
    }
  }, [focusedId, pendingExit]);
  // v2.0.41-dev.53 — Process Manager, step 4: stesso identico principio
  // di pendingExit qui sopra — il focus che si sposta via dal pulsante
  // annulla la conferma armata, non serve tenerla per un'altra riga.
  useEffect(() => {
    if (pendingKillUnit && focusedId !== `pm-kill-${pendingKillUnit}`) {
      setPendingKillUnit(null);
    }
  }, [focusedId, pendingKillUnit]);
  // v2.1.10-dev.2 — Punto 2 roadmap: rispecchia in un ref (letto dal
  // gate isFocusFrozen più sotto) se il gioco tracciato da handlePlay è
  // ancora considerato in esecuzione, aggiornato dallo stesso identico
  // polling che già gestisce isFocusFrozen — nessun secondo timer.
  // Serve a decidere se la combo Select+◄/► (ritorno al gioco) ha senso:
  // ha senso SOLO se isFocusFrozen è già tornato false (es. dopo un
  // risveglio con Select+L1+R1) ma il gioco non è nel frattempo chiuso
  // per conto suo.
  const gameStillRunningRef = useRef(false);

  // v2.1.10-dev.8 — diagnostica per il bug segnalato dall'utente
  // (Select+◄/► congela la Dashboard con più finestre aperte, dopo il
  // passaggio al vero --kiosk in dev.4). logDiag scrive nella stessa
  // Debug Console (Ctrl+H) che già mostra i log del backend — vedi
  // POST /api/logs in server.ts — così le voci di qui e quelle di
  // windowFocus.ts finiscono nello stesso pannello, ordinabili per
  // timestamp. useCallback con deps vuote: riferimento stabile, non
  // fa scattare inutilmente il grande effetto gamepad più sotto che la
  // userà nei due punti di attivazione delle combo.
  const logDiag = useCallback((message: string) => {
    fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, type: 'debug' }),
    }).catch(() => {});
  }, []);

  // Verifica diretta dell'Ipotesi B (vero --kiosk gestisce diversamente
  // la perdita di focus verso un'altra applicazione, fermando il loop
  // RAF del gamepad — vedi useGamepad.ts — come se la finestra fosse
  // stata minimizzata invece che semplicemente coperta): se durante il
  // bug segnalato dall'utente questo listener registra
  // hidden=true/visibilityState='hidden' nel momento esatto in cui la
  // Dashboard smette di rispondere anche alla combo di risveglio
  // Select+L1+R1, l'ipotesi è confermata — il loop stesso si è fermato,
  // non è un problema di isFocusFrozen o di riconoscimento finestre.
  useEffect(() => {
    const handler = () => {
      logDiag(`[DIAG] visibilitychange → hidden=${document.hidden}, visibilityState=${document.visibilityState}`);
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [logDiag]);

  const { state: gamepadState, isJustPressed } = useGamepad();
  const { play } = useAudio();

  // Gestione tastiera on-screen generalizzata:
  // activeField identifica quale campo è in editing, fieldValue è il valore corrente,
  // onFieldCommit è la callback chiamata al Done per persistere il valore.
  const [activeField, setActiveField] = useState<{
    id: string;
    label: string;
    value: string;
    onCommit: (val: string) => void;
    // v0.99.90 — generalizzato: prima era sempre 'game-options' (unico
    // contesto che usava questo meccanismo finora). Con la tastiera
    // richiamabile anche da Impostazioni (campo budget token) serve
    // tornare al gruppo giusto alla chiusura, non sempre allo stesso.
    returnGroup: string;
  } | null>(null);

  // v1.1.16 — tip del suggerimento (Shift) attualmente a fuoco sulla
  // tastiera virtuale, mostrato nell'intestazione del campo fluttuante.
  // Reset esplicito ad ogni apertura di un campo diverso: senza, il tip
  // dell'ultimo suggerimento sfogliato in un campo resterebbe visibile
  // (sbagliato) appena se ne apre un altro, prima ancora che l'utente
  // tocchi Shift o sfogli qualcosa nel nuovo campo.
  const [suggestionTip, setSuggestionTip] = useState<string | undefined>(undefined);

  // Apre la tastiera on-screen per un campo specifico
  const openKeyboardForField = useCallback((
    id: string,
    label: string,
    currentValue: string,
    onCommit: (val: string) => void,
    returnGroup: string = 'game-options'
  ) => {
    setActiveField({ id, label, value: currentValue, onCommit, returnGroup });
    setSuggestionTip(undefined);
    setShowKeyboard(true);
    setActiveGroup('keyboard');
    play('select');
  }, [play, setActiveGroup]);

  // Chiude la tastiera, committa il valore e torna allo scope da cui è
  // stata aperta (Game Options o Impostazioni — vedi returnGroup sopra).
  const closeKeyboard = useCallback(() => {
    const fieldId = activeField?.id;
    const returnGroup = activeField?.returnGroup ?? 'game-options';
    if (activeField) {
      activeField.onCommit(activeField.value);
    }
    setShowKeyboard(false);
    setActiveField(null);
    setSuggestionTip(undefined);
    setActiveGroup(returnGroup);
    if (fieldId) setTimeout(() => setFocusedId(fieldId), 50);
  }, [activeField, setActiveGroup, setFocusedId]);

  // Unica fonte di verità per il focus iniziale della tastiera: si attiva
  // quando showKeyboard diventa true, indipendentemente da quale percorso
  // l'ha aperta (ricerca o campo dell'overlay Game Options).
  // Il focus iniziale va su 'key-done', NON su un tasto-lettera: se un
  // residuo di pressione A (rimbalzo del tasto fisico, comune su controller
  // Bluetooth) viene letto come "appena premuto" anche nel frame
  // immediatamente successivo all'apertura, finire su 'key-1-Q' significava
  // scrivere "q" involontariamente — da cui le sequenze "qqqq" osservate.
  // 'key-done' è sicuro: un A residuo lì chiude semplicemente la tastiera
  // senza scrivere nulla, comportamento comunque recuperabile dall'utente.
  // Richiesta utente: focus iniziale sulla lettera "Q" quando la tastiera
  // si apre. FIX di un riferimento morto trovato mentre si applicava
  // questa richiesta: puntava a 'key-done', un pulsante "Fatto" che non
  // esiste più da quando la tastiera è stata ridisegnata a 4 righe con
  // Invio che chiude (vedi il commento sul layout più in alto in
  // VirtualKeyboard.tsx: "nessun pulsante Fatto separato, ridondante") —
  // setFocusedId('key-done') non stava più puntando a nulla, quindi la
  // protezione anti-rimbalzo descritta qui sotto in origine non era già
  // più realmente in funzione. 'key-1-Q-0' è l'id reale della Q, identico
  // in entrambi i layout IT/EN (keyId(1, keyDef, 0) da
  // VirtualKeyboard.tsx — Q è sempre il primo tasto della riga QWERTY).
  // La protezione contro un rimbalzo residuo del tasto A è stata spostata
  // dentro VirtualKeyboard.tsx stesso (breve finestra di grazia dopo il
  // montaggio, vedi lì) invece di evitare la Q come bersaglio iniziale.
  useEffect(() => {
    if (showKeyboard) {
      setFocusedId('key-1-Q-0');
      play('focus');
    }
  }, [showKeyboard, setFocusedId, play]);

  // When closing search, restore view or just clear query
  useEffect(() => {
    if (!showSearch) {
      setSearchQuery('');
      // v1.5.20-dev.8 — bug reale segnalato dall'utente: selezionare un
      // tag genere/categoria nella ricerca (v1.5.20-dev.7) e poi chiudere
      // con Y lasciava il filtro attivo, mentre il testo digitato veniva
      // già azzerato qui sopra — un'asimmetria concettuale (sia il testo
      // che i tag sono filtri della STESSA ricerca, dovrebbero avere la
      // stessa sorte alla chiusura). Stesso trattamento del testo.
      setSelectedGenre('');
      setSelectedCategory('');
    }
  }, [showSearch]);

  // Chiude la libreria avatar quando si cambia store o libreria
  useEffect(() => {
    setShowAvatarLibrary(false);
  }, [activeStore]);

  // Refresh on-demand della libreria (v0.99.4): forza il daemon a
  // ri-scansionare i plugin (filesystem ROM, stato install Epic/GOG, ecc.)
  // ad ogni apertura/cambio di store, al posto di un solo polling periodico
  // fisso indipendente da cosa l'utente sta effettivamente guardando.
  // Isolato in un effect dedicato — legato solo ad activeStore, non a
  // sort/search/genere/categoria, che filtrano la stessa libreria già
  // scansionata e non richiedono un nuovo scan dei plugin. Fire-and-forget:
  // la libreria fresca arriva via SSE (library-updated) non appena il
  // backend completa lo scan; se il refresh fallisce, il fetch principale
  // (altro effect) mostra comunque l'ultimo stato noto sul DB.
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/library/refresh', { method: 'POST', signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [activeStore]);

  // Seleziona automaticamente la prima card all'apertura/cambio di libreria
  // (v0.99.4). Triggerato SOLO da un cambio reale di activeStore (tracciato
  // con un ref, confrontato contro il valore precedente) — non da
  // activeGroup che torna a null: quest'ultimo accade anche alla chiusura
  // di un qualunque overlay (Game Options, Settings, ecc.), e in quel caso
  // closeGameOptions/equivalenti riportano già correttamente il focus sulla
  // card che l'utente stava guardando — selezionare di nuovo la prima card
  // in quel momento avrebbe scavalcato quel comportamento, "rubando" il
  // focus indietro ogni volta che si chiude un pannello.
  // Riusa lo stesso meccanismo di scoring (priorità + posizione, "più in
  // alto poi più a sinistra") già usato dal fallback automatico di
  // moveFocus e dall'apertura overlay — qui invocato esplicitamente perché
  // il cambio libreria non passa da moveFocus, quindi nessun input
  // direzionale lo innescherebbe spontaneamente.
  const previousStoreForFocusRef = useRef(activeStore);
  useEffect(() => {
    if (previousStoreForFocusRef.current === activeStore) return;
    previousStoreForFocusRef.current = activeStore;
    if (activeGroup !== null) return; // un overlay è aperto, nessuna interferenza
    // Piccolo delay: le card del nuovo store devono prima montare i loro
    // Focusable nel registry (filteredVisibleGames deriva da `games`, che
    // arriva da un fetch asincrono dopo il cambio di activeStore).
    const t = setTimeout(() => focusFirstInGroup('dashboard'), 80);
    return () => clearTimeout(t);
  }, [activeStore, activeGroup, focusFirstInGroup]);

  // Ping al boot per garantire che la cartella avatars venga creata dal server
  useEffect(() => {
    fetch('/api/avatars').catch(() => {});
  }, []);

  // Richiesta utente — Info Hardware: un solo fetch alla prima apertura
  // della tab (systemInfo resta null finché non è mai stata aperta),
  // non ad ogni riselezione. Estratto in useSystemInfo (hooks/), vedi
  // import in cima al file.
  const systemInfo = useSystemInfo(activeSettingsTab);

  // v1.5.4-dev.1 — REIMPLEMENTATO su richiesta esplicita dell'utente,
  // dopo il bug v1.1.87 (vedi storico sotto): questa volta la fonte è
  // /api/version, corretto per leggere package.json invece di
  // metadata.json. package.json viene aggiornato ad OGNI singola
  // modifica di sviluppo (non solo ai congelamenti di milestone come
  // metadata.json) — stessa idea di prima, fonte finalmente corretta.
  // Il letterale useState sopra resta come valore iniziale/fallback,
  // sostituito da questo fetch appena disponibile — non più l'unica
  // fonte di verità come dopo la rimozione del 2026.
  //
  // v1.1.87 — STORICO DEL BUG ORIGINALE (per non ripeterlo): un effect
  // precedente sovrascriveva silenziosamente appVersion con quello letto
  // da /api/version, che ALLORA leggeva metadata.json — toccato SOLO nei
  // congelamenti di milestone (RC3, poi Gaia), mai nei fix quotidiani:
  // rimasto fermo al valore della primissima build, con l'effetto che
  // ogni aggiornamento fatto in sessione veniva scartato al caricamento
  // della pagina. La causa reale non era il demone né la build (entrambi
  // verificati corretti all'epoca) ma questa fonte sbagliata.
  useEffect(() => {
    fetch('/api/version')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.version) {
          setAppVersion(data.version.startsWith('v') ? data.version : `v${data.version}`);
        }
      })
      .catch(() => {}); // silenzioso: il letterale sopra resta come fallback
  }, []);

  // Sincronizza displayMode con la preferenza persistita: kiosk-launch.sh
  // ha già deciso con quali flag lanciare il browser in base a questo
  // stesso valore, quindi il menu deve mostrare lo stato reale invece di
  // ripartire sempre da 'kiosk' indipendentemente da come la Dashboard è
  // stata effettivamente avviata.
  //
  // v0.99.26 — Letto anche `dedicatedSession`: true se kiosk-launch.sh ha
  // rilevato di girare come sessione X11 dedicata (selezionabile dal menu
  // sessioni di LightDM, x-launcher.desktop), senza xfwm4/XFCE sotto. In
  // quel caso "Window" non ha senso nel menu Display Mode — non esiste un
  // desktop su cui mostrare una finestra normale — sostituito da una voce
  // "Console Mode" che fa uno switch di sessione LightDM verso XFCE.
  const [dedicatedSession, setDedicatedSession] = useState(false);
  // Step 19b (v1.1.49) — bug confermato dall'utente al primo avvio a
  // freddo dopo il login: il fetch di /api/config qui sotto, su un boot a
  // freddo, può risolversi MOLTO più tardi del solito (filesystem/rete
  // ancora "a freddo"). Se l'utente raggiunge Settings e preme il
  // selettore di lingua PRIMA che questo fetch risolva, il cambio manuale
  // avviene correttamente (i18n.changeLanguage + suono) — ma quando il
  // fetch finalmente risolve, questo effetto chiamava comunque
  // i18n.changeLanguage(d.language) con il valore PERSISTITO (quello di
  // prima, non quello appena scelto), silenziosamente annullando la
  // scelta manuale un istante dopo, senza alcun suono o feedback visivo
  // che lo segnalasse — da qui l'impressione di "il selettore non
  // risponde". Ai riavvii successivi il fetch è quasi istantaneo
  // (filesystem/rete "caldi"), risolve ben prima che l'utente possa anche
  // solo aprire Settings, quindi la corsa non si manifesta mai. Il ref
  // impedisce a questo effetto di sovrascrivere una scelta manuale
  // avvenuta nel frattempo.
  const userChangedLanguageRef = useRef(false);
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(d => {
      if (d.displayMode === 'kiosk' || d.displayMode === 'window' || d.displayMode === 'borderless') {
        setDisplayMode(d.displayMode);
      } else if (typeof d.fullscreen === 'boolean') {
        // Retrocompatibilità: app.conf scritto da una versione precedente
        // a v0.99.9, senza displayMode — il backend lo deriva già in
        // appConfig.ts, ma per sicurezza lo deriviamo anche qui se per
        // qualche motivo arrivasse solo il vecchio campo.
        setDisplayMode(d.fullscreen ? 'kiosk' : 'window');
      }
      setDedicatedSession(d.dedicatedSession === true);
      if (d.avatarUrl !== undefined) setAvatarImage(d.avatarUrl);
      // Step 19b (v1.1.38, guardia aggiunta in v1.1.49, autorilevamento in
      // v1.1.63) — applica la lingua persistita SOLO se l'utente non ha
      // già cambiato lingua manualmente nel frattempo.
      if ((d.language === 'it' || d.language === 'en') && !userChangedLanguageRef.current) {
        i18n.changeLanguage(d.language);
      } else if (d.languageIsUserSet === false && !userChangedLanguageRef.current) {
        // Primissimo avvio mai (nessuna preferenza ancora scritta in
        // app.conf, vedi hasLanguageBeenSet() in appConfig.ts) — autorileva
        // dal browser invece di assumere 'it' come fino a v1.1.62.
        // navigator.languages[0] è preferito a navigator.language: riflette
        // l'ordine di preferenza reale impostato a livello di sistema/
        // browser, non solo la prima lingua installata.
        const detected = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase();
        const primarySubtag = detected.split('-')[0];
        const supported: Array<'it' | 'en'> = ['it', 'en'];
        if (supported.includes(primarySubtag as any)) {
          const lang = primarySubtag as 'it' | 'en';
          i18n.changeLanguage(lang);
          fetch('/api/config', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang }),
          }).catch(() => {});
        } else {
          // Lingua di sistema non ancora supportata come UI — fallback
          // inglese, persistito subito così questo ramo non si ripete ad
          // ogni avvio (languageIsUserSet diventerà true al prossimo
          // /api/config). L'avviso, però, va nella lingua REALE
          // dell'utente (o nel fallback inglese generico se non ancora
          // presente nel dizionario) — mostrarlo in inglese o italiano
          // vanificherebbe lo scopo se l'utente non capisce nessuno dei
          // due.
          i18n.changeLanguage('en');
          fetch('/api/config', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: 'en' }),
          }).catch(() => {});
          import('./i18n/unsupportedLanguageNotices').then(({ getUnsupportedLanguageNotice }) => {
            const notice = getUnsupportedLanguageNotice(primarySubtag);
            pushNotification({
              type: 'info',
              title: notice.title,
              body: notice.body,
              source: 'system',
            });
          });
        }
      }
    }).catch(() => {});
  }, []);

  // v0.99.18 — RIMOSSO il meccanismo di auto-requestFullscreen() al primo
  // input (introdotto in v0.99.12, mantenuto come "riserva" in v0.99.17).
  // Motivo: con titlebar e pannelli XFCE già nascosti in modalità
  // Borderless (v0.99.13-15), la finestra è GIÀ visivamente indistinguibile
  // da un vero schermo intero — chiamare comunque requestFullscreen() al
  // primo input del controller non produceva alcun cambiamento visibile,
  // ma mostrava comunque il popup informativo standard del browser ("È
  // entrato in modalità schermo intero, premi Esc per uscire") ad ogni
  // singolo avvio dell'HTPC, un fastidio reale senza alcun beneficio.
  // 'kiosk' ("Fullscreen" in UI) e 'borderless' ("Kiosk" in UI, dietro
  // Ctrl+Alt+K) sono quindi ora IDENTICI a livello di comportamento del
  // frontend — restano distinti solo come etichetta/preferenza persistita,
  // dato che kiosk-launch.sh li gestisce già nello stesso identico modo.

  // v0.99.19 — Nasconde il cursore del mouse quando l'ultimo input
  // registrato proviene dal gamepad. Senza --kiosk reale (v0.99.12),
  // Chromium non nasconde più automaticamente il cursore dopo un periodo
  // di inattività (comportamento integrato della modalità kiosk, perso
  // passando a Borderless) — resta visibile permanentemente a meno che non
  // lo gestiamo noi via CSS.
  //
  // v0.99.28 — Sostituito il trigger "gamepadState.buttons.size > 0" con
  // un vero timer di inattività del mouse. Causa del cambiamento: test
  // reale dell'utente con la finestra impostata always-on-top (wmctrl -b
  // add,above, v0.99.25) ha confermato in modo definitivo che il problema
  // non è mai stato di visibilità/posizione della finestra — è
  // specificamente il FOCUS DELL'INPUT a livello di sistema (distinto da
  // "above"/raise su X11), che resta assente finché non avviene
  // un'interazione esplicita (click, Alt+Tab). Senza il focus, il loop che
  // alimenta gamepadState non si popola in modo affidabile, quindi il
  // trigger precedente scattava solo dopo che l'utente aveva già dato
  // focus alla finestra manualmente — niente di nuovo rispetto a prima.
  //
  // Visto che il cursore visibile non interferisce più con la navigazione
  // (fix isStaleMouseEnter, v0.99.19 stesso commit) il problema residuo è
  // puramente estetico — un timer di inattività del mouse è la soluzione
  // proporzionata: nessuna dipendenza dal gamepad o dal focus della
  // finestra, si nasconde semplicemente se il mouse non si muove per un
  // po', e ricompare al primo movimento reale. CURSOR_IDLE_MS scelto
  // abbastanza breve da percepirsi reattivo ma non così aggressivo da
  // nascondere il cursore mentre l'utente sta ancora leggendo/decidendo
  // con il mouse fermo sopra un elemento.
  const CURSOR_IDLE_MS = 3000;
  const [cursorHidden, setCursorHidden] = useState(false);
  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleHide = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setCursorHidden(true), CURSOR_IDLE_MS);
    };
    const onMouseMove = () => {
      setCursorHidden(false);
      scheduleHide();
    };
    window.addEventListener('mousemove', onMouseMove);
    scheduleHide(); // avvia il timer anche se il mouse non si è ancora mai mosso dal boot
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, []);

  // Carica notifiche persistenti dal backend al boot
  // v1.5.11-dev.1 — spostato in useNotifications (hooks/), vedi import
  // in cima al file.

  // Carica plugin registry ogni volta che si apre il tab plugins
  // v1.5.14-dev.1 — spostato in useStorePluginRegistry (hooks/), vedi
  // import in cima al file.

  // Aggiorna dispositivi connessi quando si apre il tab input
  // v1.5.13-dev.1 — spostato in useInputDevices (hooks/), vedi import in
  // cima al file.

  // ── Notification helpers (Step 15a) ─────────────────────────────────────
  // v1.5.11-dev.1 — pushNotification/dismissNotification/
  // resolveNotification/unreadCount: tutte spostate in useNotifications
  // (hooks/), vedi import in cima al file.

  // Carica (e ricarica) la lista file avatar
  // v2.0.41-dev.53 — Process Manager, step 4: stesso identico pattern di
  // loadAvatarFiles qui sopra (fetch/then/json/catch, nessun toast di
  // errore — una lista vuota in caso di problemi è già uno stato
  // presentabile, non serve altro).
  const loadProcessManagerList = useCallback(() => {
    fetch('/api/process-manager/list')
      .then(r => r.json())
      .then((data: Array<{ unit: string; kind: 'game' | 'shared-launcher'; id: string; title: string; startedAt: number }>) => {
        setProcessManagerList(Array.isArray(data) ? data : []);
      })
      .catch(() => setProcessManagerList([]));
  }, []);

  // v2.0.41-dev.53 — Process Manager, step 4: doppia conferma già
  // consumata dal chiamante (vedi il pulsante rosso nell'overlay) — qui
  // arriva solo la richiesta vera, mai la prima pressione che arma.
  const killProcessManagerEntry = useCallback((unit: string) => {
    setPendingKillUnit(null);
    fetch(`/api/process-manager/${encodeURIComponent(unit)}/kill`, { method: 'POST' })
      .finally(() => loadProcessManagerList());
  }, [loadProcessManagerList]);

  const loadAvatarFiles = useCallback(() => {
    // Prima recupera il path effettivo della cartella dal server
    fetch('/api/avatars/info')
      .then(r => r.json())
      .then((info: { dir: string; exists: boolean }) => {
        if (info?.dir) setAvatarDir(info.dir);
      })
      .catch(() => {});
    // Poi carica i file
    fetch('/api/avatars')
      .then(r => r.json())
      .then((data: Array<{ filename: string; url: string }>) => {
        setAvatarFiles(Array.isArray(data) ? data : []);
      })
      .catch(() => setAvatarFiles([]));
  }, []);

  // v1.5.20-dev.12 — Fase A.4: helper di join percorso — fileBrowserPath
  // è sempre un percorso assoluto già risolto dal server (mai relativo),
  // ma "/" (radice) non deve diventare "//nome" quando ci si entra dentro.
  const joinFsPath = (base: string, name: string) => (base.endsWith('/') ? `${base}${name}` : `${base}/${name}`);

  // v1.5.20-dev.12 — Fase A.4: extensions/filterOn passati SEMPRE come
  // argomenti espliciti, mai letti dallo stato dentro la funzione —
  // evita un bug di closure superata quando questa viene chiamata subito
  // dopo aver appena cambiato quello stesso stato nello stesso gestore
  // (es. aprendo l'overlay, o alternando il filtro: setState è
  // asincrono, la callback qui dentro vedrebbe ancora il valore vecchio
  // se letta da una closure invece che da un parametro).
  const loadFileBrowserDir = useCallback((dirPath: string, extensions: string[], filterOn: boolean) => {
    const query = filterOn && extensions.length > 0 ? `&extensions=${extensions.join(',')}` : '';
    fetch(`/api/filesystem/list?path=${encodeURIComponent(dirPath)}${query}`)
      .then(r => r.json())
      .then((data: { path?: string; parentPath?: string | null; entries?: typeof fileBrowserEntries; error?: string }) => {
        if (data.error) {
          setFileBrowserError(data.error);
          setFileBrowserEntries([]);
          setFileBrowserParentPath(null);
          return;
        }
        setFileBrowserError(null);
        setFileBrowserPath(data.path ?? dirPath);
        setFileBrowserParentPath(data.parentPath ?? null);
        setFileBrowserEntries(data.entries ?? []);
      })
      .catch(() => setFileBrowserError(t('dashboard:fileBrowser.communicationError')));
  }, [t]);

  // v2.0.41-dev.1 — startPath opzionale: quando fornito (richiamo da
  // Executable Path), l'overlay parte SEMPRE da lì invece che da
  // Download/Home — richiesta esplicita dell'utente. Se il percorso non
  // esiste/non è una cartella, /api/filesystem/list lo segnala già con
  // fileBrowserError (vedi listDirectory in fileManager.ts), e i
  // quick-link nell'header restano comunque la via d'uscita — nessuna
  // gestione speciale in più necessaria qui.
  // v2.0.41-dev.1 — BUG UTENTE: navigazione/selezione impossibili
  // nell'overlay, anche a z-index corretto. Causa reale: openFileBrowser
  // non ha MAI impostato activeGroup('file-browser') né chiamato
  // focusFirstInGroup — manca il pattern che ogni altro overlay del
  // progetto segue (vedi openGameOptions poco sotto: setShowX(true) +
  // setActiveGroup('x') + focusFirstInGroup('x') via setTimeout).
  // moveFocus in FocusProvider naviga SOLO nel pool di
  // `activeGroup ?? 'dashboard'` (vedi targetGroup lì) — con
  // activeGroup ancora su 'game-options'/'keyboard'/'downloads', i
  // Focusable group="file-browser" restavano irraggiungibili da
  // D-pad/stick indipendentemente dallo z-index, che risolveva solo la
  // sovrapposizione visiva. Bug preesistente anche per purpose
  // 'installer' (mai notato: richiede controller + stato
  // awaiting_installer insieme, combinazione stretta) — fix unico in
  // questo punto condiviso, corregge entrambi i chiamanti.
  const openFileBrowser = useCallback((context: { purpose: 'installer' | 'executable'; gameId: string; extensions: string[] }, startPath?: string) => {
    setFileBrowserContext(context);
    setFileBrowserFilterOn(true);
    setActiveGroup('file-browser');
    fetch('/api/filesystem/quick-links')
      .then(r => r.json())
      .then((links: { home: string; downloads: string | null; removableMedia: string | null }) => {
        setFileBrowserQuickLinks(links);
        setShowFileBrowser(true);
        loadFileBrowserDir(startPath ?? (links.downloads ?? links.home), context.extensions, true);
        setTimeout(() => focusFirstInGroup('file-browser'), 80);
      })
      .catch(() => {
        // Anche senza quick-link risolti, l'overlay può ancora aprirsi
        // sulla home — meglio di un fallimento silenzioso.
        setShowFileBrowser(true);
        loadFileBrowserDir(startPath ?? '~', context.extensions, true);
        setTimeout(() => focusFirstInGroup('file-browser'), 80);
      });
  }, [loadFileBrowserDir, setActiveGroup, focusFirstInGroup]);

  // v2.0.41-dev.1 — purpose 'executable': il chiamante è stato la
  // tastiera virtuale (nascosta esplicitamente da openExecutableFileBrowser
  // prima di aprire questo overlay) — va fatta ricomparire alla chiusura,
  // non tornare al pannello Download come per 'installer'.
  const closeFileBrowser = useCallback(() => {
    setShowFileBrowser(false);
    if (fileBrowserContext?.purpose === 'executable') {
      setShowKeyboard(true);
      setActiveGroup('keyboard');
    } else {
      setActiveGroup('downloads');
    }
    setFileBrowserContext(null);
  }, [fileBrowserContext, setActiveGroup]);

  const confirmFileBrowserSelection = useCallback((fileName: string) => {
    if (!fileBrowserContext || !fileBrowserPath) return;
    const fullPath = joinFsPath(fileBrowserPath, fileName);
    if (fileBrowserContext.purpose === 'executable') {
      // Nessun PATCH diretto qui: aggiorna solo il valore in editing
      // nella tastiera (che sta per ricomparire, vedi closeFileBrowser) —
      // il salvataggio reale resta quello già esistente alla chiusura
      // della tastiera (onCommit di openKeyboardForField per questo
      // campo, vedi field-executablePath), stesso identico percorso di
      // una digitazione manuale, nessuna persistenza duplicata.
      setActiveField(prev => (prev ? { ...prev, value: fullPath } : prev));
      closeFileBrowser();
    } else {
      fetch('/api/downloads/installer-select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: fileBrowserContext.gameId, path: fullPath }),
      }).finally(() => {
        closeFileBrowser();
      });
    }
  }, [fileBrowserContext, fileBrowserPath, closeFileBrowser]);

  useEffect(() => {
    if (!showAvatarLibrary) return;
    loadAvatarFiles();
  }, [showAvatarLibrary, loadAvatarFiles]);

  // v2.0.41-dev.53 — Process Manager, step 4: ricarica a ogni apertura,
  // stesso principio di showAvatarLibrary — la lista può essere cambiata
  // da un lancio/chiusura avvenuti mentre il pannello era chiuso.
  useEffect(() => {
    if (!showProcessManager) return;
    loadProcessManagerList();
  }, [showProcessManager, loadProcessManagerList]);

  // FIX v0.99.4 — rimossa la vecchia useEffect "Update selected game when
  // games list changes (switching stores)": era un meccanismo pre-SSE
  // (commento in inglese, residuo dei primi step del progetto) diventato
  // ridondante e in conflitto con la sincronizzazione più recente e protetta
  // già presente negli handler SSE/fetch (vedi setSelectedGameId con guardia
  // `if (showGameOptions) return prev;`). A differenza di quella, questa
  // vecchia versione non aveva ALCUNA protezione sull'overlay aperto: ad
  // ogni cambio di reference di `games` (anche con contenuto identico, come
  // ad ogni ciclo del refresh periodico in background) forzava
  // selectedGameId al primo elemento dell'array corrente se non vi trovava
  // l'id selezionato — causa diretta del bug "l'overlay punta sempre al
  // primo gioco GOG (A Plague Tale)": bastava che selectedGameId non fosse
  // nell'array filtrato del momento (es. utente su un altro store) per
  // venire sovrascritto silenziosamente, overlay aperto o no.

  // Sync selected game with focused element — SOLO quando l'overlay Game
  // Options non è aperto. Senza questa guardia, un focusedId "stantio"
  // ancora puntato su una card della dashboard sottostante (possibile nella
  // finestra tra apertura overlay e aggiornamento completo dello scope)
  // sovrascriveva selectedGameId e quindi il contenuto mostrato
  // dall'overlay — stesso bug del punto sopra, innescato da una via diversa.
  useEffect(() => {
    if (showGameOptions) return;
    if (focusedId?.startsWith('game-')) {
      const gameId = focusedId.replace('game-', '');
      if (gameId !== selectedGameId) {
        setSelectedGameId(gameId);
      }
    }
  }, [focusedId, selectedGameId, showGameOptions]);

  // SSE — aggiorna la libreria automaticamente quando il daemon lo notifica
  // (installazione/disinstallazione Steam, scan ROM, ecc.)
  //
  // FIX (patch-step3-003): selectedGameId non viene mai toccato se l'overlay
  // è aperto (showGameOptions). Evita il reset della selezione durante la
  // navigazione delle opzioni di una ROM.
  //
  // v1.1.24 — CAUSA RADICE REALE del bug "installo, cambio store, torna
  // disinstallato": questo effetto aveva activeStore/searchQuery/sortBy/
  // sortOrder/selectedGenre/selectedCategory/showGameOptions nella
  // dependency array — quindi ad OGNI cambio di store (o filtro) la
  // connessione SSE veniva chiusa (`es.close()`) e una NUOVA aperta da
  // zero. Una connessione EventSource al servizio di notifiche non ha
  // alcun motivo di dipendere da cosa l'utente sta navigando in quel
  // momento — è un canale "la libreria è cambiata da qualche parte",
  // non specifico per store/filtro. Chiudere e riaprire questa
  // connessione ad ogni cambio di tab creava una finestra di
  // disconnessione durante la quale un evento 'library-updated' emesso
  // dal server (es. install appena confermato) non aveva NESSUN client
  // in ascolto — perso silenziosamente, mai riprocessato. La card
  // sembrava aggiornarsi "per un attimo" solo grazie al fetch fresco
  // della normale navigazione tra store, poi restava all'ultimo stato
  // noto (quello da PRIMA dell'installazione) perché l'evento che
  // avrebbe dovuto propagare il cambiamento non è mai arrivato a
  // destinazione. Ora la connessione è aperta una sola volta (deps `[]`)
  // e resta viva per tutta la sessione; l'handler legge activeStore e
  // tutti gli altri valori dai ref sincronizzati sopra (stesso pattern
  // già in uso per activeStoreRef/focusedIdRef), non dalla propria
  // closure di montaggio.
  useEffect(() => {
    const es = new EventSource('/api/events');

    es.onmessage = async (e) => {
      try {
        const parsed = JSON.parse(e.data);
        const { event, payload } = parsed;

        // Notifiche pushed dal NotificationEngine (Step 15b)
        if (event === 'notification' && payload) {
          const n = payload as any;
          const mapped: AppNotification = {
            id:             n.id,
            type:           n.type,
            status:         n.status ?? 'pending',
            title:          n.title,
            body:           n.body,
            gameId:         n.game_id,
            gameTitle:      n.game_title,
            rawLog:         n.raw_log,
            primaryAction:  n.primary_action   ? JSON.parse(n.primary_action)   : undefined,
            secondaryAction:n.secondary_action ? JSON.parse(n.secondary_action) : undefined,
            tertiaryAction: n.tertiary_action  ? JSON.parse(n.tertiary_action)  : undefined,
            linkUrl:        n.link_url ?? undefined,
            linkLabel:      n.link_label ?? undefined,
            source:         n.source ?? 'system',
            aiProvider:     n.ai_provider,
            confidence:     n.confidence,
            timestamp:      n.created_at ?? new Date().toISOString(),
            seen:           false,
          };
          setNotifications(prev => {
            if (prev.some(p => p.id === mapped.id)) return prev;
            // v1.1.29 — stessa logica di pushNotification: sostituisce
            // una notifica pending precedente per lo stesso gioco+titolo
            // (es. installazioni ripetute dello stesso gioco durante
            // test) invece di affiancarla — vedi commento lì per il
            // dettaglio del confronto.
            const updated = [
              mapped,
              ...prev.filter(p => !(p.gameId && p.gameId === mapped.gameId && p.title === mapped.title && p.status === 'pending')),
            ];
            // v1.1.28 — stessa correzione di pushNotification sopra:
            // 'success' (es. "gioco installato") non si auto-dismette
            // più. Le due implementazioni erano duplicate e leggermente
            // divergenti solo per caso — ora coerenti.
            //
            // v1.5.20-dev.27 — BUG REALE CONFERMATO DALL'UTENTE: una
            // notifica azionabile (con primaryAction/secondaryAction,
            // es. "tieni aperto / chiudi ora" del launcher condiviso,
            // dev.22) è comunque di type='info' — questo timer la
            // faceva scomparire dopo 6s indipendentemente dal fatto che
            // l'utente avesse deciso, impedendo qualunque scelta se non
            // si è abbastanza rapidi. Il tipo 'info' da solo non basta
            // più a decidere se auto-scompare: solo l'ASSENZA di azioni
            // lo rende un avviso genuinamente transitorio (toggle
            // modalità, passaggio a desktop) — qualunque notifica con
            // un'azione da compiere resta finché l'utente non decide
            // davvero (dismissNotification esplicito).
            const isActionable = !!(mapped.primaryAction || mapped.secondaryAction || mapped.tertiaryAction);
            if (mapped.type === 'info' && !isActionable) {
              setTimeout(() => {
                setNotifications(p2 => p2.map(p => p.id === mapped.id && p.status === 'pending' ? { ...p, status: 'dismissed' } : p));
              }, 6000);
            }
            return updated;
          });
        }

        if (event === 'library-updated') {
          // Step 18 (v1.1.37) — passa dalla funzione condivisa
          // refreshGamesList(). `clearCacheFirst: true` perché un
          // cambiamento reale alla libreria (install/uninstall/login/
          // logout — vedi sotto, ora tutti passano da qui) invalida
          // TUTTA la cache: un nuovo titolo può comparire sia in "All
          // Games" sia nello store specifico, quindi invalidare solo una
          // chiave lascerebbe l'altra stale. `useCurrentFilters: true`
          // perché questo handler deve rispettare qualunque combinazione
          // di store/ricerca/ordinamento/genere/categoria l'utente stia
          // guardando in quel momento, letta dai ref sincronizzati (mai
          // dalla propria closure di montaggio — vedi commento v1.1.24
          // sull'EventSource persistente più sopra).
          await refreshGamesList({ useCurrentFilters: true, clearCacheFirst: true });
        }
      } catch {}
    };

    es.onerror = () => {};

    return () => es.close();
  }, []);

  // Fetch initial data + polling separato per log/download
  //
  // FIX (patch-step3-003): il polling ogni 5s ora aggiorna SOLO log e
  // download, non la libreria di giochi. La libreria viene:
  //   - caricata una volta al boot (o al cambio filtri)
  //   - aggiornata in tempo reale via SSE (evento library-updated)
  // Questo elimina il re-render continuo della game grid che causava
  // il reset involontario della selezione durante l'overlay ROM.
  useEffect(() => {
    const safeJson = async (res: Response) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 50)}`);
      }
      const ct = res.headers.get('content-type');
      if (!ct || !ct.includes('application/json')) {
        throw new Error(`Expected JSON but got ${ct}`);
      }
      return res.json();
    };

    // Carica libreria + stores (solo al boot / cambio filtri)
    //
    // Step 18 (v1.1.37) — il fetch dei giochi passa dalla funzione
    // condivisa refreshGamesList() (guard di sequenza, cache, e
    // riconciliazione selectedGameId incapsulati lì, condivisi con
    // l'handler SSE 'library-updated'). Restano qui, non delegati alla
    // funzione condivisa perché specifici di questo effetto: la lettura
    // della cache PRIMA del fetch (stale-while-revalidate, mostra subito
    // l'ultima versione nota per questa combinazione di filtri invece di
    // un flash vuoto) e il fetch di `/api/stores` in parallelo.
    const fetchLibrary = async (signal: AbortSignal) => {
      const cacheKey = buildLibraryCacheKey(
        activeStore || 'All', searchQuery || '', sortBy || 'title', sortOrder || 'asc',
        selectedGenre || '', selectedCategory || ''
      );
      const cached = libraryCacheRef.current.get(cacheKey);
      if (cached) {
        setGames(cached);
      }

      // Refresh on-demand (v0.99.4) avviene in un effect dedicato più sotto,
      // legato solo ad activeStore — qui restiamo legati anche a sort/search/
      // genere/categoria, che non richiedono un nuovo scan dei plugin.
      try {
        const [gamesData, storesData] = await Promise.all([
          refreshGamesList({ useCurrentFilters: true, signal, showLoadingIndicator: true }),
          fetch('/api/stores', { signal }).then(safeJson),
        ]);
        // gamesData === null → fetch scartato (superato da un altro più
        // recente, o abortito): refreshGamesList non ha toccato `games`,
        // niente altro da fare qui.
        setStores(storesData);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch library:', err);
      }
    };

    // Aggiorna solo log e download (polling leggero, non tocca la game grid)
    const fetchStatus = async (signal: AbortSignal) => {
      try {
        const [logsData, downloadsData] = await Promise.all([
          fetch('/api/logs', { signal }).then(safeJson),
          fetch('/api/downloads', { signal }).then(safeJson),
        ]);
        setLogs(logsData);
        setDownloads(downloadsData);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        console.error('Failed to fetch status:', err);
      }
    };

    const controller = new AbortController();
    fetchLibrary(controller.signal);
    fetchStatus(controller.signal);

    // Polling solo per log/download — la libreria si aggiorna via SSE
    const interval = setInterval(() => fetchStatus(controller.signal), 5000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [activeStore, searchQuery, sortBy, sortOrder, selectedGenre, selectedCategory, buildLibraryCacheKey, refreshGamesList]);

  // v0.99.35 — quando un task passa a 'completed', programma la sua
  // rimozione dalla visualizzazione locale dopo 6s. scheduledTimersRef
  // (non lo stato React) traccia quali gameId hanno già un timer
  // attivo, indipendentemente dai re-render — necessario perché la
  // cleanup function di un useEffect scatta a OGNI cambio di
  // dipendenza, non solo allo smontaggio: senza questo ref, se un
  // secondo task completasse in un poll successivo mentre il timer
  // del primo è ancora in corso, la cleanup cancellerebbe anche
  // quello del primo, riprogrammandolo da capo e allungandone la
  // visibilità oltre i 6s previsti.
  const scheduledHideTimersRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    downloads.forEach((t: any) => {
      if (t.status !== 'completed') return;
      if (hiddenCompletedIds.has(t.gameId)) return;
      if (scheduledHideTimersRef.current.has(t.gameId)) return;

      scheduledHideTimersRef.current.add(t.gameId);
      setTimeout(() => {
        setHiddenCompletedIds(prev => new Set(prev).add(t.gameId));
        scheduledHideTimersRef.current.delete(t.gameId);
      }, 6000);
    });
  }, [downloads, hiddenCompletedIds]);

  // Nessun fallback a MOCK_GAMES: mostrare un gioco finto (Cyberpunk 2077)
  // durante il render iniziale prima che il fetch reale risponda è la stessa
  // classe di bug del flash store mock. undefined è il valore corretto
  // quando non esistono ancora dati reali — i punti che consumano
  // selectedGame già gestiscono il caso "nessun gioco selezionato".
  // v0.99.37 — fix: la card "Steam Big Picture" non esiste mai in `games`
  // (stato popolato solo da /api/games, lato server — la card è virtuale,
  // iniettata solo per il rendering della griglia). Prima di questo fix,
  // selezionarla faceva sempre fallire il find() e cadere su games[0],
  // mostrando nel pannello destro le info di un titolo reale a caso invece
  // che della card selezionata. Risolta qui esplicitamente con la stessa
  // factory usata per l'iniezione in griglia, prima di provare il find().
  // v0.99.38 — rimosso il fallback finale `|| games[0]`: prima, quando
  // selectedGameId era vuoto (nessuna vera selezione dell'utente, es. al
  // primo caricamento), il pannello destro mostrava comunque il primo
  // gioco della lista corrente come se fosse selezionato — "appare sempre
  // A Plague Tale: Innocence di default". Ora selectedGame è
  // genuinamente undefined in quel caso, e il pannello destro mostra un
  // messaggio di benvenuto (vedi rendering condizionale più sotto) invece
  // di una selezione finta.
  const selectedGame = selectedGameId === STEAM_BIG_PICTURE_ID
    ? makeSteamBigPictureCard()
    : games.find(g => g.id === selectedGameId);

  // v2.0.41-dev.1 — richiesta utente: apre il file manager per correggere
  // Executable Path, partendo SEMPRE dalla cartella che contiene il path
  // già scritto nel campo in editing (activeField.value — il "campo di
  // testo dell'overlay", live, non ancora committato), mai da Download/
  // Home. Path sempre assoluti per questo campo (placeholder/esempi
  // nell'overlay: "/home/.../Game.exe") — dirname manuale a stringhe,
  // senza bisogno del modulo 'path' di Node lato frontend. Se il campo è
  // vuoto o non assoluto, nessun punto di partenza noto: openFileBrowser
  // ricade sul comportamento esistente (Download/Home), stesso default
  // già in uso per l'installer. Deve vivere DOPO la dichiarazione di
  // selectedGame qui sopra, non prima — stessa categoria di errore
  // (TS2448) già documentata più sotto per keyboardAltSuggestions/
  // overlayNavAnchors in questo stesso file.
  const openExecutableFileBrowser = useCallback(() => {
    if (!activeField || activeField.id !== 'field-executablePath' || !selectedGame) return;
    const current = activeField.value.trim();
    let startPath: string | undefined;
    if (current.startsWith('/')) {
      const idx = current.lastIndexOf('/');
      startPath = idx > 0 ? current.slice(0, idx) : '/';
    }
    setShowKeyboard(false); // riappare alla chiusura del file browser, vedi closeFileBrowser
    openFileBrowser({ purpose: 'executable', gameId: selectedGame.id, extensions: ['exe'] }, startPath);
  }, [activeField, selectedGame, openFileBrowser]);

  // Richiesta utente — dimensione prevista di installazione, on-demand per
  // un solo gioco alla volta (solo GOG/Epic/Amazon — il backend ritorna
  // null per ogni altro store, gestito qui semplicemente nascondendo il
  // blocco). Deve vivere DOPO la dichiarazione di selectedGame qui sopra,
  // non prima — stessa categoria di errore (TS2448) già documentata più
  // sotto per keyboardAltSuggestions/overlayNavAnchors in questo stesso
  // file. Estratto in usePredictedInstallSize (hooks/), vedi import in
  // cima al file.
  const { bytes: predictedSizeBytes, loading: predictedSizeLoading } = usePredictedInstallSize(selectedGame);

  // v1.0.0 — fix navigazione overlay Game Options: Runner Bridge,
  // Compatibility Layer/Core ed Executable Path si affidavano solo allo
  // scoring geometrico di FocusProvider per passare da una sezione
  // all'altra — con risultati diversi a seconda della direzione (su/giù),
  // soprattutto quando una sezione risulta vuota per questo gioco
  // specifico (es. Wine-Lutris è l'unico runner disponibile, mai
  // mostrato come switch essendo il default implicito — la card "Runner
  // Bridge" resta visibile ma senza alcun elemento selezionabile dentro).
  // Calcolato qui, in un solo punto, invece che duplicato nel JSX.
  //
  // v1.0.0 — FIX CRITICO: questo blocco viveva PRIMA della dichiarazione
  // di selectedGame (riga sopra) — un ReferenceError "used before
  // declaration" che manda in crash l'intero render ad ogni caricamento
  // (schermo nero). Spostato qui, subito dopo, dove selectedGame esiste
  // già. Errore mio, trovato con tsc mirato su TS2448 dopo la
  // segnalazione — non l'avevo controllato perché il mio filtro di
  // verifica precedente cercava solo alcuni codici di errore specifici,
  // non questa categoria.
  // v1.1.16 — stessa lezione già documentata sopra per overlayNavAnchors:
  // questo blocco deve vivere DOPO la dichiarazione di selectedGame, non
  // prima — l'avevo messo vicino ad activeField (molto più in alto nel
  // file) e tsc l'ha segnalato subito come TS2448 prima ancora di
  // arrivare a un test su hardware reale.
  // Set di suggerimenti alternativo per il campo attualmente in editing:
  // Launch Arguments → lista curata di flag comuni, RetroArch o Wine/
  // Proton in base al runner del gioco selezionato (richiesta utente:
  // prima era sempre e solo Wine/Proton, anche per RetroArch); una riga
  // Custom Env Variables → lista curata di variabili, diversa per Wine o
  // Proton in base al runner del gioco selezionato; ogni altro campo →
  // nessuna alternativa, Shift si comporta come sempre (solo maiuscolo/
  // minuscolo).
  const keyboardAltSuggestions = useMemo((): SuggestionItem[] | undefined => {
    if (!activeField) return undefined;
    if (activeField.id === 'field-launchArgs') {
      return selectedGame?.runner === 'RetroArch' ? RETROARCH_LAUNCH_ARG_SUGGESTIONS : LAUNCH_ARG_SUGGESTIONS;
    }
    if (activeField.id.startsWith('envvar-')) {
      const isProton = (selectedGame?.runner ?? '').toLowerCase().includes('proton');
      return isProton ? ENV_VAR_SUGGESTIONS_PROTON : ENV_VAR_SUGGESTIONS_WINE;
    }
    return undefined;
  }, [activeField, selectedGame?.runner]);

  const overlayNavAnchors = useMemo(() => {
    if (!selectedGame) return { lastRunnerBridgeId: undefined, firstMiddleId: undefined, lastMiddleId: undefined, firstOverlayContentId: undefined };

    const nonDefaultRunners = availableRunners.filter((r: any) => (r.id || r) !== 'Wine-Lutris');
    const runnerBridgeShown = selectedGame.store !== 'Classic Console';
    const firstRunnerBridgeId = (runnerBridgeShown && nonDefaultRunners.length > 0)
      ? `game-runner-${nonDefaultRunners[0].id || nonDefaultRunners[0]}`
      : undefined;
    const lastRunnerBridgeId = (runnerBridgeShown && nonDefaultRunners.length > 0)
      ? `game-runner-${nonDefaultRunners[nonDefaultRunners.length - 1].id || nonDefaultRunners[nonDefaultRunners.length - 1]}`
      : undefined;

    let firstMiddleId: string | undefined;
    let lastMiddleId: string | undefined;
    if (selectedGame.runner === 'RetroArch') {
      const nonDefaultCores = retroarchCores.filter(c => c.name !== retroarchDefaultCore);
      firstMiddleId = nonDefaultCores[0] ? `core-${nonDefaultCores[0].name}` : undefined;
      lastMiddleId  = nonDefaultCores.length > 0 ? `core-${nonDefaultCores[nonDefaultCores.length - 1].name}` : undefined;
    } else if (selectedGame.store !== 'Classic Console') {
      firstMiddleId = 'compat-fsr';
      // v1.5.20-dev.3 — era 'compat-battleye': valido finché quello era
      // l'ultimo tile della griglia Compatibility Layer. Con l'aggiunta di
      // 'umuRun' come 7° tile (v1.5.20-dev.1), battleye è diventato il
      // penultimo — questo anchor doveva seguirlo, non l'ho aggiornato
      // insieme al resto della navigazione della griglia. Bug di
      // navigazione minore (nessun id inesistente, quindi non rilevato da
      // check-focus-ids: 'compat-battleye' esiste comunque), non un crash.
      lastMiddleId  = 'compat-umuRun';
    }

    // v1.1.3 — ingresso deterministico dal pulsante di chiusura (in alto a
    // destra) verso il primo elemento REALE del corpo dell'overlay: prima
    // Runner Bridge se presente, altrimenti la sezione centrale
    // (core RetroArch o Compatibility Layer), altrimenti il campo
    // Executable Path — sempre presente in fondo, unico fallback
    // garantito per i giochi Classic Console non-RetroArch (dove
    // Runner Bridge e la sezione centrale sono entrambe assenti/vuote).
    // Bug reale scoperto in test: senza questo, "giù" dal pulsante di
    // chiusura usava scoring geometrico puro e atterrava direttamente
    // sulla colonna destra di Compatibility Layer, scavalcando per intero
    // Runner Bridge e i core RetroArch.
    const firstOverlayContentId = firstRunnerBridgeId ?? firstMiddleId ?? 'field-executablePath';

    return { lastRunnerBridgeId, firstMiddleId, lastMiddleId, firstOverlayContentId };
  }, [selectedGame, availableRunners, retroarchCores, retroarchDefaultCore]);

  // v0.99.38 — auto-scroll per il box descrizione nel pannello info a
  // destra (v1.0.0: ristretto al SOLO box descrizione, prima riguardava
  // l'intera colonna — immagine/badge/titolo/tag/playtime restano fissi
  // ora, vincolati alla loro dimensione naturale, mai coinvolti nello
  // scroll). Interfaccia controller-first: senza mouse non c'è modo di
  // trascinare uno scrollbar per leggere un testo che eccede l'altezza
  // massima del box — un ridimensionamento non basterebbe comunque, il
  // box ha un max-height deliberatamente vincolato a non eccedere mai lo
  // spazio della colonna.
  //
  // v1.0.0 — FIX incoerenza "a volte parte, a volte no": prima era un
  // useRef + useEffect(..., [selectedGame?.id]) separati. Il pannello usa
  // AnimatePresence mode="wait" — al cambio di gioco, il nuovo box viene
  // montato nel DOM solo DOPO che l'animazione di uscita della card
  // precedente è finita. L'useEffect invece scattava subito al cambio di
  // selectedGame.id, PRIMA che il nuovo nodo esistesse davvero — trovava
  // il ref a `null` o no a seconda di quanto la macchina impiegava a
  // completare l'animazione in quel momento: una vera race condition,
  // non un comportamento casuale. Una ref a CALLBACK risolve alla radice:
  // React la richiama esattamente quando il nodo viene attaccato al DOM,
  // indipendentemente dai tempi di Framer Motion.
  // v1.0.0 — DIAGNOSTICA TEMPORANEA (round 2): stavolta con aggiornamento
  // continuo (ogni 500ms via setInterval, indipendente da ResizeObserver
  // o da qualunque altro evento) invece di un singolo valore letto una
  // tantum — deve dirci con certezza se il meccanismo resta bloccato su
  // "non serve scorrere" per tutta la durata dell'osservazione, o se
  // semplicemente non viene mai invocato affatto.
  const descriptionScrollCleanupRef = useRef<(() => void) | null>(null);
  const descriptionScrollRefCallback = useCallback((el: HTMLDivElement | null) => {
    // Il nodo precedente (gioco già cambiato, o testo troppo corto per
    // scorrere) viene smontato — ripulisci sempre prima di ripartire.
    if (descriptionScrollCleanupRef.current) {
      descriptionScrollCleanupRef.current();
      descriptionScrollCleanupRef.current = null;
    }
    if (!el) return;

    // v1.0.0 — FIX: prova diagnostica ha dimostrato che l'assegnazione a
    // scrollTop viene ignorata (before===after nella stessa riga di
    // codice, non un problema di timing) — sintomo tipico di
    // overflow-y non davvero impostato su un valore scrollabile a
    // livello di stile calcolato, nonostante la classe Tailwind
    // overflow-y-auto sia presente (una regola con specificità più alta
    // altrove nel CSS può vincere sulla cascata). Lo stile inline ha
    // sempre la priorità massima, indipendentemente da qualunque foglio
    // di stile in conflitto — elimina il dubbio alla radice invece di
    // continuare a cercare quale regola specifica lo stia sovrascrivendo.
    el.style.overflowY = 'auto';
    el.style.overflowX = 'hidden';

    el.scrollTop = 0;

    let cancelled     = false;
    let rafId: number | null = null;
    let userActive    = false;
    let cycleRunning  = false;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    let startTimer:  ReturnType<typeof setTimeout> | null = null;

    const onUserInteraction = () => {
      userActive = true;
      if (resumeTimer) clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => { userActive = false; }, 4000);
    };
    el.addEventListener('wheel', onUserInteraction, { passive: true });
    el.addEventListener('touchstart', onUserInteraction, { passive: true });

    const startCycle = () => {
      if (cancelled || cycleRunning) return;
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow <= 8) return; // contenuto già tutto visibile, nulla da fare
      cycleRunning = true;

      // v1.0.0 — tempi allungati su richiesta: prima il ciclo (partenza,
      // velocità, pause alle inversioni) risultava troppo compulsivo,
      // l'utente non faceva in tempo a leggere con calma prima che il
      // testo ripartisse. Stesso meccanismo, solo più rilassato.
      const scrollDurationMs = Math.min(Math.max(overflow * 24, 3000), 11000);
      let direction: 1 | -1 = 1;
      let lastTs: number | null = null;
      let pauseUntil = 0;
      // v1.0.0 — FIX VERO: il browser arrotonda scrollTop all'intero più
      // vicino ad ogni lettura/scrittura. Il nostro incremento per
      // fotogramma (~0.37px in questo caso, overflow=67 fa scattare la
      // soglia minima di 3000ms) è sotto 0.5px — "prima+incremento" viene
      // arrotondato allo stesso intero di partenza ad ogni fotogramma,
      // la frazione non si accumula MAI perché rileggevamo il valore già
      // arrotondato dal browser come base per il calcolo successivo
      // (provato con un test diretto: un salto grande a un intero
      // "stickava" perfettamente, ma il ciclo incrementale restava poi
      // bloccato esattamente li). Un accumulatore proprio, mai riletto
      // da el.scrollTop, risolve alla radice — accumula sempre con
      // precisione piena, indipendentemente da come il browser arrotonda
      // il valore effettivamente memorizzato/visualizzato.
      let virtualScrollTop = el.scrollTop;

      const step = (ts: number) => {
        if (cancelled) return;
        rafId = requestAnimationFrame(step);
        if (userActive || ts < pauseUntil) { lastTs = null; return; }
        if (lastTs == null) { lastTs = ts; return; }
        const dt = ts - lastTs;
        lastTs = ts;

        virtualScrollTop += direction * (overflow / scrollDurationMs) * dt;
        el.scrollTop = virtualScrollTop;

        if (direction === 1 && virtualScrollTop >= overflow - 1) {
          virtualScrollTop = overflow;
          el.scrollTop = overflow;
          direction = -1;
          pauseUntil = ts + 4500; // pausa in fondo, tempo di finire la lettura
        } else if (direction === -1 && virtualScrollTop <= 1) {
          virtualScrollTop = 0;
          el.scrollTop = 0;
          direction = 1;
          pauseUntil = ts + 6000; // pausa più lunga in cima, prima di ripartire da capo
        }
      };
      rafId = requestAnimationFrame(step);
    };

    // v1.0.0 — FIX per il caso "il ciclo non parte mai per questo
    // titolo": prima l'overflow veniva misurato UNA sola volta, in un
    // punto fisso nel tempo (4s dopo il montaggio). Se per quel gioco
    // specifico il layout sopra il box (titolo su piu righe, badge su
    // piu righe) impiegava piu tempo del solito ad assestarsi, la misura
    // poteva cadere nel momento sbagliato — e non veniva piu ritentata,
    // il ciclo restava spento per sempre anche se il testo eccedeva
    // chiaramente lo spazio. Un ResizeObserver osserva le dimensioni
    // REALI del box in continuo (non un singolo istante): ogni volta che
    // cambiano — incluso il primo assestamento — si rivaluta se serve
    // scorrere, con debounce di 4s (lo stesso ritardo di lettura di
    // prima) prima di avviare davvero il ciclo.
    const resizeObserver = new ResizeObserver(() => {
      if (cancelled) return;
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow <= 8) {
        // Il box è cresciuto (o il testo si è accorciato) abbastanza da
        // non aver più bisogno di scorrere — ferma un ciclo in corso.
        if (cycleRunning) {
          cycleRunning = false;
          if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
          el.scrollTop = 0;
        }
        if (startTimer) { clearTimeout(startTimer); startTimer = null; }
        return;
      }
      if (!cycleRunning) {
        if (startTimer) clearTimeout(startTimer);
        startTimer = setTimeout(startCycle, 4000);
      }
    });
    resizeObserver.observe(el);

    // v1.0.0 — FIX per il caso reale scoperto: rimuovendo un elemento
    // diagnostico temporaneo sopra il box, lo scroll smetteva di
    // partire — non per la posizione del box, ma perché quell'elemento
    // causava ri-render aggiuntivi che davano al ResizeObserver più
    // occasioni di ricontrollare la misura. Il ResizeObserver da solo
    // notifica una volta all'osservazione iniziale e poi solo se la
    // dimensione cambia DAVVERO — se quella prima misura cade in un
    // momento in cui il layout non si è ancora assestato (Framer Motion
    // sta ancora animando, l'immagine di copertina sta ancora
    // caricando) e la dimensione poi non cambia più, quella misura
    // sbagliata resta quella definitiva per sempre. Questi ricontrolli
    // programmati (non legati a un evento di resize) danno al
    // meccanismo altre occasioni di correggersi, indipendentemente da
    // cosa succede nel frattempo.
    // v1.0.0 — il primo tentativo resta a 4s (stesso ritardo di lettura
    // già richiesto e mantenuto), gli altri sono solo una rete di
    // sicurezza nel caso quella prima misura cada ancora nel momento
    // sbagliato — non anticipano mai la partenza, la rallentano se mai,
    // dato che ripartono da capo solo se il ciclo non è già in corso.
    const retryDelays = [4000, 6000, 8500, 11000];
    const retryTimers = retryDelays.map(delay => setTimeout(() => {
      if (!cancelled && !cycleRunning) startCycle();
    }, delay));

    descriptionScrollCleanupRef.current = () => {
      cancelled = true;
      if (startTimer) clearTimeout(startTimer);
      if (resumeTimer) clearTimeout(resumeTimer);
      retryTimers.forEach(clearTimeout);
      if (rafId != null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      el.removeEventListener('wheel', onUserInteraction);
      el.removeEventListener('touchstart', onUserInteraction);
    };
  }, []);

  // v1.0.0 — scorrimento del campo Executable Path quando il path eccede
  // lo spazio disponibile, stesso principio dei titoli notifica ma
  // applicato a un <input> di sola lettura (vedi useScrollOnceOverflow
  // sopra). Riparte ogni volta che il valore cambia — nuovo gioco
  // selezionato o path modificato dall'utente.
  const executablePathRef = useRef<HTMLInputElement>(null);
  useScrollOnceOverflow(executablePathRef, localGameConfig.executablePath);

  // Carica i core RetroArch quando l'overlay si apre per una ROM Classic Console
  // Step 4 — carica profilo compat e config locale quando si apre l'overlay
  useEffect(() => {
    if (!showGameOptions || !selectedGame) return;
    fetch(`/api/games/${selectedGame.id}/compat`)
      // v1.5.20-dev.3 — fix causa reale di 10 errori tsc pre-esistenti
      // (9 + il nuovo profile.umuRun aggiunto qui): il ramo `: {}` di
      // questo ternario non era una Promise, mentre r.json() lo è —
      // TypeScript inferiva il tipo del .then() successivo come '{}'
      // invece di 'any', segnalando ogni singolo accesso a profile.X
      // come proprietà inesistente. Promise.resolve({}) allinea i due
      // rami allo stesso tipo Promise, risolvendo tutti gli accessi
      // in un colpo solo — nessuna logica cambiata, stesso identico
      // comportamento a runtime.
      .then(r => r.ok ? r.json() : Promise.resolve({}))
      .then(profile => {
        setLocalCompatProfile({
          fsr:      !!profile.fsr,
          gameMode: !!profile.gameMode,
          mangohud: Number(profile.mangohud ?? 0),
          eac:      !!profile.eac,
          battleye: !!profile.battleye,
          // v1.5.20-dev.3 — bug reale segnalato dall'utente: umuRun mancava
          // qui, quindi anche con il valore salvato correttamente nel DB
          // (fix v1.5.20-dev.2), l'overlay lo scartava ad ogni apertura e
          // mostrava sempre lo switch spento — oggetto ricostruito da zero
          // con una lista di campi hardcoded, non un merge col profilo
          // ricevuto. Stesso identico bug avrebbe colpito qualunque nuovo
          // campo booleano futuro aggiunto a CompatibilityProfile senza
          // toccare anche questo punto.
          umuRun:   !!profile.umuRun,
          // v1.5.20-dev.33 — BUG REALE segnalato dall'utente, esattamente
          // l'avvertimento lasciato scritto nel commento qui sopra da
          // dev.3 ("qualunque nuovo campo booleano futuro... senza
          // toccare anche questo punto") — dimenticato aggiungendo
          // bypassStoreAuthChain in dev.32. Stesso identico sintomo di
          // allora: salvato correttamente nel DB, scartato ad ogni
          // riapertura dell'overlay, switch sempre mostrato spento.
          bypassStoreAuthChain: !!profile.bypassStoreAuthChain,
          // v2.0.41-dev.26 — BUG REALE segnalato dall'utente, TERZA
          // occorrenza esatta dello stesso identico avvertimento
          // lasciato scritto qui sopra da dev.3 ("qualunque nuovo campo
          // futuro... senza toccare anche questo punto") — dimenticato
          // di nuovo aggiungendo gamescope in dev.24/25. Stesso identico
          // sintomo: salvato correttamente nel DB (verificato — la
          // scrittura era già corretta), scartato ad ogni riapertura
          // dell'overlay, selettore sempre tornato alla posizione
          // "spento" di default. Numero, non booleano — coerente col
          // ciclo a 4 stati (0|1|2|3).
          gamescope: Number(profile.gamescope ?? 0),
        });
        setCustomEnvText(
          Object.entries(profile.customEnv ?? {})
            .map(([k, v]) => `${k}=${v}`)
            .join('\n')
        );
        // v1.1.18 — reset esplicito: tutto ciò che arriva dal profilo
        // salvato è per definizione persistente (non esisterebbe un
        // concetto di "non persistente" scritto nel DB — per costruzione
        // le righe non persistenti non vengono mai salvate). Mappa vuota
        // = tutte le righe partono come persistenti, coerente col
        // default deciso.
        setCustomEnvPersistentFlags({});
        // Carica verbs winetricks salvati per questo gioco, fallback ai default
        if (Array.isArray(profile.winetricksVerbs)) {
          setWinetricksVerbs(profile.winetricksVerbs);
        } else {
          setWinetricksVerbs(DEFAULT_WINE_VERBS);
        }
        setDisableWineSync(!!profile.disableWineSync);
        setUseKnownFixes(!!profile.useKnownFixes);
        // v1.1.109-dev.1 — riparte sempre da vista compatta ad ogni
        // apertura/cambio gioco, stesso principio di setCustomEnvPersistentFlags
        // sopra: è uno stato di visualizzazione, non di configurazione.
        setWineDepsExpanded(false);
      })
      .catch(() => { setWinetricksVerbs(DEFAULT_WINE_VERBS); });
    setLocalGameConfig({
      executablePath: selectedGame.executablePath ?? '',
      launchArgs:     selectedGame.launchArgs     ?? '',
      steamAppId:     selectedGame.steamAppId     ?? '',
      dosboxConf:     selectedGame.dosboxConf     ?? '',
      libretroCore:   selectedGame.libretroCore   ?? '',
      scummvmId:      selectedGame.scummvmId      ?? '',
      scrapeTitle:    selectedGame.scrapeTitle    ?? '',
      // v2.0.41-dev.40 — override manuale del window_class rilevato
      // automaticamente. Stessa lezione già imparata con gamescope
      // (dev.26): ogni nuovo campo va aggiunto ESPLICITAMENTE qui,
      // altrimenti l'overlay lo mostrerebbe sempre vuoto anche quando un
      // valore esiste davvero nel DB.
      windowClass:    selectedGame.windowClass    ?? '',
      // Step 19d — switch "Launcher condiviso". Stringa vuota = nessuna
      // dipendenza, stesso principio degli altri campi in questa mappa
      // (mai null/undefined qui, solo nel salvataggio verso il backend).
      requiresLauncher: selectedGame.requiresLauncher ?? '',
    });
    fetch('/api/runners')
      .then(r => r.json())
      .then((runners: Array<{id: string; version: string; status: string}>) => {
        const match = runners.find(r => r.id === selectedGame.runner);
        setRunnerVersion(match?.version ?? selectedGame.runner ?? '');
      })
      .catch(() => setRunnerVersion(''));
    fetch('/api/system-tools')
      .then(r => r.json())
      .then(tools => setSystemTools(tools))
      .catch(() => {});
    // Carica runner installabili per il picker nell'overlay (se non già caricati)
    if (installableRunners.length === 0) {
      fetch('/api/runners/installable')
        .then(r => r.json())
        .then(setInstallableRunners)
        .catch(() => {});
    }
  }, [showGameOptions, selectedGame?.id]);

  // Sincronizza executablePath nel form se arriva via SSE dopo il completamento install
  useEffect(() => {
    if (!showGameOptions || !selectedGame?.executablePath) return;
    setLocalGameConfig(prev => {
      if (prev.executablePath) return prev; // non sovrascrivere se l'utente ha già scritto qualcosa
      return { ...prev, executablePath: selectedGame.executablePath! };
    });
  }, [showGameOptions, selectedGame?.executablePath]);

  useEffect(() => {
    if (!showGameOptions || !selectedGame) return;
    // v1.0.0 — fix: prima bastava store==='Classic Console' per mostrare
    // questa sezione, ma non tutti i giochi Classic Console usano
    // RetroArch (DOS passa da DOSBox, le avventure da ScummVM) — mostrare
    // "core RetroArch" per un gioco DOS non ha senso, stessa categoria di
    // confusione del mostrare Proton per un gioco RetroArch.
    if (selectedGame.runner !== 'RetroArch') return;
    const systemParam = selectedGame.system ? `?system=${encodeURIComponent(selectedGame.system)}` : '';
    fetch(`/api/retroarch/cores${systemParam}`)
      .then(r => r.json())
      .then(data => {
        setRetroarchAvailable(data.retroarchAvailable);
        setRetroarchCores(data.cores);
        setRetroarchDefaultCore(data.defaultCore ?? '');
      })
      .catch(() => setRetroarchAvailable(false));
  }, [showGameOptions, selectedGame?.id]);

  // Plugin disabilitati — mappa storeId → drmFree per filtro e badge card
  const pluginStateMap = useMemo(() => {
    const map = new Map<string, { enabled: boolean; drmFree: boolean }>();
    for (const p of pluginRegistry) map.set(p.id, { enabled: p.enabled, drmFree: p.drmFree });
    return map;
  }, [pluginRegistry]);

  // Mappa storeId → stato di autenticazione reale, distinta da
  // pluginStateMap (che riflette solo il toggle manuale on/off in Plugins).
  // Disconnettersi da uno store (logout) non disabilita il plugin — sono
  // due concetti diversi: il logout invalida una sessione, il toggle è una
  // preferenza utente persistente. Senza questa mappa, i titoli non
  // installati di uno store appena disconnesso restavano visibili come se
  // nulla fosse cambiato, perché il filtro esistente guardava solo
  // pluginRegistry.
  const storeConnectedMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const s of stores) map.set(s.id, !!s.isConnected);
    return map;
  }, [stores]);

  const filteredVisibleGames = useMemo(() => {
    // Il filtro per store è già applicato server-side (vedi gameManager.ts,
    // fetch con ?store=${activeStore}). Filtrare di nuovo qui contro `games`
    // produceva una griglia vuota istantanea ad ogni cambio di activeStore:
    // lo stato logico cambiava subito, ma `games` conteneva ancora i dati
    // del vecchio store fino al completamento del fetch (anche secondi),
    // quindi g.store === activeStore non trovava più alcuna corrispondenza
    // nella finestra di latenza. Rimuovendo il doppio filtro, la griglia
    // mostra sempre esattamente ciò che il server ha già restituito.
    let result = games;
    // Plugin disabilitati (toggle manuale): nascondi non installati, mantieni installati
    result = result.filter(g => {
      const ps = pluginStateMap.get(g.store as string);
      if (!ps || ps.enabled) return true;
      return g.isInstalled;
    });
    // Store disconnesso (logout): stessa logica, ma basata sullo stato di
    // autenticazione reale invece del toggle manuale. Esclude gli store
    // senza un vero concetto di login (Steam, Amazon, Battle.net, Classic
    // Console), per cui isConnected non implica una sessione da poter
    // perdere nello stesso senso.
    const NO_LOGIN_STORES = new Set(['Steam', 'Battle.net', 'Classic Console', 'Ubisoft', 'EA App']);
    result = result.filter(g => {
      const store = g.store as string;
      if (NO_LOGIN_STORES.has(store)) return true;
      const connected = storeConnectedMap.get(store);
      if (connected === undefined || connected) return true;
      return g.isInstalled;
    });
    if (onlyInstalled) result = result.filter(g => g.isInstalled);
    if (!searchQuery) {
      return appendSteamBigPictureCard(result, activeStore, '');
    }
    const s = searchQuery.toLowerCase();
    const searched = result.filter(g =>
      g.title.toLowerCase().includes(s) ||
      g.description.toLowerCase().includes(s) ||
      g.tags?.some(t => typeof t === 'string' && t.toLowerCase().includes(s))
    );
    // La card resta raggiungibile dalla ricerca col proprio nome, esattamente
    // come un vero elemento della libreria — non un'eccezione "sempre visibile
    // a prescindere", solo iniettata e poi soggetta allo stesso filtro testuale
    // applicato a tutti gli altri elementi.
    return appendSteamBigPictureCard(searched, activeStore, searchQuery);
  }, [games, searchQuery, onlyInstalled, pluginStateMap, storeConnectedMap, activeStore]);

  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const [selectionLocked, _setSelectionLocked] = useState(false); // kept for compat, unused

  // Lancia il gioco — accetta gameId diretto (click sx) o usa selectedGame (play button)
  // Ref sincronizzati con games/selectedGame/pluginStateMap: stesso motivo
  // di activeStoreRef/focusedIdRef. Questi tre cambiano molto frequentemente
  // (fetch libreria, cache, cambio card, toggle plugin) ed erano dipendenze
  // dirette di handlePlay, che è a sua volta dipendenza dell'effect gamepad
  // principale — ogni loro cambiamento rimontava l'intero effect. Una
  // pressione fisica (es. B) che cadeva nello stesso frame di quel remount
  // poteva andare persa a metà, anche se il suono dell'azione parte comunque
  // (play('back') è eseguito prima di ogni controllo sui rami if/else).
  const gamesRef = useRef(games);
  useEffect(() => { gamesRef.current = games; }, [games]);
  const selectedGameRef = useRef(selectedGame);
  useEffect(() => { selectedGameRef.current = selectedGame; }, [selectedGame]);
  const pluginStateMapRef = useRef(pluginStateMap);
  useEffect(() => { pluginStateMapRef.current = pluginStateMap; }, [pluginStateMap]);
  const storeConnectedMapRef = useRef(storeConnectedMap);
  useEffect(() => { storeConnectedMapRef.current = storeConnectedMap; }, [storeConnectedMap]);

  // v2.1.10-dev.12 — chiude la splash e la connessione SSE associata,
  // se aperta. Sicura da chiamare più volte (es. sia dal timeout visivo
  // sia da un successivo evento 'phase' che arriva un attimo dopo).
  const closeSplash = useCallback(() => {
    splashEventSourceRef.current?.close();
    splashEventSourceRef.current = null;
    setSplashInfo(null);
    // v2.1.11-dev.3 — vedi commento su activeGroupRef più sopra: senza
    // questo, activeGroup restava 'splash' per sempre dopo la chiusura,
    // lasciando moveFocus con un pool vuoto (nessun Focusable group
    // 'splash' più montato) finché qualcos'altro non lo sovrascriveva.
    // Condizionato su activeGroupRef.current per non scavalcare un altro
    // scope apertosi nel frattempo (es. Gestore Processi via Select+L1+R1
    // mentre la splash era ancora tecnicamente in corso).
    if (activeGroupRef.current === 'splash') setActiveGroup(null);
  }, [setActiveGroup]);

  // Apre la connessione SSE per un lancio appena avviato — stesso
  // endpoint già usato dalla vecchia finestra splash separata
  // (/api/games/:id/launch-stream), invariato lato backend. Le fasi
  // terminali (done/failed/timeout/cancelled) chiudono la splash da
  // sole dopo un breve intervallo, per lasciare il messaggio finale
  // leggibile — stesso principio dei sleep() che il backend faceva
  // prima di chiudere la vecchia finestra, ora spostato qui.
  const openSplashEventSource = useCallback((gameId: string, gameTitle: string) => {
    splashEventSourceRef.current?.close();
    setSplashInfo({ gameId, gameTitle, phase: 'launching' });
    setActiveGroup('splash');
    setTimeout(() => setFocusedId('splash-close'), 80);
    const es = new EventSource(`/api/games/${gameId}/launch-stream`);
    es.addEventListener('phase', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setSplashInfo(prev => (prev && prev.gameId === gameId ? { ...prev, ...data } : prev));
        if (data.phase === 'done') {
          setTimeout(closeSplash, 1500);
        } else if (data.phase === 'failed' || data.phase === 'timeout' || data.phase === 'cancelled') {
          setTimeout(closeSplash, 3500);
        }
      } catch { /* evento malformato, ignorato — la splash resta con l'ultimo stato valido */ }
    });
    splashEventSourceRef.current = es;
  }, [closeSplash, setActiveGroup, setFocusedId]);

  const handlePlay = useCallback(async (gameId?: string) => {
    const id = gameId ?? selectedGameRef.current?.id;
    if (!id) return;

    // v0.99.32 — La card "Steam Big Picture" è iniettata solo lato
    // frontend (filteredVisibleGames), non esiste in gamesRef (i dati reali
    // dal backend) — va intercettata qui, PRIMA della ricerca sottostante,
    // altrimenti game risulterebbe sempre undefined e la funzione
    // ritornerebbe silenziosamente senza fare nulla.
    if (id === STEAM_BIG_PICTURE_ID) {
      fetch('/api/system/steam-bigpicture', { method: 'POST' }).catch(() => {});
      play('select');
      return;
    }

    const game = gamesRef.current.find(g => g.id === id);
    if (!game) return;

    if (!game.isInstalled) {
      // Mostra conferma nel pannello download invece di avviare subito
      setPendingAction({ type: 'install', gameId: id, gameTitle: game.title });
      setShowDownloads(true);
      // v0.99.35 — fix: questa chiamata mancava qui (presente invece
      // nei due punti analoghi dentro l'overlay opzioni gioco, righe
      // ~5050/5068). Senza questa, activeGroup restava sul valore
      // precedente all'apertura del pannello — il sistema di focus
      // non sapeva che il gruppo "downloads" era ora quello attivo,
      // quindi il bottone "Installa" non riceveva mai il focus
      // iniziale lanciando l'installazione direttamente dalla card
      // (a differenza del bottone equivalente nell'overlay, che
      // impostava activeGroup correttamente). Causa esatta del
      // sintomo "serve chiudere e riaprire il pannello con L2" — quel
      // tasto/azione probabilmente chiama setActiveGroup altrove,
      // sistemando lo stato solo a posteriori.
      setActiveGroup('downloads');
      return;
    }

    // Gioco installato ma plugin disabilitato e DRM richiesto
    const ps = pluginStateMapRef.current.get(game.store as string);
    if (ps && !ps.enabled && !ps.drmFree) {
      // v0.99.38 — fix: era un alert() nativo del browser (compare come
      // popup di Chromium in alto al centro, fuori dal sistema di
      // notifiche della dashboard e non navigabile col pad) — lo stesso
      // scenario lato backend (vedi notificationEngine.ts, evento
      // 'launch-blocked') passa correttamente dal pannello notifiche,
      // ma qui il controllo blocca il lancio PRIMA che la richiesta
      // arrivi mai al server, quindi quel percorso non scattava.
      pushNotification({
        type: 'warning',
        title: t('dashboard:notif.launchBlockedTitle', { title: game.title }),
        body: t('dashboard:notif.launchBlockedBody', { store: game.store }),
        gameId: game.id,
        gameTitle: game.title,
        source: 'system',
        primaryAction: { label: t('dashboard:notif.goToPlugins'), handler: 'open_section', params: { section: 'plugins' } },
      });
      return;
    }

    // Gioco installato, plugin abilitato, ma sessione store disconnessa
    // (logout) e DRM richiesto: avviso non bloccante, non un blocco totale
    // come sopra — il gioco potrebbe comunque funzionare (cache locale,
    // modalità offline), ma l'utente deve sapere del rischio prima di
    // procedere, dato che la sessione non è più valida.
    const NO_LOGIN_STORES_HANDLEPLAY = new Set(['Steam', 'Battle.net', 'Classic Console', 'Ubisoft', 'EA App']);
    if (ps && !ps.drmFree && !NO_LOGIN_STORES_HANDLEPLAY.has(game.store as string)) {
      const connected = storeConnectedMapRef.current.get(game.store as string);
      if (connected === false) {
        const proceed = confirm(`"${game.title}" richiede l'autenticazione ${game.store} (DRM) e l'account risulta disconnesso.
Il gioco potrebbe non avviarsi correttamente. Rifai il login in Impostazioni → Store Accounts per maggiore affidabilità.

Vuoi provare ad avviarlo comunque?`);
        if (!proceed) return;
      }
    }

    play('launch');
    // v2.1.10-dev.12 — apre la splash overlay PRIMA del fetch di lancio,
    // stesso principio già stabilito per la vecchia finestra separata
    // (dev.36: appare subito, non solo dopo la verifica verb che può
    // richiedere secondi). Esclusi i launcher condivisi lanciati da soli
    // dalla propria card (stessa convenzione d'id usata lato backend,
    // `${launcherId}-launcher` — vedi isThisGameASharedLauncherApp in
    // gameManager.ts): nessuna sequenza di caricamento a fasi
    // paragonabile a un gioco per quei due app desktop.
    const isSharedLauncherStandalone = id.endsWith('-launcher');
    if (!isSharedLauncherStandalone) {
      openSplashEventSource(id, game.title);
    }
    try {
      await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      // Congela l'input gamepad mentre il gioco è in esecuzione.
      // Polling ogni 3s su /api/system/game-running per sapere quando il
      // processo termina.
      //
      // FIX v2.1.10-dev.2 — BUG UTENTE (segnalato indirettamente come
      // "la Dashboard intercetta l'input del controller durante il
      // gioco"): questo polling interrogava /api/status, un endpoint
      // generico di healthcheck del daemon che risponde SEMPRE e solo
      // { status, uptime } — non ha mai avuto né `running` né
      // `gameRunning`. `isRunning` valutava quindi sempre `false` già al
      // primo tick, e il freeze veniva rimosso dopo soli 3 secondi
      // dall'avvio, indipendentemente da quanto il gioco fosse ancora
      // realmente in esecuzione. L'endpoint corretto, già esistente e
      // usato da tray.py per lo stesso scopo, è /api/system/game-running
      // — risponde { running, gameId?, gameTitle? } da
      // isLastLaunchedGameRunning(), che esclude già i launcher condivisi.
      setFocusFrozen(true);
      gameStillRunningRef.current = true;
      let consecutiveFailures = 0;
      const pollGameRunning = setInterval(async () => {
        try {
          const res = await fetch('/api/system/game-running');
          const data = await res.json();
          const isRunning = data?.running ?? false;
          consecutiveFailures = 0;
          gameStillRunningRef.current = isRunning;
          if (!isRunning) {
            clearInterval(pollGameRunning);
            setFocusFrozen(false);
          }
        } catch {
          // Sblocca solo dopo ~30s di fallimenti CONSECUTIVI (10 tick da
          // 3s), non al primo errore isolato — un singolo fetch fallito
          // (rete momentaneamente occupata, GC pause) non è motivo
          // sufficiente per considerare il gioco chiuso.
          consecutiveFailures++;
          if (consecutiveFailures >= 10) {
            gameStillRunningRef.current = false;
            clearInterval(pollGameRunning);
            setFocusFrozen(false);
          }
        }
      }, 3000);
      // FIX v2.1.10-dev.6 — BUG UTENTE su hardware reale: "dopo 5 minuti
      // circa sento la dashboard rispondere di nuovo agli input" (pulsanti
      // sì, D-pad/analogico no — coerente con isFocusFrozen tornato false
      // mentre il focus non aveva un ancoraggio valido dopo minuti di
      // freeze: moveFocus non ha prodotto un salto percepibile, ma un
      // pulsante come Start/una combo con un suono ha comunque un
      // riscontro udibile anche a schermo occupato dal gioco). RIMOSSO
      // interamente un fallback assoluto pre-esistente (mai toccato in
      // dev.2, sopravvissuto identico dalla versione precedente a questo
      // intero lavoro sul punto 2) che sbloccava l'input dopo ESATTAMENTE
      // 5 minuti in modo INCONDIZIONATO — nessun controllo su
      // consecutiveFailures, nessun controllo se il polling sopra stesse
      // funzionando bene: un timer cieco che ignorava completamente lo
      // stato reale del gioco. Prima che esistesse la combo Select+L1+R1
      // (dev.2) questo timer aveva una ragion d'essere — l'unica via
      // d'uscita da un freeze potenzialmente perenne in caso di rilevamento
      // di chiusura del gioco realmente rotto (un processo zombie mai
      // rilevato come chiuso). Ora che quella combo esiste come via
      // d'uscita esplicita e affidabile, un timer cieco che scade sempre
      // alla stessa soglia — indipendentemente da quanto a lungo si sta
      // ancora giocando — è pura fonte del bug, non più una rete di
      // sicurezza. Il fallback dei fallimenti CONSECUTIVI di fetch, sopra,
      // resta l'unica rete di sicurezza automatica: quello sblocca solo
      // sulla base di un'evidenza reale (il backend non risponde più), non
      // di un timer alla cieca.
    } catch (err) {
      console.error("Launch failed:", err);
      setFocusFrozen(false);
      // v2.1.10-dev.12 — se il fetch di lancio stesso fallisce (es.
      // errore di rete), la splash aperta poco sopra resterebbe orfana:
      // nessun evento di fase arriverà mai a chiuderla da sola, dato che
      // il lancio non è mai nemmeno arrivato al backend.
      closeSplash();
    }
  }, [play, openSplashEventSource, closeSplash]);

  const handleLogin = async (storeId: string) => {
    play('select');
    setAuthMessage(prev => ({ ...prev, [storeId]: '⏳ Avvio autenticazione...' }));
    setAuthUrl(prev => { const n = { ...prev }; delete n[storeId]; return n; });
    try {
      const res = await fetch('/api/stores/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: storeId }),
      });
      const result = await res.json();
      if (result.authUrl) {
        setAuthUrl(prev => ({ ...prev, [storeId]: result.authUrl }));
      }
      if (result.message) {
        setAuthMessage(prev => ({ ...prev, [storeId]: result.message }));
      }
      if (result.waitForBrowser) {
        // Avvia polling — l'utente sta completando il login nel browser
        setAuthPolling(storeId);
      } else if (result.success) {
        // Login completato subito (es. Steam).
        // Step 18 (v1.1.37) — niente più fetch esplicito di /api/games
        // qui: `gameManager.loginToStore()` lato server chiama già
        // `refreshLibrary()` internamente, che emette l'evento SSE
        // 'library-updated' PRIMA ancora che questa risposta HTTP
        // torni — l'handler SSE (che passa da refreshGamesList())
        // farà il fetch aggiornato da solo. Resta solo /api/stores,
        // che l'evento 'library-updated' non copre (è specifico ai
        // giochi, non allo stato di connessione).
        const storesData = await fetch('/api/stores').then(r => r.json());
        setStores(storesData);
        setAuthMessage(prev => ({ ...prev, [storeId]: '✅ Connesso.' }));
        play('launch');
      } else {
        setAuthMessage(prev => ({ ...prev, [storeId]: result.message ?? 'Errore sconosciuto.' }));
      }
    } catch (err) {
      setAuthMessage(prev => ({ ...prev, [storeId]: '❌ Errore di rete.' }));
    }
  };

  const handleLogout = async (storeId: string) => {
    play('back');
    setAuthMessage(prev => ({ ...prev, [storeId]: '⏳ Disconnessione in corso...' }));
    try {
      const res = await fetch('/api/stores/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: storeId }),
      });
      const result = await res.json();
      if (result.success) {
        // Step 18 (v1.1.37) — niente più fetch esplicito di /api/games
        // qui (vedi commento gemello in handleLogin): `logoutFromStore()`
        // lato server chiama già `refreshLibrary()`, che emette
        // 'library-updated' — l'handler SSE aggiorna la libreria da solo,
        // rispettando qualunque filtro l'utente stia guardando in quel
        // momento. Il vecchio fetch mirato allo storeId disconnesso (con
        // merge manuale nello stato) non protegge nulla che non sia già
        // coperto da `allGamesForAccountCounts` (i conteggi per store in
        // questo stesso pannello usano quello, non `games`) — rimosso.
        const storesData = await fetch('/api/stores').then(r => r.json());
        setStores(storesData);
        setAuthMessage(prev => ({ ...prev, [storeId]: `✅ ${result.message}` }));
      } else {
        setAuthMessage(prev => ({ ...prev, [storeId]: `❌ ${result.message}` }));
      }
    } catch {
      setAuthMessage(prev => ({ ...prev, [storeId]: '❌ Errore di rete.' }));
    }
  };

  const handleInstallRunner = (runnerId: string) => {
    if (runnerInstalling) return;
    setRunnerInstalling(runnerId);
    setRunnerInstallProgress(prev => ({ ...prev, [runnerId]: ['⏳ Avvio download...'] }));

    const es = new EventSource(`/api/runners/install-stream?id=${encodeURIComponent(runnerId)}`);
    es.addEventListener('log', (e: any) => {
      const { message } = JSON.parse(e.data);
      setRunnerInstallProgress(prev => ({
        ...prev,
        [runnerId]: [...(prev[runnerId] ?? []), message].slice(-8),
      }));
    });
    es.addEventListener('done', (e: any) => {
      const { message } = JSON.parse(e.data);
      es.close();
      setRunnerInstalling(null);
      setRunnerInstallProgress(prev => ({
        ...prev,
        [runnerId]: [...(prev[runnerId] ?? []), `✅ ${message}`],
      }));
      // Ricarica runners installati
      fetch('/api/runners').then(r => r.json()).then(setAvailableRunners).catch(() => {});
      fetch('/api/runners/installable').then(r => r.json()).then(setInstallableRunners).catch(() => {});
      play('launch');
      // Pulisce il log dopo che l'utente ha avuto tempo di leggere l'esito:
      // senza questo, il blocco di righe resta visibile indefinitamente,
      // persistendo nello stato React fino a un refresh completo della pagina.
      setTimeout(() => {
        setRunnerInstallProgress(prev => {
          const next = { ...prev };
          delete next[runnerId];
          return next;
        });
      }, 5000);
    });
    es.addEventListener('error', (e: any) => {
      const msg = e.data ? JSON.parse(e.data).message : 'Errore durante l\'installazione.';
      es.close();
      setRunnerInstalling(null);
      setRunnerInstallProgress(prev => ({
        ...prev,
        [runnerId]: [...(prev[runnerId] ?? []), `❌ ${msg}`],
      }));
      setTimeout(() => {
        setRunnerInstallProgress(prev => {
          const next = { ...prev };
          delete next[runnerId];
          return next;
        });
      }, 5000);
    });
    es.onerror = () => {
      es.close();
      setRunnerInstalling(null);
    };
  };

  const handleUninstallRunner = (runnerId: string) => {
    if (runnerUninstalling) return;
    setRunnerUninstalling(runnerId);
    setRunnerUninstallProgress(prev => ({ ...prev, [runnerId]: ['⏳ Avvio disinstallazione...'] }));
    // Durata visiva minima: rm -rf su una cartella locale è praticamente
    // istantaneo, quindi l'animazione di progresso non avrebbe mai il tempo
    // di essere notata prima di scattare già a "completato" — spiazzante per
    // l'utente, come segnalato. Questo NON rallenta l'operazione reale (il
    // backend lavora comunque alla sua velocità naturale): ritarda solo il
    // momento in cui la UI riporta il completamento, garantendo che
    // l'animazione indeterminata compia almeno un ciclo visibile completo.
    const startedAt = Date.now();
    const MIN_VISUAL_MS = 900;

    const es = new EventSource(`/api/runners/uninstall-stream?id=${encodeURIComponent(runnerId)}`);
    es.addEventListener('log', (e: any) => {
      const { message } = JSON.parse(e.data);
      setRunnerUninstallProgress(prev => ({
        ...prev,
        [runnerId]: [...(prev[runnerId] ?? []), message].slice(-8),
      }));
    });
    es.addEventListener('done', (e: any) => {
      const { message } = JSON.parse(e.data);
      es.close();
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_VISUAL_MS - elapsed);
      setTimeout(() => {
        setRunnerUninstalling(null);
        setRunnerUninstallProgress(prev => ({
          ...prev,
          [runnerId]: [...(prev[runnerId] ?? []), `✅ ${message}`],
        }));
        // Ricarica runners: il runner torna tra gli installabili
        fetch('/api/runners').then(r => r.json()).then(setAvailableRunners).catch(() => {});
        fetch('/api/runners/installable').then(r => r.json()).then(setInstallableRunners).catch(() => {});
        play('back');
        setTimeout(() => {
          setRunnerUninstallProgress(prev => {
            const next = { ...prev };
            delete next[runnerId];
            return next;
          });
        }, 5000);
      }, remaining);
    });
    es.addEventListener('error', (e: any) => {
      const msg = e.data ? JSON.parse(e.data).message : 'Errore durante la disinstallazione.';
      es.close();
      setRunnerUninstalling(null);
      setRunnerUninstallProgress(prev => ({
        ...prev,
        [runnerId]: [...(prev[runnerId] ?? []), `❌ ${msg}`],
      }));
      setTimeout(() => {
        setRunnerUninstallProgress(prev => {
          const next = { ...prev };
          delete next[runnerId];
          return next;
        });
      }, 5000);
    });
    es.onerror = () => {
      es.close();
      setRunnerUninstalling(null);
    };
  };

  // Global search toggle — percorso CONTROLLER (tasto Y): apre la search bar
  // E la Virtual Keyboard, perché un controller non ha modo di digitare
  // altrimenti. Per il percorso mouse/tastiera fisica vedi
  // openSearchWithPhysicalInput più sotto — i due sono intenzionalmente
  // separati (v0.99.4): aprire la VK anche per chi sta già usando mouse e
  // tastiera fisica era ridondante e ingombrante (overlay fullscreen con
  // blur sopra tutta la dashboard) per un'azione che l'utente può già fare
  // nativamente nel campo di testo.
  const toggleSearch = useCallback(() => {
    setShowSearch(prev => {
      const next = !prev;
      if (next) {
        setActiveField(null); // assicura che la tastiera sia in modalità ricerca, non in un campo residuo
        setShowKeyboard(true);
        setActiveGroup('keyboard');
        // Il focus iniziale è gestito centralmente dal useEffect su showKeyboard
      } else {
        // FIX v0.99.8: rimosso setActiveStore(previousActiveStore) — la
        // chiusura della ricerca ripristinava sempre lo store da cui era
        // partita. Comportamento corretto in origine, ma con L1/R1 che ora
        // possono cambiare store mentre la ricerca resta attiva (v0.99.6,
        // navigando i risultati filtrati attraverso più librerie senza
        // perdere il filtro) è emerso un workflow utile non previsto:
        // cercare un titolo di cui non si ricorda lo store, scorrere con
        // L1/R1 finché non si trova filtrato altrove. Il rollback
        // riportava l'utente allo store di partenza proprio nel momento in
        // cui aveva trovato il titolo altrove — vanificando la scoperta.
        // Ora Y chiude la ricerca lasciando lo store esattamente dov'è al
        // momento della chiusura, qualunque libreria si stesse guardando.
        setShowKeyboard(false);
        setActiveField(null);
        setActiveGroup(null);
        // FIX v0.99.4: 'nav-search' non è più un Focusable (la lente non è
        // più navigabile da controller, solo cliccabile da mouse — vedi
        // punto 2 del fix navigazione) — setFocusedId('nav-search') non
        // avrebbe più alcun target valido nel registry. Nessun
        // setFocusedId qui: con activeGroup tornato a null, il prossimo
        // input direzionale del controller (se l'utente lo usa) farà
        // ricadere correttamente moveFocus sul fallback del group
        // 'dashboard' tramite il meccanismo già esistente.
      }
      return next;
    });
    play('select');
  }, [play, setActiveGroup]);

  // Apre la search bar per interazione mouse/tastiera fisica (v0.99.4):
  // NESSUNA Virtual Keyboard — porta il focus diretto sull'input reale,
  // che l'utente può già compilare con la propria tastiera. Chiamata dal
  // click sulla lente (mouse) e da Ctrl+F.
  // Il campo è già montato non appena showSearch diventa true (AnimatePresence
  // con height/opacity, non un mount/unmount condizionale), quindi un breve
  // delay basta per garantire che il ref dell'input esista già nel DOM.
  const openSearchWithPhysicalInput = useCallback(() => {
    if (!showSearch) {
      // FIX v0.99.8: non salva più previousActiveStore — la chiusura della
      // ricerca (Y, Escape, "Fatto" su un campo, ecc.) non fa più alcun
      // rollback dello store: resta sempre su quello visualizzato al
      // momento della chiusura. Vedi toggleSearch per il dettaglio.
      setShowSearch(true);
    } else if (showKeyboard) {
      // Caso limite: la ricerca era già aperta da Y/controller (con VK
      // sovrapposta) e l'utente passa al mouse/tastiera fisica — chiude la
      // VK residua, lasciando solo la search bar e il focus sull'input.
      setShowKeyboard(false);
      setActiveField(null);
      setActiveGroup(null);
    }
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, [showSearch, showKeyboard, setActiveGroup]);

  // Handler Esc unificato
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        // FIX v0.99.4: Ctrl+F è già un'azione da tastiera fisica — usa lo
        // stesso percorso del click mouse sulla lente (focus diretto
        // sull'input, niente Virtual Keyboard), non più toggleSearch
        // (che apriva sempre anche la VK, ridondante e ingombrante per chi
        // sta già usando una tastiera fisica).
        openSearchWithPhysicalInput();
        return;
      }
      if (e.key === 'Escape') {
        // FIX v0.99.4: la ricerca può essere stata aperta da due percorsi
        // distinti — Y/controller (con Virtual Keyboard e activeGroup
        // 'keyboard' attivi) o mouse/Ctrl+F (solo focus sull'input, nessuno
        // stato aggiuntivo). Se la VK è effettivamente aperta, toggleSearch
        // la chiude correttamente insieme al resto dello stato; altrimenti
        // basta chiudere la search bar.
        // FIX v0.99.8: rimosso il rollback setActiveStore(previousActiveStore)
        // — Escape ora chiude la ricerca lasciando lo store esattamente
        // dov'è, stesso comportamento di Y (vedi toggleSearch).
        if (showSearch && showKeyboard) { toggleSearch();                return; }
        if (showSearch)                 { setShowSearch(false);          return; }
        if (showGameOptions)  { setShowGameOptions(false);     play('back'); return; }
        if (showNotifications) { setShowNotifications(false);   return; }
        if (showNotifications) { setShowNotifications(false);   return; }
        if (showDownloads)    { setShowDownloads(false);       return; }
        if (viewState !== 'library') { setViewState('library'); return; }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, showKeyboard, showGameOptions, showDownloads, viewState, toggleSearch, openSearchWithPhysicalInput, play]);

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ALT + ENTER -> Cicla modalità display (window ↔ kiosk)
      if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        cycleDisplayMode();
      }
      // CTRL + H -> Toggle Debug Console
      if (e.ctrlKey && e.key === 'h') {
        e.preventDefault();
        setShowDebugConsole(prev => !prev);
        play('select');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [play]);

  // FIX v0.99.4: rimosso searchJustOpenedRef (anti-bounce per "A su
  // nav-search") — non più necessario: la lente non è più un Focusable
  // attivabile da A (vedi punto 2 del fix navigazione), e l'apertura
  // ricerca da controller passa ora dal tasto Y, che ha un ramo `if`
  // indipendente con la propria edge-detection già garantita da
  // isJustPressed (consumedRef, v0.96) — nessun rischio di doppia lettura
  // nello stesso frame come accadeva quando A serviva sia per "apri
  // ricerca" sia per "azione generica" nello stesso gestore.

  // ───────────────────────────────────────────────────────────────────────
  // MODELLO DI NAVIGAZIONE (specifica concordata):
  //
  // - La Dashboard (top bar store + libreria) è UNA griglia continua:
  //   su/giù/sx/dx si muovono liberamente fra store bar e card, nessun
  //   confine. activeGroup resta null quando nessun overlay è aperto.
  //
  // - Ogni overlay/pannello modale (game-options, avatar-library, settings,
  //   downloads, notifications, quick-menu) è uno SCOPE ISOLATO: appena si
  //   apre, activeGroup viene impostato sul group di quell'overlay, e lo
  //   stick/D-pad naviga SOLO dentro quel pannello.
  //
  // - A: esegue l'azione dell'elemento selezionato (sempre).
  // - B: chiude il pannello/overlay corrente UN livello alla volta e
  //   ripristina lo scope precedente (mai più livelli insieme).
  // - X: su una card della libreria apre l'overlay Game Options; con
  //   l'overlay già aperto, X lo richiude (toggle), riportando lo scope
  //   alla Dashboard.
  // - Select: toggle del quick-menu, con relativo scope dedicato.
  // - Y: apre la ricerca con la Virtual Keyboard (v0.99.4) — solo quando
  //   nessun altro overlay/scope è già attivo.
  // ───────────────────────────────────────────────────────────────────────

  // Apre l'overlay Game Options e isola lo scope di navigazione.
  //
  // FIX v0.99.4: il focus iniziale non viene più forzato su un id hardcoded
  // ('game-options-close', il pulsante di chiusura) — quel valore ignorava
  // il fallbackPriority negativo già dichiarato su quel pulsante, perché
  // veniva scritto direttamente nello stato invece di passare dal
  // meccanismo di scoring del FocusProvider: l'id era comunque "valido" nel
  // nuovo pool, quindi il primo movimento direzionale non lo correggeva.
  // focusFirstInGroup interroga il registry con lo stesso criterio già
  // usato per il fallback automatico (priorità + posizione), selezionando
  // il primo controllo di contenuto reale invece del bottone di chiusura.
  const openGameOptions = useCallback((gameId: string) => {
    // v2.0.41-dev.7 — richiesta utente: la card "Steam Big Picture" deve
    // rispondere SOLO ad A (Invio/click sinistro), come qualunque altra
    // card risponde solo alla propria azione primaria — X/click destro
    // devono restare senza effetto, non un'azione alternativa che porta
    // comunque allo stesso risultato. Prima (v0.99.32) X reindirizzava a
    // handlePlay con la motivazione "un solo significato per qualunque
    // interazione" — esattamente il comportamento anomalo segnalato:
    // ora X/click destro su questa card non fanno letteralmente nulla.
    if (gameId === STEAM_BIG_PICTURE_ID) return;
    setSelectedGameId(gameId);
    setShowGameOptions(true);
    setActiveGroup('game-options');
    play('select');
    setTimeout(() => focusFirstInGroup('game-options'), 80);
  }, [play, focusFirstInGroup, setActiveGroup]);

  // Chiude l'overlay Game Options e ripristina lo scope Dashboard.
  // La card è sempre montata sotto l'overlay (che è sovrapposto, non la
  // sostituisce), ma lasciamo un micro-delay cautelativo nel caso la card
  // sia fuori dal viewport corrente e debba ancora completare lo
  // scrollIntoView innescato da setFocusedId. Con triggerFocusedAction che
  // ora legge dal registry invece che dal DOM, anche se l'utente preme A
  // durante questa finestra non si verifica più un click silenzioso a vuoto.
  const closeGameOptions = useCallback(() => {
    setShowGameOptions(false);
    setActiveGroup(null);
    if (selectedGameId) setTimeout(() => setFocusedId(`game-${selectedGameId}`), 50);
  }, [selectedGameId, setFocusedId, setActiveGroup]);

  // Ciclo store bar con L1/R1: 'All' + tutti gli store registrati, in ordine.
  // Esclude il logo X-Launcher (ora apribile solo con Home/Start) e l'icona
  // avatar (ora puramente decorativa, raggiungibile solo dal menu).
  // La sola selezione — senza bisogno di A — cambia subito la libreria attiva.
  // Store con plugin disattivato: nascosti dalla store bar perché l'utente
  // ha dichiarato di non possedere un account in quello store. Diverso dal
  // caso "disconnesso" (storeConnectedMap): un plugin disattivato è una
  // dichiarazione esplicita e persistente, non solo una sessione scaduta —
  // quindi qui lo store scompare del tutto, non solo i suoi titoli non
  // installati.
  const visibleStores = useMemo(
    () => stores.filter(s => {
      const ps = pluginStateMap.get(s.id);
      return !ps || ps.enabled;
    }),
    [stores, pluginStateMap]
  );

  const storeCycleIds = useMemo(() => ['All', ...visibleStores.map(s => s.id)], [visibleStores]);

  // Debounce esplicito: rete di sicurezza indipendente dal fix di stabilità
  // del remount sopra. Anche con quel fix, un controller Bluetooth può
  // generare letture "rumorose" del pulsante (pressione-rilascio-pressione
  // in pochi millisecondi per un solo gesto fisico) a livello di driver/OS,
  // del tutto fuori dal controllo del nostro codice React. 130ms è un
  // compromesso: abbastanza per ignorare il rumore del segnale, abbastanza
  // breve da non rendere la navigazione percettibilmente "gommosa".
  const lastCycleStoreRef = useRef(0);

  const cycleStore = useCallback((direction: 'next' | 'prev') => {
    const now = Date.now();
    if (now - lastCycleStoreRef.current < 130) return;
    lastCycleStoreRef.current = now;

    const currentIndex = storeCycleIds.indexOf(activeStoreRef.current);
    // Se il focus non è già su uno store (es. veniamo dalla libreria sotto),
    // partiamo comunque dall'attualmente attivo per dare continuità.
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;
    const len = storeCycleIds.length;
    const nextIndex = direction === 'next'
      ? (baseIndex + 1) % len
      : (baseIndex - 1 + len) % len;
    const nextStoreId = storeCycleIds[nextIndex];

    setActiveStore(nextStoreId as StoreType | 'All');
    setFocusedId(nextStoreId === 'All' ? 'store-all' : `store-${nextStoreId}`);
    play('select');
  }, [storeCycleIds, setFocusedId, play]);

  // Ciclo tab Settings con L1/R1, stessa identica logica di cycleStore:
  // ref per evitare che il callback cambi identità ad ogni tab selezionata
  // (la causa del bug "L1/R1 impazziti" sulla store bar), array fisso delle
  // 4 tab, debounce dedicato come rete di sicurezza contro il rumore di
  // segnale dei controller Bluetooth.
  // v1.1.0 — settings-tabs è il primo group migrato alla strategia
  // 'sequential': prima esisteva solo grazie al ciclo indexOf/modulo scritto
  // a mano in cycleSettingsTab (sopra). Dichiarata qui una sola volta al
  // mount — non cambia mai a runtime, non serve altro.
  useEffect(() => {
    setGroupStrategy('settings-tabs', 'sequential');
  }, [setGroupStrategy]);

  const activeSettingsTabRef = useRef(activeSettingsTab);
  useEffect(() => { activeSettingsTabRef.current = activeSettingsTab; }, [activeSettingsTab]);
  const lastCycleSettingsTabRef = useRef(0);

  // Risolve esplicitamente il primo Focusable sensato per ogni tab di
  // Settings, invece di affidarsi al fallback geometrico generico di
  // FocusProvider.moveFocus. Quel fallback aveva un bias strutturale:
  // close-settings è nell'header della maschera, quindi geometricamente
  // sempre il più in alto di tutta la tab — vinceva sempre il calcolo
  // "elemento più in alto" indipendentemente da quanto in basso si trovasse
  // il primo controllo reale del contenuto. Qui invece sappiamo esattamente
  // cosa esiste per ciascuna tab e puntiamo lì in modo deterministico.
  const getFirstFocusableForSettingsTab = useCallback((tab: 'accounts' | 'engine' | 'plugins' | 'input' | 'ai-models' | 'hardware'): string | null => {
    switch (tab) {
      case 'accounts': {
        const visibleAccountStores = stores.filter(s => {
          const ps = pluginStateMapRef.current.get(s.id);
          return !ps || ps.enabled;
        });
        const first = visibleAccountStores[0];
        if (!first) return null;
        const noLogin = ['Battle.net', 'Classic Console', 'Ubisoft', 'EA App'].includes(first.id);
        if (noLogin) return null; // nessun controllo interattivo su questa card
        return first.isConnected ? `store-unlink-${first.id}` : `store-connect-${first.id}`;
      }
      case 'engine':
        // Step 19b (v1.1.38) — il selettore di lingua è ora il primo
        // elemento reale della tab (vedi il blocco che lo renderizza più
        // sotto in App.tsx), sempre presente indipendentemente da
        // availableRunners/installableRunners. Prima di questo fix questa
        // funzione restituiva ancora il vecchio primo elemento (lista
        // runner): sia entrando dalla tab bar sia con L1/R1 il focus
        // saltava il selettore, atterrando direttamente sui runner — da lì
        // "su" tornava al pulsante di chiusura invece che al selettore,
        // stesso bug segnalato in test.
        return 'settings-language-toggle';
      case 'plugins':
        return pluginRegistry[0] ? `plugin-toggle-${pluginRegistry[0].id}` : null;
      case 'input':
        return inputPlugins[0] ? `input-plugin-toggle-${inputPlugins[0].id}` : null;
      case 'ai-models':
        return ollamaModels[0] ? `ollama-model-select-${ollamaModels[0].name}` : null;
      default:
        return null;
    }
  }, [stores, pluginRegistry, inputPlugins, ollamaModels]);

  // Ref sincronizzato con getFirstFocusableForSettingsTab: stesso motivo di
  // activeStoreRef/focusedIdRef. Qualunque cambio in stores/pluginRegistry/
  // inputPlugins/ecc. (es. attivare o disattivare un plugin) cambia
  // l'identità di questa funzione; senza il ref, cycleSettingsTab — che la
  // usa — cambierebbe identità a sua volta, e siccome cycleSettingsTab è
  // dipendenza dell'effect gamepad principale, l'intero effect si
  // rimonterebbe. Se una pressione fisica (B, nel caso riportato) cadeva
  // nello stesso frame di quel remount, l'input poteva andare parzialmente
  // perso: il suono parte comunque (eseguito prima di ogni controllo di
  // stato), ma la logica di chiusura non viene mai eseguita.
  const getFirstFocusableForSettingsTabRef = useRef(getFirstFocusableForSettingsTab);
  useEffect(() => { getFirstFocusableForSettingsTabRef.current = getFirstFocusableForSettingsTab; }, [getFirstFocusableForSettingsTab]);

  const cycleSettingsTab = useCallback((direction: 'next' | 'prev') => {
    const now = Date.now();
    if (now - lastCycleSettingsTabRef.current < 130) return;
    lastCycleSettingsTabRef.current = now;

    // v1.1.0 — migrato dal ciclo indexOf/modulo scritto a mano su
    // settingsTabCycleIds al meccanismo generico cycleSequential
    // (FocusProvider), stessa astrazione discussa per il modello di
    // navigazione device-agnostic. fromId esplicito perché il riferimento
    // qui è "quale tab è attiva", non il focus visivo corrente (che nella
    // maggior parte dei casi è dentro al contenuto della tab).
    const nextId = cycleSequential('settings-tabs', direction, {
      wrap: true,
      fromId: `settings-tab-${activeSettingsTabRef.current}`,
    });
    if (!nextId) return;
    const nextTab = nextId.replace('settings-tab-', '') as 'accounts' | 'engine' | 'plugins' | 'input' | 'ai-models' | 'hardware';

    setActiveSettingsTab(nextTab);
    play('select');
    const target = getFirstFocusableForSettingsTabRef.current(nextTab);
    setTimeout(() => setFocusedId(target ?? nextId), 50);
  }, [cycleSequential, play, setFocusedId]);

  // Step 19b (v1.1.38) — solo due lingue per ora (vedi appConfig.ts):
  // un toggle binario, non serve una vera "direzione" come cycleSettingsTab
  // (rimasta come nome per coerenza col pattern, ma ignorata nella scelta
  // del prossimo valore). Persistita in app.conf con lo stesso meccanismo
  // già in uso per displayMode/fullscreen (PATCH /api/config).
  const cycleUiLanguage = useCallback(() => {
    // v1.1.49 — segnala all'effetto di boot (vedi commento esteso lì) che
    // l'utente ha già scelto manualmente: se il fetch di /api/config
    // risolve DOPO questo punto (boot a freddo lento), non deve più
    // sovrascrivere questa scelta con il valore persistito precedente.
    userChangedLanguageRef.current = true;
    const next: 'it' | 'en' = i18n.language === 'it' ? 'en' : 'it';
    i18n.changeLanguage(next);
    fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: next }),
    }).catch(() => {});
    play('select');
  }, [i18n, play]);

  // Step 19b (v1.1.42) — segnalato dall'utente in test: le descrizioni dei
  // plugin store/input restavano in italiano cambiando lingua, perché sono
  // dati letti dal backend (steamPlugin.ts, XInputPlugin.ts, ecc.), non
  // stringhe scritte in App.tsx — il grep usato per individuare il testo
  // da tradurre nelle tab precedenti non le trovava. Invece di spostare
  // l'i18n lato backend (un lavoro distinto, plugin non ancora pensati per
  // restituire chiavi anziché testo), le traduzioni vivono qui nel
  // frontend, indicizzate per id plugin — con fallback al testo originale
  // del backend per qualunque plugin non presente in queste chiavi (es.
  // un plugin di terze parti futuro, coerente con l'idea di "pacchetti
  // caricabili" del resto del sistema i18n: un plugin senza traduzione
  // mostra il proprio testo invece di rompersi o mostrare una chiave
  // grezza). I punti (Battle.net) non sono validi in una chiave i18next
  // (keySeparator di default è '.'), quindi l'id viene sanificato prima
  // della lookup.
  const translateStorePluginDescription = useCallback((pluginId: string, fallback: string) => {
    const key = pluginId.replace(/[^a-zA-Z0-9]/g, '_');
    return t(`storePluginDescriptions.${key}`, fallback);
  }, [t]);
  // v1.1.124-dev.1 — stesso identico pattern di translateStorePluginDescription
  // sopra: la description dei provider Cloud Backup arriva dal backend
  // sempre in italiano (campo readonly della classe del provider) — senza
  // questa traduzione l'inglese mostrerebbe comunque il testo italiano.
  const translateCloudBackupDescription = useCallback((providerId: string, fallback: string) => {
    const key = providerId.replace(/[^a-zA-Z0-9]/g, '_');
    return t(`cloudBackupDescriptions.${key}`, fallback);
  }, [t]);
  const translateInputPluginDescription = useCallback((pluginId: string, fallback: string) => {
    return t(`inputPluginDescriptions.${pluginId}`, fallback);
  }, [t]);
  // v2.0.41-dev.16 — BUG UTENTE: stesso identico problema di
  // translateStorePluginDescription sopra, ma per il campo `description`
  // della RIGA GIOCO (non del plugin) — la card "launcher" seedata da
  // ogni StorePlugin di un launcher condiviso (Ubisoft Connect, EA App,
  // vedi ensureSeeded() nei rispettivi file) scrive un testo fisso in
  // italiano nel DB una volta sola, mostrato poi tale e quale nella
  // colonna destra a prescindere dalla lingua corrente — non passa mai
  // da t(). Stesso namespace 'dashboard' già usato per il resto della
  // colonna destra (coerenza), non 'settings' come l'omonima funzione
  // sopra (quella vive nella tab Impostazioni, questa nella Dashboard).
  const translateLauncherGameDescription = useCallback((gameId: string, fallback: string) => {
    const key = gameId.replace(/[^a-zA-Z0-9]/g, '_');
    return t(`dashboard:launcherDescriptions.${key}`, fallback);
  }, [t]);
  // Solo il fallback "Controller Generico" ha un vero nome da tradurre —
  // gli altri (Xbox / XInput, DualShock 4, DualSense) sono nomi di
  // prodotto, identici in entrambe le lingue, quindi non hanno bisogno di
  // una chiave: il fallback li restituisce invariati.
  const translateInputPluginName = useCallback((pluginId: string, fallback: string) => {
    return t(`inputPluginNames.${pluginId}`, fallback);
  }, [t]);
  // CLOUD_PROVIDERS è una costante di App.tsx (non dati da backend come i
  // plugin store/input), ma stessa idea di fallback: se in futuro un
  // provider venisse aggiunto senza aggiornare le chiavi di traduzione,
  // mostra comunque la nota invece di una chiave grezza o testo mancante.
  const translateCloudProviderNote = useCallback((providerId: string, fallback: string) => {
    return t(`cloudProviderNotes.${providerId}`, fallback);
  }, [t]);
  // Step 19b (v1.1.49) — game.status è testo scritto letteralmente in
  // inglese nel DB da ciascun plugin store ('Ready to Launch'/'Not
  // Installed'/'Playing' — vedi db.ts/steamPlugin.ts/gogPlugin.ts/
  // epicPlugin.ts/classicPlugin.ts), non un dato variabile per titolo:
  // stesso principio già usato per le descrizioni plugin, mappa
  // valore→traduzione con fallback al testo originale per qualunque
  // valore di stato non ancora mappato (nuovi plugin futuri inclusi).
  // Namespace 'dashboard', non 'settings' (il default di `t` qui) — da
  // cui il prefisso esplicito.
  const translateGameStatus = useCallback((status: string, fallback: string) => {
    const key = status.replace(/[^a-zA-Z0-9]/g, '_');
    return t(`dashboard:gameStatus.${key}`, fallback);
  }, [t]);
  // "Classic Console" (e futuri nomi coniati dal progetto, non brand di
  // terzi come Steam/GOG/Epic/Battle.net/Amazon) è un nome descrittivo
  // scelto da X-Launcher stesso, non un marchio — quindi va tradotto,
  // a differenza degli altri nomi store. Fallback al nome originale per
  // qualunque store non presente in questa mappa (tutti gli altri, che
  // sono brand e restano SEMPRE invariati per scelta, non per lacuna).
  const translateStorePluginName = useCallback((storeId: string, fallback: string) => {
    const key = storeId.replace(/[^a-zA-Z0-9]/g, '_');
    return t(`dashboard:storePluginNames.${key}`, fallback);
  }, [t]);

  useEffect(() => {
    // Se il focus è congelato (gioco in esecuzione) ignora tutto l'input
    // TRANNE la combo di risveglio Select+L1+R1 — v2.1.10-dev.2, punto 2
    // della roadmap. Prima di questo step, isFocusFrozen non aveva
    // alcuna eccezione: una volta congelato l'unico modo per riottenere
    // il controllo dalla Dashboard era attendere che il gioco tracciato
    // chiudesse (o il fallback di 30s di errori di rete CONSECUTIVI —
    // vedi handlePlay) — nessuna via per, ad esempio, raggiungere il
    // Gestore Processi e terminare un processo bloccato.
    //
    // Ordine di lettura: Select e L1 tenuti premuti, R1 il tasto che
    // completa la combo (stesso schema già usato per Select+R2 più
    // sotto, fuori da questo ramo). Richiede TUTTI E TRE, a differenza
    // di Select+R2 che ne richiede solo due — combo intenzionalmente più
    // lunga per una funzione che scavalca il freeze, per ridurre il
    // rischio di trigger accidentali mentre si gioca.
    if (isFocusFrozen) {
      if (gamepadState.buttons.has('Select') && gamepadState.buttons.has('L1') && isJustPressed('R1')) {
        play('select');
        // v2.1.10-dev.8 — diagnostica: se questa combo smette di
        // rispondere durante il bug segnalato dall'utente, questa voce
        // non comparirà affatto nella Debug Console — prova diretta che
        // il loop gamepad si è fermato (Ipotesi B), non che la combo sia
        // stata letta ma ignorata.
        logDiag(`[DIAG] Select+L1+R1 rilevato — isFocusFrozen era true, document.hidden=${document.hidden}`);
        fetch('/api/system/input-wake', { method: 'POST' }).catch(() => {});
        setFocusFrozen(false);
        // FIX v2.1.10-dev.11 — BUG UTENTE su hardware reale: dopo aver
        // aperto il Gestore Processi da qui, terminato il gioco e chiuso
        // il Gestore Processi (pm-close), l'analogico/D-pad restavano
        // bloccati sulla libreria finché non si apriva e richiudeva il
        // quick-menu con Start. Causa: il Gestore Processi può NORMALMENTE
        // essere aperto solo da un quick-menu già visibile
        // (opt-process-manager, in fondo a questo stesso file) — e sia
        // pm-close sia il ramo "Start mentre il Gestore Processi è aperto"
        // (poco più sotto in questo stesso effetto) assumono SEMPRE quel
        // precondizione: impostano activeGroup su 'quick-menu' senza mai
        // toccare viewState, perché normalmente è già 'quick-menu' da
        // prima. Qui invece si apriva il Gestore Processi direttamente,
        // saltando quel passaggio — viewState restava 'library', il
        // pannello del quick-menu (condizionato su viewState==='quick-menu'
        // alla riga della sua resa) non veniva mai renderizzato, e
        // moveFocus non aveva nulla su cui muoversi nel gruppo 'quick-menu'
        // fantasma. Aggiunto qui lo stesso setViewState che un Avvio
        // normale da Start avrebbe già impostato, per lasciare lo stato
        // coerente con quello che pm-close/Start assumono sempre.
        setViewState('quick-menu');
        setShowProcessManager(true);
        setActiveGroup('process-manager');
        setTimeout(() => setFocusedId('pm-close'), 80);
      }
      // Select+B — annulla un lancio in corso, punto (c) della richiesta
      // dell'utente sulla splash integrata (v2.1.10-dev.12). Disponibile
      // SOLO mentre la splash è visibile (splashInfo non null): il
      // freeze scatta comunque immediatamente al lancio, invariato per
      // esplicita scelta dell'utente (non spostato alla rilevazione
      // della finestra, come proposto e poi scartato) — questa è quindi
      // l'UNICA eccezione per la fase di avvio/verifica, non deve mai
      // essere disponibile durante il gioco vero e proprio: una volta
      // che la splash si chiude da sola (fase 'done', gioco rilevato),
      // splashInfo torna null e questo ramo smette di scattare, lasciando
      // il freeze normale — quello con la sola eccezione Select+L1+R1 —
      // esattamente come oggi.
      else if (splashInfo && gamepadState.buttons.has('Select') && isJustPressed('B')) {
        play('back');
        fetch(`/api/games/${splashInfo.gameId}/cancel-launch`, { method: 'POST' }).catch(() => {});
        closeSplash();
        setFocusFrozen(false);
        gameStillRunningRef.current = false;
      }
      return;
    }

    // v1.1.8 — Modalità cattura area di test controller: mentre questo
    // widget ha il focus, la Dashboard NON deve interpretare alcun input
    // come azione — altrimenti ogni pressione/movimento durante il test
    // attiverebbe anche una funzione reale (navigazione, cicli store,
    // ecc.), che è esattamente quello che il test dovrebbe escludere
    // dall'equazione. Unica eccezione: una pressione PROLUNGATA di B
    // (soglia GAMEPAD_TEST_EXIT_HOLD_MS) riporta alla navigazione
    // normale — la sola via di uscita garantita, per non restare
    // "intrappolati" nel widget con un controller e nessuna tastiera.
    // v1.1.10 — la rilevazione della pressione prolungata di B è stata
    // spostata in un useEffect dedicato più sotto, con un proprio timer
    // indipendente da gamepadState: qui bastava sospendere tutto il resto,
    // ma calcolare la durata della pressione DENTRO questo effetto era
    // sbagliato — si riesegue solo quando gamepadState cambia (nuovo
    // pulsante o asse), e un B tenuto premuto senza muovere gli stick non
    // cambia nulla frame dopo frame: il progresso restava fermo al primo
    // istante invece di avanzare durante l'attesa.
    if (focusedIdRef.current === 'gamepad-test-area') return;

    // Select+◄/► — torna alla finestra del gioco tracciato (v2.1.10-dev.10,
    // punto 2 roadmap). STORIA: dev.7 aveva sostituito il "ritorno al
    // gioco" a memoria singola di dev.2 con un ciclo Alt+Tab-like fra
    // tutte le finestre aperte — sembrava corretto, ma due log reali
    // forniti dall'utente (dev.8/dev.9) hanno mostrato che restava
    // inaffidabile: quando si preme la combo stando sulla Dashboard (il
    // caso normale, subito dopo un risveglio), la Dashboard è la
    // finestra attiva ma è esclusa dall'elenco su cui si cicla — l'indice
    // di partenza è sempre -1, e il ripiego ricadeva sempre sullo stesso
    // risultato arbitrario (il desktop, mai il gioco, in entrambi i log).
    // Su proposta dell'utente: niente più ciclo generico, si punta
    // DIRETTAMENTE alla finestra del gioco (correlata per PID/cgroup lato
    // backend — vedi windowFocus.ts) — ◄ e ► fanno ora la stessa identica
    // cosa, un solo bersaglio possibile non lascia spazio a una direzione
    // diversa dall'altra. Disponibile solo se un gioco tracciato risulta
    // ancora in esecuzione (gameStillRunningRef, aggiornato dallo stesso
    // polling di handlePlay che gestisce isFocusFrozen). Va controllata
    // PRIMA del blocco D-pad normale sotto, altrimenti
    // isJustPressed('Left'/'Right') consumerebbe già il fronte di
    // pressione per moveFocus prima di arrivare qui.
    if (gamepadState.buttons.has('Select') && gameStillRunningRef.current) {
      const pressedDirection = isJustPressed('Left') ? '◄' : isJustPressed('Right') ? '►' : null;
      if (pressedDirection) {
        // Diagnostica (v2.1.10-dev.8, ancora utile): se questa combo
        // smette di rispondere durante un futuro problema simile, questa
        // voce non comparirà — prova diretta che il loop gamepad si è
        // fermato, non che la combo sia stata letta ma ignorata.
        logDiag(`[DIAG] Select+${pressedDirection} rilevato — isFocusFrozen=${isFocusFrozen}, document.hidden=${document.hidden}`);
        fetch('/api/system/input-focus-game', { method: 'POST' })
          .then(res => res.json())
          .then(data => {
            logDiag(`[DIAG] input-focus-game risposta: success=${data?.success}`);
            // Ri-arma il freeze SOLO se il focus sulla finestra del gioco
            // è davvero riuscito: se fallisce (nessuna finestra trovata
            // per il PID/cgroup tracciato, o wmctrl/xprop assenti) la
            // Dashboard è rimasta in primo piano — congelare comunque
            // l'input la renderebbe inutilizzabile senza una seconda
            // combo di risveglio per uscirne.
            if (data?.success) setFocusFrozen(true);
          })
          .catch(() => {});
        play('back');
      }
      return;
    }

    if (isJustPressed('Up'))    moveFocus('up');
    if (isJustPressed('Down'))  moveFocus('down');
    // Step 19b (v1.1.38) — stesso principio del blocco L1/R1 poco più
    // sotto (isolare un controllo dal resto della navigazione stick):
    // mentre il selettore di lingua ha il focus, sinistra/destra ne
    // cambiano il valore invece di spostare il focus altrove. Controllato
    // qui, PRIMA della dispatch generica a moveFocus, non dopo — altrimenti
    // moveFocus('left'/'right') sposterebbe comunque il focus nello stesso
    // frame.
    if (focusedIdRef.current === 'settings-language-toggle' && activeGroup === 'settings') {
      if (isJustPressed('Left') || isJustPressed('Right')) cycleUiLanguage();
    } else {
      if (isJustPressed('Left'))  moveFocus('left');
      if (isJustPressed('Right')) moveFocus('right');
    }

    // L1/R1 → ciclo store bar con wrap-around — PRIORITÀ ASSOLUTA (v0.99.6).
    //
    // Regola di riferimento: se l'utente preme L1/R1, vuole guardare
    // un'altra libreria — punto. Qualunque operazione "interattiva" in
    // corso sulla dashboard viene annullata per dare spazio al cambio
    // store, senza dover prima chiudere manualmente quell'overlay.
    //
    // Due categorie di activeGroup, comportamento opposto:
    // - CATEGORIA A — overlay che interrompono l'interazione con la
    //   libreria corrente (ricerca/keyboard, game-options, avatar-library):
    //   L1/R1 li annulla esplicitamente e procede col cambio store. Sono
    //   "nel mezzo" di un'azione sulla libreria attuale — cambiare libreria
    //   è incompatibile col restare lì, quindi ha senso che vinca il cambio.
    // - CATEGORIA B — pannelli indipendenti dalla libreria visualizzata
    //   (quick-menu, settings, downloads, notifications): L1/R1 resta
    //   bloccato, NESSUNA interferenza. Un download/installazione in corso,
    //   o la configurazione di un account, continuano indipendentemente da
    //   quale libreria è in primo piano — non hanno alcuna relazione con
    //   "quale store sto guardando", quindi non vanno mai annullati da un
    //   input che riguarda solo la navigazione fra librerie.
    const isCancellableOverlay = activeGroup === 'keyboard' || activeGroup === 'game-options' || activeGroup === 'avatar-library' || activeGroup === 'process-manager';
    if (activeGroup === null || isCancellableOverlay) {
      // FIX v0.99.7: isJustPressed consuma il fronte di pressione alla
      // prima lettura nel frame corrente (vedi useGamepad.ts) — chiamarlo
      // due volte per lo stesso tasto (una per l'annullamento overlay, una
      // per cycleStore) faceva sì che la seconda chiamata ritornasse sempre
      // false, perché il fronte era già stato consumato dalla prima. Letto
      // una sola volta per tasto e il valore booleano riusato sotto.
      const l1Pressed = isJustPressed('L1');
      const r1Pressed = isJustPressed('R1');
      if (l1Pressed || r1Pressed) {
        if (activeGroup === 'keyboard' && activeField) {
          // La VK è aperta per un campo dell'overlay Game Options (es.
          // executablePath), non per la ricerca — activeGroup vale
          // 'keyboard' in entrambi i casi (vedi openKeyboardForField), va
          // quindi distinto tramite activeField. Annullare qui significa
          // chiudere l'intero overlay Game Options sottostante, non solo
          // la VK: lasciarlo aperto mentre lo store cambia sotto
          // produrrebbe un overlay configurato su un gioco di uno store
          // non più visualizzato.
          setShowKeyboard(false);
          setActiveField(null);
          setShowGameOptions(false);
        } else if (activeGroup === 'keyboard') {
          // VK aperta per la ricerca — annulla la ricerca senza il
          // ripristino "torna allo store precedente" di toggleSearch: il
          // prossimo store lo decide comunque cycleStore appena sotto.
          setShowSearch(false);
          setShowKeyboard(false);
          setSearchQuery('');
        } else if (activeGroup === 'game-options') {
          setShowGameOptions(false);
        } else if (activeGroup === 'avatar-library') {
          setShowAvatarLibrary(false);
        } else if (activeGroup === 'process-manager') {
          setShowProcessManager(false);
        }
        if (isCancellableOverlay) setActiveGroup(null);
      }
      if (l1Pressed) cycleStore('prev');
      if (r1Pressed) cycleStore('next');
    }

    // L2/R2 → scorciatoia diretta per Downloads/Notifiche, senza dover
    // navigare con D-pad/stick fino in fondo alla pagina per raggiungere il
    // footer. Stessa identica logica già usata da footer-downloads/
    // footer-notifications — qui semplicemente la rendiamo raggiungibile
    // con un dorsale, simmetrico a L1/R1 per la store bar. Esclude
    // esplicitamente il caso in cui Select sia premuto insieme, per non
    // collidere con la combo Select+R2 del debug console.
    if (activeGroup === null && !gamepadState.buttons.has('Select')) {
      if (isJustPressed('L2')) {
        setShowDownloads(p => {
          const next = !p;
          setShowNotifications(false);
          setActiveGroup(next ? 'downloads' : null);
          if (next) setTimeout(() => setFocusedId('downloads-close'), 50);
          return next;
        });
        play('select');
      }
      if (isJustPressed('R2')) {
        setShowNotifications(p => {
          const next = !p;
          setShowDownloads(false);
          setActiveGroup(next ? 'notifications' : null);
          if (next) {
            setTimeout(() => setFocusedId('notifications-close'), 50);
            // Marca come lette solo le notifiche già presenti al momento
            // dell'apertura: l'utente sta fisicamente vedendo il pannello
            // adesso, quindi tutto ciò che già conteneva è "letto" da qui
            // in avanti — eventuali nuovi arrivi successivi resteranno
            // comunque non letti finché non si riapre.
            setNotifications(prev => prev.map(n => ({ ...n, seen: true })));
          }
          return next;
        });
        play('select');
      }
    }

    // L1/R1 → ciclo tab Settings con wrap-around, solo quando l'overlay
    // Settings è aperto. Isolato da D-pad/stick, che dentro ogni tab naviga
    // solo i controlli del suo contenuto (settings-tab-* sono nel proprio
    // group "settings-tabs", escluso dal pool "settings" usato da moveFocus).
    if (activeGroup === 'settings') {
      if (isJustPressed('L1')) cycleSettingsTab('prev');
      if (isJustPressed('R1')) cycleSettingsTab('next');
    }

    // A → esegue l'azione dell'elemento attualmente selezionato
    if (isJustPressed('A')) {
      // FIX v0.99.4: rimosso il ramo `focusedIdRef.current === 'nav-search'`
      // — la lente non è più un Focusable (vedi punto 2 del fix
      // navigazione), quindi focusedId non può più assumere quel valore.
      // L'apertura ricerca da controller passa ora esclusivamente dal
      // tasto Y (vedi isJustPressed('Y') più sotto). Rimosso anche il
      // relativo bounce-guard (searchJustOpenedRef), non più necessario.
      if (focusedIdRef.current?.startsWith('game-') && !showGameOptions) {
        const gameId = focusedIdRef.current.replace('game-', '');
        handlePlay(gameId);
      } else {
        // Invoca onEnter dell'elemento focalizzato leggendo dal registry
        // (FocusProvider), non più dal DOM: il vecchio approccio con
        // document.querySelector('[data-focused="true"]') poteva trovare
        // null in una finestra di desincronizzazione tra activeGroup e
        // focusedId (es. subito dopo la chiusura di un overlay), producendo
        // una pressione di A silenziosamente a vuoto e un apparente freeze.
        triggerFocusedAction();
      }
    }

    // X → apre/chiude l'overlay Game Options (toggle), sempre su una card
    if (isJustPressed('X')) {
      if (showGameOptions) {
        closeGameOptions();
      } else if (focusedIdRef.current?.startsWith('game-')) {
        const gameId = focusedIdRef.current.replace('game-', '');
        openGameOptions(gameId);
      }
    }

    // Y → apre/chiude la ricerca con la Virtual Keyboard (v0.99.4).
    //
    // FIX v0.99.5: la condizione precedente (`activeGroup === null`) faceva
    // di Y un tasto "solo apertura" — una volta aperta la ricerca,
    // activeGroup diventa 'keyboard' e la guardia bloccava ogni pressione
    // successiva, impedendo la chiusura. Risultato osservato: la seconda
    // pressione di Y non chiudeva nulla, e con activeGroup bloccato su
    // 'keyboard' anche L1/R1 (controllati dalla stessa guardia altrove)
    // restavano sordi alla navigazione store — l'unica via d'uscita era
    // passare da un altro overlay (es. il menu) che resettava lo stato per
    // un percorso diverso.
    //
    // Regola corretta: Y è il toggle della ricerca, sempre.
    // - Nessun overlay attivo (activeGroup === null) → Y apre.
    // - L'overlay attivo è proprio quello della ricerca (activeGroup ===
    //   'keyboard', ricerca aperta da Y stesso) → Y chiude.
    // - Un overlay DIVERSO occupa lo scope (Settings, Game Options, ecc.)
    //   → Y non deve interferire, resta bloccato.
    if (isJustPressed('Y') && (activeGroup === null || activeGroup === 'keyboard')) {
      toggleSearch();
    }

    // B → chiude UN livello alla volta, ripristinando lo scope precedente
    if (isJustPressed('B')) {
      play('back');
      if (pendingUnlinkRef.current) {
        // Annulla la conferma di disconnessione in corso, senza chiudere
        // nient'altro — priorità massima su qualunque altra azione di B.
        setPendingUnlink(null);
      } else if (pendingRunnerActionRef.current) {
        // Stessa priorità: annulla la conferma install/uninstall runner.
        setPendingRunnerAction(null);
      } else if (pendingExitRef.current) {
        // Stessa priorità: annulla la conferma di chiusura Dashboard.
        setPendingExit(false);
      } else if (showFileBrowser) {
        // v1.5.20-dev.12 — Fase A.4: si apre SOPRA il pannello Download
        // (l'unico chiamante oggi) — deve chiudersi per primo, altrimenti
        // il ramo showDownloads sotto lo lascerebbe aperto mentre chiude
        // il pannello che gli sta dietro.
        closeFileBrowser();
      } else if (showKeyboard) {
        // La tastiera può essere aperta per la ricerca o per un campo
        // dell'overlay Game Options: ciascuno ha la sua chiusura corretta.
        if (activeField) {
          closeKeyboard();
        } else {
          toggleSearch();
        }
      } else if (showAvatarLibrary) {
        setShowAvatarLibrary(false);
        setActiveGroup('quick-menu');
        setFocusedId('opt-avatar');
      } else if (showProcessManager) {
        setShowProcessManager(false);
        setActiveGroup('quick-menu');
        setFocusedId('opt-process-manager');
      } else if (showSettings) {
        setShowSettings(false);
        setActiveGroup('quick-menu');
        setFocusedId('opt-accounts');
      } else if (showGameOptions) {
        closeGameOptions();
      } else if (showNotifications) {
        setShowNotifications(false);
        setActiveGroup(null);
        setFocusedId('footer-notifications');
      } else if (showDownloads) {
        setShowDownloads(false);
        setActiveGroup(null);
        setFocusedId('footer-downloads');
      } else if (viewState === 'quick-menu') {
        setViewState('library');
        setActiveGroup(null);
      }
    }

    // Select + R2 → Toggle Debug Console
    if (gamepadState.buttons.has('Select') && isJustPressed('R2')) {
      setShowDebugConsole(prev => !prev);
      play('select');
    }

    // Start → toggle quick-menu con scope dedicato.
    //
    // v2.1.10-dev.2 — RIMOSSA la scorciatoia equivalente "Select da solo"
    // che esisteva qui accanto a Start: Select è ora un modificatore
    // usato da tre combo diverse in questo stesso effetto (Select+R2
    // debug console, Select+L1+R1 risveglio dashboard, Select+◄/► ritorno
    // al gioco) — lasciarlo anche come trigger a sé avrebbe reso ambiguo
    // ogni frame in cui Select viene premuto insieme a uno di questi
    // tasti (il quick-menu si sarebbe aperto PRIMA che l'utente riesca a
    // completare la combo, dato che isJustPressed('Select') scatta sul
    // fronte di pressione, non a rilascio). Start resta l'unico trigger,
    // era già lui il pulsante ufficiale da specifica (Home escluso per
    // conflitto con l'overlay di Steam).
    if (isJustPressed('Start')) {
      // Se un overlay secondario è aperto SOPRA il quick-menu (Settings,
      // Avatar Library), Start/Select deve chiuderlo e tornare al menu,
      // non aprire ciecamente un secondo livello di quick-menu sopra di
      // esso. Senza questo controllo, viewState resta 'library' mentre
      // Settings è aperto (opt-accounts lo imposta esplicitamente così),
      // quindi il ramo "apri" veniva preso comunque, sovrascrivendo
      // activeGroup da 'settings' a 'quick-menu' mentre showSettings
      // restava true — uno stato incoerente che bloccava sia i controlli
      // di Settings sia il ciclo store L1/R1 della dashboard sottostante.
      if (showSettings) {
        setShowSettings(false);
        setActiveGroup('quick-menu');
        setFocusedId('opt-accounts');
        play('back');
      } else if (showAvatarLibrary) {
        setShowAvatarLibrary(false);
        setActiveGroup('quick-menu');
        setFocusedId('opt-avatar');
        play('back');
      } else if (showProcessManager) {
        setShowProcessManager(false);
        setActiveGroup('quick-menu');
        setFocusedId('opt-process-manager');
        play('back');
      } else {
        setViewState(prev => {
          const next = prev === 'quick-menu' ? 'library' : 'quick-menu';
          setActiveGroup(next === 'quick-menu' ? 'quick-menu' : null);
          if (next === 'quick-menu') setTimeout(() => setFocusedId('opt-accounts'), 50);
          return next;
        });
        play('select');
      }
    }

  }, [gamepadState, isJustPressed, moveFocus, isFocusFrozen, viewState, play,
      showDownloads, showSettings, showNotifications, selectedGameId,
      showGameOptions, showAvatarLibrary, showProcessManager, handlePlay, setFocusedId, toggleSearch,
      setActiveGroup, openGameOptions, closeGameOptions, showKeyboard, activeField, closeKeyboard,
      showFileBrowser, closeFileBrowser, logDiag, splashInfo, closeSplash,
      activeGroup, cycleStore, triggerFocusedAction, cycleSettingsTab, cycleUiLanguage]);

  // v1.1.10 — timer indipendente per "tieni premuto B per uscire"
  // dall'area di test controller. Deliberatamente NON agganciato a
  // gamepadState/isJustPressed: quelli si aggiornano solo quando qualcosa
  // CAMBIA (pulsanti o assi, per evitare re-render inutili in tutto il
  // resto dell'app — vedi useGamepad.ts), ma un B tenuto premuto fermo,
  // senza muovere alcuno stick, non genera alcun cambiamento frame dopo
  // frame: quel meccanismo da solo non basta a misurare una durata di
  // pressione. Questo effetto legge InputManager direttamente ogni 50ms,
  // indipendentemente da eventuali "cambiamenti", finché l'area di test
  // ha il focus.
  useEffect(() => {
    if (focusedId !== 'gamepad-test-area') {
      gamepadTestBHoldStartRef.current = null;
      setGamepadTestExitProgress(0);
      setGamepadTestExiting(false);
      return;
    }
    const interval = setInterval(() => {
      if (gamepadTestExiting) return; // già in fase di uscita ritardata, non rielaborare
      const raw = InputManager.readPrimary();
      if (raw.buttons.has('B')) {
        if (gamepadTestBHoldStartRef.current === null) {
          gamepadTestBHoldStartRef.current = Date.now();
        }
        const elapsed = Date.now() - gamepadTestBHoldStartRef.current;
        setGamepadTestExitProgress(Math.min(1, elapsed / GAMEPAD_TEST_EXIT_HOLD_MS));
        if (elapsed >= GAMEPAD_TEST_EXIT_HOLD_MS) {
          // Soglia raggiunta: mostra subito il LED verde (captureActive
          // diventa false lato widget), ma l'uscita vera e propria
          // (moveFocus + suono) avviene dopo un breve ritardo, così il
          // verde è visibile invece di sparire nello stesso istante in
          // cui si lascia la schermata.
          setGamepadTestExiting(true);
          setTimeout(() => {
            moveFocus('up');
            play('back');
            gamepadTestBHoldStartRef.current = null;
            setGamepadTestExitProgress(0);
            setGamepadTestExiting(false);
          }, GAMEPAD_TEST_EXIT_DELAY_MS);
        }
      } else if (gamepadTestBHoldStartRef.current !== null) {
        gamepadTestBHoldStartRef.current = null;
        setGamepadTestExitProgress(0);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [focusedId, moveFocus, play, gamepadTestExiting]);


  // Monitor focus changes for sound
  useEffect(() => {
    setShowTrailer(false);
  }, [selectedGameId]);

  // Monitor focus changes for sound
  useEffect(() => {
    if (focusedId) play('focus');
  }, [focusedId, play]);

  // Step 12f — auto-scroll del log quando arrivano nuove voci (se non in pausa)
  useEffect(() => {
    if (!pauseScroll && logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logs, pauseScroll]);

  // v0.99.37 — fix: availableRunners veniva popolata SOLO dall'effetto lazy
  // legato alla tab System (sotto), pensato per limitare il costo delle
  // fetch più pesanti (installable, system-tools, disk) a quando l'utente
  // apre davvero quella tab. Ma le switch runner nell'overlay Game Options
  // (sezione "Runner Bridge") leggono la STESSA availableRunners — se
  // l'utente non apre mai Impostazioni > System, quelle switch restano
  // vuote per l'intera sessione anche con runner alternativi già
  // installati e rilevati su disco. /api/runners da sola è economica
  // (legge solo la tabella runners già popolata al boot del daemon, nessuna
  // scansione filesystem) — la carichiamo qui una volta all'avvio,
  // indipendentemente dalla tab System, che continua comunque a
  // ricaricarla (ridondante ma innocuo) insieme ai dati più pesanti.
  useEffect(() => {
    fetch('/api/runners').then(r => r.json()).then(setAvailableRunners).catch(() => {});
  }, []);

  // Step 19d — stesso principio del fetch sopra: economico, caricato una
  // volta all'avvio indipendentemente da quale tab/overlay è aperto.
  useEffect(() => {
    fetch('/api/shared-launchers').then(r => r.json()).then(setSharedLaunchers).catch(() => {});
  }, []);

  // v0.99.90 — Step 15d: verifica raggiungibilità Ollama + elenco modelli.
  // v1.5.12-dev.1 — spostato in useAiAdvisorProviders (hooks/), vedi
  // import in cima al file.

  // v1.1.122-dev.1 — Cloud Backup: stesso ciclo di refresh (boot + ogni
  // apertura di Impostazioni) già usato per gli altri stati di questa
  // tab. Preserva i draft di Client ID/Secret già digitati in questa
  // sessione, stesso principio di apiKeyDraft per l'AI Advisor.
  // v1.5.10-dev.1 — spostato in useCloudBackupProviders (hooks/), vedi
  // import in cima al file.

  // v1.1.122-dev.1 — polling durante il login OAuth: ora in
  // useCloudBackupProviders (hooks/), vedi import in cima al file.

  // v1.5.12-dev.1 — i due useEffect di refresh Ollama sono ora dentro
  // useAiAdvisorProviders (hooks/).

  // v0.99.90 — Step 15d: saveCloudProvider/testCloudProvider/
  // removeCloudProviderKey: tutte spostate in useAiAdvisorProviders
  // (hooks/), vedi import in cima al file.
  // v1.1.122-dev.1 — saveCloudBackupProvider/connectCloudBackupProvider/
  // disconnectCloudBackupProvider/runCloudBackupAction: tutte spostate in
  // useCloudBackupProviders (hooks/), vedi import in cima al file.

  // Step 13 — carica dati System tab quando viene aperta (lazy, una volta sola per sessione)
  useEffect(() => {
    if (activeSettingsTab !== 'engine' || systemTabLoaded) return;
    setSystemTabLoaded(true);
    const loadSystemData = () => {
      Promise.all([
        fetch('/api/runners').then(r => r.json()).catch(() => []),
        fetch('/api/runners/installable').then(r => r.json()).catch(() => []),
        fetch('/api/system-tools').then(r => r.json()).catch(() => ({})),
        fetch('/api/system/disk').then(r => r.json()).catch(() => null),
      ]).then(([installed, installable, tools, disk]) => {
        setAvailableRunners(installed);
        setInstallableRunners(installable);
        setSystemTools(tools);
        if (disk && typeof disk.totalBytes === 'number') setDiskUsage(disk);
      });
    };
    loadSystemData();
  }, [activeSettingsTab, systemTabLoaded]);

  // Auto-refresh periodico dei Tool di sistema: a differenza di runner e
  // spazio disco (caricati una volta e aggiornabili solo a richiesta),
  // i tool di sistema devono riflettere automaticamente l'installazione di
  // nuovi strumenti senza che l'utente debba premere Aggiorna manualmente.
  // Attivo solo mentre la tab System è effettivamente aperta.
  useEffect(() => {
    if (activeSettingsTab !== 'engine') return;
    const iv = setInterval(() => {
      fetch('/api/system-tools').then(r => r.json()).then(setSystemTools).catch(() => {});
    }, 8000);
    return () => clearInterval(iv);
  }, [activeSettingsTab]);

  // Step 13 — polling isAuthenticated per store in attesa completamento OAuth browser
  useEffect(() => {
    if (!authPolling) return;
    const iv = setInterval(async () => {
      try {
        const res = await fetch(`/api/stores/login-status/${encodeURIComponent(authPolling)}`);
        const { authenticated } = await res.json();
        if (authenticated) {
          clearInterval(iv);
          setAuthPolling(null);
          setAuthMessage(prev => ({ ...prev, [authPolling]: '✅ Autenticato con successo!' }));
          // Forza sync libreria dopo auth (tutti gli store, non solo Epic).
          // Step 18 (v1.1.37) — questa chiamata da sola già scatena
          // `refreshLibrary()` lato server → evento SSE 'library-updated'
          // → l'handler SSE aggiorna `games` da solo (via
          // refreshGamesList()): niente più fetch esplicito di
          // /api/games qui, resta solo /api/stores.
          await fetch('/api/library/refresh', { method: 'POST' }).catch(() => {});
          const storesData = await fetch('/api/stores').then(r => r.json());
          setStores(storesData);
          play('launch');
        }
      } catch {}
    }, 2500);
    // Timeout 150s
    const timeout = setTimeout(() => {
      clearInterval(iv);
      setAuthPolling(null);
      setAuthMessage(prev => ({
        ...prev,
        [authPolling]: '⏱ Timeout — riprova o usa il terminale.',
      }));
    }, 150000);
    return () => { clearInterval(iv); clearTimeout(timeout); };
  }, [authPolling]);

  // v0.99.16 — Semplificazione del menu: il ciclo visibile mostra solo due
  // opzioni — "Finestra" e "Kiosk".
  //
  // v2.1.10-dev.5 — RIMOSSO il toggle Ctrl+Alt+K e lo stato
  // kioskOptionVisible che rendevano raggiungibile una terza voce nel
  // ciclo: non ha più senso ora che 'kiosk' e 'borderless' sono
  // implementazioni DAVVERO diverse (kiosk-launch.sh, v2.1.10-dev.4) — la
  // vecchia motivazione ("le due varianti sono comunque identiche a
  // livello di frontend, la terza voce serve solo a chi vuole
  // sperimentare con l'una o l'altra") non vale più: 'borderless' è ora un
  // fallback deliberatamente più cauto (niente input lag, ma nemmeno un
  // comportamento uniforme fra desktop diversi), non una semplice
  // variante intercambiabile da esporre per curiosità. Resta raggiungibile
  // solo da riga di comando (--borderless) o da un vecchio app.conf
  // persistito da prima di questo cambiamento — mai più dal menu.
  //
  // Logica comune di applicazione estratta in applyDisplayMode: persistenza
  // su app.conf e notifica, condivisa da tutti i punti che cambiano modalità.
  const applyDisplayMode = (next: 'kiosk' | 'window' | 'borderless') => {
    setDisplayMode(next);

    // Persiste la preferenza: kiosk-launch.sh la legge al PROSSIMO avvio
    // per decidere quale modalità applicare. Non ha alcun effetto sulla
    // sessione del browser già in corso — serve solo a far ripartire la
    // Dashboard nello stato giusto al riavvio successivo.
    fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayMode: next }),
    }).catch(() => {});

    // v2.1.10-dev.5 — FIX: 'kiosk'/'borderless' usavano stringhe inglesi
    // hardcoded ('Fullscreen'/'Kiosk') invece di passare da t(), unico
    // punto di questa funzione che non seguiva la convenzione IT+EN del
    // progetto — 'window' la seguiva già correttamente.
    const labels: Record<typeof next, string> = {
      kiosk: t('dashboard:kioskMode'),
      window: t('dashboard:windowed'),
      borderless: t('dashboard:borderlessMode'),
    };
    // v1.1.28 — messaggio corretto: verificato che questa funzione fa
    // solo due cose, nessuna delle quali cambia davvero la modalità
    // finestra a livello di sistema in QUESTA sessione — setDisplayMode
    // aggiorna solo lo stato React/UI interno, e la PATCH a /api/config
    // persiste la preferenza per kiosk-launch.sh, che la legge solo al
    // PROSSIMO avvio (vedi commento sopra). Il messaggio precedente
    // ("applicato immediatamente, nessun riavvio necessario") era
    // semplicemente falso per il cambio di modalità reale — confermato
    // da test su hardware reale.
    pushNotification({
      type: 'info',
      title: t('dashboard:notif.displayModeTitle', { mode: labels[next] }),
      body: t('dashboard:notif.displayModeBody'),
      source: 'system',
    });
  };

  // Ciclo VISIBILE nel menu: due soli stati, window ↔ kiosk (vero --kiosk/
  // -kiosk dal browser dopo kiosk-launch.sh v2.1.10-dev.4 — non più una
  // semplice etichetta interna, vedi commento sopra applyDisplayMode).
  // 'borderless' non è MAI nel ciclo: se lo stato attuale è 'borderless'
  // (letto da un vecchio app.conf persistito da prima di questo
  // cambiamento, o da un avvio con --borderless da CLI), currentIndex
  // sarà -1 — si riparte da 'window' invece di un indice -1 che
  // produrrebbe un risultato errato. Non è un modo per "correggere" la
  // preferenza borderless dell'utente: applyDisplayMode('window') scrive
  // la nuova preferenza su app.conf solo se l'utente arriva davvero a
  // premere Alt+Enter/aprire questa voce di menu — finché non lo fa,
  // kiosk-launch.sh continua a rispettare 'borderless' al prossimo avvio.
  const cycleDisplayMode = () => {
    const order: Array<'kiosk' | 'window'> = ['window', 'kiosk'];
    const currentIndex = order.indexOf(displayMode as 'kiosk' | 'window');
    const next = order[currentIndex === -1 ? 0 : (currentIndex + 1) % order.length];
    applyDisplayMode(next);
  };

  // v0.99.26 — Visibile solo quando dedicatedSession è true (sessione X11
  // dedicata, senza XFCE sotto, vedi kiosk-launch.sh). Esegue uno switch di
  // sessione LightDM verso XFCE — non chiude X-Launcher, lo lascia in
  // esecuzione in background sulla propria sessione, esattamente come
  // "Switch User" lascerebbe la sessione precedente intatta.
  const switchToDesktop = () => {
    pushNotification({
      type: 'info',
      title: t('dashboard:notif.switchToDesktopTitle'),
      body: t('dashboard:notif.switchToDesktopBody'),
      source: 'system',
    });
    fetch('/api/system/switch-session', { method: 'POST', body: JSON.stringify({ target: 'desktop' }), headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  };

  // Chiude la Dashboard: la conferma a 2 tap è gestita dalla voce di menu
  // stessa (vedi opt-exit), questa funzione esegue solo l'azione reale
  // quando la conferma è già stata data.
  const handleExit = () => {
    fetch('/api/system/exit', { method: 'POST' }).catch(() => {});
    // Il daemon backend termina (process.exit) dopo aver risposto. Tentare
    // anche la chiusura della finestra/tab del browser: window.close()
    // funziona solo se la pagina è stata aperta da script (kiosk-launch.sh
    // la apre così), ma anche se il browser la ignora, il backend morto
    // farà comunque cadere la pagina su un errore di connessione — l'esito
    // percepito dall'utente è comunque "Dashboard chiusa".
    setTimeout(() => { window.close(); }, 200);
  };

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('x-launcher-theme', next); } catch {}
      return next;
    });
    play('select');
  };

  // Step 12f — colori e label per i livelli di log nella debug console
  const LOG_LEVEL_META: Record<string, { color: string; border: string; label: string }> = {
    debug:    { color: 'text-gray-500',    border: 'border-gray-600',   label: 'DBG'  },
    info:     { color: 'text-green-400/70',border: 'border-green-500/30',label: 'INF' },
    system:   { color: 'text-blue-400',    border: 'border-blue-500',   label: 'SYS'  },
    warning:  { color: 'text-yellow-400',  border: 'border-yellow-400', label: 'WRN'  },
    error:    { color: 'text-red-400',     border: 'border-red-500',    label: 'ERR'  },
    auth:     { color: 'text-purple-400',  border: 'border-purple-400', label: 'AUTH' },
    download: { color: 'text-cyan-400',    border: 'border-cyan-500',   label: 'DL'   },
    launch:   { color: 'text-emerald-400', border: 'border-emerald-500',label: 'RUN'  },
  };
  const ALL_LOG_LEVELS = Object.keys(LOG_LEVEL_META);

  const toggleLogFilter = (level: string) => {
    setLogFilter(prev => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  };

  const filteredLogs = useMemo(() => {
    const base = logFilter.size === 0 ? logs : logs.filter(l => logFilter.has(l.type));
    return base;
  }, [logs, logFilter]);

  const handleCopyLogs = () => {
    const text = filteredLogs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleDownloadLogs = () => {
    const text = filteredLogs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `x-launcher-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn(
      "w-full h-full font-sans flex flex-col overflow-hidden select-none transition-colors duration-500 relative",
      theme === 'dark' ? "bg-[#0b0c0f] text-gray-100" : "bg-gray-100 text-gray-900",
      cursorHidden && "cursor-hidden-global"
    )}>
      {/* Header */}
      <header className={cn(
        "h-16 flex items-center px-8 shrink-0 z-30 shadow-lg border-b transition-colors",
        theme === 'dark' ? "bg-[#161920] border-white/10" : "bg-white border-gray-200"
      )}>
        <Focusable group="header-logo" id="header-logo" onEnter={() => setViewState('quick-menu')}>
          {(isFocused) => (
            <div className={cn(
              "flex items-center gap-2 mr-12 transition-transform",
              isFocused && "scale-110"
            )}>
              <div className="w-10 h-10 bg-blue-600 rounded-sm flex items-center justify-center font-black italic text-white shadow-lg shadow-blue-600/20">X</div>
              <span className={cn(
                "text-2xl font-black tracking-tighter italic",
                theme === 'dark' ? "text-blue-400" : "text-blue-600"
              )}>LAUNCHER</span>
            </div>
          )}
        </Focusable>
        
        <nav className="flex gap-8 text-sm font-bold tracking-widest uppercase">
          <Focusable group="store-bar" id="store-all" onEnter={() => { setActiveStore('All'); play('select'); }}>
            {(isFocused) => (
              <button className={cn(
                "pb-1 border-b-2 transition-all",
                activeStore === 'All' ? "text-blue-500 border-blue-500" : "opacity-50 border-transparent",
                isFocused && "scale-110 opacity-100 border-blue-400"
              )}>
                {t('dashboard:allGames')}
              </button>
            )}
          </Focusable>
          {visibleStores.map(store => (
            <Focusable group="store-bar" key={store.id} id={`store-${store.id}`} onEnter={() => { setActiveStore(store.id); play('select'); }}>
              {(isFocused) => (
                <button className={cn(
                  "pb-1 border-b-2 transition-all",
                  activeStore === store.id ? "text-blue-500 border-blue-500" : "opacity-50 border-transparent",
                  isFocused && "scale-110 opacity-100 border-blue-400"
                )}>
                  {translateStorePluginName(store.id, store.name)}
                </button>
              )}
            </Focusable>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-6">
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-tighter">
              {isGamescope ? t('dashboard:gamescopeStandalone') : (hostname || '—')}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] opacity-50 uppercase tracking-widest">
                {isGamescope ? t('dashboard:waylandNative') : (
                  // v0.99.38 — legato allo stato reale della Dashboard invece
                  // del testo fisso "HTPC Mode".
                  //
                  // v2.1.10-dev.5 — FIX: 'borderless' riusava qui la stessa
                  // etichetta "Console Mode" riservata alla futura sessione
                  // dedicata X11 con desktop env spento in background (Step
                  // 20 della roadmap, non ancora iniziata — vedi anche
                  // l'uso DAVVERO relativo a quel concetto poco più sotto,
                  // nel quick-menu, quando dedicatedSession è true: quello
                  // resta invariato, è un caso diverso). Ora che 'borderless'
                  // è un fallback deliberato e distinto (kiosk-launch.sh,
                  // v2.1.10-dev.4), non la variante "Console Mode" del
                  // futuro, riusare quella stessa etichetta qui era fuorviante
                  // — nuova etichetta dedicata.
                  displayMode === 'window' ? t('dashboard:windowed') :
                  displayMode === 'borderless' ? t('dashboard:borderlessMode') :
                  t('dashboard:kioskMode')
                )}
              </span>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            </div>
          </div>
          <div className="relative">
            {/* Icona avatar: puramente decorativa, mostra solo l'avatar
                corrente. L'accesso alla libreria avatar passa esclusivamente
                dal menu X-Launcher (voce "Avatar"), non più da qui — elimina
                sia la ridondanza del doppio handler (Focusable.onEnter e
                button.onClick facevano lo stesso identico toggle) sia
                l'ambiguità ai bordi della griglia libreria per lo scoring
                assiale generico. */}
            <div
              className={cn(
                "w-10 h-10 rounded-full transition-all flex items-center justify-center overflow-hidden ring-2",
                theme === 'dark'
                  ? "border border-white/20 ring-white/10"
                  : "border border-black/20 ring-black/10"
              )}
            >
              {avatarImage
                ? <img
                    src={avatarImage}
                    className="w-full h-full object-cover"
                    alt="avatar"
                    onError={() => {
                      setAvatarImage(null);
                      persistAvatarUrl(null);
                    }}
                  />
                : <User size={18} className="opacity-70" />}
            </div>

            {/* Profile menu spostato nell'header della libreria avatar */}
          </div>
        </div>
      </header>

      {/* Avatar Library — si sovrappone alla main grid solo quando attiva */}
      <AnimatePresence>
        {showAvatarLibrary && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "absolute inset-0 z-[80] flex flex-col pt-[80px] pl-[80px] pr-[80px] pb-[64px]",
              theme === 'dark' ? "bg-[#0b0c0f]/98" : "bg-gray-100/98"
            )}
          >
            {/* Header libreria */}
            <div className="flex items-center justify-between mb-10 shrink-0">
              <div className="flex items-center gap-4">
                {/* Avatar corrente */}
                <div className="w-14 h-14 rounded-full border-2 border-blue-500/40 overflow-hidden flex items-center justify-center bg-white/5 shrink-0">
                  {avatarImage
                    ? <img src={avatarImage} className="w-full h-full object-cover" alt="avatar" />
                    : <User size={26} className="opacity-40" />}
                </div>
                <div>
                  <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('avatarLibrary:title')}</h2>
                  <p className={cn("text-[10px] font-mono mt-0.5 select-all", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                    {avatarDir} · {t('avatarLibrary:fileTypes')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Rimuovi avatar */}
                {avatarImage && (
                  <Focusable group="avatar-library" id="avatar-remove" onEnter={() => {
                    setAvatarImage(null);
                    persistAvatarUrl(null);
                    play('back');
                  }}>
                    {(isFocused) => (
                      <button
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                          isFocused
                            ? "bg-red-600 border-red-600 text-white scale-105"
                            : theme === 'dark' ? "border-white/10 text-white/50 hover:bg-red-600 hover:border-red-600 hover:text-white" : "border-gray-300 text-gray-500 hover:bg-red-600 hover:border-red-600 hover:text-white"
                        )}
                      >
                        <Trash2 size={13} />
                        <span className="hidden md:inline">{t('avatarLibrary:remove')}</span>
                      </button>
                    )}
                  </Focusable>
                )}
                {/* Account settings shortcut */}
                <Focusable group="avatar-library" id="avatar-account" onEnter={() => {
                  setShowAvatarLibrary(false);
                  setShowSettings(true);
                  setActiveGroup('settings');
                  setActiveSettingsTab('accounts');
                  play('select');
                  setTimeout(() => setFocusedId('settings-tab-accounts'), 80);
                }}>
                  {(isFocused) => (
                    <button
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                        isFocused
                          ? "bg-blue-600 border-blue-600 text-white scale-105"
                          : theme === 'dark' ? "border-white/10 text-white/50 hover:bg-blue-600 hover:border-blue-600 hover:text-white" : "border-gray-300 text-gray-500 hover:bg-blue-600 hover:border-blue-600 hover:text-white"
                      )}
                    >
                      <Settings size={13} />
                      <span className="hidden md:inline">{t('avatarLibrary:account')}</span>
                    </button>
                  )}
                </Focusable>
                {/* Ricarica */}
                <Focusable group="avatar-library" id="avatar-reload" onEnter={loadAvatarFiles}>
                  {(isFocused) => (
                    <button
                      className={cn(
                        "w-10 h-10 rounded-full border flex items-center justify-center transition-all",
                        isFocused
                          ? "bg-blue-600 border-blue-600 text-white scale-110"
                          : theme === 'dark' ? "border-white/10 hover:bg-blue-600 hover:border-blue-600 hover:text-white" : "border-gray-300 hover:bg-blue-600 hover:border-blue-600 hover:text-white"
                      )}
                      title={t('avatarLibrary:reload')}
                    >
                      <RotateCcw size={16} />
                    </button>
                  )}
                </Focusable>
                {/* Chiudi */}
                <Focusable group="avatar-library" id="avatar-close" fallbackPriority={-1} onEnter={() => { setShowAvatarLibrary(false); setActiveGroup('quick-menu'); setFocusedId('opt-avatar'); play('back'); }}>
                  {(isFocused) => (
                    <button
                      className={cn(
                        "w-10 h-10 rounded-full border flex items-center justify-center transition-all",
                        isFocused
                          ? "bg-red-600 border-red-600 text-white scale-110"
                          : theme === 'dark' ? "border-white/10 hover:bg-red-600 hover:border-red-600 hover:text-white" : "border-gray-300 hover:bg-red-600 hover:border-red-600 hover:text-white"
                      )}
                    >
                      <X size={18} />
                    </button>
                  )}
                </Focusable>
              </div>
            </div>

            {/* Griglia immagini */}
            {avatarFiles.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-30">
                <User size={64} className="mb-6" />
                <h3 className="text-xl font-black italic uppercase tracking-widest">{t('avatarLibrary:emptyFolderTitle')}</h3>
                <p className="text-sm font-medium mt-2 text-center max-w-xs">
                  {t('avatarLibrary:emptyFolderDesc')}<br />
                  <code className="font-mono text-xs">~/.local/share/x-launcher/avatars/</code>
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto overflow-x-visible custom-scrollbar">
                <div className="grid grid-cols-7 gap-5 px-2 pb-4 pt-2">
                  {avatarFiles.map((file, idx) => (
                    <Focusable
                      key={file.filename}
                      id={`avatar-${idx}`}
                      group="avatar-library"
                      onEnter={() => {
                        // A applica l'avatar scelto ma NON chiude la libreria:
                        // secondo specifica, solo B o il pulsante rosso X
                        // chiudono — questo permette di provare più avatar
                        // in sequenza prima di confermare e tornare al menu.
                        setAvatarImage(file.url);
                        persistAvatarUrl(file.url);
                        play('select');
                      }}
                    >
                      {(isFocused) => (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setAvatarImage(file.url);
                            persistAvatarUrl(file.url);
                            setShowAvatarLibrary(false);
                            setActiveGroup(null);
                            play('select');
                          }}
                          className={cn(
                            "relative aspect-square rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 border-[4px]",
                            avatarImage === file.url
                              ? "border-blue-500 scale-[1.06] shadow-[0_12px_32px_rgba(37,99,235,0.5)] z-10"
                              : isFocused
                                ? "border-white scale-[1.06] shadow-[0_12px_32px_rgba(255,255,255,0.2)] z-10"
                                : "border-red-500/60 opacity-75 hover:opacity-100 hover:border-red-400"
                          )}
                        >
                          <img
                            src={file.url}
                            alt={file.filename}
                            className="w-full h-full object-cover"
                          />
                          {avatarImage === file.url && (
                            <div className="absolute inset-0 bg-blue-600/20 flex items-end p-2">
                              <span className="text-[8px] font-black uppercase tracking-widest text-white bg-blue-600 px-1.5 py-0.5 rounded-full shadow-lg">{t('avatarLibrary:activeBadge')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </Focusable>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* v2.1.10-dev.12 — Splash di lancio integrata nella Dashboard,
          richiesta esplicita dell'utente al posto della vecchia finestra
          browser separata (vedi splashOrchestrator.ts per la storia
          completa). Stessa struttura degli altri overlay a schermo
          intero (sfondo quasi opaco, z-index alto), pulsante di
          chiusura IDENTICO a pm-close per stile/posizione — l'unico
          modo in cui è davvero raggiungibile è la combo Select+B (vedi
          il gate isFocusFrozen più sopra in questo file), dato che il
          freeze scatta immediatamente al lancio per scelta esplicita
          dell'utente: la normale navigazione col D-pad verso questo
          pulsante non viene mai raggiunta mentre isFocusFrozen è vero.
          Resta comunque un Focusable vero (activeGroup/focusedId
          impostati in openSplashEventSource) per coerenza con gli altri
          overlay e per la breve finestra fra apertura splash e
          l'effettivo scattare del freeze. */}
      <AnimatePresence>
        {splashInfo && (() => {
          // Percentuale di avanzamento indicativa — non un progresso
          // reale (il lancio di un gioco non ha un totale noto), solo
          // un riscontro visivo che la fase sta avanzando: launching
          // parte da un valore basso, verifying-env avanza in base a
          // index/total se presenti, le fasi terminali arrivano a 100%.
          const splashProgressPercent = (): number => {
            switch (splashInfo.phase) {
              case 'launching': return 20;
              case 'verifying-env':
                return splashInfo.total ? 30 + Math.round(((splashInfo.index ?? 0) / splashInfo.total) * 50) : 40;
              default: return 100;
            }
          };
          const splashPhaseText = (): string => {
            switch (splashInfo.phase) {
              case 'launching':
                return splashInfo.store ? `Avvio da ${splashInfo.store}...` : 'Avvio in corso...';
              case 'verifying-env':
                return `Verifica dell'ambiente${splashInfo.total ? ` (${splashInfo.index}/${splashInfo.total})` : ''}${splashInfo.detail ? ` — ${splashInfo.detail}` : ''}`;
              case 'done': return 'Pronto.';
              case 'failed': return 'Avvio non riuscito.';
              case 'timeout': return 'Tempo scaduto — avvio interrotto.';
              case 'cancelled': return 'Avvio annullato.';
              default: return '';
            }
          };
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={cn(
                "absolute inset-0 z-[170] flex flex-col items-center justify-center gap-8 px-12",
                theme === 'dark' ? "bg-[#0b0c0f]/98" : "bg-gray-100/98"
              )}
            >
              {/* Chiudi — stesso identico stile di pm-close */}
              <div className="absolute top-8 right-8">
                <Focusable group="splash" id="splash-close" onEnter={() => {
                  play('back');
                  fetch(`/api/games/${splashInfo.gameId}/cancel-launch`, { method: 'POST' }).catch(() => {});
                  closeSplash();
                  setFocusFrozen(false);
                  gameStillRunningRef.current = false;
                }}>
                  {(isFocused) => (
                    <button
                      className={cn(
                        "w-10 h-10 rounded-full border flex items-center justify-center transition-all",
                        isFocused
                          ? "bg-red-600 border-red-600 text-white scale-110"
                          : theme === 'dark' ? "border-white/10 hover:bg-red-600 hover:border-red-600 hover:text-white" : "border-gray-300 hover:bg-red-600 hover:border-red-600 hover:text-white"
                      )}
                    >
                      <X size={18} />
                    </button>
                  )}
                </Focusable>
              </div>

              {/* Logo — stesso identico stile del logo in header */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-blue-600 rounded-sm flex items-center justify-center font-black italic text-white text-2xl shadow-lg shadow-blue-600/20">X</div>
                <span className={cn("text-4xl font-black tracking-tighter italic", theme === 'dark' ? "text-blue-400" : "text-blue-600")}>
                  LAUNCHER
                </span>
              </div>

              {/* Titolo gioco + fase corrente */}
              <div className="text-center max-w-xl">
                <h2 className="text-xl font-black italic tracking-tight uppercase mb-2">{splashInfo.gameTitle}</h2>
                <p className={cn("text-sm font-mono", theme === 'dark' ? "text-white/50" : "text-gray-600")}>
                  {splashPhaseText()}
                </p>
              </div>

              {/* Barra di progresso */}
              <div className={cn("w-full max-w-md h-1.5 rounded-full overflow-hidden", theme === 'dark' ? "bg-white/10" : "bg-gray-300")}>
                <motion.div
                  className="h-full bg-blue-600"
                  animate={{ width: `${splashProgressPercent()}%` }}
                  transition={{ ease: 'easeOut' }}
                />
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* v2.0.41-dev.53 — Process Manager, step 4: stessa identica
          struttura dell'overlay avatar-library qui sopra (stesso sfondo,
          stesso header con pulsante rosso di chiusura) — wrapper
          AnimatePresence separato, stesso principio del file manager
          poco più sotto, non condiviso con l'avatar-library dato che i
          due overlay non si aprono mai insieme. */}
      <AnimatePresence>
        {showProcessManager && (() => {
          const formatElapsed = (startedAt: number): string => {
            const totalSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
            const h = Math.floor(totalSeconds / 3600);
            const m = Math.floor((totalSeconds % 3600) / 60);
            const s = totalSeconds % 60;
            if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
            return `${m}m ${String(s).padStart(2, '0')}s`;
          };
          return (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={cn(
                "absolute inset-0 z-[80] flex flex-col pt-[80px] pl-[80px] pr-[80px] pb-[64px]",
                theme === 'dark' ? "bg-[#0b0c0f]/98" : "bg-gray-100/98"
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-10 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full border-2 border-blue-500/40 overflow-hidden flex items-center justify-center bg-white/5 shrink-0">
                    <Cpu size={26} className="opacity-40" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('processManager:title')}</h2>
                    <p className={cn("text-[10px] font-mono mt-0.5", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                      {t('processManager:subtitle')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Ricarica — stesso ruolo di avatar-reload */}
                  <Focusable group="process-manager" id="pm-reload" neighbors={{ down: processManagerList.length > 0 ? `pm-kill-${processManagerList[0].unit}` : undefined }} onEnter={loadProcessManagerList}>
                    {(isFocused) => (
                      <button
                        className={cn(
                          "w-10 h-10 rounded-full border flex items-center justify-center transition-all",
                          isFocused
                            ? "bg-blue-600 border-blue-600 text-white scale-110"
                            : theme === 'dark' ? "border-white/10 hover:bg-blue-600 hover:border-blue-600 hover:text-white" : "border-gray-300 hover:bg-blue-600 hover:border-blue-600 hover:text-white"
                        )}
                        title={t('avatarLibrary:reload') as string}
                      >
                        <RotateCcw size={16} />
                      </button>
                    )}
                  </Focusable>
                  {/* Chiudi */}
                  <Focusable group="process-manager" id="pm-close" fallbackPriority={-1} neighbors={{ down: processManagerList.length > 0 ? `pm-kill-${processManagerList[0].unit}` : undefined }} onEnter={() => { setShowProcessManager(false); setActiveGroup('quick-menu'); setFocusedId('opt-process-manager'); play('back'); }}>
                    {(isFocused) => (
                      <button
                        className={cn(
                          "w-10 h-10 rounded-full border flex items-center justify-center transition-all",
                          isFocused
                            ? "bg-red-600 border-red-600 text-white scale-110"
                            : theme === 'dark' ? "border-white/10 hover:bg-red-600 hover:border-red-600 hover:text-white" : "border-gray-300 hover:bg-red-600 hover:border-red-600 hover:text-white"
                        )}
                      >
                        <X size={18} />
                      </button>
                    )}
                  </Focusable>
                </div>
              </div>

              {/* Elenco */}
              {processManagerList.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-30">
                  <Cpu size={64} className="mb-6" />
                  <h3 className="text-xl font-black italic uppercase tracking-widest">{t('processManager:emptyTitle')}</h3>
                  <p className="text-sm font-medium mt-2 text-center max-w-xs">{t('processManager:emptyDesc')}</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                  {processManagerList.map((proc, idx) => {
                    const upId = idx === 0 ? 'pm-close' : `pm-kill-${processManagerList[idx - 1].unit}`;
                    const downId = idx === processManagerList.length - 1 ? undefined : `pm-kill-${processManagerList[idx + 1].unit}`;
                    const isPending = pendingKillUnit === proc.unit;
                    return (
                      <div
                        key={proc.unit}
                        className={cn(
                          "flex items-center justify-between gap-4 p-4 rounded-2xl border",
                          theme === 'dark' ? "border-white/10 bg-white/[0.03]" : "border-gray-200 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className={cn(
                            "w-11 h-11 rounded-xl border flex items-center justify-center shrink-0",
                            theme === 'dark' ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50"
                          )}>
                            {proc.kind === 'game' ? <Gamepad2 size={18} className="opacity-60" /> : <Package size={18} className="opacity-60" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold truncate">{proc.title}</p>
                            <p className={cn("text-[10px] font-mono uppercase tracking-widest mt-0.5", theme === 'dark' ? "text-white/40" : "text-gray-500")}>
                              {proc.kind === 'game' ? t('processManager:kindGame') : t('processManager:kindSharedLauncher')} · {t('processManager:runningSince')} {formatElapsed(proc.startedAt)}
                            </p>
                          </div>
                        </div>

                        <Focusable
                          group="process-manager"
                          id={`pm-kill-${proc.unit}`}
                          neighbors={{ up: upId, down: downId }}
                          onEnter={() => {
                            if (isPending) {
                              killProcessManagerEntry(proc.unit);
                              play('back');
                            } else {
                              setPendingKillUnit(proc.unit);
                              play('select');
                            }
                          }}
                        >
                          {(isFocused) => (
                            <div
                              className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all shrink-0",
                                isFocused || isPending
                                  ? "bg-red-600 border-red-600 text-white scale-105"
                                  : theme === 'dark' ? "border-white/10 text-white/50" : "border-gray-300 text-gray-500"
                              )}
                            >
                              <Trash2 size={13} />
                              {isPending && <span>{t('processManager:confirmKill')}</span>}
                            </div>
                          )}
                        </Focusable>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* v1.5.20-dev.12 — Fase A.4: file manager nativo controller-navigabile,
          sostituisce zenity/kdialog quando inputDevice === 'controller'.
          v2.0.41-dev.1 — BUG UTENTE: z-[95] bastava solo per il chiamante
          originario (sopra il pannello Download, z-50), ma con purpose
          'executable' l'overlay Game Options resta aperto SOTTO (z-[150],
          vedi più sotto) — il file manager ci finiva dietro, invisibile
          in primo piano. z-[160]: sopra Game Options, sotto la tastiera
          virtuale (z-[200], comunque nascosta mentre questo overlay è
          aperto — vedi openExecutableFileBrowser/closeFileBrowser). */}
      <AnimatePresence>
        {showFileBrowser && (() => {
          const formatFileSize = (bytes: number | null): string => {
            if (bytes === null) return '';
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
            if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
            return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
          };
          const formatFileDate = (mtimeMs: number | null): string => {
            if (mtimeMs === null) return '';
            return new Date(mtimeMs).toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' });
          };
          const extensions = fileBrowserContext?.extensions ?? [];
          return (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "absolute inset-0 z-[160] flex flex-col pt-[80px] pl-[80px] pr-[80px] pb-[64px]",
              theme === 'dark' ? "bg-[#0b0c0f]/98" : "bg-gray-100/98"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6 shrink-0 gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('dashboard:fileBrowser.title')}</h2>
                <p className={cn("text-[10px] font-mono mt-0.5 truncate select-all", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                  {fileBrowserPath ?? ''}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Focusable group="file-browser" id="fb-up" onEnter={() => {
                  if (fileBrowserParentPath) loadFileBrowserDir(fileBrowserParentPath, extensions, fileBrowserFilterOn);
                }}>
                  {(isFocused) => (
                    <button
                      disabled={!fileBrowserParentPath}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                        !fileBrowserParentPath ? "opacity-20 border-transparent" :
                        isFocused
                          ? "bg-blue-600 border-blue-600 text-white scale-105"
                          : theme === 'dark' ? "border-white/10 text-white/50" : "border-gray-300 text-gray-500"
                      )}
                    >
                      <ArrowUp size={13} />
                      <span className="hidden md:inline">{t('dashboard:fileBrowser.up')}</span>
                    </button>
                  )}
                </Focusable>
                <Focusable group="file-browser" id="fb-home" onEnter={() => {
                  if (fileBrowserQuickLinks.home) loadFileBrowserDir(fileBrowserQuickLinks.home, extensions, fileBrowserFilterOn);
                }}>
                  {(isFocused) => (
                    <button className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                      isFocused
                        ? "bg-blue-600 border-blue-600 text-white scale-105"
                        : theme === 'dark' ? "border-white/10 text-white/50" : "border-gray-300 text-gray-500"
                    )}>
                      <Home size={13} />
                      <span className="hidden md:inline">{t('dashboard:fileBrowser.home')}</span>
                    </button>
                  )}
                </Focusable>
                <Focusable group="file-browser" id="fb-downloads" onEnter={() => {
                  if (fileBrowserQuickLinks.downloads) loadFileBrowserDir(fileBrowserQuickLinks.downloads, extensions, fileBrowserFilterOn);
                }}>
                  {(isFocused) => (
                    <button
                      disabled={!fileBrowserQuickLinks.downloads}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                        !fileBrowserQuickLinks.downloads ? "opacity-20 border-transparent" :
                        isFocused
                          ? "bg-blue-600 border-blue-600 text-white scale-105"
                          : theme === 'dark' ? "border-white/10 text-white/50" : "border-gray-300 text-gray-500"
                      )}
                    >
                      <FileDown size={13} />
                      <span className="hidden md:inline">{t('dashboard:fileBrowser.downloads')}</span>
                    </button>
                  )}
                </Focusable>
                <Focusable group="file-browser" id="fb-removable" onEnter={() => {
                  if (fileBrowserQuickLinks.removableMedia) loadFileBrowserDir(fileBrowserQuickLinks.removableMedia, extensions, fileBrowserFilterOn);
                }}>
                  {(isFocused) => (
                    <button
                      disabled={!fileBrowserQuickLinks.removableMedia}
                      title={!fileBrowserQuickLinks.removableMedia ? t('dashboard:fileBrowser.noRemovableMedia') : undefined}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                        !fileBrowserQuickLinks.removableMedia ? "opacity-20 border-transparent" :
                        isFocused
                          ? "bg-blue-600 border-blue-600 text-white scale-105"
                          : theme === 'dark' ? "border-white/10 text-white/50" : "border-gray-300 text-gray-500"
                      )}
                    >
                      <HardDrive size={13} />
                      <span className="hidden md:inline">{t('dashboard:fileBrowser.removableMedia')}</span>
                    </button>
                  )}
                </Focusable>
                {/* v1.5.20-dev.12 — richiesta utente: switch on/off del
                    filtro estensioni, riusa lo stesso campo `filter` già
                    esistente in filePicker.ts (il chiamante lo passa via
                    fileBrowserContext.extensions, qui solo acceso/spento). */}
                <Focusable group="file-browser" id="fb-filter" onEnter={() => {
                  const next = !fileBrowserFilterOn;
                  setFileBrowserFilterOn(next);
                  if (fileBrowserPath) loadFileBrowserDir(fileBrowserPath, extensions, next);
                }}>
                  {(isFocused) => (
                    <button className={cn(
                      "flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all",
                      isFocused
                        ? "bg-blue-600 border-blue-600 text-white scale-105"
                        : fileBrowserFilterOn
                          ? (theme === 'dark' ? "border-blue-500/40 text-blue-400" : "border-blue-400 text-blue-600")
                          : (theme === 'dark' ? "border-white/10 text-white/50" : "border-gray-300 text-gray-500")
                    )}>
                      <Filter size={13} />
                      <span className="hidden md:inline">{fileBrowserFilterOn ? t('dashboard:fileBrowser.filterOn') : t('dashboard:fileBrowser.filterOff')}</span>
                    </button>
                  )}
                </Focusable>
                {/* Chiudi */}
                <Focusable group="file-browser" id="fb-close" fallbackPriority={-1} onEnter={closeFileBrowser}>
                  {(isFocused) => (
                    <button
                      className={cn(
                        "w-10 h-10 rounded-full border flex items-center justify-center transition-all",
                        isFocused
                          ? "bg-red-600 border-red-600 text-white scale-110"
                          : theme === 'dark' ? "border-white/10 hover:bg-red-600 hover:border-red-600 hover:text-white" : "border-gray-300 hover:bg-red-600 hover:border-red-600 hover:text-white"
                      )}
                    >
                      <X size={18} />
                    </button>
                  )}
                </Focusable>
              </div>
            </div>

            {/* Corpo — lista verticale */}
            {/* v2.0.41-dev.2 — BUG UTENTE: barra grigio scura che
                lampeggia in basso ad ogni input di navigazione (fra
                pulsanti header e lista file). Stessa causa già
                documentata e corretta altrove nel progetto (v1.1.4/
                v1.1.7, vedi settingsBodyRef più sotto): un figlio flex
                con overflow-y-auto ma SENZA min-h-0 non si comprime mai
                sotto l'altezza del proprio contenuto — il contenitore
                cresce con la lista invece di restare vincolato
                all'altezza disponibile del genitore (motion.div
                `absolute inset-0`), e il colore piatto del fondo sotto
                traspare per un frame ad ogni scroll manuale innescato
                da FocusProvider (setFocusedId→scrollIntoView custom).
                min-h-0 aggiunto qui, stesso fix identico.

                v2.0.41-dev.3 — BUG UTENTE (persiste dopo min-h-0): barra
                grigio scura che lampeggia durante lo SCROLL della lista
                (non solo al passaggio focus header↔lista). Causa reale
                diversa e più sottile — stesso bug ESATTO già
                diagnosticato e corretto una volta nel pannello
                notifiche (CHANGELOG.md, sezione "Polish interfaccia"):
                `overflow-x-visible` insieme a `overflow-y-auto` non
                resta "visible" — per spec CSS il browser lo promuove
                silenziosamente ad `auto` quando l'altro asse non è
                `visible`. .custom-scrollbar (index.css) stila solo
                `width` (lo spessore della scrollbar VERTICALE) — una
                scrollbar ORIZZONTALE nativa non stilizzata, grigia,
                appare/scompare a ogni ricalcolo di scroll innescato da
                FocusProvider durante la navigazione nella lista:
                esattamente la barra riportata. Fix identico a quello
                già in uso per il pannello notifiche e il pannello
                Download (vedi overflow-x-hidden altrove in questo
                file): overflow-x-visible → overflow-x-hidden sul
                contenitore della lista qualche riga più sotto. */}
            {fileBrowserError ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-30">
                <Folder size={64} className="mb-6" />
                <p className="text-sm font-medium">{fileBrowserError}</p>
              </div>
            ) : fileBrowserEntries.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-30">
                <Folder size={64} className="mb-6" />
                <h3 className="text-xl font-black italic uppercase tracking-widest">{t('dashboard:fileBrowser.emptyFolder')}</h3>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
                <div className="flex flex-col gap-1.5 px-2 pb-4 pt-2">
                  {fileBrowserEntries.map((entry, idx) => (
                    <Focusable
                      key={entry.name}
                      id={`fb-entry-${idx}`}
                      group="file-browser"
                      onEnter={() => {
                        if (entry.isDirectory) {
                          if (fileBrowserPath) loadFileBrowserDir(joinFsPath(fileBrowserPath, entry.name), extensions, fileBrowserFilterOn);
                        } else {
                          confirmFileBrowserSelection(entry.name);
                        }
                      }}
                    >
                      {(isFocused) => (
                        <div className={cn(
                          "flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl border transition-all",
                          isFocused
                            ? "bg-blue-600 border-blue-600 text-white scale-[1.01]"
                            : theme === 'dark' ? "border-white/10 bg-white/[0.02]" : "border-gray-200 bg-white"
                        )}>
                          <div className="flex items-center gap-3 min-w-0">
                            {entry.isDirectory
                              ? <Folder size={16} className="shrink-0 opacity-70" />
                              : <File size={16} className="shrink-0 opacity-70" />}
                            <span className="truncate text-sm font-medium">{entry.name}</span>
                          </div>
                          {!entry.isDirectory && (
                            <div className={cn("flex items-center gap-3 shrink-0 text-[10px] font-mono tabular-nums", isFocused ? "text-white/80" : "opacity-50")}>
                              <span>{formatFileSize(entry.sizeBytes)}</span>
                              <span>{formatFileDate(entry.mtimeMs)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </Focusable>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
          );
        })()}
      </AnimatePresence>
      <main className="flex flex-1 overflow-hidden relative">
        {/* Background Ambient Blur */}
        {selectedGame && (
          <AnimatePresence>
            <motion.div 
              key={selectedGame.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.15 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="absolute inset-0 blur-[120px] pointer-events-none"
              style={{ 
                backgroundImage: `url(${selectedGame.previewImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            />
          </AnimatePresence>
        )}

        {/* Library Grid */}
        <section className="flex-[3] p-12 overflow-y-auto custom-scrollbar relative z-10">
          <div className="flex flex-col mb-10 px-2 transition-all">
            <div className="flex justify-between items-end mb-6">
              <h2 className="text-4xl font-extralight italic tracking-tight uppercase">
                {activeStore === 'All' ? t('dashboard:collectionTitle') : translateStorePluginName(activeStore, activeStore)}
              </h2>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-mono opacity-40 uppercase tracking-[0.3em] font-black">{t('dashboard:titlesSynced', { count: games.length })}</span>
                <div className="h-4 w-[1px] bg-blue-500/20" />
                {/* FIX v0.99.4 — la lente non è più un Focusable: non deve
                    essere selezionabile/attivabile da D-pad/stick/A del
                    controller, solo cliccabile dal mouse. Da controller,
                    la ricerca si apre con il tasto Y (toggleSearch, con
                    Virtual Keyboard); dal mouse, openSearchWithPhysicalInput
                    porta il focus diretto sul campo di testo reale, senza
                    sovrapporre la VK — l'utente può già digitare con la
                    propria tastiera fisica. */}
                <div
                  onClick={openSearchWithPhysicalInput}
                  className={cn(
                    "p-2 rounded-full transition-all cursor-pointer",
                    showSearch ? "bg-blue-600 text-white" : "hover:bg-white/5"
                  )}
                >
                  <Search size={18} />
                </div>
              </div>
            </div>

            <AnimatePresence>
              {showSearch && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="flex gap-4">
                    <div className="flex-1 relative group">
                       <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30" />
                       <input 
                         ref={searchInputRef}
                         type="text" 
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                         placeholder={activeStore === 'All' ? t('dashboard:searchAllLibraries') : t('dashboard:searchInStore', { store: activeStore })}
className={cn("w-full rounded-xl py-3 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-blue-500 transition-all", theme === 'dark' ? "bg-white/5 border border-white/10" : "bg-white border border-gray-400 text-gray-900")}
                       />
                       <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                          {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="p-2 opacity-30 hover:opacity-100 hover:text-red-500 transition-all">
                              <X size={14} />
                            </button>
                          )}
                          {/* FIX v0.99.10: btn-keyboard non è più un
                              Focusable — risolve alla radice un bug più
                              serio del fallbackPriority=-1 introdotto in
                              v0.99.7. Con la libreria filtrata a zero
                              risultati, l'icona tastiera resta l'UNICO
                              elemento nel pool 'dashboard': pickBestFallback
                              la seleziona comunque (è l'unico candidato),
                              e quel focus veniva "ereditato" cambiando
                              libreria con L1/R1 mentre la ricerca resta
                              attiva — se la nuova libreria aveva risultati,
                              muovere lo stick verso il basso atterrava sulla
                              colonna più a destra della prima riga (il
                              vicino direzionale più prossimo all'icona,
                              posizionata sopra la griglia), non sulla prima
                              card a sinistra come dovrebbe.
                              Causa di fondo: l'icona non dovrebbe essere
                              raggiungibile da controller in primo luogo —
                              Y apre già la ricerca da controller (v0.99.4),
                              quindi questo pulsante serve solo a chi ha
                              aperto la ricerca dal mouse e vuole forzare la
                              VK in un secondo momento. Stesso trattamento
                              già dato alla lente in v0.99.4: cliccabile solo
                              dal mouse, mai parte del pool di navigazione
                              del controller — nessun pool mai "vuoto salvo
                              l'icona", nessun focus da ereditare. */}
                          <div
                            onClick={() => setShowKeyboard(true)}
                            className="p-2 rounded-lg transition-all cursor-pointer opacity-30 hover:opacity-100 bg-white/10"
                          >
                            <Keyboard size={14} />
                          </div>
                       </div>
                    </div>
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                       <button 
                         onClick={() => { setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); play('select'); }}
                         className="px-4 py-2 hover:bg-white/5 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase italic tracking-widest"
                       >
                         {sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                         {sortOrder}
                       </button>
                       <select 
                         value={sortBy}
                         onChange={(e) => setSortBy(e.target.value as any)}
  className={cn("text-[10px] font-black uppercase italic tracking-widest px-4 py-2 outline-none cursor-pointer rounded-lg", theme === 'dark' ? "bg-[#1a1d27] text-white border border-white/10" : "bg-gray-100 text-gray-900 border border-gray-300")}
                       >
                         <option value="title">{t('dashboard:sortByTitle')}</option>
                         <option value="playTime">{t('dashboard:sortByPlayTime')}</option>
                         <option value="rating">{t('dashboard:sortByRating')}</option>
                         <option value="installDate">{t('dashboard:sortByInstallDate')}</option>
                       </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* Toggle solo installati */}
                    <button
                      onClick={() => setOnlyInstalled(!onlyInstalled)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest italic transition-all border",
                        onlyInstalled
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white/5 border-white/10 opacity-50 hover:opacity-100"
                      )}
                    >
                      <Download size={9} />
                      {t('dashboard:installedFilter')}
                    </button>
                    <div className="w-px h-6 bg-white/10 self-center mx-1" />
                    {/* Genres — derivati dai giochi reali */}
                    {(() => {
                      const genres = [...new Set(games.flatMap(g => g.genres ?? []))].slice(0, 8);
                      if (genres.length === 0) return null;
                      return (
                        <div className="flex items-center gap-2 mr-4">
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40 italic">{t('dashboard:genres')}</span>
                          <div className="flex flex-wrap gap-1">
                            {genres.map(genre => (
                              <button
                                key={genre}
                                onClick={() => setSelectedGenre(selectedGenre === genre ? '' : genre)}
                                className={cn(
                                  "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest italic transition-all",
                                  selectedGenre === genre ? "bg-blue-600 text-white" : "bg-white/5 opacity-50 hover:opacity-100"
                                )}
                              >
                                {genre}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {/* Categories — derivate dai giochi reali */}
                    {(() => {
                      const cats = [...new Set(games.flatMap(g => g.categories ?? []))].slice(0, 5);
                      if (cats.length === 0) return null;
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40 italic">{t('dashboard:categories')}</span>
                          <div className="flex flex-wrap gap-1">
                            {cats.map(cat => (
                              <button
                                key={cat}
                                onClick={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
                                className={cn(
                                  "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest italic transition-all",
                                  selectedCategory === cat ? "bg-blue-600 text-white" : "bg-white/5 opacity-50 hover:opacity-100"
                                )}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="h-[1px] bg-white/5 w-full my-6" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="grid grid-cols-4 gap-10">
            {filteredVisibleGames.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-4 py-20 flex flex-col items-center justify-center opacity-30"
              >
                <Search size={64} className="mb-6" />
                <h3 className="text-2xl font-black italic uppercase tracking-widest">{t('dashboard:noMatchingTitles')}</h3>
                <p className="text-sm font-medium mt-2">{t('dashboard:tryAdjustingFilters')}</p>
                <button 
                  onClick={() => { setSearchQuery(''); setSelectedGenre(''); setSelectedCategory(''); setOnlyInstalled(activeStore === 'All'); }}
                  className="mt-8 px-8 py-3 bg-white/10 rounded-xl text-xs font-black uppercase italic tracking-widest hover:bg-white/20 transition-all pointer-events-auto"
                >
                  {t('dashboard:clearAllFilters')}
                </button>
              </motion.div>
            ) : (
              filteredVisibleGames.map((game) => (
                <Focusable 
                  key={game.id} 
                  id={`game-${game.id}`} 
                  group="dashboard"
                  disableHoverFocus={true}
                  onEnter={() => {
                    setSelectedGameId(game.id);
                    play('select');
                  }}
                >
                  {(isFocused) => {
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        onMouseEnter={() => {
                          // Hover sempre libero — aggiorna la sidebar
                          setSelectedGameId(game.id);
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedGameId(game.id);
                          play('select');
                          handlePlay(game.id);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          // FIX v0.99.4: prima apriva l'overlay con
                          // setShowGameOptions(true) diretto, senza passare
                          // da openGameOptions — quindi senza isolare lo
                          // scope (setActiveGroup) né impostare un focus
                          // iniziale corretto. Risultato: con l'overlay
                          // aperto da click destro, stick/D-pad del
                          // controller continuavano a interagire con la
                          // dashboard sottostante invece che con l'overlay
                          // (stesso problema già risolto per Manage
                          // Accounts). openGameOptions ora gestisce tutto
                          // in un solo punto, qualunque sia l'origine
                          // dell'apertura (tastiera/controller o mouse).
                          openGameOptions(game.id);
                        }}
                        className={cn(
                          "group relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300",
                          "border-[6px]",
                          (isFocused || selectedGameId === game.id) && game.isInstalled
                            ? "border-blue-500 scale-[1.05] shadow-[0_20px_50px_rgba(37,99,235,0.4)] z-20"
                            : (isFocused || selectedGameId === game.id) && !game.isInstalled
                              ? "border-red-500 scale-[1.05] shadow-[0_20px_50px_rgba(239,68,68,0.4)] z-20"
                              : "border-transparent opacity-70"
                        )}
                      >
                        <img src={game.coverImage} className="absolute inset-0 w-full h-full object-cover" alt={game.title} />
                        {game.verified && (
                          <div
                            className="absolute top-2 right-2 z-10 bg-black/60 rounded-full p-1 backdrop-blur-sm"
                            title={game.verificationMethod ? t('dashboard:sidebar.verifiedWithMethod', { method: game.verificationMethod }) : t('dashboard:sidebar.verified')}
                          >
                            <CheckCircle2 size={16} className="text-green-400" />
                          </div>
                        )}
                        <div className={cn(
                          "absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-6 transition-opacity",
                          isFocused ? "opacity-100" : "opacity-0"
                        )}>
                          {/* Badge plugin disabilitato — solo per giochi installati con DRM */}
                          {(() => {
                            const ps = pluginStateMap.get(game.store as string);
                            const blocked = ps && !ps.enabled && !ps.drmFree && game.isInstalled;
                            return blocked ? (
                              <p className="text-[11px] font-black uppercase tracking-widest mb-1 text-yellow-400 italic">
                                {t('dashboard:sidebar.pluginDisabled')}
                              </p>
                            ) : (
                              <p className="text-[11px] font-black uppercase tracking-widest mb-1 text-blue-400 italic">
                                {translateGameStatus(game.status, game.status)}
                              </p>
                            );
                          })()}
                          <h3 className="text-xl font-black leading-tight uppercase tracking-tighter italic text-white">{game.title}</h3>
                        </div>
                      </motion.div>
                    );
                  }}
                </Focusable>
              ))
            )}
          </div>
        </section>

        {/* Sidebar — info principali */}
        {/* v0.99.36 — fix glitch visivo: transform (translateZ) forza un
            layer di compositing GPU stabile e indipendente per l'aside.
            Senza questo, il motion.div interno (che anima x/opacity ad
            ogni cambio gioco) crea/distrugge il proprio layer ad ogni
            mount, e Chromium in alcuni casi ridisegna per un frame il
            backdrop-filter dell'ancestor mostrando il colore piatto
            sotto invece che lo sfondo sfocato — visto come un rettangolo
            che lampeggia nello spazio vuoto sotto il contenuto animato. */}
        <aside
          style={{ transform: 'translateZ(0)' }}
          className={cn(
          "w-[400px] h-full backdrop-blur-3xl border-l p-10 flex flex-col z-20 shadow-[-20px_0_60px_rgba(0,0,0,0.5)] transition-colors duration-500",
          theme === 'dark' ? "bg-[#12141a]/90 border-white/5" : "bg-white/90 border-gray-200"
        )}>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {selectedGame ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedGame.id}
                  initial={{ x: 50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  transition={{ type: 'spring', damping: 20 }}
                  className="flex flex-col gap-6 min-h-0"
                >
                  {/* Cover / Trailer */}
                  <div className="relative w-full aspect-video rounded-2xl border border-white/10 overflow-hidden shadow-2xl group shrink-0">
                    {showTrailer && selectedGame.trailerUrl ? (
                    <div className="relative w-full h-full">
                      <iframe src={`${selectedGame.trailerUrl}?autoplay=1`} className="w-full h-full border-0" allow="autoplay; encrypted-media" allowFullScreen />
                      <button onClick={() => setShowTrailer(false)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-600 transition-all">
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <img src={selectedGame.previewImage} className="w-full h-full object-cover" alt="Preview" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-4">
                        {/* v0.99.37 — "Installed/Not Installed" non ha senso
                            per la card Big Picture: non è un titolo
                            installabile, è sempre disponibile se Steam è
                            presente sul sistema. Etichetta dedicata al
                            posto del badge di stato installazione. */}
                        {selectedGame.isBigPictureLauncher ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-[#66c0f4] text-[#0b1118]">
                            {t('dashboard:sidebar.steamClient')}
                          </span>
                        ) : (
                          <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest", selectedGame.isInstalled ? "bg-blue-600" : "bg-red-600")}>
                            {selectedGame.isInstalled ? t('dashboard:sidebar.installed') : t('dashboard:sidebar.notInstalled')}
                          </span>
                        )}
                      </div>
                      {selectedGame.trailerUrl && (
                        <button onClick={() => setShowTrailer(true)} className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                          <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white hover:text-black transition-all">
                            <Play size={24} fill="currentColor" />
                          </div>
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Titolo */}
                <h1 className="text-4xl font-black uppercase tracking-tighter leading-none italic [text-wrap:balance] shrink-0">{selectedGame.title}</h1>

                {/* Info rapide */}
                <div className="flex flex-wrap gap-3 items-center shrink-0">
                  {selectedGame.rating && <span className="text-[10px] font-black uppercase text-green-500 tracking-widest italic">{t('dashboard:sidebar.rating', { pct: selectedGame.rating })}</span>}
                  {selectedGame.hltbHours && <span className="text-[10px] font-black uppercase text-blue-400 tracking-widest italic border-l border-white/10 pl-3">{t('dashboard:sidebar.hltb', { hours: selectedGame.hltbHours.main })}</span>}
                  <span className="text-[10px] font-black uppercase text-white/40 tracking-widest italic border-l border-white/10 pl-3">{translateStorePluginName(selectedGame.store, selectedGame.store)}</span>
                  <span className="text-[10px] font-black uppercase text-white/40 tracking-widest italic border-l border-white/10 pl-3">{selectedGame.runner}</span>
                </div>

                {/* Generi e tag */}
                <div className="flex flex-wrap gap-2 shrink-0">
                  {selectedGame.genres?.map(g => (
                    <span key={g} className="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-[10px] font-black uppercase tracking-widest text-purple-400">{g}</span>
                  ))}
                  {selectedGame.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-[10px] font-black uppercase tracking-widest text-blue-400">{tag}</span>
                  ))}
                </div>

                {/* Ore di gioco — reali dal DB */}
                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 shrink-0">
                  <Clock size={14} className="text-blue-400 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{t('dashboard:sidebar.playtime')}</span>
                  <span className="ml-auto text-sm font-black italic">
                    {selectedGame.playTimeHours > 0
                      ? `${selectedGame.playTimeHours.toFixed(1)}h`
                      : <span className="opacity-30 text-xs font-normal">—</span>}
                  </span>
                </div>

                {/* Dimensione prevista di installazione — richiesta utente,
                    GOG/Epic/Amazon (v1.1.112-dev.1: getPredictedInstallSizeBytes
                    implementata anche per Amazon via nile install --info --json,
                    vedi amazonPlugin.ts). Steam/Classic Console non hanno una
                    fonte già cablata per questo, vedi discussione.
                    Blocco nascosto del tutto per gli altri store, invece di
                    mostrare sempre un "—" che implicherebbe un dato mancante
                    anziché "non applicabile a questo store". */}
                {(selectedGame.store === 'GOG Galaxy' || selectedGame.store === 'Epic Games' || selectedGame.store === 'Amazon Games') && (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/5 shrink-0">
                    <HardDrive size={14} className="text-blue-400 shrink-0" />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{t('dashboard:sidebar.predictedSize')}</span>
                    <span className="ml-auto text-sm font-black italic">
                      {predictedSizeLoading
                        ? <span className="opacity-30 text-xs font-normal">{t('dashboard:sidebar.predictedSizeLoading')}</span>
                        : predictedSizeBytes && predictedSizeBytes > 0
                          ? `${(predictedSizeBytes / (1024 ** 3)).toFixed(1)} GB`
                          : <span className="opacity-30 text-xs font-normal">—</span>}
                    </span>
                  </div>
                )}

                {/* Achievements — nascosto: non ancora implementato */}
                {/* {selectedGame.achievements && ( ... )} */}

                {/* Descrizione — v1.0.0: prima l'auto-scroll riguardava
                    l'intera colonna (immagine, badge, titolo, tag, ecc.
                    tutti insieme) quando il contenuto eccedeva lo spazio.
                    Ora è vincolata a un'altezza massima propria che non
                    eccede mai lo spazio della colonna, e solo il testo AL
                    SUO INTERNO scorre quando supera quella dimensione —
                    tutto il resto (immagine, badge, titolo, piattaforma/
                    runner, tag, playtime) resta fisso, mai coinvolto nello
                    scroll. Il ref di auto-scroll si sposta qui, sull'unico
                    contenitore che ora può eccedere la propria dimensione. */}
                {/* v1.0.0 — DIAGNOSTICA TEMPORANEA (round 2): position
                    fixed, fuori dal flusso della colonna — la volta
                    scorsa l'elemento diagnostico viveva DENTRO il flusso
                    e potrebbe aver influenzato il layout che stavamo
                    misurando. Qui non puo' avere alcun effetto sulla
                    dimensione del box sotto osservazione. */}
                
                {selectedGame.description && (
                  <div
                    ref={descriptionScrollRefCallback}
                    className={cn(
                      "overflow-y-auto overflow-x-hidden custom-scrollbar p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl",
                      // v1.0.0 — fix definitivo, non più una soglia fissa
                      // per "console aperta/chiusa": flex-1 min-h-0 lascia
                      // che sia il browser a calcolare quanto spazio resta
                      // DAVVERO disponibile nella colonna, dato tutto il
                      // resto (titolo/tag/playtime sopra, che possono
                      // occupare più o meno righe a seconda della
                      // lunghezza, e la console di debug sotto, che è
                      // shrink-0 e prende la sua parte per prima). Un
                      // titolo lunghissimo o una console aperta riducono
                      // automaticamente lo spazio di questo box, mai il
                      // contrario — niente più bisogno di conoscere lo
                      // stato della console qui dentro. max-h resta solo
                      // come tetto massimo per schermi molto alti con
                      // poco altro sopra, non più come unica misura.
                      "flex-1 min-h-0 max-h-[400px]"
                    )}
                  >
                    <p className="text-xs opacity-70 leading-relaxed font-medium italic">
                      {(selectedGame.id === 'ea-app-launcher' || selectedGame.id === 'ubisoft-connect-launcher')
                        ? translateLauncherGameDescription(selectedGame.id, selectedGame.description)
                        : selectedGame.description}
                    </p>
                  </div>
                )}
                </motion.div>
              </AnimatePresence>
            ) : isFetchingLibrary && games.length === 0 ? (
              // v0.99.38 — stato di caricamento vero e proprio, distinto dal
              // benvenuto: solo quando la libreria non ha ancora risposto
              // affatto (primo fetch, games ancora vuoto). Se games.length
              // > 0 ma selectedGame è undefined, la libreria C'È già — è
              // semplicemente che l'utente non ha ancora selezionato nulla,
              // quindi va mostrato il benvenuto, non "sta caricando".
              <div className="flex flex-col items-center justify-center h-full opacity-30 text-center px-6">
                <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">{t('dashboard:sidebar.loadingLibrary')}</p>
              </div>
            ) : (
              // v0.99.38 — pannello di benvenuto vero e proprio (prima era
              // un placeholder minimale "Nessun gioco selezionato" nato solo
              // per evitare il crash da accesso a selectedGame.id senza
              // guardia — funzionale ma poco accogliente). Mostrato al
              // primo caricamento prima di qualunque selezione, e ogni volta
              // che la selezione torna genuinamente vuota (es. libreria
              // filtrata svuotata da una ricerca).
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
                  <Sparkles size={28} className="text-blue-400" />
                </div>
                <p className="text-lg font-black italic uppercase tracking-tight mb-1">
                  {hostname ? t('dashboard:sidebar.welcomeBackNamed', { name: hostname }) : t('dashboard:sidebar.welcomeBack')}
                </p>
                <p className="text-xs opacity-50 font-medium leading-relaxed max-w-[240px] mb-6">
                  {t('dashboard:sidebar.welcomeHint')}
                </p>
                {games.length > 0 && (
                  <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest opacity-40">
                    <span className="flex items-center gap-1.5">
                      <LayoutGrid size={12} />
                      {t('dashboard:sidebar.titleCount', { count: games.length })}
                    </span>
                    {games.some((g: any) => g.verified) && (
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-green-400" />
                        {t('dashboard:sidebar.verifiedCount', { count: games.filter((g: any) => g.verified).length })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Debug Console — Step 12f */}
          <AnimatePresence>
            {showDebugConsole && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 260, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-6 pt-6 border-t border-white/5 overflow-hidden shrink-0 flex flex-col"
              >
                {/* Header toolbar */}
                <div className="flex items-center gap-2 mb-2 px-1 flex-wrap">
                  {/* Titolo */}
                  <Terminal size={12} className="text-blue-500 shrink-0" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em] font-mono italic shrink-0">
                    Daemon Log
                  </span>

                  {/* Filtri livello */}
                  <div className="flex items-center gap-1 ml-1 flex-wrap">
                    {ALL_LOG_LEVELS.map(lvl => {
                      const meta = LOG_LEVEL_META[lvl];
                      const active = logFilter.has(lvl);
                      return (
                        <button
                          key={lvl}
                          onClick={() => toggleLogFilter(lvl)}
                          title={`Filtra ${lvl}`}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-black font-mono uppercase border transition-all",
                            active
                              ? `${meta.color} ${meta.border} bg-white/5`
                              : "text-gray-600 border-gray-700 hover:border-gray-500"
                          )}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                    {logFilter.size > 0 && (
                      <button
                        onClick={() => setLogFilter(new Set())}
                        title="Rimuovi filtri"
                        className="px-1.5 py-0.5 rounded text-[8px] font-black font-mono uppercase border text-gray-600 border-gray-700 hover:border-red-500 hover:text-red-400 transition-all"
                      >
                        ✕ ALL
                      </button>
                    )}
                  </div>

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Azioni */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setPauseScroll(p => !p)}
                      title={pauseScroll ? "Riprendi auto-scroll" : "Pausa auto-scroll"}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border transition-all",
                        pauseScroll
                          ? "text-yellow-400 border-yellow-500/50 bg-yellow-500/10"
                          : "text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400"
                      )}
                    >
                      <Pause size={9} />
                      {pauseScroll ? "PAUSED" : "LIVE"}
                    </button>
                    <button
                      onClick={handleCopyLogs}
                      title="Copia log negli appunti"
                      className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border text-gray-600 border-gray-700 hover:border-gray-500 hover:text-gray-400 transition-all"
                    >
                      <Copy size={9} />
                    </button>
                    <button
                      onClick={handleDownloadLogs}
                      title="Scarica log come file"
                      className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono border text-gray-600 border-gray-700 hover:border-blue-400 hover:text-blue-400 transition-all"
                    >
                      <FileDown size={9} />
                    </button>
                  </div>

                  {/* Live indicator */}
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    pauseScroll ? "bg-yellow-500" : "bg-blue-500 animate-pulse"
                  )} />
                </div>

                {/* Log body */}
                <div
                  ref={logScrollRef}
                  className={cn(
                    "rounded-xl p-3 font-mono text-[9px] flex-1 border overflow-y-auto shadow-inner scroll-smooth",
                    theme === 'dark' ? "bg-black/80 border-white/5" : "bg-white border-black/5"
                  )}
                >
                  {filteredLogs.length === 0 ? (
                    <span className="text-gray-700 italic">Nessun log{logFilter.size > 0 ? ' per il filtro selezionato' : ''}.</span>
                  ) : (
                    <div className="space-y-1">
                      {filteredLogs.map((log, i) => {
                        const meta = LOG_LEVEL_META[log.type] ?? LOG_LEVEL_META['info'];
                        return (
                          <div key={i} className={cn("flex gap-2 border-l-2 pl-2", meta.color, meta.border)}>
                            <span className="opacity-30 shrink-0 font-bold whitespace-nowrap">[{log.timestamp}]</span>
                            <span className={cn(
                              "shrink-0 font-black uppercase text-[8px] w-7 pt-px",
                              meta.color
                            )}>{meta.label}</span>
                            <span className="break-all opacity-90">{log.message}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer: conteggio */}
                <div className="flex items-center justify-between px-1 mt-1">
                  <span className="text-[8px] text-gray-700 font-mono">
                    {filteredLogs.length} voci{logFilter.size > 0 ? ` · filtro attivo (${logFilter.size})` : ''}
                  </span>
                  <span className="text-[8px] text-gray-700 font-mono">
                    {logs.length} totali
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>

        <AnimatePresence>
          {showDownloads && (
            <motion.div
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              className={cn(
                "absolute top-0 right-0 bottom-0 w-96 z-50 p-10 flex flex-col shadow-2xl border-l",
                theme === 'dark' ? "bg-[#12141a] border-white/10" : "bg-white border-gray-200"
              )}
            >
              <div className="flex items-center justify-between gap-4 mb-10">
                 {/* Step 19b (v1.1.45) — stesso fix del Quick Menu: vedi
                     commento esteso lì. */}
                 <div className="flex items-center gap-3 flex-1 min-w-0">
                   <Download size={20} className="text-blue-500 shrink-0" />
                   <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('downloads:title')}</h2>
                 </div>
                 <Focusable group="downloads" id="downloads-close" fallbackPriority={-1} onEnter={() => { setShowDownloads(false); setActiveGroup(null); setFocusedId('footer-downloads'); }}>
                   {(isFocused) => (
                     <div className={cn(
                       "w-8 h-8 rounded-full border flex items-center justify-center transition-all shrink-0",
                       isFocused && "scale-110 bg-red-600 border-red-600 text-white"
                     )}>
                       <X size={16} />
                     </div>
                   )}
                 </Focusable>
              </div>

              <div className="space-y-6 overflow-y-auto custom-scrollbar flex-1 pr-2">

                {/* Dialog di conferma install/uninstall */}
                {pendingAction && (
                  <div className="p-5 rounded-2xl border-2 border-blue-500/40 bg-blue-500/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">
                      {pendingAction.type === 'install' ? t('downloads:confirmInstall') : t('downloads:confirmUninstall')}
                    </p>
                    <p className="text-sm font-black italic uppercase tracking-tighter mb-5">
                      {pendingAction.gameTitle}
                    </p>
                    <p className="text-xs opacity-50 mb-6">
                      {pendingAction.type === 'install'
                        ? t('downloads:installConfirmDesc')
                        : t('downloads:uninstallConfirmDesc')}
                    </p>
                    <div className="flex gap-3">
                      <Focusable group="downloads" id="pending-confirm" onEnter={async () => {
                        const action = pendingAction;
                        setPendingAction(null);
                        if (action.type === 'install') {
                          play('launch');
                          // v0.99.35 — bug confermato: winetricksVerbs (stato
                          // React) viene popolato SOLO quando si apre
                          // l'overlay opzioni per un gioco specifico (vedi
                          // useEffect su showGameOptions/selectedGame). Se
                          // l'installazione parte da handlePlay — lancio
                          // diretto dalla card, senza passare dall'overlay
                          // per QUESTO gioco in questa sessione — lo stato
                          // resta quello dell'ultimo gioco aperto
                          // nell'overlay (o i default, se nessuno) invece
                          // dei verbs realmente salvati per action.gameId.
                          // Si rilegge sempre dal DB qui, al momento della
                          // conferma effettiva, per il gameId corretto —
                          // stessa fonte (GET /api/games/:id/compat) e
                          // stesso fallback ai default già usati
                          // dall'overlay, così i due percorsi (card diretta
                          // vs overlay) restano garantiti coerenti.
                          let verbsToSend: string[] = DEFAULT_WINE_VERBS;
                          let disableSyncToSend = false;
                          let useKnownFixesToSend = false;
                          try {
                            const compatRes = await fetch(`/api/games/${action.gameId}/compat`);
                            const profile = compatRes.ok ? await compatRes.json() : {};
                            if (Array.isArray(profile?.winetricksVerbs)) {
                              verbsToSend = profile.winetricksVerbs;
                            }
                            disableSyncToSend = !!profile?.disableWineSync;
                            useKnownFixesToSend = !!profile?.useKnownFixes;
                          } catch {
                            // fetch falsa — procede con i default, non blocca l'installazione
                          }
                          try {
                            const res = await fetch('/api/downloads/start', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                gameId: action.gameId, winetricksVerbs: verbsToSend,
                                disableWineSync: disableSyncToSend, useKnownFixes: useKnownFixesToSend,
                                // v1.1.18 — presente solo se l'utente aveva
                                // davvero spento lo switch "solo
                                // installazione" per almeno una variabile;
                                // undefined altrimenti (nessuna differenza
                                // rispetto a prima di questa modifica).
                                installOnlyEnv: action.installOnlyEnv,
                              }),
                            });
                            const data = await res.json().catch(() => ({}));
                            // v0.99.36 — Step 2 (lock prefix): il backend ora
                            // può rifiutare esplicitamente l'avvio (es. il
                            // gioco è già in esecuzione) invece di limitarsi
                            // a ignorare la richiesta — l'utente deve saperlo,
                            // stesso trattamento già riservato al ramo uninstall.
                            if (!res.ok || data?.success === false) {
                              pushNotification({
                                type:   'error',
                                title:  t('downloads:installNotStarted'),
                                body:   data?.message ?? t('downloads:unknownError'),
                                gameId: action.gameId,
                                gameTitle: action.gameTitle,
                                source: 'system',
                              });
                            }
                          } catch (err) {
                            pushNotification({
                              type:   'error',
                              title:  t('downloads:installNotStarted'),
                              body:   String(err),
                              gameId: action.gameId,
                              gameTitle: action.gameTitle,
                              source: 'system',
                            });
                          }
                        } else {
                          play('launch');
                          // v0.99.35 — la risposta NON va più ignorata: se
                          // il backend rifiuta (es. nessun file da
                          // rimuovere — caso raro ora che la pulizia
                          // copre anche installazioni incomplete, vedi
                          // gameManager.ts), l'utente deve saperlo invece
                          // di vedere il pannello chiudersi come se fosse
                          // andato tutto bene su un'operazione che in
                          // realtà non ha fatto nulla.
                          try {
                            const res = await fetch(`/api/games/${action.gameId}/uninstall`, { method: 'DELETE' });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok || data?.success === false) {
                              pushNotification({
                                type:   'error',
                                title:  t('downloads:uninstallFailed'),
                                body:   data?.message ?? t('downloads:unknownError'),
                                gameId: action.gameId,
                                gameTitle: action.gameTitle,
                                source: 'system',
                              });
                            }
                          } catch (err) {
                            pushNotification({
                              type:   'error',
                              title:  t('downloads:uninstallFailed'),
                              body:   String(err),
                              gameId: action.gameId,
                              gameTitle: action.gameTitle,
                              source: 'system',
                            });
                          }
                        }
                      }}>
                        {(isFocused) => (
                          <button className={cn(
                            "flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all",
                            pendingAction.type === 'install'
                              ? isFocused ? "bg-blue-500 text-white scale-105" : "bg-blue-600 hover:bg-blue-500 text-white"
                              : isFocused ? "bg-red-500 text-white scale-105" : "bg-red-600 hover:bg-red-500 text-white"
                          )}>
                            {pendingAction.type === 'install' ? t('downloads:installActionConfirm') : t('downloads:uninstallActionConfirm')}
                          </button>
                        )}
                      </Focusable>
                      <Focusable group="downloads" id="pending-cancel" onEnter={() => setPendingAction(null)}>
                        {(isFocused) => (
                          <button className={cn(
                            "flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all",
                            isFocused ? "bg-white/25 scale-105" : "bg-white/10 hover:bg-white/20"
                          )}>{t('downloads:cancel')}</button>
                        )}
                      </Focusable>
                    </div>
                  </div>
                )}

                {downloads.filter((t: any) => !hiddenCompletedIds.has(t.gameId)).length === 0 && !pendingAction ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 text-center">
                    <Download size={48} className="mb-4" />
                    <p className="font-black italic uppercase tracking-widest text-xs">{t('downloads:noActiveTransfers')}</p>
                  </div>
                ) : (
                  downloads.filter((t: any) => !hiddenCompletedIds.has(t.gameId)).map(task => (
                    <div key={task.gameId} className={cn("p-5 rounded-2xl", theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200")}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                           <span className="text-[10px] font-black italic text-blue-500 uppercase tracking-widest block mb-1">
                             {task.phaseLabel || (task.status === 'downloading' ? t('downloads:downloadInProgress') : task.status.toUpperCase())}
                           </span>
                           <h4 className="text-sm font-black italic uppercase tracking-tighter">{task.gameTitle}</h4>
                        </div>
                        <span className="text-xs font-black italic text-blue-400">{task.speed}</span>
                      </div>

                      {/* Step 19d — link alla pagina ufficiale di download,
                          consolidato qui invece che in una notifica a
                          parte: l'utente ha chiarito che l'interazione per
                          le installazioni vive sempre nel pannello
                          Download, non ha senso spezzarla su un'altra
                          colonna. */}
                      {task.status === 'awaiting_installer' && task.downloadUrl && (
                        <Focusable
                          group="downloads"
                          id={`dl-link-${task.gameId}`}
                          onEnter={() => {
                            fetch('/api/open-url', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ url: task.downloadUrl }),
                            });
                          }}
                        >
                          {(isFocused) => (
                            <div className={cn(
                              "mb-3 px-3 py-2 rounded-lg text-[10px] font-bold text-center underline cursor-pointer transition-all",
                              isFocused ? "bg-blue-500/30 text-blue-200" : "text-blue-400"
                            )}>{task.downloadUrl}</div>
                          )}
                        </Focusable>
                      )}
                      
                      <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mb-3">
                        <motion.div 
                          className="h-full bg-blue-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${task.progress}%` }}
                        />
                      </div>
                      
                      <div className="flex justify-between items-center flex-wrap gap-y-2">
                        {/* Step 19d — bug segnalato dall'utente: 3 pulsanti
                            (Continua/Sfoglia/Annulla) uscivano dal widget
                            perché il contenitore non andava mai a capo.
                            La percentuale non è pertinente in attesa
                            dell'installer (resta sempre 0%) — nascosta per
                            lasciare spazio ai pulsanti senza affollare la riga. */}
                        {task.status !== 'awaiting_installer' && (
                          <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest italic">{t('downloads:percentComplete', { pct: task.progress.toFixed(0) })}</span>
                        )}
                        <div className="flex flex-wrap justify-end gap-2 ml-auto">
                          {confirmCancelDownloadId === task.gameId ? (
                            <>
                              <Focusable
                                group="downloads"
                                id={`dl-cancel-confirm-${task.gameId}`}
                                onEnter={() => {
                                  setConfirmCancelDownloadId(null);
                                  fetch('/api/downloads/cancel', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: task.gameId }),
                                  });
                                }}
                              >
                                {(isFocused) => (
                                  <button className={cn(
                                    "px-3 py-1 rounded-lg text-[9px] font-black uppercase italic transition-all",
                                    isFocused ? "bg-red-600 text-white" : "bg-red-600/60 text-white"
                                  )}>
                                    {t('downloads:confirm')}
                                  </button>
                                )}
                              </Focusable>
                              <Focusable
                                group="downloads"
                                id={`dl-cancel-back-${task.gameId}`}
                                onEnter={() => setConfirmCancelDownloadId(null)}
                              >
                                {(isFocused) => (
                                  <button className={cn(
                                    "px-3 py-1 rounded-lg text-[9px] font-black uppercase italic transition-all",
                                    isFocused ? "bg-white/25 text-white" : "bg-white/10 opacity-60"
                                  )}>
                                    {t('downloads:back')}
                                  </button>
                                )}
                              </Focusable>
                            </>
                          ) : (
                            <>
                              <Focusable 
                                group="downloads"
                                id={`dl-pause-${task.gameId}`} 
                                onEnter={() => {
                                  // Step 19d — in attesa dell'installer,
                                  // "Pausa" non ha senso (non c'è nulla in
                                  // corso da mettere in pausa): il click
                                  // ricontrolla ~/Downloads (stesso
                                  // endpoint di "Continua"), invece del
                                  // generico pause/resume pensato per un
                                  // download vero e proprio. Consolidato
                                  // qui dopo feedback utente: le notifiche
                                  // di installazione sono sempre vissute
                                  // nel pannello Download, non ha senso
                                  // spezzare il flusso su un'altra colonna.
                                  if (task.status === 'awaiting_installer') {
                                    fetch('/api/downloads/installer-continue', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ gameId: task.gameId }),
                                    });
                                    return;
                                  }
                                  fetch(task.status === 'paused' ? '/api/downloads/resume' : '/api/downloads/pause', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ id: task.gameId })
                                  });
                                }}
                              >
                                {(isFocused) => (
                                  <button className={cn(
                                    "px-3 py-1 rounded-lg text-[9px] font-black uppercase italic transition-all",
                                    isFocused ? "bg-blue-600 text-white" : "bg-white/10 opacity-60"
                                  )}>
                                    {task.status === 'awaiting_installer'
                                      ? t('downloads:continue')
                                      : task.status === 'paused' ? t('downloads:resume') : t('downloads:pause')}
                                  </button>
                                )}
                              </Focusable>
                              {task.status === 'awaiting_installer' && (
                                <Focusable
                                  group="downloads"
                                  id={`dl-browse-${task.gameId}`}
                                  onEnter={() => {
                                    // v1.5.20-dev.12 — Fase A.4: zenity/
                                    // kdialog non rispondono affatto al
                                    // gamepad — con un controller si apre
                                    // il file manager nativo in-app al
                                    // loro posto, stessa distinzione
                                    // inputDevice già usata altrove nel
                                    // progetto (footer). Con mouse/
                                    // tastiera resta il dialog nativo di
                                    // sempre, nessun cambiamento per loro.
                                    if (inputDevice === 'controller') {
                                      openFileBrowser({ purpose: 'installer', gameId: task.gameId, extensions: ['exe', 'msi', 'cab'] });
                                      return;
                                    }
                                    fetch('/api/downloads/installer-browse', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ gameId: task.gameId }),
                                    });
                                  }}
                                >
                                  {(isFocused) => (
                                    <button className={cn(
                                      "px-3 py-1 rounded-lg text-[9px] font-black uppercase italic transition-all",
                                      isFocused ? "bg-blue-600 text-white" : "bg-white/10 opacity-60"
                                    )}>{t('downloads:browse')}</button>
                                  )}
                                </Focusable>
                              )}
                              {/* v0.99.38 — annulla davvero il download: elimina
                                  processo, task E i file parziali già scaricati/
                                  estratti su disco (vedi downloadManager.ts/
                                  cancelTask). Prima esisteva solo pausa/ripresa,
                                  nessun modo di abbandonare del tutto
                                  un'installazione che non si vuole più
                                  completare. */}
                              <Focusable
                                group="downloads"
                                id={`dl-cancel-${task.gameId}`}
                                onEnter={() => setConfirmCancelDownloadId(task.gameId)}
                              >
                                {(isFocused) => (
                                  <button className={cn(
                                    "px-3 py-1 rounded-lg text-[9px] font-black uppercase italic transition-all",
                                    isFocused ? "bg-red-600 text-white" : "bg-white/10 opacity-60"
                                  )}>
                                    {t('downloads:cancel')}
                                  </button>
                                )}
                              </Focusable>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-10 p-6 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-center gap-4">
                <Activity size={20} className="text-blue-500 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-black opacity-30 uppercase tracking-widest leading-none mb-1">{t('downloads:peerHashCache')}</span>
                  <span className="text-xs font-black italic">{t('downloads:checksumVerification')}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Gamepad activation hint ── */}
        {connectedDevices.length > 0 && (
          <div
            id="gamepad-hint"
            className={cn(
              "absolute bottom-20 left-1/2 -translate-x-1/2 z-40 px-6 py-3 rounded-2xl",
              "bg-black/80 text-white text-[10px] font-black uppercase tracking-widest",
              "transition-opacity duration-1000 pointer-events-none"
            )}
            style={{ opacity: 0, animation: 'fadeInOut 4s ease forwards' }}
          >
            {t('downloads:gamepadHint')}
          </div>
        )}

        {/* ── Centro Notifiche ── */}
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              className={cn(
                "absolute top-0 right-0 bottom-0 w-96 z-50 p-10 flex flex-col shadow-2xl border-l",
                theme === 'dark' ? "bg-[#12141a] border-white/10" : "bg-white border-gray-200"
              )}
            >
              <div className="flex items-center justify-between gap-4 mb-2">
                {/* Step 19b (v1.1.64) — segnalato dall'utente: "Notifiche"/
                    "Notifications" è una singola parola, senza spazi —
                    non può andare a capo per fare spazio, quindi flex-1
                    min-w-0 sul contenitore (v1.1.45) non bastava: se badge
                    + "Pulisci storico" + chiusura insieme non ci stavano
                    più nella riga, il titolo la sovrapponeva comunque,
                    invece di restringersi (non può, è una parola sola).
                    Pulisci storico spostato su una riga propria sotto
                    l'header, così titolo e chiusura restano solo in due
                    sulla riga principale — molto più margine, e Pulisci
                    storico non compete mai più con nessuno. */}
                <div className="flex items-center gap-3 min-w-0">
                  {unreadCount > 0 ? <BellDot size={20} className="text-blue-400 shrink-0" /> : <Bell size={20} className="text-blue-400 shrink-0" />}
                  <h2 className="text-2xl font-black italic tracking-tighter uppercase truncate">{t('notifications:title')}</h2>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-600 text-white shrink-0">{unreadCount}</span>
                  )}
                </div>
                <Focusable group="notifications" id="notifications-close" fallbackPriority={-1} onEnter={() => { setShowNotifications(false); setActiveGroup(null); setFocusedId('footer-notifications'); }}>
                  {(isFocused) => (
                    <div className={cn(
                      "w-8 h-8 rounded-full border flex items-center justify-center transition-all shrink-0",
                      isFocused && "scale-110 bg-red-600 border-red-600 text-white"
                    )}><X size={16} /></div>
                  )}
                </Focusable>
              </div>
              {notifications.some(n => n.status === 'dismissed' || n.status === 'resolved' || n.status === 'failed') && (
                <div className="flex justify-end mb-6">
                  <Focusable group="notifications" id="notifications-clear" onEnter={() => setNotifications(prev => prev.filter(n => n.status === 'pending' || n.status === 'applied'))}>
                    {(isFocused) => (
                      <button
                        className={cn(
                          "text-[10px] font-black uppercase tracking-widest transition-opacity whitespace-nowrap",
                          isFocused ? "opacity-100 text-red-400" : "opacity-30 hover:opacity-80"
                        )}
                      >{t('notifications:clearHistory')}</button>
                    )}
                  </Focusable>
                </div>
              )}
              <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-2 space-y-3">
                {notifications.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 text-center gap-4">
                    <Bell size={48} />
                    <p className="font-black italic uppercase tracking-widest text-xs">{t('notifications:noNotifications')}</p>
                  </div>
                ) : (
                  notifications.map(notif => {
                    const isDone = notif.status === 'resolved' || notif.status === 'failed' || notif.status === 'dismissed';
                    const cfgMap: Record<string, { icon: React.ReactNode; accent: string; badge: string }> = {
                      'info':          { icon: <Info size={14} />,          accent: 'border-blue-500/30 bg-blue-500/5',     badge: 'bg-blue-600' },
                      'success':       { icon: <CheckCircle2 size={14} />,  accent: 'border-green-500/30 bg-green-500/5',   badge: 'bg-green-600' },
                      'warning':       { icon: <AlertTriangle size={14} />, accent: 'border-yellow-500/30 bg-yellow-500/5', badge: 'bg-yellow-500' },
                      'error':         { icon: <XCircle size={14} />,       accent: 'border-red-500/30 bg-red-500/5',       badge: 'bg-red-600' },
                      'ai-suggestion': { icon: <Sparkles size={14} />,      accent: 'border-purple-500/30 bg-purple-500/5', badge: 'bg-purple-600' },
                      'kb-suggestion': { icon: <BookOpen size={14} />,      accent: 'border-gray-500/30 bg-gray-500/5',     badge: 'bg-gray-600' },
                    };
                    const cfg = cfgMap[notif.type] ?? cfgMap['info'];
                    return (
                      <div key={notif.id} className={cn("rounded-2xl border p-4 transition-all", cfg.accent, isDone && "opacity-40")}>
                        <div className="flex items-start gap-3 mb-2">
                          <div className={cn("mt-0.5 p-1.5 rounded-lg shrink-0 text-white", cfg.badge)}>{cfg.icon}</div>
                          <div className="flex-1 min-w-0">
                            <ScrollOnceTitle text={notif.title} className="text-sm font-black uppercase tracking-tight leading-tight" />
                            <p className={cn("text-[10px] font-mono mt-0.5", theme === 'dark' ? "opacity-30" : "text-gray-400")}>
                              {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {notif.gameTitle && ` · ${notif.gameTitle}`}
                              {notif.status === 'applied' && ` · ${t('notifications:waitingConfirmation')}`}
                              {notif.status === 'resolved' && ` · ${t('notifications:resolved')}`}
                              {notif.status === 'failed' && ` · ${t('notifications:notResolved')}`}
                            </p>
                          </div>
                          {!isDone && (
                            <Focusable group="notifications" id={`notif-dismiss-${notif.id}`} onEnter={() => dismissNotification(notif.id)}>
                              {(isFocused) => (
                                <button className={cn(
                                  "shrink-0 rounded-full transition-all",
                                  isFocused ? "opacity-100 bg-white/15 p-0.5" : "opacity-20"
                                )}><X size={12} /></button>
                              )}
                            </Focusable>
                          )}
                        </div>
                        {/* v2.0.41-dev.15 — BUG trovato scrivendo i
                            suggerimenti multi-riga (launcher-troubleshooting-tips,
                            un "•" per riga separati da \n): senza
                            whitespace-pre-line l'HTML collassa i newline in
                            un unico paragrafo, illeggibile come elenco.
                            Nessun corpo di notifica esistente aveva mai
                            avuto più di una riga prima d'ora — bug latente
                            mai emerso, non solo per questa nuova funzione. */}
                        <p className="text-[13px] leading-relaxed opacity-70 mb-3 whitespace-pre-line">{notif.body}</p>
                        {notif.rawLog && (
                          <div className="mb-3">
                            <Focusable group="notifications" id={`notif-log-${notif.id}`} onEnter={() => setExpandedNotifId(prev => prev === notif.id ? null : notif.id)}>
                              {(isFocused) => (
                                <button className={cn(
                                  "flex items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-opacity",
                                  isFocused ? "opacity-100" : "opacity-40"
                                )}>
                                  <ChevronDown size={10} className={cn("transition-transform", expandedNotifId === notif.id && "rotate-180")} />
                                  {t('notifications:technicalLog')}
                                </button>
                              )}
                            </Focusable>
                            {expandedNotifId === notif.id && (
                              <pre className={cn("mt-2 p-3 rounded-xl text-[10px] font-mono leading-relaxed overflow-x-auto max-h-32", theme === 'dark' ? "bg-black/40 text-white/50" : "bg-gray-100 text-gray-600")}>{notif.rawLog}</pre>
                            )}
                          </div>
                        )}
                        {!isDone && (
                          <div className="flex gap-2">
                            {notif.linkUrl && (
                              <Focusable
                                group="notifications"
                                id={`notif-link-${notif.id}`}
                                onEnter={() => { fetch('/api/open-url', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ url: notif.linkUrl }),
                                }).catch(() => {}); }}
                              >
                                {(isFocused) => (
                                  <div className={cn(
                                    "w-full mb-2 px-3 py-2 rounded-xl text-[10px] font-bold text-center underline transition-all cursor-pointer",
                                    isFocused ? "bg-blue-500/30 text-blue-200" : "text-blue-300"
                                  )}>{notif.linkLabel ?? notif.linkUrl}</div>
                                )}
                              </Focusable>
                            )}
                            {notif.status === 'applied' ? (
                              <>
                                <Focusable group="notifications" id={`notif-ok-${notif.id}`} onEnter={() => resolveNotification(notif.id, true)}>
                                  {(isFocused) => (
                                    <button className={cn(
                                      "flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white text-center transition-all",
                                      isFocused ? "bg-green-500 scale-[1.03]" : "bg-green-600"
                                    )}>{t('notifications:itWorked')}</button>
                                  )}
                                </Focusable>
                                <Focusable group="notifications" id={`notif-ko-${notif.id}`} onEnter={() => resolveNotification(notif.id, false)}>
                                  {(isFocused) => (
                                    <button className={cn(
                                      "flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-white text-center transition-all",
                                      isFocused ? "bg-red-600 scale-[1.03]" : "bg-red-700/60"
                                    )}>{t('notifications:itDidNotWork')}</button>
                                  )}
                                </Focusable>
                              </>
                            ) : (
                              <>
                                {/* const locale: la narrowing di TS su notif.primaryAction
                                    non attraversa la closure di onEnter/(isFocused) => sotto,
                                    che TS tratta come possibile riassegnazione — con una
                                    const catturata per valore la narrowing invece regge. */}
                                {(() => { const primaryAction = notif.primaryAction; return primaryAction && (
                                  <Focusable
                                    group="notifications"
                                    id={`notif-primary-${notif.id}`}
                                    onEnter={() => {
                                      if (primaryAction?.handler === 'open_section') {
                                        const section = primaryAction.params?.section;
                                        if (section === 'accounts' || section === 'plugins') {
                                          setShowNotifications(false);
                                          setShowSettings(true);
                                          setActiveSettingsTab(section);
                                        }
                                        setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, status: 'applied' } : n));
                                        return;
                                      }
                                      // v1.5.20-dev.22 — richiesta utente:
                                      // scelta esplicita "chiudi ora" per
                                      // il launcher condiviso rimasto
                                      // aperto dopo la chiusura di un
                                      // gioco dipendente — la scelta
                                      // opposta ("tieni aperto") non
                                      // richiede alcuna azione, è già il
                                      // comportamento del pulsante
                                      // secondario/dismiss di sempre.
                                      // dismissNotification invece di
                                      // status:'applied' — non ha senso
                                      // un "ha funzionato?" di riscontro
                                      // per un'azione fire-and-forget
                                      // come questa (a differenza di un
                                      // fix applicato, qui non c'è nulla
                                      // da confermare).
                                      if (primaryAction?.handler === 'close_shared_launcher') {
                                        const launcherId = primaryAction.params?.launcherId;
                                        if (launcherId) {
                                          fetch(`/api/shared-launchers/${launcherId}/close`, { method: 'POST' }).catch(() => {});
                                        }
                                        dismissNotification(notif.id);
                                        return;
                                      }
                                      // v2.0.41-dev.4 — richiesta utente: conferma di
                                      // collegamento fra un gioco rilevato nativamente in
                                      // un launcher condiviso (Ubisoft Connect, oggi) e la
                                      // riga già esistente in libreria da un altro store.
                                      // Riusa lo stesso endpoint generico già usato da
                                      // Runner Bridge in Game Options (PATCH config) — un
                                      // solo punto di scrittura per requiresLauncher, sia
                                      // manuale che proposto da notifica.
                                      if (primaryAction?.handler === 'link_shared_launcher_game') {
                                        const targetGameId = primaryAction.params?.targetGameId;
                                        const launcherId = primaryAction.params?.launcherId;
                                        if (targetGameId && launcherId) {
                                          fetch(`/api/games/${targetGameId}/config`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ requiresLauncher: launcherId }),
                                          }).catch(() => {});
                                        }
                                        dismissNotification(notif.id);
                                        return;
                                      }
                                      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, status: 'applied' } : n));
                                    }}
                                  >
                                    {(isFocused) => (
                                      <button className={cn(
                                        "flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-white text-center transition-all",
                                        isFocused ? "bg-blue-500 scale-[1.03]" : "bg-blue-600"
                                      )}>{primaryAction.label}</button>
                                    )}
                                  </Focusable>
                                ); })()}
                                <Focusable group="notifications" id={`notif-secondary-${notif.id}`} onEnter={() => dismissNotification(notif.id)}>
                                  {(isFocused) => (
                                    <button className={cn(
                                      "flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-center transition-all",
                                      isFocused ? "bg-white/25" : "bg-white/10"
                                    )}>{notif.secondaryAction?.label ?? t('notifications:close')}</button>
                                  )}
                                </Focusable>
                                {notif.tertiaryAction && (
                                  <Focusable group="notifications" id={`notif-tertiary-${notif.id}`} onEnter={() => dismissNotification(notif.id)}>
                                    {(isFocused) => (
                                      <button className={cn(
                                        "flex-1 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest text-center transition-all",
                                        isFocused ? "bg-white/25" : "bg-white/10"
                                      )}>{notif.tertiaryAction!.label}</button>
                                    )}
                                  </Focusable>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Menu Overlay */}
        <AnimatePresence>
          {viewState === 'quick-menu' && (
            <motion.div
              initial={{ x: -400 }}
              animate={{ x: 0 }}
              exit={{ x: -400 }}
              className={cn(
                "absolute top-0 left-0 bottom-0 w-96 z-50 p-12 flex flex-col shadow-2xl border-r",
                theme === 'dark' ? "bg-[#0b0c0f] border-white/10" : "bg-white border-gray-200"
              )}
            >
              <div className="flex items-center justify-between gap-4 mb-16">
                 {/* Step 19b (v1.1.45) — flex-1 min-w-0 sul gruppo icona+
                     titolo, shrink-0 sul pulsante di chiusura: senza,
                     un titolo tradotto più lungo dell'italiano ("Settings"
                     è più corto di "Impostazioni", ma altre lingue future
                     potrebbero non esserlo) si sovrapponeva al pulsante
                     rosso invece di andare a capo. Segnalato dall'utente
                     in test — stesso principio applicato di seguito agli
                     header di Downloads e Notifiche, stesso bug identico
                     in tutti e tre. */}
                 {/* Step 19b (v1.1.46) — badge icona e titolo erano già,
                     nel codice originale, più grandi di quelli di
                     Downloads/Notifiche (text-3xl + w-10 h-10 qui, contro
                     text-2xl + w-8 h-8 negli altri due) — una discrepanza
                     preesistente, mascherata finché "IMPOSTAZIONI" si
                     sovrapponeva alla X (v1.1.45 l'ha resa visibile, non
                     creata). Segnalato dall'utente in test: sembrava "più
                     grande di prima" — in realtà è la stessa dimensione
                     di sempre, solo non più nascosta dalla sovrapposizione.
                     Allineato qui alla stessa scala degli altri due
                     overlay invece di introdurre un meccanismo di
                     ridimensionamento percentuale nuovo — tre pannelli
                     identici nella struttura meritano la stessa scala,
                     non tre scale diverse "giustificate" a parole. */}
                 <div className="flex items-center gap-3 flex-1 min-w-0">
                   <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
                     <Settings size={16} className="text-white" />
                   </div>
                   <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('quickMenu:title')}</h2>
                 </div>
                 <Focusable group="quick-menu" id="quick-menu-close" fallbackPriority={-1} onEnter={() => { setViewState('library'); setActiveGroup(null); }}>
                   {(isFocused) => (
                     <div className={cn(
                       "w-8 h-8 rounded-full border flex items-center justify-center transition-all shrink-0",
                       isFocused && "scale-110 bg-red-600 border-red-600 text-white"
                     )}>
                       <X size={16} />
                     </div>
                   )}
                 </Focusable>
              </div>

              <div className="space-y-4">
                <OptionItem group="quick-menu" id="opt-accounts" icon={Gamepad2} label={t('quickMenu:manageAccounts')} onClick={() => { setShowSettings(true); setActiveGroup('settings'); setActiveSettingsTab('accounts'); setFocusedId(null); setTimeout(() => setFocusedId('settings-tab-accounts'), 80); }} />
                <OptionItem group="quick-menu" id="opt-avatar" icon={User} label={t('quickMenu:avatar')} onClick={() => { setShowAvatarLibrary(true); setActiveGroup('avatar-library'); setTimeout(() => setFocusedId('avatar-0'), 80); }} />
                <OptionItem group="quick-menu" id="opt-process-manager" icon={Cpu} label={t('quickMenu:processManager')} onClick={() => { setShowProcessManager(true); setActiveGroup('process-manager'); setTimeout(() => setFocusedId('pm-close'), 80); }} />
                <OptionItem group="quick-menu" id="opt-gamescope" icon={LayoutGrid} label={t('quickMenu:gamescopeMode')} value={isGamescope ? t('quickMenu:on') : t('quickMenu:off')} onClick={() => { setIsGamescope(!isGamescope); play('select'); }} />
                <OptionItem group="quick-menu" id="opt-theme" icon={theme === 'dark' ? Sun : Moon} label={t('quickMenu:toggleTheme')} value={theme} onClick={toggleTheme} />
                {dedicatedSession ? (
                  <OptionItem group="quick-menu" id="opt-fs" icon={Maximize2} label={t('quickMenu:consoleMode')} value={t('quickMenu:backToDesktop')} onClick={switchToDesktop} />
                ) : (
                  <OptionItem group="quick-menu" id="opt-fs" icon={Maximize2} label={t('quickMenu:displayMode')} value={displayMode === 'window' ? t('quickMenu:windowed') : displayMode === 'borderless' ? t('quickMenu:borderlessMode') : t('quickMenu:kioskMode')} onClick={cycleDisplayMode} />
                )}
                <OptionItem
                  group="quick-menu"
                  id="opt-exit"
                  icon={Power}
                  label={t('quickMenu:exit')}
                  value={pendingExit ? t('quickMenu:confirmA') : ""}
                  pending={pendingExit}
                  onClick={() => {
                    if (pendingExit) {
                      setPendingExit(false);
                      handleExit();
                    } else {
                      setPendingExit(true);
                    }
                  }}
                />
                {/* Audio UI, Input Profile, System Runner — non ancora implementati, nascosti */}
              </div>

              <div className="mt-auto opacity-30 italic text-[10px] font-bold tracking-[0.4em] uppercase">
                 X-Launcher Core {appVersion}
              </div>
              {/* v2.2.17-dev.3 — spostato qui sotto il numero di versione su
                  richiesta dell'utente (prima badge fisso in basso a destra,
                  slegato dal resto del menu). Stesso scopo: sapere da dove
                  si sta leggendo senza dover guardare il terminale. */}
              {isLocalDevServer && (
                <div className="text-center text-[9px] font-black uppercase tracking-widest text-red-500">
                  Server locale · :{window.location.port || '80'}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Settings Overlay */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={cn("absolute inset-0 z-[100] backdrop-blur-3xl flex items-center justify-center p-20", theme === 'dark' ? "bg-black/95" : "bg-white/80")}
          >
            <div className={cn(
              // v1.1.7 — stesso bug strutturale già risolto in v1.1.5
              // per l'overlay Game Options: vh fa riferimento al viewport
              // REALE del browser, non al canvas virtuale 1920×1080 di
              // ScalingContainer.tsx. Qui era persino più severo — h-[80vh]
              // è un'altezza FISSA (non un tetto massimo): a 2560×1440
              // forzava 1152px reali dentro un contenitore di soli 1080px
              // di layout, eccedendo sempre, indipendentemente dal
              // contenuto della tab attiva. Percentuale invece di vh: si
              // risolve contro il contenitore reale, corretto a qualunque
              // risoluzione.
              "w-full max-w-5xl rounded-3xl overflow-hidden flex flex-col shadow-2xl h-[80%]",
              theme === 'dark' ? "bg-[#12141a] border border-white/10" : "bg-white border border-gray-200"
            )}>
              <div className={cn("p-10 border-b flex justify-between items-center", theme === 'dark' ? "border-white/5" : "border-gray-200")}>
                <div className="flex items-center gap-6">
                  <div className={cn("flex p-1 rounded-2xl", theme === 'dark' ? "bg-white/5" : "bg-gray-100")}>
                    <Focusable group="settings-tabs" id="settings-tab-accounts" onEnter={() => {
                      setActiveSettingsTab('accounts');
                      const target = getFirstFocusableForSettingsTabRef.current('accounts');
                      setTimeout(() => setFocusedId(target ?? 'settings-tab-accounts'), 50);
                    }}>
                      {(isFocused) => (
                        <button className={cn(
                          "px-8 py-3 rounded-xl text-xs font-black uppercase italic tracking-widest transition-all",
                          activeSettingsTab === 'accounts' ? "bg-blue-600 text-white shadow-lg" : isFocused ? "opacity-100 bg-white/10" : "opacity-40 hover:opacity-100"
                        )}>{t('tabs.accounts')}</button>
                      )}
                    </Focusable>
                    <Focusable group="settings-tabs" id="settings-tab-engine" onEnter={() => {
                      setActiveSettingsTab('engine');
                      const target = getFirstFocusableForSettingsTabRef.current('engine');
                      setTimeout(() => setFocusedId(target ?? 'settings-tab-engine'), 50);
                    }}>
                      {(isFocused) => (
                        <button className={cn(
                          "px-8 py-3 rounded-xl text-xs font-black uppercase italic tracking-widest transition-all",
                          activeSettingsTab === 'engine' ? "bg-blue-600 text-white shadow-lg" : isFocused ? "opacity-100 bg-white/10" : "opacity-40 hover:opacity-100"
                        )}>{t('tabs.system')}</button>
                      )}
                    </Focusable>
                    <Focusable group="settings-tabs" id="settings-tab-plugins" onEnter={() => {
                      setActiveSettingsTab('plugins');
                      const target = getFirstFocusableForSettingsTabRef.current('plugins');
                      setTimeout(() => setFocusedId(target ?? 'settings-tab-plugins'), 50);
                    }}>
                      {(isFocused) => (
                        <button className={cn(
                          "px-8 py-3 rounded-xl text-xs font-black uppercase italic tracking-widest transition-all",
                          activeSettingsTab === 'plugins' ? "bg-blue-600 text-white shadow-lg" : isFocused ? "opacity-100 bg-white/10" : "opacity-40 hover:opacity-100"
                        )}>{t('tabs.plugins')}</button>
                      )}
                    </Focusable>
                    <Focusable group="settings-tabs" id="settings-tab-input" onEnter={() => {
                      setActiveSettingsTab('input');
                      const target = getFirstFocusableForSettingsTabRef.current('input');
                      setTimeout(() => setFocusedId(target ?? 'settings-tab-input'), 50);
                    }}>
                      {(isFocused) => (
                        <button className={cn(
                          "px-8 py-3 rounded-xl text-xs font-black uppercase italic tracking-widest transition-all",
                          activeSettingsTab === 'input' ? "bg-blue-600 text-white shadow-lg" : isFocused ? "opacity-100 bg-white/10" : "opacity-40 hover:opacity-100"
                        )}>{t('tabs.input')}</button>
                      )}
                    </Focusable>
                    {/* v0.99.90 — Step 15d: tab visibile solo se Ollama è
                        raggiungibile (verificato al boot e ad ogni apertura
                        di Impostazioni) — "per non appesantire la
                        navigazione di elementi inutili" quando Ollama non
                        è nemmeno installato/in esecuzione. */}
                    {ollamaAvailable && (
                      <Focusable group="settings-tabs" id="settings-tab-ai-models" onEnter={() => {
                        setActiveSettingsTab('ai-models');
                        const target = getFirstFocusableForSettingsTabRef.current('ai-models');
                        setTimeout(() => setFocusedId(target ?? 'settings-tab-ai-models'), 50);
                      }}>
                        {(isFocused) => (
                          <button className={cn(
                            "px-8 py-3 rounded-xl text-xs font-black uppercase italic tracking-widest transition-all",
                            activeSettingsTab === 'ai-models' ? "bg-blue-600 text-white shadow-lg" : isFocused ? "opacity-100 bg-white/10" : "opacity-40 hover:opacity-100"
                          )}>{t('tabs.aiAdvisor')}</button>
                        )}
                      </Focusable>
                    )}
                    {/* Richiesta utente — tab Info Hardware: deve restare
                        SEMPRE per ultima, indipendentemente da altre tab
                        che potrebbero essere aggiunte in futuro. Per
                        questo vive qui, come ultimo elemento fisico di
                        questo blocco — qualunque nuova tab futura va
                        inserita PRIMA di questa, mai dopo. */}
                    <Focusable group="settings-tabs" id="settings-tab-hardware" onEnter={() => {
                      setActiveSettingsTab('hardware');
                      const target = getFirstFocusableForSettingsTabRef.current('hardware');
                      setTimeout(() => setFocusedId(target ?? 'settings-tab-hardware'), 50);
                    }}>
                      {(isFocused) => (
                        <button className={cn(
                          "px-8 py-3 rounded-xl text-xs font-black uppercase italic tracking-widest transition-all",
                          activeSettingsTab === 'hardware' ? "bg-blue-600 text-white shadow-lg" : isFocused ? "opacity-100 bg-white/10" : "opacity-40 hover:opacity-100"
                        )}>{t('tabs.hardware')}</button>
                      )}
                    </Focusable>
                  </div>
                </div>
                {(() => {
                  // v1.1.8 — stesso bug già risolto in v1.1.3 per l'overlay
                  // Game Options: il pulsante di chiusura (condiviso da
                  // tutte le tab di questo modal) non aveva mai un
                  // neighbors.down esplicito. Qui serve dipendente dalla
                  // tab attiva, non un id fisso. Calcolato solo per le tab
                  // di cui il primo elemento è determinabile con certezza
                  // senza dipendere da stato per-riga (es. connessione
                  // store) — 'accounts' resta non coperta, invariata.
                  let firstTabContentId: string | undefined;
                  if (activeSettingsTab === 'engine') {
                    // Step 19b (v1.1.38) — il selettore di lingua è ora il
                    // primo elemento reale della tab (vedi sotto), prima di
                    // "Runner installati": aggiornato di conseguenza,
                    // altrimenti il pulsante di chiusura punterebbe sempre
                    // a un elemento più in basso, saltando il nuovo primo.
                    firstTabContentId = 'settings-language-toggle';
                  } else if (activeSettingsTab === 'plugins') {
                    firstTabContentId = pluginRegistry.length > 0 ? `plugin-toggle-${pluginRegistry[0].id}` : undefined;
                  } else if (activeSettingsTab === 'input') {
                    firstTabContentId = inputPlugins.length > 0 ? `input-plugin-toggle-${inputPlugins[0].id}` : undefined;
                  } else if (activeSettingsTab === 'ai-models') {
                    // v1.1.108-dev.1 — il vecchio widget budget aggregato
                    // (primo elemento di questa tab) non esiste più: ora
                    // il primo elemento reale è il primo modello Ollama
                    // installato, o — se non ce n'è nessuno — il toggle
                    // del primo provider cloud.
                    firstTabContentId = ollamaModels.length > 0
                      ? `ollama-model-select-${ollamaModels[0].name}`
                      : `cloud-provider-toggle-${CLOUD_PROVIDERS[0].id}`;
                  }
                  return (
                <Focusable
                  group="settings"
                  id="close-settings"
                  fallbackPriority={-1}
                  neighbors={{ down: firstTabContentId }}
                  onEnter={() => { setShowSettings(false); setActiveGroup('quick-menu'); setFocusedId('opt-accounts'); }}
                >
                  {(isFocused) => (
                    <button className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center transition-all",
                      isFocused ? "bg-red-600 text-white scale-110" : theme === 'dark' ? "bg-white/5" : "bg-gray-100"
                    )}>
                      <X size={24} />
                    </button>
                  )}
                </Focusable>
                  );
                })()}
              </div>

              {/* v1.1.7 — min-h-0 necessario: senza, un figlio flex con
                  overflow-y-auto non si comprime mai sotto l'altezza del
                  proprio contenuto (stesso fix di v1.1.4). */}
              <div ref={settingsBodyRef} className="flex-1 min-h-0 overflow-y-auto p-12 custom-scrollbar">
                {activeSettingsTab === 'accounts' ? (
                  /* ── Store Accounts tab ── */
                  /* v1.1.122-dev.1 — Fragment necessario: da qui in poi
                     questo ramo contiene DUE elementi fratelli (griglia
                     store + sezione Cloud Backup sotto), non più uno solo. */
                  <>
                  <div className="grid grid-cols-2 gap-8">
                    {stores.filter(s => {
                      const ps = pluginStateMap.get(s.id);
                      return !ps || ps.enabled;
                    }).map((store, idx, arr) => {
                      const isWaiting = authPolling === store.id;
                      const msg       = authMessage[store.id];
                      const url       = authUrl[store.id];
                      const noLogin   = ['Battle.net', 'Classic Console', 'Ubisoft', 'EA App'].includes(store.id);
                      // Steam ha login (rileva il client locale) ma nessun
                      // vero concetto di logout — non è un account OAuth.
                      // Il backend già risponde success:false di default per
                      // i plugin che non sovrascrivono logout(), questo è
                      // solo per evitare di mostrare un controllo che
                      // fallirebbe sempre.
                      const noLogout  = store.id === 'Steam';
                      const isRowFocused = focusedId === `store-connect-${store.id}` || focusedId === `store-cancel-${store.id}` || focusedId === `store-unlink-${store.id}`;
                      // v1.1.123-dev.1 — bug reale segnalato dall'utente:
                      // la sezione Cloud Backup sotto la griglia store era
                      // raggiungibile scendendo solo da alcune card, in
                      // modo incoerente (dipendeva da cosa fosse già
                      // visibile a schermo) — lo scoring geometrico da
                      // solo non basta quando la card sottostante richiede
                      // scroll, o quando (griglia a 2 colonne) una card non
                      // ha nulla direttamente sotto di sé nella propria
                      // colonna (es. l'ultima riga con un solo elemento).
                      // Stesso principio già usato altrove in questo
                      // progetto: qualunque card per cui non esiste un
                      // elemento nella stessa colonna alla riga successiva
                      // (idx+2 oltre la fine dell'elenco) collega
                      // esplicitamente al primo elemento di Cloud Backup.
                      //
                      // v1.1.125-dev.1 — bug reale segnalato dall'utente,
                      // causa verificata nell'ordine reale dei plugin
                      // (gameManager.ts: GOG, Steam, Epic, Amazon,
                      // Battle.net, Classic Console — 6 store, non 3 come
                      // supposto scrivendo il fix precedente): Battle.net
                      // e Classic Console sono "noLogin" e renderizzano un
                      // div statico, MAI un Focusable — una card sopra di
                      // loro nella stessa colonna (es. Epic sopra
                      // Battle.net, Amazon sopra Classic Console) non ha
                      // quindi nulla di realmente navigabile sotto,
                      // nonostante idx+2 sia ancora dentro l'array. Il
                      // controllo precedente considerava solo l'esistenza
                      // dell'elemento nell'array, non la sua navigabilità
                      // reale — per questo Epic (con Battle.net sotto)
                      // veniva lasciato allo scoring, che senza un
                      // candidato reale nella propria colonna finiva su
                      // Client ID invece che sullo switch (più a sinistra
                      // nella card, più vicino geometricamente a Epic che
                      // sta più a sinistra della griglia store — mentre da
                      // Amazon, più a destra, lo scoring trovava lo switch
                      // per puro allineamento orizzontale, da cui il
                      // percorso "funzionante" scoperto dall'utente).
                      // v2.0.41-dev.11 — EA App aggiunto agli store
                      // "noLogin" (Fase B, stesso trattamento di Ubisoft
                      // Connect sopra): stesso identico ragionamento,
                      // renderizza anch'esso un div statico non
                      // Focusable, va incluso qui per la stessa ragione.
                      const NO_LOGIN_GRID_STORES = ['Battle.net', 'Classic Console', 'Ubisoft', 'EA App'];
                      const belowStore = arr[idx + 2];
                      const noElementBelowInGrid = !belowStore || NO_LOGIN_GRID_STORES.includes(belowStore.id);
                      const storeDownNeighbor = noElementBelowInGrid ? 'cloud-backup-toggle-google-drive' : undefined;
                      // Conteggi reali derivati da allGamesForAccountCounts
                      // (sempre non filtrato — vedi v1.1.20), distinti da
                      // gameCount (backend, logica composita store+plugin):
                      // synced = tutti i titoli noti per questo store,
                      // installed = quanti di quelli sono effettivamente
                      // presenti su disco.
                      const storeGames    = allGamesForAccountCounts.filter(g => g.store === store.id);
                      const syncedCount   = storeGames.length;
                      const installedCount = storeGames.filter(g => g.isInstalled).length;
                      return (
                        <div key={store.id} className={cn(
                          "p-8 rounded-3xl border flex flex-col transition-all",
                          isRowFocused
                            ? "ring-2 ring-blue-400 border-blue-400 scale-[1.005]"
                            : store.isConnected
                              ? "bg-green-500/5 border-green-500/20"
                              : isWaiting
                                ? "bg-blue-500/5 border-blue-500/30"
                                : theme === 'dark'
                                  ? "bg-white/5 border-white/5 hover:bg-white/[0.07]"
                                  : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                        )}>
                          {/* Header */}
                          <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-4">
                              <div className={cn(
                                // v1.5.20-dev.5 — bug reale segnalato dall'utente: l'icona si
                                // deformava (perdeva la forma quadrata) quando lo store
                                // risultava sincronizzato. Causa: nessun `shrink-0` su questo
                                // contenitore — la label accanto ("Sessione attiva (N
                                // sincronizzati, M installati)") è molto più lunga di
                                // "Disconnesso", e senza `shrink-0` il flex item con
                                // flex-shrink di default (1) si restringe in LARGHEZZA
                                // quando lo spazio del contenitore flex si riduce, mentre
                                // l'altezza (governata da h-12, non da flex-shrink sull'asse
                                // riga) resta fissa — risultato: un rettangolo schiacciato
                                // invece del quadrato voluto. shrink-0 blocca qualunque
                                // restringimento, indipendentemente da quanto sia lunga la
                                // label del fratello.
                                "w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center shadow-2xl",
                                store.isConnected ? "bg-green-600 shadow-green-500/20"
                                  : isWaiting    ? "bg-blue-600 shadow-blue-500/20"
                                  : theme === 'dark' ? "bg-white/10" : "bg-gray-200"
                              )}>
                                <Gamepad2 size={20} className="shrink-0" />
                              </div>
                              <div>
                                <h4 className="text-lg font-black italic uppercase tracking-tighter">{translateStorePluginName(store.id, store.name)}</h4>
                                <span className={cn(
                                  "text-[10px] font-black uppercase tracking-widest italic",
                                  store.isConnected ? "text-green-400"
                                    : isWaiting    ? "text-blue-400"
                                    : "text-red-400"
                                )}>
                                  {store.isConnected ? t('accounts.sessionActive', { synced: syncedCount, installed: installedCount })
                                    : isWaiting    ? t('accounts.waitingBrowser')
                                    : t('accounts.disconnected')}
                                </span>
                              </div>
                            </div>
                            {store.isConnected && (
                              <div className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full text-[9px] font-black text-green-400 uppercase tracking-widest italic">
                                {t('accounts.synced')}
                              </div>
                            )}
                          </div>

                          {/* Spinner polling */}
                          {isWaiting && (
                            <div className="flex items-center gap-3 mb-4 px-3 py-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                              <span className="text-[10px] text-blue-300 font-mono">{t('accounts.waitingTerminal')}</span>
                            </div>
                          )}

                          {/* Messaggio stato */}
                          {msg && (
                            <p className={cn(
                              "text-[10px] mb-4 font-mono leading-relaxed px-1",
                              msg.startsWith('✅') ? "text-green-400"
                                : msg.startsWith('❌') || msg.startsWith('⏱') ? "text-red-400"
                                : "text-white/60"
                            )}>
                              {msg}
                            </p>
                          )}

                          {/* Action button */}
                          <div className="mt-auto">
                            {noLogin ? (
                              <div className={cn("w-full py-3 rounded-xl text-xs font-black uppercase italic tracking-[0.2em] text-center opacity-40 cursor-default", theme === 'dark' ? "bg-white/5" : "bg-gray-100")}>
                                {t('accounts.noLoginRequired')}
                              </div>
                            ) : store.isConnected ? (
                              noLogout ? (
                                <div className="w-full py-3 rounded-xl text-xs font-black uppercase italic tracking-[0.2em] text-center bg-green-500/10 text-green-400 border border-green-500/20">
                                  {t('accounts.linkedAccount')}
                                </div>
                              ) : (
                                <Focusable
                                  group="settings"
                                  id={`store-unlink-${store.id}`}
                                  neighbors={{ down: storeDownNeighbor }}
                                  onEnter={() => {
                                    if (pendingUnlink === store.id) {
                                      // Seconda pressione: esegue la disconnessione
                                      setPendingUnlink(null);
                                      handleLogout(store.id);
                                    } else {
                                      // Prima pressione: passa allo stato di conferma
                                      setPendingUnlink(store.id);
                                      play('select');
                                    }
                                  }}
                                >
                                  {(isFocused) => (
                                    <button className={cn(
                                      "w-full py-3 rounded-xl text-xs font-black uppercase italic tracking-[0.2em] transition-all border",
                                      pendingUnlink === store.id
                                        ? "bg-red-600 text-white border-red-600 animate-pulse"
                                        : isFocused
                                          ? "bg-green-500/20 text-green-300 border-green-400"
                                          : "bg-green-500/10 text-green-400 border-green-500/20"
                                    )}>
                                      {pendingUnlink === store.id ? t('accounts.confirmDisconnect') : t('accounts.linkedAccount')}
                                    </button>
                                  )}
                                </Focusable>
                              )
                            ) : isWaiting ? (
                              <Focusable group="settings" id={`store-cancel-${store.id}`} neighbors={{ down: storeDownNeighbor }} onEnter={() => { setAuthPolling(null); setAuthMessage(prev => ({ ...prev, [store.id]: '' })); }}>
                                {(isFocused) => (
                                  <button className={cn("w-full py-3 rounded-xl text-xs font-black uppercase italic tracking-[0.2em] transition-all",
                                    isFocused ? "bg-red-600 text-white" : theme === 'dark' ? "bg-white/5" : "bg-gray-100 text-gray-800"
                                  )}>{t('accounts.cancel')}</button>
                                )}
                              </Focusable>
                            ) : (
                              <Focusable group="settings" id={`store-connect-${store.id}`} neighbors={{ down: storeDownNeighbor }} onEnter={() => handleLogin(store.id)}>
                                {(isFocused) => (
                                  <button className={cn("w-full py-3 rounded-xl text-xs font-black uppercase italic tracking-[0.2em] transition-all",
                                    isFocused ? "bg-blue-600 text-white" : theme === 'dark' ? "bg-white/10" : "bg-gray-100 text-gray-800"
                                  )}>{t('accounts.connectStore')}</button>
                                )}
                              </Focusable>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* v1.1.122-dev.1 — Cloud Backup, integrato nella tab
                      Account su decisione esplicita dell'utente (invece
                      di una tab dedicata — evita il problema di spazio
                      nella barra tab in alto). Un solo provider attivo
                      alla volta come per l'AI Advisor. */}
                  <div className="mt-10">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 mb-4">{t('accounts.cloudBackup')}</h3>
                    <div className="grid grid-cols-2 gap-8">
                      {Object.entries(cloudBackupProviders).map(([id, p]) => {
                        const toggleId = `cloud-backup-toggle-${id}`;
                        return (
                          <div key={id} className={cn(
                            "rounded-xl p-4 transition-all",
                            p.enabled ? "ring-1 ring-purple-400/50" : "",
                            theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200"
                          )}>
                            <div className="flex items-center gap-3 mb-1">
                              <Cloud size={14} className="text-purple-400 shrink-0" />
                              <span className="text-xs font-black uppercase tracking-tighter flex-1">{p.name}</span>
                              <Focusable
                                group="settings"
                                id={toggleId}
                                neighbors={{ down: p.enabled ? `cloud-backup-clientid-${id}` : undefined }}
                                onEnter={() => {
                                  const nextEnabled = !p.enabled;
                                  setCloudBackupProviders(prev => ({ ...prev, [id]: { ...p, enabled: nextEnabled } }));
                                  saveCloudBackupProvider(id, { enabled: nextEnabled });
                                  play('select');
                                }}
                              >
                                {(isFocused) => (
                                  <button className={cn(
                                    "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border min-w-[70px] text-center transition-all shrink-0",
                                    // v1.1.125-dev.1 — bug reale segnalato
                                    // dall'utente: quando enabled=true non
                                    // c'era MAI un indicatore di focus
                                    // visibile (il ramo isFocused non
                                    // veniva nemmeno controllato in quel
                                    // caso) — ambiguo, sembrava che la
                                    // selezione col controller "saltasse"
                                    // il pulsante. Ora un anello distinto
                                    // in entrambi gli stati.
                                    p.enabled
                                      ? isFocused
                                        ? "bg-purple-600 border-purple-300 text-white ring-2 ring-purple-300 ring-offset-1 ring-offset-transparent"
                                        : "bg-purple-600 border-purple-600 text-white"
                                      : isFocused
                                        ? "bg-purple-500/20 border-purple-400 text-purple-300"
                                        : "bg-white/5 border-white/10 opacity-60"
                                  )}>
                                    {p.enabled ? t('aiAdvisor.active') : t('aiAdvisor.inactive')}
                                  </button>
                                )}
                              </Focusable>
                            </div>
                            <p className={cn("text-[9px] font-mono leading-relaxed mb-3", theme === 'dark' ? "text-white/30" : "text-gray-500")}>{translateCloudBackupDescription(id, p.description)}</p>

                            {p.enabled && (
                              <div className="space-y-2 mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40 shrink-0 w-20">Client ID</span>
                                  <Focusable
                                    group="settings"
                                    id={`cloud-backup-clientid-${id}`}
                                    neighbors={{ up: toggleId, down: `cloud-backup-secret-${id}` }}
                                    onEnter={() => openKeyboardForField(
                                      `cloud-backup-clientid-${id}`,
                                      `${p.name} — Client ID`,
                                      p.clientIdDraft,
                                      (val) => {
                                        setCloudBackupProviders(prev => ({ ...prev, [id]: { ...prev[id], clientIdDraft: val } }));
                                        saveCloudBackupProvider(id, { clientId: val });
                                      },
                                      'settings'
                                    )}
                                  >
                                    {(isFocused) => (
                                      <input
                                        type="text"
                                        readOnly
                                        value={p.clientIdDraft || (p.hasCredentials ? '••••••••' : '')}
                                        placeholder={t('accounts.notConfigured')}
                                        className={cn(
                                          "flex-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none transition-colors cursor-pointer",
                                          theme === 'dark' ? "bg-black/40" : "bg-white",
                                          isFocused ? "border-2 border-purple-500" : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                                        )}
                                      />
                                    )}
                                  </Focusable>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40 shrink-0 w-20">Client Secret</span>
                                  <Focusable
                                    group="settings"
                                    id={`cloud-backup-secret-${id}`}
                                    sequentialChain={`cloud-backup-row-${id}`}
                                    chainAxis="horizontal"
                                    // v1.1.125-dev.1 — completa la catena
                                    // verticale esplicita del widget:
                                    // senza questo, scendere da qui
                                    // ricadeva sullo scoring geometrico,
                                    // esattamente la stessa categoria di
                                    // bug segnalata per l'ingresso dalla
                                    // griglia store sopra. Il target
                                    // dipende da quale blocco è
                                    // effettivamente renderizzato sotto
                                    // (Connetti se non ancora autenticato,
                                    // Backup/Ripristina se già connesso).
                                    neighbors={{ down: !p.hasCredentials ? undefined : (p.authenticated ? `cloud-backup-run-${id}` : `cloud-backup-connect-${id}`) }}
                                    onEnter={() => openKeyboardForField(
                                      `cloud-backup-secret-${id}`,
                                      `${p.name} — Client Secret`,
                                      '',
                                      (val) => {
                                        setCloudBackupProviders(prev => ({ ...prev, [id]: { ...prev[id], clientSecretDraft: val } }));
                                        saveCloudBackupProvider(id, { clientSecret: val });
                                      },
                                      'settings'
                                    )}
                                  >
                                    {(isFocused) => (
                                      <input
                                        type="text"
                                        readOnly
                                        value={p.clientSecretDraft ? '••••••••' : (p.hasCredentials ? '••••••••' : '')}
                                        placeholder={t('accounts.notConfigured')}
                                        className={cn(
                                          "flex-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none transition-colors cursor-pointer",
                                          theme === 'dark' ? "bg-black/40" : "bg-white",
                                          isFocused ? "border-2 border-purple-500" : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                                        )}
                                      />
                                    )}
                                  </Focusable>
                                </div>
                              </div>
                            )}

                            {p.enabled && p.hasCredentials && !p.authenticated && (
                              <Focusable group="settings" id={`cloud-backup-connect-${id}`} neighbors={{ up: `cloud-backup-secret-${id}` }} onEnter={() => connectCloudBackupProvider(id)}>
                                {(isFocused) => (
                                  <button className={cn(
                                    "w-full py-2.5 rounded-xl text-[10px] font-black uppercase italic tracking-[0.2em] transition-all",
                                    isFocused ? "bg-purple-600 text-white" : theme === 'dark' ? "bg-white/10" : "bg-gray-100 text-gray-800"
                                  )}>
                                    {p.connecting ? t('accounts.waitingBrowser') : t('accounts.connectStore')}
                                  </button>
                                )}
                              </Focusable>
                            )}

                            {p.authenticated && (
                              <div className="space-y-2">
                                <p className={cn("text-[9px] font-mono", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                                  {p.lastBackupAt
                                    ? t('accounts.lastBackup', { date: new Date(p.lastBackupAt).toLocaleString(i18n.language) })
                                    : t('accounts.noBackupYet')}
                                </p>
                                <div className="flex gap-2">
                                  <Focusable
                                    group="settings"
                                    id={`cloud-backup-run-${id}`}
                                    neighbors={{ up: `cloud-backup-secret-${id}`, down: `cloud-backup-disconnect-${id}` }}
                                    sequentialChain={`cloud-backup-actions-${id}`}
                                    chainAxis="horizontal"
                                    onEnter={() => runCloudBackupAction(id, 'backup')}
                                  >
                                    {(isFocused) => (
                                      <button className={cn(
                                        "flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase italic tracking-[0.2em] text-center transition-all",
                                        isFocused ? "bg-purple-600 text-white" : theme === 'dark' ? "bg-white/10" : "bg-gray-100 text-gray-800"
                                      )}>
                                        {p.actionRunning === 'backup' ? t('accounts.backupRunning') : t('accounts.backupNow')}
                                      </button>
                                    )}
                                  </Focusable>
                                  <Focusable
                                    group="settings"
                                    id={`cloud-backup-restore-${id}`}
                                    neighbors={{ up: `cloud-backup-secret-${id}`, down: `cloud-backup-disconnect-${id}` }}
                                    sequentialChain={`cloud-backup-actions-${id}`}
                                    chainAxis="horizontal"
                                    onEnter={() => runCloudBackupAction(id, 'restore')}
                                  >
                                    {(isFocused) => (
                                      <button className={cn(
                                        "flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase italic tracking-[0.2em] text-center transition-all",
                                        isFocused ? "bg-orange-600 text-white" : theme === 'dark' ? "bg-white/10" : "bg-gray-100 text-gray-800"
                                      )}>
                                        {p.actionRunning === 'restore' ? t('accounts.restoreRunning') : t('accounts.restoreNow')}
                                      </button>
                                    )}
                                  </Focusable>
                                </div>
                                <Focusable group="settings" id={`cloud-backup-disconnect-${id}`} neighbors={{ up: `cloud-backup-run-${id}` }} onEnter={() => disconnectCloudBackupProvider(id)}>
                                  {(isFocused) => (
                                    <button className={cn(
                                      "w-full py-2 rounded-xl text-[9px] font-black uppercase italic tracking-[0.2em] transition-all",
                                      isFocused ? "bg-red-600/20 text-red-400" : "opacity-40"
                                    )}>
                                      {t('accounts.disconnect')}
                                    </button>
                                  )}
                                </Focusable>
                              </div>
                            )}

                            {p.actionStatus && (
                              <p className={cn("text-[9px] font-mono mt-2", p.actionStatus.success ? "text-green-400" : "text-red-400")}>
                                {p.actionStatus.success ? '✓ ' : '✗ '}{p.actionStatus.message}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  </>
                ) : activeSettingsTab === 'engine' ? (
                  /* ── System tab ── */
                  (() => {
                    // v1.1.7 — calcolato una sola volta qui, riusato sia
                    // dalla lista Runner installabili (confine di uscita)
                    // sia da Tool di sistema (confine di ingresso in
                    // risalita) — prima duplicato, e la copia usata per
                    // "up" da Tool di sistema semplicemente non esisteva,
                    // causando lo stesso bug asimmetrico visto sopra ma
                    // sul lato opposto (risalita invece di discesa).
                    let lastInstallableFocusableIdx = -1;
                    installableRunners.forEach((r: any, i: number) => {
                      const alreadyInst = r.installed || availableRunners.some((a: any) => a.id === r.id);
                      if (!alreadyInst) lastInstallableFocusableIdx = i;
                    });
                    const lastInstallableFocusableId = lastInstallableFocusableIdx !== -1
                      ? `runner-install-${installableRunners[lastInstallableFocusableIdx].id}`
                      : undefined;
                    // Fallback se nessun runner installabile ha un vero
                    // Focusable (lista vuota o tutti già installati):
                    // risale invece all'ultima riga di Runner installati.
                    const systemToolsUpNeighbor = lastInstallableFocusableId
                      ?? (availableRunners.length > 0 ? `runner-uninstall-${availableRunners[availableRunners.length - 1].id}` : undefined);

                    // Step 19b (v1.1.38) — stesso id già usato calcolando
                    // firstTabContentId per il pulsante di chiusura più
                    // sopra: il selettore di lingua, non più la lista
                    // runner, è ora il vero primo elemento della tab, quindi
                    // scende verso quello che PRIMA era il primo elemento.
                    const firstRunnerContentId = availableRunners.length > 0
                      ? `runner-uninstall-${(availableRunners[0] as any).id || availableRunners[0]}`
                      : 'runners-refresh';

                    return (
                  <div className="space-y-10">

                    {/* Selettore lingua (Step 19b, v1.1.38) — UN SOLO
                        Focusable, non uno per lingua: su/giù lo raggiunge
                        come qualunque altra riga, sinistra/destra ne
                        cambia il valore mentre è focalizzato (intercettati
                        nell'effetto gamepad principale, stesso schema già
                        usato per L1/R1 sul cambio tab — vedi
                        cycleUiLanguage). Due Focusable separati (versione
                        precedente) competevano con la normale navigazione
                        su/giù del resto della tab, raggiungibili solo per
                        caso muovendo lo stick. */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 mb-4">{t('language.label')}</h3>
                      <Focusable
                        group="settings"
                        id="settings-language-toggle"
                        neighbors={{ down: firstRunnerContentId }}
                        onEnter={() => cycleUiLanguage()}
                      >
                        {(isFocused) => (
                          <div className={cn(
                            "flex p-1 rounded-2xl w-fit transition-all",
                            isFocused ? "ring-2 ring-blue-400" : "",
                            theme === 'dark' ? "bg-white/5" : "bg-gray-100"
                          )}>
                            {(['it', 'en'] as const).map(lng => (
                              <div key={lng} className={cn(
                                "px-6 py-2 rounded-xl text-xs font-black uppercase italic tracking-widest transition-all",
                                i18n.language === lng ? "bg-blue-600 text-white shadow-lg" : "opacity-40"
                              )}>{t(`language.${lng}`)}</div>
                            ))}
                          </div>
                        )}
                      </Focusable>
                    </div>

                    {/* Runner installati */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 mb-4">{t('system.installedRunners')}</h3>
                      <div className="space-y-2">
                        {availableRunners.length === 0 && (
                          <p className="text-xs opacity-40 italic">{t('system.noRunnersFound')}</p>
                        )}
                        {availableRunners.map((r: any, idx: number) => {
                          const isPendingConfirm = pendingRunnerAction && pendingRunnerAction.id === r.id && pendingRunnerAction.action === 'uninstall';
                          const isUninstalling   = runnerUninstalling === r.id;
                          const uninstallLog     = runnerUninstallProgress[r.id];
                          const isRowFocused     = focusedId === `runner-uninstall-${r.id}`;
                          // L'ultima riga della lista deve poter scendere
                          // direttamente al pulsante Aggiorna della sezione
                          // successiva: lo scoring geometrico normale lo
                          // salta sempre, essendo piccolo e defilato a
                          // destra nell'header sottostante.
                          const isLastInstalled = idx === availableRunners.length - 1;
                          // Step 19b (v1.1.38) — stesso principio di
                          // isLastInstalled/down sopra, mirror per "su":
                          // il selettore di lingua è stretto e allineato a
                          // sinistra, la riga runner è larga — lo scoring
                          // geometrico normale valuta "sinistra" più vicino
                          // di "su" (dx grande, dy piccolo) e ci porta lì
                          // invece che al selettore, il bug segnalato in
                          // test. Esplicito qui, non lasciato allo scoring.
                          const isFirstInstalled = idx === 0;
                          return (
                            <div key={r.id} className={cn(
                              "rounded-xl overflow-hidden transition-all",
                              isRowFocused ? "ring-2 ring-blue-400" : "",
                              theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200"
                            )}>
                              <div className="flex items-center gap-3 px-4 py-3">
                                <Cpu size={14} className="text-blue-400 shrink-0" />
                                <span className="text-xs font-black uppercase tracking-tighter flex-1">{r.id}</span>
                                <span className={cn("text-[9px] font-mono", theme === 'dark' ? "text-white/30" : "text-gray-500")}>{r.version}</span>
                                <Focusable
                                  group="settings"
                                  id={`runner-uninstall-${r.id}`}
                                  neighbors={{
                                    ...(isFirstInstalled ? { up: 'settings-language-toggle' } : {}),
                                    ...(isLastInstalled ? { down: 'runners-refresh' } : {}),
                                  }}
                                  onEnter={() => {
                                    if (isUninstalling) return;
                                    if (isPendingConfirm) {
                                      setPendingRunnerAction(null);
                                      handleUninstallRunner(r.id);
                                    } else {
                                      setPendingRunnerAction({ id: r.id, action: 'uninstall' });
                                      play('select');
                                    }
                                  }}
                                >
                                  {(isFocused) => (
                                    <button
                                      disabled={isUninstalling}
                                      className={cn(
                                        "relative overflow-hidden px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border min-w-[84px] text-center transition-all",
                                        isUninstalling
                                          ? "border-red-500/30 text-white/80"
                                          : isPendingConfirm
                                            ? "bg-red-600 border-red-600 text-white animate-pulse"
                                            : isFocused
                                              ? "bg-green-500/20 border-green-400 text-green-300"
                                              : "bg-green-500/10 border-green-500/20 text-green-400"
                                      )}
                                    >
                                      {/* Barra indeterminata, riempie da dx verso sx durante la disinstallazione */}
                                      {isUninstalling && (
                                        <span className="absolute inset-y-0 bg-red-500/40 animate-[runnerProgressRtl_1.2s_ease-in-out_infinite]" />
                                      )}
                                      <span className="relative z-10">
                                        {isUninstalling ? t('system.removing') : isPendingConfirm ? t('system.confirmA') : t('system.installedBadge')}
                                      </span>
                                    </button>
                                  )}
                                </Focusable>
                              </div>
                              {uninstallLog && uninstallLog.length > 0 && (
                                <div className="px-4 pb-3 space-y-0.5">
                                  {uninstallLog.map((line, i) => (
                                    <p key={i} className={cn("text-[9px] font-mono leading-relaxed", theme === 'dark' ? "text-white/40" : "text-gray-500")}>{line}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Runner installabili */}
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30">{t('system.installableRunners')}</h3>
                        <Focusable
                          group="settings"
                          id="runners-refresh"
                          neighbors={{
                            down: installableRunners[0] ? `runner-install-${installableRunners[0].id}` : undefined,
                            // Step 19b (v1.1.38) — quando non ci sono
                            // runner installati, questo pulsante È il primo
                            // elemento reale della tab (vedi
                            // firstRunnerContentId più sopra): "su" deve
                            // tornare al selettore di lingua, non cadere
                            // sullo scoring geometrico.
                            up: availableRunners.length > 0 ? `runner-uninstall-${availableRunners[availableRunners.length - 1].id}` : 'settings-language-toggle',
                          }}
                          onEnter={() => {
                            fetch('/api/runners/installable').then(r => r.json()).then(setInstallableRunners).catch(() => {});
                            play('select');
                          }}
                        >
                          {(isFocused) => (
                            <button
                              className={cn(
                                // v1.1.107-dev.1 — stile unificato con
                                // disk-usage-refresh più sotto: celeste
                                // semplice a riposo, pillola rossa SOLO
                                // quando isFocused (selezione volontaria).
                                "text-[9px] font-black uppercase tracking-widest transition-all px-2 py-1 rounded-lg",
                                isFocused ? "bg-red-600/20 text-red-400" : "text-blue-400/70"
                              )}
                            >
                              {t('system.refresh')}
                            </button>
                          )}
                        </Focusable>
                      </div>

                      {/* Banner protonup / Lutris */}
                      {(() => {
                        const hasProtonup = !!systemTools['protonup'];
                        const hasLutris   = !!systemTools['lutris'];
                        if (hasProtonup && hasLutris) return (
                          <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-green-500/5 border border-green-500/20">
                            <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                            <div>
                              <p className="text-[10px] font-black text-green-400">{t('system.protonupLutris.title')}</p>
                              <p className={cn("text-[9px] font-mono mt-0.5", theme === 'dark' ? "text-white/40" : "text-gray-500")}>
                                {t('system.protonupLutris.prefix')}<span className={cn(theme === 'dark' ? "text-white/60" : "text-gray-600")}>protonup</span>{t('system.protonupLutris.suffix')}
                              </p>
                            </div>
                          </div>
                        );
                        if (hasProtonup) return (
                          <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                            <div>
                              <p className={cn("text-[10px] font-black", theme === 'dark' ? "text-blue-300" : "text-blue-600")}>{t('system.protonupOnly.title')}</p>
                              <p className={cn("text-[9px] font-mono mt-0.5", theme === 'dark' ? "text-white/40" : "text-gray-500")}>
                                {t('system.protonupOnly.prefix')}<span className="text-white/60">protonup</span>{t('system.protonupOnly.middle')}
                                <code className="text-yellow-400/80">yay -S lutris</code>{t('system.protonupOnly.suffix')}
                              </p>
                            </div>
                          </div>
                        );
                        if (hasLutris) return (
                          <div className="flex items-center gap-3 mb-4 px-4 py-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                            <div>
                              <p className="text-[10px] font-black text-blue-300">{t('system.lutrisOnly.title')}</p>
                              <p className={cn("text-[9px] font-mono mt-0.5", theme === 'dark' ? "text-white/40" : "text-gray-500")}>
                                {t('system.lutrisOnly.prefix')}<code className="text-yellow-400/80">yay -S protonup-qt</code>{t('system.lutrisOnly.suffix')}
                              </p>
                            </div>
                          </div>
                        );
                        // nessuno dei due
                        return (
                          <div className="flex gap-3 mb-4 px-4 py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/30">
                            <div className="w-2 h-2 rounded-full bg-yellow-400 shrink-0 mt-1" />
                            <div className="space-y-2">
                              <p className="text-[10px] font-black text-yellow-300">
                                {t('system.neitherFound.title')}
                              </p>
                              <p className={cn("text-[9px] font-mono leading-relaxed", theme === 'dark' ? "text-white/50" : "text-gray-600")}>
                                {t('system.neitherFound.desc')}
                              </p>
                              <div className="flex flex-col gap-1 mt-1">
                                <div className="flex items-center gap-2">
                                  <span className={cn("text-[8px] uppercase font-black w-16", theme === 'dark' ? "text-white/30" : "text-gray-500")}>ProtonUp</span>
                                  <code className="text-[9px] font-mono text-green-400/80 bg-black/30 px-2 py-0.5 rounded">yay -S protonup-qt</code>
                                  <span className="text-[8px] text-white/25 italic">{t('system.neitherFound.recommended')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={cn("text-[8px] uppercase font-black w-16", theme === 'dark' ? "text-white/30" : "text-gray-500")}>Lutris</span>
                                  <code className="text-[9px] font-mono text-green-400/80 bg-black/30 px-2 py-0.5 rounded">yay -S lutris</code>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      <div className="space-y-2">
                        {installableRunners.length === 0 && (
                          <p className="text-xs opacity-40 italic">{t('system.loadingVersions')}</p>
                        )}
                        {installableRunners.map((r: any, idx: number) => {
                          const isInst  = r.installed || availableRunners.some((a: any) => a.id === r.id);
                          const isThisInstalling = runnerInstalling === r.id;
                          const isPendingConfirm  = pendingRunnerAction && pendingRunnerAction.id === r.id && pendingRunnerAction.action === 'install';
                          const isRowFocused      = focusedId === `runner-install-${r.id}`;
                          const progress = runnerInstallProgress[r.id];
                          const isFirstInstallable = idx === 0;
                          // v1.1.6 — mancava il confine simmetrico: il
                          // ritorno (disk-usage-refresh → up →
                          // system-tools-area) era già esplicito, ma
                          // l'andata no — scendendo dall'ultima riga
                          // installabile lo scoring geometrico saltava
                          // per intero "Tool di sistema" (una card larga
                          // e bassa) atterrando direttamente su
                          // "disk-usage-refresh" più sotto.
                          const isLastInstallable = idx === lastInstallableFocusableIdx;
                          return (
                            <div key={r.id} className={cn(
                              "rounded-xl overflow-hidden transition-all",
                              isRowFocused ? "ring-2 ring-blue-400" : "",
                              theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200"
                            )}>
                              <div className="flex items-center gap-3 px-4 py-3">
                                <Package size={14} className={cn("shrink-0", isInst ? "text-green-400" : theme === 'dark' ? "text-white/30" : "text-gray-400")} />
                                <span className="text-xs font-black uppercase tracking-tighter flex-1">{r.id}</span>
                                <span className={cn("text-[8px] font-mono px-2 py-0.5 rounded-full border", theme === 'dark' ? "text-white/30 bg-white/5 border-white/10" : "text-gray-500 bg-gray-100 border-gray-200")}>
                                  via {r.source}
                                </span>
                                {isInst ? (
                                  <span className="px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-[8px] font-black text-green-400 uppercase">{t('system.installedBadge')}</span>
                                ) : (
                                  <Focusable
                                    group="settings"
                                    id={`runner-install-${r.id}`}
                                    neighbors={{
                                      up: isFirstInstallable ? 'runners-refresh' : undefined,
                                      down: isLastInstallable ? 'system-tools-area' : undefined,
                                    }}
                                    onEnter={() => {
                                      if (runnerInstalling) return;
                                      if (isPendingConfirm) {
                                        setPendingRunnerAction(null);
                                        handleInstallRunner(r.id);
                                      } else {
                                        setPendingRunnerAction({ id: r.id, action: 'install' });
                                        play('select');
                                      }
                                    }}
                                  >
                                    {(isFocused) => (
                                      <button
                                        disabled={!!runnerInstalling}
                                        className={cn(
                                          "relative overflow-hidden px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border min-w-[84px] text-center transition-all",
                                          isThisInstalling
                                            ? "border-blue-500/30 text-white/80"
                                            : runnerInstalling
                                              ? "opacity-30 cursor-not-allowed border-white/10"
                                              : isPendingConfirm
                                                ? "bg-blue-600 border-blue-600 text-white animate-pulse"
                                                : isFocused
                                                  ? "bg-blue-600 text-white border-blue-600"
                                                  : "border-blue-500/40 text-blue-400 hover:bg-blue-600 hover:text-white hover:border-blue-600"
                                        )}
                                      >
                                        {/* Barra indeterminata, riempie da sx verso dx durante l'installazione */}
                                        {isThisInstalling && (
                                          <span className="absolute inset-y-0 bg-blue-500/40 animate-[runnerProgressLtr_1.2s_ease-in-out_infinite]" />
                                        )}
                                        <span className="relative z-10">
                                          {isThisInstalling ? t('system.installing') : isPendingConfirm ? t('system.confirmA') : t('system.installAction')}
                                        </span>
                                      </button>
                                    )}
                                  </Focusable>
                                )}
                              </div>
                              {/* Progress log */}
                              {progress && progress.length > 0 && (
                                <div className="px-4 pb-3 space-y-0.5">
                                  {progress.map((line, i) => (
                                    <p key={i} className={cn("text-[9px] font-mono leading-relaxed", theme === 'dark' ? "text-white/40" : "text-gray-500")}>{line}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Tool di sistema */}
                    <Focusable
                      group="settings"
                      id="system-tools-area"
                      // v1.1.7 — mancava questo confine: down esisteva da
                      // sempre, ma non l'analogo up (risalendo da qui, lo
                      // scoring geometrico atterrava su "runners-refresh"
                      // invece che sull'ultima riga installabile).
                      neighbors={{ down: 'disk-usage-refresh', up: systemToolsUpNeighbor }}
                      onEnter={() => {}}
                    >
                      {(isFocused) => (
                        <div className={cn(
                          // v1.1.6 — Tool di sistema è un widget puramente
                          // informativo (onEnter no-op, nessuna azione
                          // possibile): il focus resta un normale stop di
                          // navigazione per continuità su/giù, ma senza
                          // anello blu — quel segnale visivo è riservato
                          // a ciò che si può davvero attivare con A.
                          "rounded-2xl transition-all p-1"
                        )}>
                          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 mb-4">{t('system.systemTools')}</h3>
                          <div className="grid grid-cols-3 gap-3">
                            {([
                              ['wine',      'Wine'],
                              ['protonup',  'ProtonUp-Qt'],
                              ['lutris',    'Lutris'],
                              ['steam',     'Steam'],
                              ['mangohud',  'MangoHud'],
                              ['gamemode',  'GameMode'],
                              ['gamescope', 'Gamescope'],
                              ['retroarch', 'RetroArch'],
                              ['scummvm',   'ScummVM'],
                              ['dosbox',    'DOSBox'],
                              ['fsr',       'FSR (Wine ≥7)'],
                              ['eac',       'EAC Runtime'],
                              ['battleye',  'BattlEye Runtime'],
                              // v1.5.20-dev.1 — umu-run (pacchetto
                              // umu-launcher), stesso trattamento
                              // puramente informativo delle altre voci.
                              ['umu',       'Umu-launcher'],
                              // v1.1.105-dev.1 — tool di decompressione
                              // Classic Console, vedi archiveExtractors.ts.
                              ['unzip',     'Unzip'],
                              ['p7zip',     '7-Zip'],
                              ['unrar',     'UnRAR'],
                            ] as [string, string][]).map(([key, label]) => {
                              const val = systemTools[key];
                              const ok  = val === true || (typeof val === 'string' && val.length > 0);
                              return (
                                <div key={key} className={cn(
                                  "flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest",
                                  ok
                                    ? theme === 'dark' ? "bg-white/5 border-white/10 text-white/80" : "bg-gray-50 border-gray-200 text-gray-700"
                                    : theme === 'dark' ? "bg-white/[0.02] border-white/5 text-white/25" : "bg-gray-100/50 border-gray-100 text-gray-400"
                                )}>
                                  <div className={cn("w-2 h-2 rounded-full shrink-0", ok ? "bg-green-500" : "bg-white/15")} />
                                  {label}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </Focusable>

                    {/* Spazio disco */}
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30">{t('system.diskSpace')}</h3>
                        <Focusable
                          group="settings"
                          id="disk-usage-refresh"
                          neighbors={{ down: 'disk-usage-area', up: 'system-tools-area' }}
                          onEnter={() => { setSystemTabLoaded(false); play('select'); }}
                        >
                          {(isFocused) => (
                            <button className={cn(
                              // v1.1.107-dev.1 — stesso stile unificato di
                              // runners-refresh sopra.
                              "text-[9px] font-black uppercase tracking-widest transition-all px-2 py-1 rounded-lg",
                              isFocused ? "bg-red-600/20 text-red-400" : "text-blue-400/70"
                            )}>{t('system.refresh')}</button>
                          )}
                        </Focusable>
                      </div>
                      <Focusable
                        group="settings"
                        id="disk-usage-area"
                        neighbors={{ up: 'disk-usage-refresh' }}
                        onEnter={() => {}}
                      >
                        {(isFocused) => (
                          // v1.1.6 — stesso trattamento di Tool di sistema:
                          // widget informativo, focus senza anello blu.
                          <div className="rounded-2xl transition-all p-1">
                            {diskUsage ? (
                              <div className="px-5 py-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                                <div className="flex items-center gap-4">
                                  <Monitor size={16} className="text-blue-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-1">
                                      <p className="text-sm font-black">{t('system.freeSpace', { free: diskUsage.freeHuman })}</p>
                                      <p className={cn("text-[9px] font-mono", theme === 'dark' ? "text-white/40" : "text-gray-500")}>
                                        {t('system.usedPercentTotal', { percent: diskUsage.usedPercent, total: diskUsage.totalHuman })}
                                      </p>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                                      <div
                                        className={cn(
                                          "h-full rounded-full transition-all",
                                          // Soglie sullo spazio LIBERO rimanente, non su quello usato:
                                          // verde quando c'è ancora ampio margine, giallo quando resta
                                          // il 30% della capacità totale, rosso quando si scende al 10%.
                                          diskUsage.usedPercent >= 90 ? "bg-red-500"
                                            : diskUsage.usedPercent >= 70 ? "bg-yellow-500"
                                            : "bg-green-500"
                                        )}
                                        style={{ width: `${diskUsage.usedPercent}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <p className={cn("text-[9px] font-mono", theme === 'dark' ? "text-white/25" : "text-gray-400")}>
                                  ~/Games: {diskUsage.usedHuman !== '—' ? diskUsage.usedHuman : t('system.folderNotCreated')}
                                </p>
                              </div>
                            ) : (
                              <div className="px-5 py-4 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[10px] font-mono opacity-40">{t('system.loadingEllipsis')}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </Focusable>
                    </div>
                  </div>
                    );
                  })()
                ) : activeSettingsTab === 'plugins' ? (
                  /* ── Plugins tab ── */
                  <div className="space-y-6">
                    <p className={cn("text-[10px] font-mono mb-8", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                      {t('plugins.intro')}
                    </p>
                    {pluginLoadError ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-xs text-red-400 font-mono">{pluginLoadError}</p>
                        <button
                          onClick={loadPluginRegistry}
                          className="self-start px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/20 hover:bg-white/10 transition-all"
                        >{t('plugins.retry')}</button>
                      </div>
                    ) : pluginRegistry.length === 0 ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-xs opacity-40 italic">{t('plugins.loadingPlugins')}</p>
                        <button
                          onClick={loadPluginRegistry}
                          className="self-start px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/20 hover:bg-white/10 transition-all"
                        >{t('plugins.reload')}</button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-5">
                        {pluginRegistry.map(plugin => {
                          const isRowFocused = focusedId === `plugin-toggle-${plugin.id}`;
                          return (
                          <div key={plugin.id} className={cn(
                            "p-6 rounded-2xl border flex flex-col gap-4 transition-all",
                            isRowFocused
                              ? "ring-2 ring-blue-400 border-blue-400 scale-[1.01]"
                              : plugin.enabled
                                ? theme === 'dark' ? "bg-blue-600/10 border-blue-500/30" : "bg-blue-50 border-blue-200"
                                : theme === 'dark' ? "bg-white/5 border-white/5"          : "bg-gray-50 border-gray-200"
                          )}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-black truncate">{translateStorePluginName(plugin.id, plugin.name)}</span>
                                  {plugin.drmFree ? (
                                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20 shrink-0">{t('plugins.drmFree')}</span>
                                  ) : (
                                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 shrink-0">{t('plugins.drm')}</span>
                                  )}
                                </div>
                                <p className={cn("text-[10px] leading-relaxed", theme === 'dark' ? "text-white/40" : "text-gray-500")}>
                                  {translateStorePluginDescription(plugin.id, plugin.description)}
                                </p>
                                {plugin.requiredTool && (
                                  <p className={cn("text-[9px] font-mono mt-1", theme === 'dark' ? "text-white/20" : "text-gray-400")}>
                                    {t('plugins.requires', { tool: plugin.requiredTool })}
                                  </p>
                                )}
                              </div>
                              {/* Toggle switch */}
                              <Focusable group="settings" id={`plugin-toggle-${plugin.id}`} onEnter={async () => {
                                const next = !plugin.enabled;
                                await fetch(`/api/plugins/${encodeURIComponent(plugin.id)}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ enabled: next }),
                                });
                                setPluginRegistry(prev => prev.map(p =>
                                  p.id === plugin.id ? { ...p, enabled: next } : p
                                ));
                                play('select');
                              }}>
                                {(isFocused) => (
                                  <button
                                    className={cn(
                                      "relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 border",
                                      plugin.enabled
                                        ? "bg-blue-600 border-blue-500"
                                        : isFocused
                                          ? "bg-white/20 border-white/40"
                                          : theme === 'dark' ? "bg-white/10 border-white/20" : "bg-gray-200 border-gray-300"
                                    )}
                                  >
                                    <span className={cn(
                                      "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300",
                                      plugin.enabled ? "left-6" : "left-0.5"
                                    )} />
                                  </button>
                                )}
                              </Focusable>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : activeSettingsTab === 'input' ? (
                  /* ── Input tab ── */
                  <div className="space-y-10">
                    {/* Dispositivi connessi */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 mb-4">{t('input.connectedDevices')}</h3>
                      {connectedDevices.length === 0 ? (
                        <div className={cn(
                          "flex items-center gap-3 px-5 py-4 rounded-xl border text-sm opacity-50",
                          theme === 'dark' ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-200"
                        )}>
                          <Gamepad size={16} />
                          <span className="text-xs font-medium">{t('input.noControllerDetected')}</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {connectedDevices.map(dev => (
                            <div key={dev.index} className={cn(
                              "flex items-center gap-4 px-5 py-4 rounded-xl border",
                              theme === 'dark' ? "bg-white/5 border-white/5" : "bg-gray-50 border-gray-200"
                            )}>
                              <Gamepad size={16} className="text-blue-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-black truncate">{dev.id}</p>
                                <p className={cn("text-[9px] font-mono mt-0.5", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                                  {t('input.assignedPlugin', { plugin: dev.pluginId })}
                                  {dev.vendorId ? ` · VID: 0x${dev.vendorId.toString(16).padStart(4,'0').toUpperCase()}` : ''}
                                </p>
                              </div>
                              <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                                {t('input.connected')}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Plugin input */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 mb-4">{t('input.inputPlugins')}</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {inputPlugins.map(plugin => {
                          const isRowFocused = focusedId === `input-plugin-toggle-${plugin.id}`;
                          return (
                          <div key={plugin.id} className={cn(
                            "p-5 rounded-2xl border flex items-center gap-4 transition-all",
                            isRowFocused
                              ? "ring-2 ring-blue-400 border-blue-400 scale-[1.01]"
                              : plugin.enabled
                                ? theme === 'dark' ? "bg-blue-600/10 border-blue-500/30" : "bg-blue-50 border-blue-200"
                                : theme === 'dark' ? "bg-white/5 border-white/5"          : "bg-gray-50 border-gray-200"
                          )}>
                            <Gamepad size={18} className={plugin.enabled ? "text-blue-400" : "opacity-30"} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-black">{translateInputPluginName(plugin.id, plugin.name)}</p>
                              <p className={cn("text-[9px] mt-0.5 leading-relaxed", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                                {translateInputPluginDescription(plugin.id, plugin.description)}
                              </p>
                            </div>
                            <Focusable group="settings" id={`input-plugin-toggle-${plugin.id}`} onEnter={() => {
                              InputManager.setPluginEnabled(plugin.id, !plugin.enabled);
                              setInputPlugins(InputManager.plugins.map(toInputPluginSummary));
                              play('select');
                            }}>
                              {(isFocused) => (
                                <button
                                  className={cn(
                                    "relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 border",
                                    plugin.enabled
                                      ? "bg-blue-600 border-blue-500"
                                      : isFocused
                                        ? "bg-white/20 border-white/40"
                                        : theme === 'dark' ? "bg-white/10 border-white/20" : "bg-gray-200 border-gray-300"
                                  )}
                                >
                                  <span className={cn(
                                    "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-300",
                                    plugin.enabled ? "left-6" : "left-0.5"
                                  )} />
                                </button>
                              )}
                            </Focusable>
                          </div>
                          );
                        })}
                      </div>
                      <p className={cn("text-[9px] font-mono mt-4 opacity-50", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                        {t('input.genericFallbackNote')}
                      </p>
                    </div>

                    {/* Test input live */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 mb-4">{t('input.testController')}</h3>
                      {/* v1.1.8 — resa selezionabile su richiesta: quando
                          ha il focus, il loop di polling principale
                          (vedi useEffect più sopra) sospende ogni
                          interpretazione normale degli input — altrimenti
                          ogni pressione durante il test attiverebbe anche
                          una funzione reale della Dashboard. Uscita
                          garantita con pressione prolungata di B (~1s),
                          l'unica eccezione gestita anche in modalità
                          cattura. onEnter resta no-op: qui basta il
                          focus, non serve un passo di conferma separato. */}
                      <Focusable group="settings" id="gamepad-test-area" onEnter={() => {}}>
                        {(isFocused) => (
                          <GamepadTester
                            state={gamepadState}
                            connected={connectedDevices.length > 0}
                            theme={theme}
                            // v1.1.11 — false anche durante il breve
                            // ritardo di uscita: il LED deve mostrarsi
                            // verde subito al raggiungimento della soglia,
                            // non solo dopo che il focus si è già spostato.
                            captureActive={isFocused && !gamepadTestExiting}
                            exitHoldProgress={gamepadTestExitProgress}
                          />
                        )}
                      </Focusable>
                    </div>
                  </div>
                ) : activeSettingsTab === 'ai-models' ? (
                  /* ── AI Models tab (Ollama) — v0.99.90, Step 15d ──
                     Stessa struttura della sezione "Runner installati" in
                     System: elenco di ciò che è già presente sul disco,
                     un pulsante per selezionare quale usare — nessuna
                     installazione/download di modelli da qui (resta
                     un'operazione da terminale, 'ollama pull'). */
                  <div className="space-y-6">
                    <div className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-xl mb-6",
                      theme === 'dark' ? "bg-purple-500/10 border border-purple-500/20" : "bg-purple-50 border border-purple-200"
                    )}>
                      <Sparkles size={14} className="text-purple-400 shrink-0" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-purple-400">{t('aiAdvisor.experimental')}</p>
                      <p className={cn("text-[10px] font-mono ml-2", theme === 'dark' ? "text-white/40" : "text-gray-500")}>
                        {t('aiAdvisor.experimentalNote')}
                      </p>
                    </div>

                    <p className={cn("text-[10px] font-mono mb-8", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                      {t('aiAdvisor.modelsIntro')}
                    </p>

                    {/* v1.1.108-dev.1 — richiesta utente: niente più un
                        budget aggregato fra tutti i provider (era qui,
                        con un campo editabile) — Ollama è locale e
                        gratuito, nessun vincolo di consumo: mostra solo
                        quanto ha processato questo mese, a puro titolo
                        informativo, col simbolo ∞ al posto di un tetto.
                        Il budget vero (editabile, con blocco reale
                        all'esaurimento) vive ora dentro ogni card
                        provider cloud più sotto — vedi CLOUD_PROVIDERS. */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 mb-4">{t('aiAdvisor.installedModels')}</h3>
                      {/* v1.1.108-dev.1 — informativo, non focalizzabile:
                          Ollama non ha budget, quindi niente da editare
                          qui, solo quanto ha processato questo mese. */}
                      <p className={cn("text-[10px] font-mono mb-4", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                        {t('aiAdvisor.tokensThisMonth', { used: ollamaUsageThisMonth.toLocaleString(i18n.language), budget: '∞' })}
                      </p>
                      <div className="space-y-2">
                        {ollamaModels.length === 0 && (
                          <p className="text-xs opacity-40 italic">{t('aiAdvisor.noModelsFound')}</p>
                        )}
                        {ollamaModels.map((m, idx) => {
                          const isActive = activeOllamaModel === m.name && ollamaEnabled;
                          const sizeGB = m.sizeBytes / (1024 ** 3);
                          // Euristica solo sulla dimensione del modello — non
                          // abbiamo un modo affidabile di leggere la VRAM
                          // libera da qui, quindi resta un proxy approssimativo
                          // del peso computazionale, non un'analisi hardware reale.
                          const weightLabel = sizeGB < 2 ? t('aiAdvisor.weight.light') : sizeGB < 5 ? t('aiAdvisor.weight.medium') : sizeGB < 10 ? t('aiAdvisor.weight.heavy') : t('aiAdvisor.weight.veryHeavy');
                          const weightColor = sizeGB < 2 ? 'text-green-400' : sizeGB < 5 ? 'text-blue-400' : sizeGB < 10 ? 'text-orange-400' : 'text-red-400';
                          // v0.99.90 — vicini espliciti su/giù invece di
                          // affidarsi solo allo scoring geometrico: stesso
                          // principio già applicato a VirtualKeyboard dopo
                          // che una riga risultava irraggiungibile — con righe
                          // di larghezza uniforme come queste lo scoring
                          // dovrebbe già funzionare da solo, ma un percorso
                          // esplicito costa poco e toglie ogni dubbio quando
                          // i modelli diventeranno 2 o più.
                          const prevId = idx === 0 ? undefined : `ollama-model-select-${ollamaModels[idx - 1].name}`;
                          const nextId = idx === ollamaModels.length - 1 ? undefined : `ollama-model-select-${ollamaModels[idx + 1].name}`;
                          // v0.99.90 — stesso segnale visivo già usato per le
                          // righe Runner in System: l'intera riga si
                          // evidenzia con un anello quando è a fuoco col pad,
                          // non solo il pulsante "seleziona" al suo interno —
                          // mancava qui, avevo evidenziato solo il pulsante.
                          const isRowFocused = focusedId === `ollama-model-select-${m.name}`;
                          return (
                            <div key={m.name} className={cn(
                              "rounded-xl overflow-hidden transition-all px-4 py-3 flex items-center gap-3",
                              isRowFocused ? "ring-2 ring-purple-400" : isActive ? "ring-1 ring-purple-400/50" : "",
                              theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200"
                            )}>
                              <Sparkles size={14} className="text-purple-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-black uppercase tracking-tighter block truncate">{m.name}</span>
                                <span className={cn("text-[9px] font-mono", theme === 'dark' ? "text-white/30" : "text-gray-500")}>
                                  {sizeGB.toFixed(1)} GB{m.parameterSize ? ` · ${m.parameterSize}` : ''}{m.quantization ? ` · ${m.quantization}` : ''}
                                </span>
                              </div>
                              <span className={cn("text-[9px] font-black uppercase tracking-widest shrink-0", weightColor)}>{weightLabel}</span>
                              <Focusable
                                group="settings"
                                id={`ollama-model-select-${m.name}`}
                                neighbors={{ up: prevId, down: nextId }}
                                onEnter={() => {
                                  // v0.99.90 — vero toggle, non sola selezione:
                                  // premere A sulla riga già attiva (questo
                                  // modello, con Ollama acceso) lo spegne;
                                  // premere A su un'altra riga la seleziona
                                  // come modello attivo e accende Ollama —
                                  // stesso comportamento dei provider cloud
                                  // e dei runner, per coerenza.
                                  const turningOff = isActive;
                                  const nextEnabled = !turningOff;
                                  setOllamaEnabled(nextEnabled);
                                  if (!turningOff) setActiveOllamaModel(m.name);
                                  // v1.1.108-dev.2 — fix: db.upsertAiProviderCredential
                                  // disattiva già correttamente tutti gli altri
                                  // provider quando questo viene abilitato (vale
                                  // per qualunque id, Ollama compreso) — ma senza
                                  // questo refreshOllamaModels() la UI non lo
                                  // scopriva mai: i pill dei provider cloud
                                  // restavano visivamente "attivi" nella sessione
                                  // corrente anche se il DB li aveva già spenti.
                                  // Stesso identico refresh già fatto da
                                  // saveCloudProvider() per il caso simmetrico.
                                  fetch('/api/ai/providers/ollama', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ enabled: nextEnabled, model: m.name, priority: 0 }),
                                  }).then(() => refreshOllamaModels()).catch(() => {});
                                  play('select');
                                }}
                              >
                                {(isFocused) => (
                                  <button className={cn(
                                    "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border min-w-[84px] text-center transition-all shrink-0",
                                    isActive
                                      ? "bg-purple-600 border-purple-600 text-white"
                                      : isFocused
                                        ? "bg-purple-500/20 border-purple-400 text-purple-300"
                                        : "bg-white/5 border-white/10 opacity-60"
                                  )}>
                                    {isActive ? t('aiAdvisor.active') : t('aiAdvisor.select')}
                                  </button>
                                )}
                              </Focusable>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* v0.99.90 — Step 15d: provider cloud. Nessun
                        download/pull qui (a differenza di Ollama, non
                        c'entra — sono API remote), solo enable + API key
                        + test connessione. */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.4em] opacity-30 mb-4">{t('aiAdvisor.cloudProviders')}</h3>
                      <div className="space-y-3">
                        {CLOUD_PROVIDERS.map((cp, idx) => {
                          const state = cloudProviderState[cp.id] ?? { enabled: false, hasStoredKey: false, apiKeyDraft: '', testing: false, testResult: null };
                          // v1.1.14 — due bug reali qui, non uno:
                          // 1) questa variabile si chiamava "prevRowToggle"
                          //    ma puntava al CAMPO api key del provider
                          //    precedente (`cloud-provider-key-…`), non al
                          //    suo toggle — risalendo da un toggle non si
                          //    tornava mai al toggle sopra, ma al suo campo
                          //    (a volte nemmeno montato, se quel provider
                          //    non era enabled).
                          // 2) il toggle non aveva MAI un neighbor down
                          //    esplicito verso la propria riga: scendendo
                          //    da un toggle, lo scoring geometrico saltava
                          //    l'intera riga (campo/test/rimuovi) e
                          //    atterrava direttamente sul toggle del
                          //    provider successivo — da cui il sintomo
                          //    "posso solo attivare/disattivare il
                          //    servizio", risolvibile solo scendendo al
                          //    provider dopo e tornando su per sbaglio.
                          const toggleUpNeighbor = idx === 0
                            ? (ollamaModels[ollamaModels.length - 1] ? `ollama-model-select-${ollamaModels[ollamaModels.length - 1].name}` : undefined)
                            : `cloud-provider-toggle-${CLOUD_PROVIDERS[idx - 1].id}`;
                          const nextProvider = CLOUD_PROVIDERS[idx + 1];
                          const toggleDownNeighbor = state.enabled
                            ? `cloud-provider-key-${cp.id}`
                            : (nextProvider ? `cloud-provider-toggle-${nextProvider.id}` : undefined);
                          // v0.99.90 — stesso segnale di riga a fuoco già
                          // usato per Ollama/Runner/Plugin: il rettangolo
                          // viola indica la riga selezionata E premere A
                          // attiva/disattiva — non serve più cercare un
                          // pulsante separato all'interno della card.
                          const isRowFocused = focusedId === `cloud-provider-toggle-${cp.id}`;
                          return (
                            <div key={cp.id} className={cn(
                              "rounded-xl p-4 transition-all",
                              isRowFocused
                                ? "ring-2 ring-purple-400"
                                : state.enabled ? "ring-1 ring-purple-400/50" : "",
                              theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200"
                            )}>
                              <div className="flex items-center gap-3 mb-1">
                                <Sparkles size={14} className="text-purple-400 shrink-0" />
                                <span className="text-xs font-black uppercase tracking-tighter flex-1">{cp.name}</span>
                                <span className={cn(
                                  "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0",
                                  cp.requiresPaidAccount ? "bg-orange-500/10 text-orange-400" : "bg-green-500/10 text-green-400"
                                )}>
                                  {cp.requiresPaidAccount ? t('aiAdvisor.paid') : t('aiAdvisor.freeCheap')}
                                </span>
                                <Focusable
                                  group="settings"
                                  id={`cloud-provider-toggle-${cp.id}`}
                                  neighbors={{ up: toggleUpNeighbor, down: toggleDownNeighbor }}
                                  onEnter={() => {
                                    const nextEnabled = !state.enabled;
                                    setCloudProviderState(prev => ({ ...prev, [cp.id]: { ...state, enabled: nextEnabled } }));
                                    saveCloudProvider(cp.id, { enabled: nextEnabled });
                                    play('select');
                                  }}
                                >
                                  {(isFocused) => (
                                    <button className={cn(
                                      "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border min-w-[70px] text-center transition-all shrink-0",
                                      state.enabled
                                        ? "bg-purple-600 border-purple-600 text-white"
                                        : isFocused
                                          ? "bg-purple-500/20 border-purple-400 text-purple-300"
                                          : "bg-white/5 border-white/10 opacity-60"
                                    )}>
                                      {state.enabled ? t('aiAdvisor.active') : t('aiAdvisor.inactive')}
                                    </button>
                                  )}
                                </Focusable>
                              </div>
                              <p className={cn("text-[9px] font-mono leading-relaxed mb-3", theme === 'dark' ? "text-white/30" : "text-gray-500")}>{translateCloudProviderNote(cp.id, cp.note)}</p>

                              {state.enabled && (
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-black uppercase tracking-widest opacity-40 shrink-0">{t('aiAdvisor.apiKey')}</span>
                                  <Focusable
                                    group="settings"
                                    id={`cloud-provider-key-${cp.id}`}
                                    // v1.1.13 — prima scoring geometrico
                                    // puro fra campo/test/rimuovi: nessun
                                    // neighbors esplicito su una riga di
                                    // 2-3 elementi ravvicinati, la stessa
                                    // categoria di bug già vista e risolta
                                    // per le righe env-var. sequentialChain
                                    // orizzontale rende la navigazione
                                    // sx/dx deterministica per ordine
                                    // visivo invece che per punteggio.
                                    sequentialChain={`cloud-provider-row-${cp.id}`}
                                    chainAxis="horizontal"
                                    onEnter={() => openKeyboardForField(
                                      `cloud-provider-key-${cp.id}`,
                                      `${cp.name} — ${t('aiAdvisor.apiKey')}`,
                                      state.apiKeyDraft,
                                      (val) => {
                                        setCloudProviderState(prev => ({ ...prev, [cp.id]: { ...prev[cp.id], apiKeyDraft: val, hasStoredKey: val ? true : prev[cp.id]?.hasStoredKey } }));
                                        if (val) saveCloudProvider(cp.id, { apiKey: val });
                                      },
                                      'settings'
                                    )}
                                  >
                                    {(isFocused) => (
                                      <input
                                        type="text"
                                        readOnly
                                        value={state.apiKeyDraft ? '•'.repeat(Math.min(state.apiKeyDraft.length, 24)) : (state.hasStoredKey ? t('aiAdvisor.apiKeyStoredPlaceholder') : '')}
                                        placeholder={t('aiAdvisor.apiKeyPlaceholder')}
                                        className={cn(
                                          "flex-1 px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none transition-colors cursor-pointer",
                                          theme === 'dark' ? "bg-black/40" : "bg-white",
                                          isFocused ? "border-2 border-blue-500" : state.hasStoredKey || state.apiKeyDraft
                                            ? "border border-green-500/40" : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                                        )}
                                      />
                                    )}
                                  </Focusable>
                                  <Focusable
                                    group="settings"
                                    id={`cloud-provider-test-${cp.id}`}
                                    sequentialChain={`cloud-provider-row-${cp.id}`}
                                    chainAxis="horizontal"
                                    onEnter={() => { if (!state.testing) testCloudProvider(cp.id); }}
                                  >
                                    {(isFocused) => (
                                      <button className={cn(
                                        "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border shrink-0 transition-all",
                                        isFocused ? "bg-blue-500/20 border-blue-400 text-blue-300" : "bg-white/5 border-white/10 opacity-70"
                                      )}>
                                        {state.testing ? t('aiAdvisor.testing') : t('aiAdvisor.testConnection')}
                                      </button>
                                    )}
                                  </Focusable>
                                  {(state.hasStoredKey || state.apiKeyDraft) && (
                                    <Focusable
                                      group="settings"
                                      id={`cloud-provider-remove-${cp.id}`}
                                      sequentialChain={`cloud-provider-row-${cp.id}`}
                                      chainAxis="horizontal"
                                      // v1.1.12 — nuovo: prima non c'era
                                      // modo di tornare a "nessuna key"
                                      // senza sovrascriverla con una nuova.
                                      onEnter={() => removeCloudProviderKey(cp.id)}
                                    >
                                      {(isFocused) => (
                                        <button className={cn(
                                          "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border shrink-0 transition-all",
                                          isFocused ? "bg-red-500/20 border-red-400 text-red-300" : "bg-white/5 border-white/10 text-red-400/70 opacity-70"
                                        )}>
                                          {t('aiAdvisor.removeKey')}
                                        </button>
                                      )}
                                    </Focusable>
                                  )}
                                  {/* v1.1.108-dev.1 — richiesta utente: budget
                                      PER PROVIDER (prima un unico numero
                                      aggregato altrove in questa tab), col
                                      credito reale — gratuito o a pagamento
                                      — di questo servizio specifico. Stesso
                                      sequentialChain orizzontale della riga:
                                      appena aggiunto in coda, nessun'altra
                                      modifica ai vicini di navigazione. */}
                                  <Focusable
                                    group="settings"
                                    id={`cloud-provider-budget-${cp.id}`}
                                    sequentialChain={`cloud-provider-row-${cp.id}`}
                                    chainAxis="horizontal"
                                    onEnter={() => openKeyboardForField(
                                      `cloud-provider-budget-${cp.id}`,
                                      `${cp.name} — ${t('aiAdvisor.budgetFieldLabel')}`,
                                      String(state.tokenBudget ?? 5_000_000),
                                      (val) => {
                                        const n = parseInt(val, 10);
                                        if (!isNaN(n) && n >= 0) {
                                          setCloudProviderState(prev => ({ ...prev, [cp.id]: { ...prev[cp.id], tokenBudget: n } }));
                                          saveCloudProvider(cp.id, { tokenBudget: n });
                                        }
                                      },
                                      'settings'
                                    )}
                                  >
                                    {(isFocused) => (
                                      <input
                                        type="text"
                                        readOnly
                                        value={String(state.tokenBudget ?? 5_000_000)}
                                        className={cn(
                                          "w-24 px-2 py-1.5 rounded-lg text-[10px] font-mono text-center focus:outline-none transition-colors cursor-pointer shrink-0",
                                          theme === 'dark' ? "bg-black/40" : "bg-white",
                                          isFocused ? "border-2 border-blue-500" : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                                        )}
                                      />
                                    )}
                                  </Focusable>
                                </div>
                              )}
                              {state.enabled && (
                                // v1.1.108-dev.1 — sostituisce il vecchio
                                // contatore aggregato: usati/budget REALI
                                // di questo provider specifico. Rosso a
                                // budget esaurito (nessuna richiesta verrà
                                // instradata, vedi orchestrator.ts),
                                // arancio oltre l'80% (stessa soglia della
                                // notifica automatica).
                                <p className={cn(
                                  "text-[9px] font-mono mt-2",
                                  (state.usageThisMonth ?? 0) >= (state.tokenBudget ?? 5_000_000)
                                    ? "text-red-400"
                                    : (state.usageThisMonth ?? 0) >= (state.tokenBudget ?? 5_000_000) * 0.8
                                      ? "text-orange-400"
                                      : theme === 'dark' ? "text-white/30" : "text-gray-500"
                                )}>
                                  {t('aiAdvisor.tokensThisMonth', {
                                    used:   (state.usageThisMonth ?? 0).toLocaleString(i18n.language),
                                    budget: (state.tokenBudget ?? 5_000_000).toLocaleString(i18n.language),
                                  })}
                                </p>
                              )}
                              {state.testResult && (
                                <p className={cn("text-[9px] font-mono mt-2", state.testResult.success ? "text-green-400" : "text-red-400")}>
                                  {state.testResult.success ? '✓ ' : '✗ '}{state.testResult.message}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : activeSettingsTab === 'hardware' ? (
                  /* ── Info Hardware — richiesta utente: Motherboard, CPU,
                     GPU, RAM, HDD, OS. Tutti i valori letti senza permessi
                     elevati (vedi systemInfo.ts) — nessun dmidecode/sudo. */
                  <div className="space-y-4">
                    {!systemInfo ? (
                      <p className={cn("text-xs font-mono", theme === 'dark' ? "text-white/40" : "text-gray-500")}>
                        {t('hardware.loading')}
                      </p>
                    ) : (
                      [
                        { icon: CircuitBoard, label: t('hardware.motherboard'), value: systemInfo.motherboard },
                        { icon: Cpu,          label: t('hardware.cpu'),         value: systemInfo.cpu },
                        { icon: Monitor,      label: t('hardware.gpu'),         value: systemInfo.gpu },
                        { icon: MemoryStick,  label: t('hardware.ram'),         value: systemInfo.ram },
                        { icon: HardDrive,    label: t('hardware.storage'),     value: systemInfo.storage },
                        { icon: Laptop,       label: t('hardware.os'),          value: systemInfo.os },
                      ].map((row, i) => (
                        <div key={i} className={cn(
                          "flex items-center gap-4 p-4 rounded-xl",
                          theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200"
                        )}>
                          <row.icon size={18} className="text-blue-400 shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 w-32 shrink-0">{row.label}</span>
                          <span className="text-sm font-mono truncate">{row.value}</span>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Options Overlay — aperto con click destro o tasto X controller */}
      <AnimatePresence>
        {showGameOptions && selectedGame && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-md"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowGameOptions(false); play('back'); } }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className={cn(
                // v1.1.5 — FIX RADICE del taglio sopra/sotto: vh NON è
                // relativo al canvas virtuale 1920×1080 di
                // ScalingContainer.tsx, ma al viewport REALE del browser.
                // A 2560×1440 (scala 1.333×) "85vh" valeva 85% di 1440px
                // reali = 1224px — dentro un contenitore (il backdrop,
                // fixed inset-0) alto solo 1080px di layout, perché
                // ScalingContainer usa transform: scale(), che rende
                // quell'ancestor il containing block per i discendenti
                // fixed (per specifica CSS) SENZA cambiare come vh viene
                // risolto. Risultato: il modal eccedeva il proprio
                // contenitore già in fase di layout, prima ancora di
                // essere scalato/ingrandito visivamente — un bug
                // strutturale del canvas virtuale, non di flexbox (il fix
                // min-h-0 di v1.1.4 restava comunque corretto, semplicemente
                // non era la causa di QUESTO sintomo).
                // Percentuale invece di vh: si risolve rispetto al
                // contenitore reale (1080px di layout), indipendentemente
                // dal fattore di scala — corretto a qualunque risoluzione.
                "w-[700px] max-h-[85%] flex flex-col rounded-3xl border shadow-2xl overflow-hidden",
                theme === 'dark' ? "bg-[#12141a] border-white/10" : "bg-white border-gray-200"
              )}
            >
              {/* Header — fuori dall'area di scroll: titolo, copertina e
                  pulsante di chiusura restano sempre completamente
                  visibili, indipendentemente da quante sezioni compaiono
                  nel corpo sottostante. */}
              <div className="shrink-0 px-10 pt-10 pb-2">
              <div className="flex items-start justify-between mb-8">
                <div className="flex gap-6 items-center">
                  <img src={selectedGame.coverImage} className="w-16 h-20 rounded-xl object-cover shadow-lg" alt={selectedGame.title} />
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter italic leading-none mb-2">{selectedGame.title}</h2>
                    <div className="flex gap-2 flex-wrap items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">{translateStorePluginName(selectedGame.store, selectedGame.store)}</span>
                      <span className={cn("text-[10px] font-black uppercase tracking-widest", theme === 'dark' ? "text-white/30" : "text-gray-400")}>·</span>
                      <span className={cn("text-[10px] font-black uppercase tracking-widest", theme === 'dark' ? "text-white/50" : selectedGame.runner === 'Wine-Lutris' ? "text-yellow-600" : "text-gray-600")}>{selectedGame.runner}</span>
                      {runnerVersion && runnerVersion !== selectedGame.runner && (
                        <span className={cn("text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border", theme === 'dark' ? "text-white/30 bg-white/5 border-white/10" : "text-gray-500 bg-gray-100 border-gray-200")}>
                          v{runnerVersion}
                        </span>
                      )}
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                        selectedGame.isInstalled
                          ? "text-green-400 bg-green-400/10 border-green-400/20"
                          : "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
                      )}>
                        {selectedGame.isInstalled ? t('gameOptions:installed') : t('gameOptions:notInstalled')}
                      </span>
                    </div>
                  </div>
                </div>
                <Focusable
                  group="game-options"
                  id="game-options-close"
                  fallbackPriority={-1}
                  // v1.1.3 — ingresso deterministico nel corpo dell'overlay
                  // invece di ricadere sullo scoring geometrico, che per
                  // un elemento in alto a destra favoriva sempre la
                  // colonna destra di Compatibility Layer, scavalcando
                  // Runner Bridge e i core RetroArch.
                  neighbors={{ down: overlayNavAnchors.firstOverlayContentId }}
                  onEnter={() => { closeGameOptions(); play('back'); }}
                >
                  {(isFocused) => (
                    <button
                      className={cn("w-10 h-10 rounded-full border flex items-center justify-center transition-all",
                        isFocused ? "bg-red-600 border-red-600 text-white" : theme === 'dark' ? "border-white/10 hover:bg-red-600 hover:border-red-600 hover:text-white" : "border-gray-300 hover:bg-red-600 hover:border-red-600 hover:text-white"
                      )}
                    ><X size={18} /></button>
                  )}
                </Focusable>
              </div>
              </div>
              {/* Corpo — unica area che scrolla. Il modal intero (sopra)
                  non supera mai 85vh grazie a overflow-hidden + flex-col;
                  qui invece flex-1 + overflow-y-auto assorbe qualunque
                  quantità di sezioni senza mai spingere l'header fuori
                  dallo schermo. */}
              {/* Corpo — unica area che scrolla. Il modal intero (sopra)
                  non supera mai 85vh grazie a overflow-hidden + flex-col;
                  qui invece flex-1 + overflow-y-auto assorbe qualunque
                  quantità di sezioni senza mai spingere l'header fuori
                  dallo schermo.
                  v1.1.4 — FIX: mancava min-h-0. Senza, un figlio flex con
                  overflow-y-auto NON si comprime mai sotto l'altezza del
                  proprio contenuto (default CSS: min-height: auto per i
                  flex item) — il corpo cresceva quanto voleva, l'unico
                  limite reale diventava l'overflow-hidden ESTERNO, che
                  tagliava il risultato invece di farlo scorrere. Risultato
                  visibile: il taglio sopra/sotto restava, anzi peggiorava,
                  perché ora l'header fisso sottraeva altezza utile senza
                  che il corpo guadagnasse davvero uno scroll funzionante. */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-10 pb-10">
              <div className="space-y-6">
                {/* Runner — v1.0.0: nascosta per i giochi Classic Console.
                    Proton/Wine-Lutris non c'entrano nulla con RetroArch/
                    DOSBox/ScummVM, mostrarli qui serve solo a confondere
                    l'utente su cosa stia effettivamente per cambiare. */}
                {selectedGame.store !== 'Classic Console' && (
                <div className={cn("p-5 rounded-2xl", theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200")}>
                  <div className="flex items-center gap-3 mb-4">
                    <Cpu size={16} className="text-blue-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest">{t('gameOptions:runnerBridge')}</span>
                    {runnerVersion && (
                      <span className={cn(
                        "ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full border",
                        theme === 'dark'
                          ? selectedGame?.runner === 'Wine-Lutris'
                            ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
                            : "text-white/40 bg-white/5 border-white/10"
                          : selectedGame?.runner === 'Wine-Lutris'
                            ? "text-yellow-600 bg-yellow-100 border-yellow-300"
                            : "text-gray-600 bg-gray-100 border-gray-200"
                      )}>
                        {selectedGame?.runner} · {runnerVersion}
                      </span>
                    )}
                  </div>

                  {/* Runner installati — selezionabili immediatamente */}
                  {/* Runner installati — switch per-gioco persistente.
                      Selezionare un runner lo attiva per questo gioco e
                      lo persiste nel DB. Deselezionare (premere di nuovo
                      lo switch attivo) riporta al runner di default
                      (Wine-Lutris) mantenendo tutta la configurazione
                      (winetricksVerbs, compat profile, prefix) invariata.
                      v0.99.35 — redesign da pulsanti a switch per
                      chiarire visivamente stato attivo/non attivo. */}
                  {availableRunners.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {(() => {
                        // v1.0.0 — fix navigazione: prima Runner Bridge,
                        // Compatibility Layer/Core ed Executable Path si
                        // affidavano solo allo scoring geometrico per
                        // passare da una sezione all'altra — con Wine-Lutris
                        // mai mostrato come switch (è il default implicito),
                        // la sezione Runner Bridge può risultare visivamente
                        // vuota per giochi che non hanno altri runner
                        // installati, sfasando lo scoring in modo diverso a
                        // seconda della direzione di navigazione. Calcoliamo
                        // qui l'elenco reale (senza il default nascosto) per
                        // sapere con certezza qual è l'ULTIMO elemento e
                        // agganciarlo esplicitamente a ciò che segue.
                        const nonDefaultRunners = availableRunners.filter((r: any) => (r.id || r) !== 'Wine-Lutris');
                        // v1.5.20-dev.27 — richiesta utente, causa diretta
                        // del bug reale appena diagnosticato (dev.26/27):
                        // il blocco precedente permetteva comunque di
                        // scegliere QUALUNQUE build Proton diversa da
                        // quella del launcher condiviso (vietava solo
                        // Wine) — l'overlay mostrava una scelta che il
                        // lancio reale ignorava silenziosamente (dev.23),
                        // fonte diretta di confusione. Quando il gioco
                        // eredita il runner dal launcher condiviso, le
                        // alternative vanno NASCOSTE, non solo disattivate
                        // — mostriamo solo la build realmente in uso,
                        // letta dalla riga `games` del launcher stesso
                        // (già caricata in `games`, nessuna chiamata in
                        // più) — stessa fonte di verità usata dal backend.
                        // v2.0.41-dev.22 — richiesta utente, stesso
                        // identico principio applicato poco sotto per
                        // Umu-launcher/Bypass store: un gioco NATIVO di
                        // un launcher condiviso (nessun requiresLauncher
                        // per design) restava sempre "non bloccato" qui,
                        // mostrando Runner Bridge come una scelta libera
                        // anche se il lancio reale (gameManager.ts,
                        // effectiveSharedLauncherId, dev.19) la ignora
                        // comunque — fonte di confusione anche se non di
                        // un lancio davvero sbagliato (il backend eredita
                        // sempre, indipendentemente da cosa mostra qui
                        // l'overlay).
                        // v2.0.41-dev.44 — BUG UTENTE: la card del
                        // launcher condiviso stesso (Ubisoft Connect, EA
                        // App) risultava bloccata su runner/layer di
                        // compatibilità come se "ereditasse" da sé stessa
                        // — il fallback sotto trova un match quando
                        // selectedGame.store combacia con lo storeId del
                        // launcher, ma quando selectedGame È quel
                        // launcher, sta trovando sé stesso, non una vera
                        // dipendenza. Stesso principio già applicato
                        // qualche riga più sotto (blocco Layer di
                        // compatibilità, isThisGameASharedLauncher) per
                        // nascondere lo switch "Launcher condiviso" —
                        // qui mancava del tutto.
                        const isThisGameASharedLauncher = sharedLaunchers.some(
                          (sl: any) => selectedGame?.id === `${sl.id}-launcher`
                        );
                        const effectiveSharedLauncherId = isThisGameASharedLauncher ? undefined : (localGameConfig.requiresLauncher
                          || sharedLaunchers.find((sl: any) => sl.storeId === selectedGame?.store)?.id);
                        const lockedToSharedLauncher = !!effectiveSharedLauncherId;
                        const inheritedRunnerId = lockedToSharedLauncher
                          ? games.find(g => g.id === `${effectiveSharedLauncherId}-launcher`)?.runner
                          : undefined;
                        // Ripiego difensivo: se per qualche motivo la riga
                        // del launcher non è ancora nota, non nascondere
                        // tutto (sezione vuota, sembrerebbe un bug) — resta
                        // sull'elenco completo bloccato, meglio visibile
                        // che silenzioso.
                        const visibleRunners = (lockedToSharedLauncher && inheritedRunnerId)
                          ? nonDefaultRunners.filter((r: any) => (r.id || r) === inheritedRunnerId)
                          : nonDefaultRunners;
                        return visibleRunners.map((r: any, idx: number) => {
                        const runnerId    = r.id || r;
                        // v1.5.20-dev.32 — BUG REALE segnalato dall'utente:
                        // era `lockedToSharedLauncher ? true : ...` — quindi
                        // OGNI tile veniva segnato come attivo quando
                        // bloccato, non solo quello giusto. Innocuo quando
                        // `visibleRunners` contiene un solo elemento (il
                        // caso normale, filtrato sopra), ma nel ripiego
                        // difensivo (runner ereditato non ancora noto, lista
                        // intera mostrata) risultava in TUTTI gli switch
                        // marcati come selezionati insieme — esattamente il
                        // sintomo osservato nella libreria Epic con Watch
                        // Dogs 2/Assassin's Creed Syndicate. Confronto
                        // esplicito col runner ereditato invece di un
                        // `true` fisso — nessuno risulta selezionato se
                        // davvero sconosciuto, più onesto che marcarli tutti.
                        const isActive    = lockedToSharedLauncher ? (runnerId === inheritedRunnerId) : selectedGame?.runner === runnerId;
                        const isLastRunnerRow = idx === visibleRunners.length - 1;
                        // Step 19d — un gioco legato a un launcher condiviso
                        // (requiresLauncher impostato) gira SEMPRE nel
                        // prefix Proton di quella scatola condivisa — mai
                        // Wine, decisione esplicita dell'utente per il
                        // supporto anticheat. Stesso principio "oscurato e
                        // non selezionabile" già in uso per i tile EAC/
                        // BattlEye quando il runner attivo è incompatibile:
                        // il tile resta visibile (indici/neighbor invariati)
                        // ma non cliccabile.
                        //
                        // v1.5.20-dev.27 — SEMPRE bloccato quando ereditato
                        // (non più solo per Wine): l'unica riga visibile a
                        // questo punto è già quella del launcher condiviso,
                        // cambiarla romperebbe esattamente la coerenza che
                        // questo intero fix vuole garantire.
                        const runnerLocked = lockedToSharedLauncher;
                        return (
                          <Focusable
                            key={runnerId}
                            group="game-options"
                            id={`game-runner-${runnerId}`}
                            // v1.1.2 — lista verticale pura: catena
                            // sequenziale al posto dello scoring geometrico
                            // per la navigazione INTERNA (riga per riga).
                            // Il confine di uscita (ultima riga → sezione
                            // successiva) resta un neighbor esplicito,
                            // invariato — la catena copre solo l'interno.
                            sequentialChain="game-options-runner-bridge"
                            neighbors={isLastRunnerRow ? { down: overlayNavAnchors.firstMiddleId } : undefined}
                            onEnter={async () => {
                              if (runnerLocked) { play('back'); return; }
                              // Toggle: se già attivo → torna a Wine-Lutris (default)
                              // altrimenti → attiva questo runner
                              const newRunner = isActive ? 'Wine-Lutris' : runnerId;
                              setGames(prev => prev.map(g =>
                                g.id === selectedGame!.id ? { ...g, runner: newRunner as any } : g
                              ));
                              if (!isActive) setRunnerVersion(r.version ?? runnerId);
                              else setRunnerVersion('');
                              await fetch(`/api/games/${selectedGame!.id}/config`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ runner: newRunner }),
                              });
                              play('select');
                            }}
                          >
                            {(isFocused) => (
                              <div className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all border",
                                isFocused
                                  ? "border-blue-400 bg-blue-500/10"
                                  : theme === 'dark'
                                    ? "border-white/10 bg-white/5"
                                    : "border-gray-200 bg-gray-50",
                                runnerLocked && "opacity-50"
                              )}>
                                {/* Info runner */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-black uppercase tracking-widest truncate">
                                    {runnerId}
                                  </p>
                                  {r.version && r.version !== runnerId && (
                                    <p className="text-[9px] font-mono opacity-40 mt-0.5">v{r.version}</p>
                                  )}
                                  {/* v1.5.20-dev.27 — richiesta utente: spiega
                                      SEMPRE il perché, non lasciare l'utente
                                      a chiedersi perché non può scegliere. */}
                                  {lockedToSharedLauncher && (
                                    <p className="text-[9px] font-mono opacity-40 mt-0.5">
                                      {t('gameOptions:runnerInheritedFromLauncher')}
                                    </p>
                                  )}
                                </div>
                                {/* Badge "attivo" quando è il runner corrente */}
                                {isActive && (
                                  <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 shrink-0">
                                    {t('gameOptions:active')}
                                  </span>
                                )}
                                {/* Switch */}
                                <div className={cn(
                                  "w-10 h-5 rounded-full transition-all relative shrink-0",
                                  isActive
                                    ? "bg-blue-500"
                                    : theme === 'dark' ? "bg-white/10" : "bg-gray-300"
                                )}>
                                  <div className={cn(
                                    "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
                                    isActive ? "left-[22px]" : "left-0.5"
                                  )} />
                                </div>
                              </div>
                            )}
                          </Focusable>
                        );
                        });
                      })()}
                    </div>
                  )}

                  {/* v0.99.35 — sezione "Runner installabili" rimossa da qui:
                      duplicava esattamente la stessa funzione già presente
                      nella tab Sistema → Runner. L'overlay del gioco mostra
                      ora solo i runner GIÀ installati (selezione per-gioco,
                      blocco sopra) — per installarne uno nuovo si usa la
                      tab Sistema, unica fonte per quell'azione. */}

                  {availableRunners.length === 0 && (
                    <p className="text-xs opacity-40 italic">Nessun runner trovato. Apri System → Runner per installarne uno.</p>
                  )}
                </div>
                )}

                {/* Sezione adattiva: RetroArch per ROM, Compat Layer per altri, niente per DOS/ScummVM */}
                {selectedGame.runner === 'RetroArch' ? (
                  <div className={cn("p-5 rounded-2xl", theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200")}>
                    <div className="flex items-center gap-3 mb-4">
                      <Activity size={16} className="text-blue-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{t('gameOptions:retroarchCore')}</span>
                      {retroarchAvailable === false && (
                        <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-red-400">{t('gameOptions:notInstalledStatus')}</span>
                      )}
                      {retroarchAvailable === true && (
                        <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-green-400">{t('gameOptions:available')}</span>
                      )}
                    </div>
                    {retroarchAvailable === false ? (
                      <div className="space-y-3">
                        <p className="text-xs opacity-60 leading-relaxed">{t('gameOptions:retroarchNotInstalledDesc')}</p>
                        <code className={cn("block text-[10px] font-mono p-3 rounded-xl text-green-400", theme === 'dark' ? "bg-black/40 border border-white/5" : "bg-gray-800 border border-gray-600")}>
                          sudo pacman -S retroarch
                        </code>
                      </div>
                    ) : retroarchCores.length > 0 ? (
                      // v1.0.0 — da chip selezionabili a switch persistenti,
                      // stesso linguaggio visivo di "Runner Bridge": ogni
                      // core compatibile con QUESTO sistema (già filtrato
                      // dal backend, vedi effetto che popola retroarchCores)
                      // ha il proprio switch. Il core di DEFAULT del
                      // sistema non mostra uno switch — esattamente come
                      // Wine-Lutris in Runner Bridge — è sempre disponibile
                      // e viene ripristinato automaticamente disattivando
                      // un altro core. Attivarne uno nuovo disattiva
                      // implicitamente l'eventuale altro già attivo (un
                      // solo core alla volta, ovviamente).
                      <div className="space-y-2">
                        {retroarchCores.map((core) => {
                          const isDefault = core.name === retroarchDefaultCore;
                          if (isDefault) return null;
                          const isActive = selectedGame.libretroCore
                            ? selectedGame.libretroCore.split('/').pop()?.replace('_libretro.so', '') === core.name
                            : false;
                          // v1.0.0 — collega esplicitamente il primo core
                          // non-default a Runner Bridge (sopra) e l'ultimo
                          // a Executable Path (sotto) — stesso principio
                          // già usato per Compatibility Layer, vedi
                          // overlayNavAnchors.
                          const nonDefaultCores = retroarchCores.filter(c => c.name !== retroarchDefaultCore);
                          const isFirstNonDefault = core.name === nonDefaultCores[0]?.name;
                          const isLastNonDefault  = core.name === nonDefaultCores[nonDefaultCores.length - 1]?.name;
                          const coreNeighbors: { up?: string; down?: string } = {};
                          if (isFirstNonDefault) coreNeighbors.up = overlayNavAnchors.lastRunnerBridgeId;
                          if (isLastNonDefault) coreNeighbors.down = 'field-executablePath';
                          return (
                            <Focusable
                              key={core.path}
                              group="game-options"
                              id={`core-${core.name}`}
                              // v1.1.2 — stessa migrazione di Runner Bridge:
                              // lista verticale pura, catena sequenziale
                              // per la navigazione interna. I confini
                              // (primo → Runner Bridge, ultimo →
                              // Executable Path) restano neighbor
                              // espliciti, invariati.
                              sequentialChain="game-options-retroarch-cores"
                              neighbors={coreNeighbors}
                              onEnter={async () => {
                                // Toggle: se già attivo → torna al core di
                                // default del sistema, altrimenti → attiva
                                // questo core (sovrascrive un'eventuale
                                // altro override già attivo).
                                const newCore = isActive ? retroarchDefaultCore : core.name;
                                const newCorePath = isActive
                                  ? (retroarchCores.find(c => c.name === retroarchDefaultCore)?.path ?? core.path)
                                  : core.path;
                                const res = await fetch(`/api/games/${selectedGame.id}/retroarch`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ libretroCore: isActive ? retroarchDefaultCore + '_libretro.so' : core.path })
                                });
                                if (res.ok) {
                                  setGames(prev => prev.map(g =>
                                    g.id === selectedGame.id
                                      ? { ...g, libretroCore: isActive ? retroarchDefaultCore + '_libretro.so' : core.path }
                                      : g
                                  ));
                                }
                                play('select');
                              }}
                            >
                              {(isFocused) => (
                                <div className={cn(
                                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all border",
                                  isFocused
                                    ? "border-blue-400 bg-blue-500/10"
                                    : theme === 'dark'
                                      ? "border-white/10 bg-white/5"
                                      : "border-gray-200 bg-gray-50"
                                )}>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-black uppercase tracking-widest truncate">{core.name}</p>
                                  </div>
                                  {isActive && (
                                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 shrink-0">{t('gameOptions:active')}</span>
                                  )}
                                  <div className={cn(
                                    "w-10 h-5 rounded-full transition-all relative shrink-0",
                                    isActive ? "bg-blue-500" : theme === 'dark' ? "bg-white/10" : "bg-gray-300"
                                  )}>
                                    <div className={cn(
                                      "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all",
                                      isActive ? "left-[22px]" : "left-0.5"
                                    )} />
                                  </div>
                                </div>
                              )}
                            </Focusable>
                          );
                        })}
                        {retroarchDefaultCore && (
                          <p className="text-[9px] font-mono opacity-30 pt-1">
                            {t('gameOptions:defaultForSystem', { name: retroarchDefaultCore })}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs opacity-60">{t('gameOptions:noCoreCompatible')}</p>
                    )}
                  </div>
                ) : selectedGame.store !== 'Classic Console' ? (
                  <div className={cn("p-5 rounded-2xl", theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200")}>
                    <div className="flex items-center gap-3 mb-4">
                      <Activity size={16} className="text-blue-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{t('gameOptions:compatibilityLayer')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {(() => {
                        // v1.5.20-dev.28 — richiesta utente, due filtri
                        // distinti applicati alla STESSA griglia:
                        //
                        // (1) "Launcher condiviso" nascosto sulla card del
                        // launcher stesso — un launcher non può dipendere
                        // da sé stesso, mostrarlo lì non serve a nulla e
                        // può confondere. Riconosciuto per convenzione
                        // d'id (`${launcherId}-launcher`, stessa già usata
                        // ovunque nel backend, non un flag nuovo).
                        const isThisGameASharedLauncher = sharedLaunchers.some(
                          (sl: any) => selectedGame?.id === `${sl.id}-launcher`
                        );
                        // (2) "Umu-launcher" bloccato (mai nascosto — a
                        // differenza del Runner Bridge, qui c'è comunque
                        // un valore reale da mostrare, non solo scelte
                        // alternative prive di senso) quando il gioco
                        // dipende da un launcher condiviso — stessa
                        // filosofia già applicata al Runner Bridge in
                        // dev.27: mai offrire una scelta indipendente che
                        // il lancio reale potrebbe ignorare o, nel
                        // percorso di riserva mai completamente
                        // verificato, generare una combinazione non
                        // testata (due container Steam Linux Runtime
                        // potenzialmente distinti sulla stessa prefix).
                        //
                        // v2.0.41-dev.22 — richiesta utente, bug reale
                        // confermato su hardware reale (Dead Space 2/EA
                        // App, gioco NATIVO di un launcher condiviso —
                        // nessun requiresLauncher per design, stesso
                        // principio già generalizzato lato backend in
                        // gameManager.ts con effectiveSharedLauncherId,
                        // dev.19, mai arrivato qui). Senza questa riga,
                        // "bloccato all'eredità" restava sempre falso per
                        // un gioco nativo — Runner/Umu-launcher
                        // apparivano come scelte libere anche se in
                        // pratica venivano comunque ignorate dal lancio
                        // reale (che eredita sempre, backend dev.19).
                        // sharedLaunchers arriva già con storeId per
                        // ogni voce (server.ts, stesso giro di modifiche).
                        const effectiveSharedLauncherId = isThisGameASharedLauncher ? undefined : (localGameConfig.requiresLauncher
                          || sharedLaunchers.find((sl: any) => sl.storeId === selectedGame?.store)?.id);
                        const lockedToSharedLauncherForUmu = !!effectiveSharedLauncherId;
                        // v1.5.20-dev.32 — richiesta esplicita dell'utente,
                        // switch per singolo gioco (mai un automatismo
                        // generalizzato — comportamento non standardizzato
                        // fra launcher condivisi diversi, verificato solo
                        // per Ubisoft Connect+Epic finora).
                        //
                        // v2.0.41-dev.22 — richiesta utente, bug reale:
                        // il vincolo store==='Epic Games' impediva del
                        // tutto a un gioco NATIVO di un launcher (es. Dead
                        // Space 2/EA App) di mostrare questo switch — ma
                        // l'effetto pratico più importante di
                        // bypassStoreAuthChain (forceFullContainerLaunch
                        // in gameManager.ts: salta il pre-avvio anticipato
                        // del launcher condiviso) è utile per QUALUNQUE
                        // gioco che si trascina dietro il proprio launcher
                        // come processo figlio, non solo per uno Epic —
                        // anzi, per un gioco nativo è esattamente questo
                        // il problema osservato (il nostro pre-avvio
                        // confligge con quello del gioco stesso,
                        // risultando in due istanze del launcher). Il
                        // "salta legendary" resta un effetto SECONDARIO,
                        // rilevante solo se store è davvero Epic — non
                        // più una condizione per mostrare il tile.
                        const showBypassStoreAuthChain = lockedToSharedLauncherForUmu;

                        return ([
                        { key: 'fsr',      label: 'AMD FSR',       desc: 'WINE_FULLSCREEN_FSR=1', sysKey: 'fsr'      },
                        { key: 'gameMode', label: 'GameMode',      desc: 'gamemoderun wrapper',   sysKey: 'gamemode' },
                        { key: 'mangohud', label: 'MangoHud',      desc: 'overlay FPS/GPU',       sysKey: 'mangohud' },
                        { key: 'eac',      label: 'EasyAntiCheat', desc: 'EAC runtime',           sysKey: 'eac'      },
                        { key: 'battleye', label: 'BattlEye',      desc: 'BE runtime',            sysKey: 'battleye' },
                        // Step 19d — 6° tile, stessa griglia/dimensione delle
                        // altre 5: riempie lo slot vuoto accanto a BattlEye
                        // (ultima riga, 2ª colonna), sotto EasyAntiCheat.
                        // sysKey vuoto: la disponibilità di questo tile non
                        // dipende da systemTools, è gestita a parte sotto
                        // (available sempre true — le singole opzioni non
                        // ancora costruite sono già escluse da cycleOptions,
                        // non mostrate come tile disabilitato).
                        { key: 'sharedLauncher', label: t('gameOptions:sharedLauncher'), desc: t('gameOptions:sharedLauncherDesc'), sysKey: '' },
                        // v1.5.20-dev.1 — 7° tile, stesso trattamento
                        // semplice booleano di fsr/gameMode (non un ciclo
                        // N-stati come sharedLauncher). sysKey: 'umu' lega
                        // la disponibilità a systemTools.umu, stesso
                        // principio delle altre voci con rilevamento reale.
                        { key: 'umuRun', label: t('gameOptions:umuLauncher'), desc: t('gameOptions:umuLauncherDesc'), sysKey: 'umu' },
                        // v1.5.20-dev.32 — 8° tile, semplice booleano come
                        // fsr/gameMode/umuRun — visibile solo per un gioco
                        // Epic con launcher condiviso attivo (filtrato
                        // sotto), sysKey vuoto (non dipende da systemTools,
                        // stesso principio di sharedLauncher sopra).
                        { key: 'bypassStoreAuthChain', label: t('gameOptions:bypassStoreAuthChain'), desc: t('gameOptions:bypassStoreAuthChainDesc'), sysKey: '' },
                        // v2.0.41-dev.24 — 9° tile, richiesta utente:
                        // stesso trattamento semplice booleano di fsr/
                        // gameMode/mangohud/eac/battleye — sysKey
                        // 'gamescope' lega la disponibilità al
                        // rilevamento reale già esistente
                        // (compatibilityManager.ts, binaryExists),
                        // nessun filtro condizionale necessario (a
                        // differenza di sharedLauncher/
                        // bypassStoreAuthChain sopra, sempre rilevante
                        // per qualunque gioco/runner).
                        { key: 'gamescope', label: 'Gamescope', desc: t('gameOptions:gamescopeDesc'), sysKey: 'gamescope' },
                      ] as const)
                        .filter(({ key }) => !(key === 'sharedLauncher' && isThisGameASharedLauncher))
                        .filter(({ key }) => !(key === 'bypassStoreAuthChain' && !showBypassStoreAuthChain))
                        .map(({ key, label, desc, sysKey }, idx, arr) => {
                        // v1.1.104-dev.1 — mangohud non è più booleano ma
                        // un livello 0/1/2 (spento/compatta/completa).
                        const mangohudLevel = key === 'mangohud' ? (Number((localCompatProfile as any).mangohud) || 0) : 0;
                        // v2.0.41-dev.25 — richiesta utente: stesso
                        // identico meccanismo di mangohudLevel sopra,
                        // esteso a 4 stati invece di 3 (spento | fullscreen
                        // a risoluzione monitor | override 4K | finestra).
                        const gamescopeLevel = key === 'gamescope' ? (Number((localCompatProfile as any).gamescope) || 0) : 0;
                        // v1.5.20-dev.28 — richiesta utente: quando il
                        // gioco dipende da un launcher condiviso, il tile
                        // Umu-launcher mostra lo stato REALE del launcher
                        // (mai una scelta indipendente che il lancio
                        // potrebbe ignorare o, nel percorso di riserva,
                        // generare una combinazione mai verificata — due
                        // container potenzialmente distinti sulla stessa
                        // prefix). Letto da `sharedLaunchers` (già
                        // caricato, esteso lato server per includere
                        // anche questo campo), non un valore indovinato.
                        const inheritedUmuRun = (key === 'umuRun' && lockedToSharedLauncherForUmu)
                          ? sharedLaunchers.find((sl: any) => sl.id === effectiveSharedLauncherId)?.umuRun ?? false
                          : undefined;
                        const enabled   = key === 'mangohud'
                          ? mangohudLevel > 0
                          : key === 'gamescope'
                            ? gamescopeLevel > 0
                            : key === 'sharedLauncher'
                              ? (localGameConfig.requiresLauncher ?? '') !== ''
                              : inheritedUmuRun !== undefined
                                ? inheritedUmuRun
                                : ((localCompatProfile as any)[key] ?? false);
                        // v1.5.3-dev.1 — richiesta utente: EAC/BattlEye
                        // funzionano SOLO col runner Proton, mai con wine
                        // puro (verificato: le variabili
                        // PROTON_EAC_RUNTIME/PROTON_BATTLEYE_RUNTIME le
                        // legge solo lo script di avvio di Proton — limite
                        // reale dell'anti-cheat su Linux, non risolvibile
                        // lato codice). Oscurati (non selezionabili) se il
                        // runner attivo per QUESTO gioco è quello di
                        // default (Wine-Lutris) invece di un runner Proton.
                        // v1.5.20-dev.1 — umu-run richiede sempre una build
                        // Proton come PROTONPATH (vedi ProtonRunner.launch):
                        // stessa restrizione/oscuramento già applicata a
                        // eac/battleye quando il runner attivo è Wine-Lutris.
                        const requiresProton = key === 'eac' || key === 'battleye' || key === 'umuRun';
                        const protonActive = !!selectedGame?.runner && selectedGame.runner !== 'Wine-Lutris';
                        // Step 19d — il tile sharedLauncher non dipende da
                        // systemTools (sysKey vuoto sopra): sempre "available",
                        // le opzioni non ancora costruite sono già filtrate
                        // fuori da cycleOptions, non rappresentate come stato
                        // disabilitato di QUESTO tile.
                        //
                        // v1.5.20-dev.28 — richiesta utente: Umu-launcher
                        // bloccato (riusa lo stesso guardiano `!available`
                        // già in uso poco sotto per ogni altro tile
                        // oscurato, nessun meccanismo nuovo) quando
                        // ereditato da un launcher condiviso — stessa
                        // filosofia già applicata al Runner Bridge
                        // (dev.27): mai una scelta indipendente che il
                        // lancio reale potrebbe ignorare.
                        const available = (key === 'sharedLauncher' || key === 'bypassStoreAuthChain')
                          ? true
                          : key === 'umuRun' && lockedToSharedLauncherForUmu
                            ? false
                            : !!systemTools[sysKey] && (!requiresProton || protonActive);
                        // Step 19d — dati del ciclo N+1 stati (Nessuno + un
                        // launcher per ciascuno già costruito), calcolati qui
                        // solo per key==='sharedLauncher', stesso principio
                        // di mangohudLevel sopra per key==='mangohud'.
                        const sharedLauncherCycleOptions = key === 'sharedLauncher'
                          ? ['', ...sharedLaunchers.filter((l: any) => l.available).map((l: any) => l.id)]
                          : [];
                        const sharedLauncherCurrent = localGameConfig.requiresLauncher ?? '';
                        const sharedLauncherCurrentLabel = sharedLauncherCurrent === ''
                          ? t('gameOptions:sharedLauncherNone')
                          : (sharedLaunchers.find((l: any) => l.id === sharedLauncherCurrent)?.displayName ?? sharedLauncherCurrent);
                        // v1.0.0 — collega esplicitamente il primo elemento
                        // a Runner Bridge (sopra) e l'ultimo a Executable
                        // Path (sotto) — vedi overlayNavAnchors. Griglia a 2
                        // colonne: l'ultima RIGA ha 2 elementi se arr.length
                        // è pari, 1 solo se dispari (v1.5.20-dev.1 — con 7
                        // voci ora l'ultima riga è singola: idx 6 da solo,
                        // non più una coppia come quando le voci erano 6 —
                        // formula generalizzata così non richiede altro
                        // aggiustamento manuale alla prossima voce aggiunta).
                        // TUTTI gli elementi dell'ultima riga vanno agganciati
                        // esplicitamente, non solo l'ultimo dell'array.
                        const itemsInLastRow = arr.length % 2 === 0 ? 2 : 1;
                        const compatNeighbors: { up?: string; down?: string } = {};
                        if (idx === 0) compatNeighbors.up = overlayNavAnchors.lastRunnerBridgeId;
                        if (idx >= arr.length - itemsInLastRow) compatNeighbors.down = 'field-executablePath';
                        // v1.1.104-dev.2 — didascalia dinamica solo per
                        // MangoHud tramite i18next (non stringhe hardcoded).
                        const tileDesc = key === 'mangohud'
                          ? (mangohudLevel === 0 ? t('gameOptions:mangohudOff') : mangohudLevel === 1 ? t('gameOptions:mangohudCompact') : t('gameOptions:mangohudFull'))
                          : key === 'gamescope'
                            ? (gamescopeLevel === 0 ? t('gameOptions:gamescopeOff') : gamescopeLevel === 1 ? t('gameOptions:gamescopeFullscreen') : gamescopeLevel === 2 ? t('gameOptions:gamescope4k') : t('gameOptions:gamescopeWindowed'))
                            : desc;
                        return (
                          <Focusable
                            key={key}
                            group="game-options"
                            id={`compat-${key}`}
                            neighbors={compatNeighbors}
                            onEnter={async () => {
                              // Step 19d — ciclo N+1 stati, percorso separato
                              // dalla logica generica sotto: endpoint diverso
                              // (/config non /compat), nessun concetto di
                              // "oscurato" per questo tile (vedi available
                              // sempre true sopra).
                              if (key === 'sharedLauncher') {
                                const idx2 = sharedLauncherCycleOptions.indexOf(sharedLauncherCurrent);
                                const next2 = sharedLauncherCycleOptions[(idx2 + 1) % sharedLauncherCycleOptions.length];
                                setLocalGameConfig(prev => ({ ...prev, requiresLauncher: next2 }));
                                await fetch(`/api/games/${selectedGame.id}/config`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ requiresLauncher: next2 === '' ? null : next2 }),
                                });
                                play('select');
                                return;
                              }
                              // v1.5.3-dev.1 — richiesta utente: se il
                              // tile è oscurato (non disponibile), non
                              // deve essere selezionabile per davvero, non
                              // solo visivamente attenuato — impedisce sia
                              // il toggle sia il salvataggio.
                              if (!available) { play('back'); return; }
                              // v1.1.104-dev.1 — MangoHud cicla 0→1→2→0 ad
                              // ogni conferma (stesso meccanismo già usato
                              // da cycleDisplayMode). v2.0.41-dev.25 —
                              // Gamescope cicla 0→1→2→3→0, stesso principio,
                              // un passo in più. Le altre voci restano un
                              // semplice toggle booleano.
                              const next = key === 'mangohud'
                                ? ((mangohudLevel + 1) % 3)
                                : key === 'gamescope'
                                  ? ((gamescopeLevel + 1) % 4)
                                  : !enabled;
                              setLocalCompatProfile(prev => ({ ...prev, [key]: next }));
                              const compatRes = await fetch(`/api/games/${selectedGame.id}/compat`);
                              const current = compatRes.ok ? await compatRes.json() : {};
                              await fetch(`/api/games/${selectedGame.id}/compat`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ ...current, [key]: next })
                              });
                              play('select');
                            }}
                          >
                            {(isFocused) => (
                              <button
                                className={cn(
                                  // v1.0.0 — min-h fisso: prima l'altezza di
                                  // ogni riquadro dipendeva dalla lunghezza
                                  // della propria descrizione (desc), righe
                                  // diverse finivano con altezze diverse —
                                  // ora tutti i riquadri hanno la stessa
                                  // dimensione indipendentemente dal testo.
                                  // Griglia a 2 colonne semplice, senza
                                  // stiramento dell'ultima voce se dispari
                                  // (confermato: preferita cosi, con lo
                                  // spazio vuoto accanto — vedi screenshot
                                  // di riferimento). Nuove voci future
                                  // (DXVK, VKD3D, ecc.) si aggiungono
                                  // semplicemente all'array sopra, la
                                  // griglia cresce da sola su righe/colonne
                                  // successive senza altro codice da toccare.
                                  "w-full min-h-[76px] flex items-center justify-between px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border",
                                  enabled
                                    ? "bg-blue-600/20 border-blue-500 text-blue-400"
                                    : isFocused
                                      ? theme === 'dark' ? "bg-white/10 border-white/30" : "bg-gray-200 border-gray-400 text-gray-800"
                                      : theme === 'dark' ? "bg-white/5 border-white/10" : "bg-gray-100 border-gray-200 text-gray-700",
                                  !available && "opacity-50"
                                )}
                              >
                                <div className="flex flex-col items-start gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <span>{label}</span>
                                    {key !== 'sharedLauncher' && (
                                      <span className={cn(
                                        "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border",
                                        available
                                          ? "text-green-400 bg-green-400/10 border-green-400/20"
                                          : "text-red-400 bg-red-400/10 border-red-400/20"
                                      )}>
                                        {available ? '✓' : '✗'}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[8px] font-mono opacity-30 normal-case">{tileDesc}</span>
                                </div>
                                {key === 'mangohud' ? (
                                  // v1.1.104-dev.1 — cursore a 3 posizioni:
                                  // sx spento, centro compatta, dx completa.
                                  <div className={cn("w-10 h-4 rounded-full transition-all relative shrink-0", mangohudLevel > 0 ? "bg-blue-500" : theme === 'dark' ? "bg-white/20" : "bg-gray-300")}>
                                    <div className={cn(
                                      "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                                      mangohudLevel === 0 ? "left-0.5" : mangohudLevel === 1 ? "left-[14px]" : "left-[26px]"
                                    )} />
                                  </div>
                                ) : key === 'gamescope' ? (
                                  // v2.0.41-dev.25 — stesso identico cursore
                                  // di mangohud sopra, un passo in più (4
                                  // posizioni invece di 3) — pillola più
                                  // larga per fare spazio al quarto stato.
                                  <div className={cn("w-14 h-4 rounded-full transition-all relative shrink-0", gamescopeLevel > 0 ? "bg-blue-500" : theme === 'dark' ? "bg-white/20" : "bg-gray-300")}>
                                    <div className={cn(
                                      "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                                      gamescopeLevel === 0 ? "left-0.5" : gamescopeLevel === 1 ? "left-[13px]" : gamescopeLevel === 2 ? "left-[25px]" : "left-[37px]"
                                    )} />
                                  </div>
                                ) : key === 'sharedLauncher' ? (
                                  // Step 19d — selettore a N stati (Nessuno +
                                  // un launcher per ciascuno costruito), non
                                  // un semplice on/off: chevron al posto del
                                  // pill, stesso principio del vecchio widget
                                  // standalone (ora fuso in questa griglia).
                                  <div className="flex items-center gap-1 shrink-0">
                                    <ChevronLeft size={11} className="opacity-30" />
                                    <span className="text-blue-300 normal-case font-bold text-[9px] max-w-[70px] truncate">{sharedLauncherCurrentLabel}</span>
                                    <ChevronRight size={11} className="opacity-30" />
                                  </div>
                                ) : (
                                  <div className={cn("w-8 h-4 rounded-full transition-all relative shrink-0", enabled ? "bg-blue-500" : theme === 'dark' ? "bg-white/20" : "bg-gray-300")}>
                                    <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all", enabled ? "left-4" : "left-0.5")} />
                                  </div>
                                )}
                              </button>
                            )}
                          </Focusable>
                        );
                      })})()}
                    </div>
                  </div>
                ) : (
                  <div className={cn("p-5 rounded-2xl", theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200")}>
                    <p className="text-xs opacity-40 italic">{t('gameOptions:noAdditionalCompatOptions')}</p>
                  </div>
                )}

                {/* Step 4 — Game Config completo */}
                <div className={cn("p-5 rounded-2xl", theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200")}>
                  <div className="flex items-center gap-3 mb-5">
                    <Monitor size={16} className="text-blue-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Game Config</span>
                  </div>
                  <div className="space-y-3">
                    <label className="block">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Executable Path</span>
                        {localGameConfig.executablePath && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-green-400 bg-green-400/10 border border-green-400/20 px-1.5 py-0.5 rounded-full">
                            {t('gameOptions:configured')}
                          </span>
                        )}
                        {!localGameConfig.executablePath && (selectedGame.store === 'Epic Games' || selectedGame.store === 'GOG Galaxy') && selectedGame.isInstalled && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-0.5 rounded-full">
                            {t('gameOptions:requiredToLaunch')}
                          </span>
                        )}
                      </div>
                      <Focusable
                        group="game-options"
                        id="field-executablePath"
                        neighbors={{ up: overlayNavAnchors.lastMiddleId ?? overlayNavAnchors.lastRunnerBridgeId }}
                        onEnter={() => openKeyboardForField(
                          'field-executablePath',
                          'Executable Path',
                          localGameConfig.executablePath ?? '',
                          async (val) => {
                            setLocalGameConfig(prev => ({ ...prev, executablePath: val }));
                            await fetch(`/api/games/${selectedGame.id}/config`, {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ executablePath: val || null })
                            });
                            setGames(prev => prev.map(g => g.id === selectedGame.id ? { ...g, executablePath: val || undefined } : g));
                          }
                        )}
                      >
                        {(isFocused) => (
                          <input
                            ref={executablePathRef}
                            type="text"
                            readOnly
                            value={localGameConfig.executablePath ?? ''}
                            placeholder="/home/archdaniel/Games/Epic/.../Game.exe"
                            className={cn(
                              "w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none transition-colors cursor-pointer",
                              theme === 'dark' ? "bg-black/40" : "bg-white",
                              isFocused
                                ? "border-2 border-blue-500"
                                : localGameConfig.executablePath
                                  ? "border border-green-500/40"
                                  : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                            )}
                          />
                        )}
                      </Focusable>
                    </label>
                    {/* v0.99.38 — campo mancante: il dato (launchArgs) esiste
                        già nel DB ed è già letto al lancio
                        (gameManager.ts/shellSplitArgs), ma non aveva mai
                        avuto un input nell'overlay — solo raggiungibile via
                        PATCH diretto all'API. Stesso pattern di
                        Executable Path sopra. */}
                    <label className="block">
                      {/* Step 19a (v1.1.77) — FIX: il pulsante "Filtro CRT"
                          qui scriveva --appendconfig=<preset .cfg
                          bundled>, che test dal vivo hanno confermato
                          essere del tutto ignorato da RetroArch (causa non
                          ancora capita). Rimosso — la stessa scorciatoia
                          ora vive fra i suggerimenti Shift della tastiera
                          virtuale per questo campo (RETROARCH_LAUNCH_ARG_
                          SUGGESTIONS), con --set-shader al posto di
                          --appendconfig=: quello risulta funzionare
                          davvero. Il file .cfg bundled resta nel progetto
                          per quando si capirà perché la configurazione
                          custom viene ignorata. */}
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">Launch Arguments</span>
                      <Focusable
                        group="game-options"
                        id="field-launchArgs"
                        onEnter={() => openKeyboardForField(
                          'field-launchArgs',
                          'Launch Arguments',
                          localGameConfig.launchArgs ?? '',
                          async (val) => {
                            setLocalGameConfig(prev => ({ ...prev, launchArgs: val }));
                            await fetch(`/api/games/${selectedGame.id}/config`, {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ launchArgs: val || null })
                            });
                            setGames(prev => prev.map(g => g.id === selectedGame.id ? { ...g, launchArgs: val || undefined } : g));
                          }
                        )}
                      >
                        {(isFocused) => (
                          <input
                            type="text"
                            readOnly
                            value={localGameConfig.launchArgs ?? ''}
                            placeholder="-dx9 -windowed"
                            className={cn(
                              "w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none transition-colors cursor-pointer",
                              theme === 'dark' ? "bg-black/40" : "bg-white",
                              isFocused
                                ? "border-2 border-blue-500"
                                : localGameConfig.launchArgs
                                  ? "border border-green-500/40"
                                  : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                            )}
                          />
                        )}
                      </Focusable>
                    </label>
                    <label className="block">
                      {/* Richiesta utente — nato per i ROM MAME con nome
                          file poco significativo (es. "gngt.zip", mai
                          riconoscibile per lo scraping IGDB/SGDB), ma
                          disponibile per qualunque gioco: non cambia il
                          titolo mostrato in libreria, solo la query usata
                          per cercare cover/rating/generi. Al salvataggio,
                          il backend fa da solo un rifetch immediato per
                          questo gioco (non aspetta la prossima sync
                          automatica) — vedi gameManager.updateGameConfig,
                          ramo 'scrapeTitle' in config. */}
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">{t('gameOptions:scrapeTitleLabel')}</span>
                      <Focusable
                        group="game-options"
                        id="field-scrapeTitle"
                        onEnter={() => openKeyboardForField(
                          'field-scrapeTitle',
                          t('gameOptions:scrapeTitleLabel'),
                          localGameConfig.scrapeTitle ?? '',
                          async (val) => {
                            setLocalGameConfig(prev => ({ ...prev, scrapeTitle: val }));
                            await fetch(`/api/games/${selectedGame.id}/config`, {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ scrapeTitle: val || null })
                            });
                            setGames(prev => prev.map(g => g.id === selectedGame.id ? { ...g, scrapeTitle: val || undefined } : g));
                          }
                        )}
                      >
                        {(isFocused) => (
                          <input
                            type="text"
                            readOnly
                            value={localGameConfig.scrapeTitle ?? ''}
                            placeholder={t('gameOptions:scrapeTitlePlaceholder')}
                            className={cn(
                              "w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none transition-colors cursor-pointer",
                              theme === 'dark' ? "bg-black/40" : "bg-white",
                              isFocused
                                ? "border-2 border-blue-500"
                                : localGameConfig.scrapeTitle
                                  ? "border border-green-500/40"
                                  : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                            )}
                          />
                        )}
                      </Focusable>
                    </label>
                    <label className="block">
                      {/* Step 19a (v1.1.73) — richiesta dall'utente: prima
                          questo campo era sempre "Steam App ID", anche per
                          giochi non-Steam dove non significa nulla (mai
                          usato, mai valorizzato). Reso contestuale: per
                          Steam resta esattamente come prima (modificabile,
                          apre la tastiera virtuale); per tutti gli altri
                          store diventa un campo di sola lettura con l'id
                          interno della Dashboard — lo stesso che va dopo
                          "xlaunch://" per testare un lancio esterno, prima
                          impossibile da vedere senza aprire il database o
                          i log a mano. */}
                      {selectedGame.store === 'Steam' ? (
                        <>
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">Steam App ID</span>
                          <Focusable
                            group="game-options"
                            id="field-steamAppId"
                            onEnter={() => openKeyboardForField(
                              'field-steamAppId',
                              'Steam App ID',
                              localGameConfig.steamAppId ?? '',
                              async (val) => {
                                setLocalGameConfig(prev => ({ ...prev, steamAppId: val }));
                                await fetch(`/api/games/${selectedGame.id}/config`, {
                                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ steamAppId: val || null })
                                });
                                setGames(prev => prev.map(g => g.id === selectedGame.id ? { ...g, steamAppId: val || undefined } : g));
                              }
                            )}
                          >
                            {(isFocused) => (
                              <input
                                type="text"
                                readOnly
                                value={localGameConfig.steamAppId ?? ''}
                                placeholder="es. 292030"
                                className={cn(
                                  "w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none cursor-pointer",
                                  theme === 'dark' ? "bg-black/40" : "bg-white",
                                  isFocused ? "border-2 border-blue-500" : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                                )}
                              />
                            )}
                          </Focusable>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">xlaunch:// App ID</span>
                          <Focusable
                            group="game-options"
                            id="field-steamAppId"
                            // v1.1.109-dev.2 — bug reale segnalato
                            // dall'utente: scendendo dall'alto lo scoring
                            // geometrico saltava del tutto lo switch
                            // "Dipendenze Wine" sotto, atterrando
                            // direttamente sulla prima checkbox — questo
                            // campo era l'ultimo prima del widget
                            // Winetricks per GOG/Epic (unico caso in cui
                            // quel widget esiste), quindi era il punto
                            // giusto per un collegamento esplicito.
                            //
                            // v2.0.41-dev.43 — BUG UTENTE: con l'aggiunta
                            // del campo "Detected Window (Splash)" subito
                            // sotto (dev.40), questo collegamento saltava
                            // ANCHE quello, andando dritto a
                            // wine-deps-expand-toggle — stesso identico
                            // problema del 2025, stavolta causato da un
                            // campo nuovo inserito fra i due invece che da
                            // uno scroll. Corretto puntando al nuovo campo
                            // invece di scavalcarlo.
                            neighbors={{ down: 'field-windowClass' }}
                            onEnter={() => {
                              // Nessuna tastiera virtuale: non è un campo
                              // modificabile, è l'id reale del gioco —
                              // l'unica azione sensata su Invio è copiarlo,
                              // per incollarlo altrove (es. un link
                              // xlaunch://<id> da testare).
                              navigator.clipboard?.writeText(selectedGame.id).catch(() => {});
                              play('select');
                            }}
                          >
                            {(isFocused) => (
                              <input
                                type="text"
                                readOnly
                                value={selectedGame.id}
                                title={t('gameOptions:pressEnterToCopy')}
                                className={cn(
                                  "w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none cursor-pointer select-all",
                                  theme === 'dark' ? "bg-black/40 text-white/70" : "bg-white text-gray-600",
                                  isFocused ? "border-2 border-blue-500" : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                                )}
                              />
                            )}
                          </Focusable>
                        </>
                      )}
                    </label>
                    {/* v2.0.41-dev.40 — richiesta utente: override
                        manuale del window_class rilevato automaticamente
                        dalla splash di lancio (windowDetector.ts). Stesso
                        modello di scrapeTitle sopra — valore vuoto =
                        cancella, torna al rilevamento automatico dal
                        prossimo lancio (stesso comportamento già seguito
                        da tutti gli altri campi di questa sezione:
                        `val || null`). Applicabile a qualunque gioco,
                        indipendentemente dallo store — a differenza del
                        campo xlaunch:// sopra, non innestato nel suo
                        ternario Steam/altri. */}
                    <label className="block">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">{t('gameOptions:windowClassLabel')}</span>
                      <Focusable
                        group="game-options"
                        id="field-windowClass"
                        // v2.0.41-dev.43 — richiesta utente: completa la
                        // catena di navigazione in entrambe le direzioni,
                        // vedi commento esteso sopra field-steamAppId.
                        // "up" punta allo stesso id sia per il ramo Steam
                        // sia per quello xlaunch:// (entrambi usano
                        // "field-steamAppId" come identificativo, solo
                        // comportamento diverso) — funziona per qualunque
                        // store senza bisogno di un ternario qui.
                        neighbors={{ up: 'field-steamAppId', down: 'wine-deps-expand-toggle' }}
                        onEnter={() => openKeyboardForField(
                          'field-windowClass',
                          t('gameOptions:windowClassLabel'),
                          localGameConfig.windowClass ?? '',
                          async (val) => {
                            setLocalGameConfig(prev => ({ ...prev, windowClass: val }));
                            await fetch(`/api/games/${selectedGame.id}/config`, {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ windowClass: val || null })
                            });
                            setGames(prev => prev.map(g => g.id === selectedGame.id ? { ...g, windowClass: val || undefined } : g));
                          }
                        )}
                      >
                        {(isFocused) => (
                          <input
                            type="text"
                            readOnly
                            value={localGameConfig.windowClass ?? ''}
                            placeholder={t('gameOptions:windowClassPlaceholder')}
                            className={cn(
                              "w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none transition-colors cursor-pointer",
                              theme === 'dark' ? "bg-black/40" : "bg-white",
                              isFocused
                                ? "border-2 border-blue-500"
                                : localGameConfig.windowClass
                                  ? "border border-green-500/40"
                                  : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                            )}
                          />
                        )}
                      </Focusable>
                      <p className="text-[10px] opacity-40 mt-1">{t('gameOptions:windowClassHint')}</p>
                    </label>
                    {selectedGame.runner === 'DOSBox' && (
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">DOSBox Config (.conf)</span>
                        <Focusable
                          group="game-options"
                          id="field-dosboxConf"
                          onEnter={() => openKeyboardForField(
                            'field-dosboxConf',
                            'DOSBox Config (.conf)',
                            localGameConfig.dosboxConf ?? '',
                            async (val) => {
                              setLocalGameConfig(prev => ({ ...prev, dosboxConf: val }));
                              await fetch(`/api/games/${selectedGame.id}/config`, {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ dosboxConf: val || null })
                              });
                              setGames(prev => prev.map(g => g.id === selectedGame.id ? { ...g, dosboxConf: val || undefined } : g));
                            }
                          )}
                        >
                          {(isFocused) => (
                            <input
                              type="text"
                              readOnly
                              value={localGameConfig.dosboxConf ?? ''}
                              placeholder="/path/to/game.conf"
                              className={cn(
                                "w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none cursor-pointer",
                                theme === 'dark' ? "bg-black/40" : "bg-white",
                                isFocused ? "border-2 border-blue-500" : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                              )}
                            />
                          )}
                        </Focusable>
                      </label>
                    )}
                    {selectedGame.runner === 'ScummVM' && (
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">ScummVM Game ID</span>
                        <Focusable
                          group="game-options"
                          id="field-scummvmId"
                          onEnter={() => openKeyboardForField(
                            'field-scummvmId',
                            'ScummVM Game ID',
                            localGameConfig.scummvmId ?? '',
                            async (val) => {
                              setLocalGameConfig(prev => ({ ...prev, scummvmId: val }));
                              await fetch(`/api/games/${selectedGame.id}/config`, {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ scummvmId: val || null })
                              });
                              setGames(prev => prev.map(g => g.id === selectedGame.id ? { ...g, scummvmId: val || undefined } : g));
                            }
                          )}
                        >
                          {(isFocused) => (
                            <input
                              type="text"
                              readOnly
                              value={localGameConfig.scummvmId ?? ''}
                              placeholder="es. monkey, loom, tentacle"
                              className={cn(
                                "w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none cursor-pointer",
                                theme === 'dark' ? "bg-black/40" : "bg-white",
                                isFocused ? "border-2 border-blue-500" : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                              )}
                            />
                          )}
                        </Focusable>
                      </label>
                    )}
                    {selectedGame.runner === 'RetroArch' && (
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">{t('gameOptions:libretroCorePathManual')}</span>
                        <Focusable
                          group="game-options"
                          id="field-libretroCore"
                          onEnter={() => openKeyboardForField(
                            'field-libretroCore',
                            'Libretro Core Path',
                            localGameConfig.libretroCore ?? '',
                            async (val) => {
                              setLocalGameConfig(prev => ({ ...prev, libretroCore: val }));
                              await fetch(`/api/games/${selectedGame.id}/retroarch`, {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ libretroCore: val || null })
                              });
                              setGames(prev => prev.map(g => g.id === selectedGame.id ? { ...g, libretroCore: val || undefined } : g));
                            }
                          )}
                        >
                          {(isFocused) => (
                            <input
                              type="text"
                              readOnly
                              value={localGameConfig.libretroCore ?? ''}
                              placeholder="~/.config/retroarch/cores/snes9x_libretro.so"
                              className={cn(
                                "w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none cursor-pointer",
                                theme === 'dark' ? "bg-black/40" : "bg-white",
                                isFocused ? "border-2 border-blue-500" : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                              )}
                            />
                          )}
                        </Focusable>
                      </label>
                    )}
                    {/* Richiesta utente — "auto-remaster": il core stesso
                        è l'interruttore (verificato passo per passo a
                        mano su hardware reale, primo caso PSX). Generico
                        per qualunque sistema con una voce in
                        REMASTER_HINT_BY_SYSTEM sopra — aggiungere un
                        sistema futuro (N64/Saturn/Dreamcast/PS2) non
                        richiede toccare questo blocco, solo aggiungere
                        una voce lì e in REMASTER_PRESETS lato backend. */}
                    {selectedGame.system && (REMASTER_HINT_BY_SYSTEM[selectedGame.system] || REMASTER_TOGGLE_SYSTEMS.has(selectedGame.system)) && (
                      <label className="block">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-1">
                          {t('gameOptions:remaster', { system: selectedGame.system.toUpperCase() })}
                        </span>
                        <Focusable
                          group="game-options"
                          id="field-remaster"
                          onEnter={async () => {
                            if (remasterToggling) return;
                            const isToggleMode = REMASTER_TOGGLE_SYSTEMS.has(selectedGame.system!);
                            const hint = REMASTER_HINT_BY_SYSTEM[selectedGame.system!];
                            const isEnabled = isToggleMode
                              ? !!selectedGame.remasterEnabled
                              : (localGameConfig.libretroCore ?? '').includes(hint);
                            setRemasterToggling(true);
                            try {
                              const res = await fetch(`/api/games/${selectedGame.id}/remaster`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ enabled: !isEnabled })
                              });
                              const data = await res.json();
                              if (data.success && data.newCore) {
                                setLocalGameConfig(prev => ({ ...prev, libretroCore: data.newCore }));
                                setGames(prev => prev.map(g => g.id === selectedGame.id
                                  ? { ...g, libretroCore: data.newCore, remasterEnabled: isToggleMode ? data.remasterEnabled : g.remasterEnabled }
                                  : g));
                                play('select');
                              }
                            } finally {
                              setRemasterToggling(false);
                            }
                          }}
                        >
                          {(isFocused) => {
                            const isToggleMode = REMASTER_TOGGLE_SYSTEMS.has(selectedGame.system!);
                            const hint = REMASTER_HINT_BY_SYSTEM[selectedGame.system!];
                            const isEnabled = isToggleMode
                              ? !!selectedGame.remasterEnabled
                              : (localGameConfig.libretroCore ?? '').includes(hint);
                            return (
                              <button className={cn(
                                "w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-black italic transition-all",
                                isEnabled ? "bg-purple-600 text-white" : theme === 'dark' ? "bg-black/40" : "bg-white",
                                isFocused && isEnabled ? "border-2 border-purple-300" : isFocused && !isEnabled ? "border-2 border-blue-500" : isEnabled ? "" : theme === 'dark' ? "border border-white/10" : "border border-gray-300"
                              )}>
                                <Sparkles size={14} className="shrink-0" />
                                {remasterToggling
                                  ? t('gameOptions:remasterToggling')
                                  : isEnabled ? t('gameOptions:remasterOn') : t('gameOptions:remasterOff')}
                              </button>
                            );
                          }}
                        </Focusable>
                      </label>
                    )}
                  </div>
                </div>

                {/* Step 10 — Winetricks dipendenze (GOG, Epic, Amazon, Ubisoft —
                    v1.1.114-dev.1: runAmazon() in downloadManager.ts usa
                    già filterVerbsForEnv(task.winetricksVerbs) esattamente
                    come GOG/Epic, mancava solo qui il permesso di
                    mostrarlo/modificarlo dall'overlay. Step 19d: Ubisoft
                    Connect aggiunto — bug reale trovato due volte,
                    verificato di nuovo qui per essere certi che regga.
                    v2.0.41-dev.11: EA App aggiunto, stesso trattamento
                    (Fase B). */}
                {(selectedGame.store === 'GOG Galaxy' || selectedGame.store === 'Epic Games' || selectedGame.store === 'Amazon Games' || selectedGame.store === 'Ubisoft' || selectedGame.store === 'EA App') && (
                  <div className={cn("p-5 rounded-2xl", theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200")}>
                    <div className="flex items-center gap-3 mb-4">
                      <Package size={16} className="text-blue-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{t('gameOptions:wineDependencies')}</span>
                      <span className="text-[9px] opacity-30 uppercase tracking-widest">{t('gameOptions:savedForThisGame')}</span>
                      {/* v1.1.109-dev.1 — richiesta utente: vista compatta
                          di default (solo verb consigliati) per accorciare
                          la navigazione, estesa a richiesta. Switch con lo
                          stesso stile pill già usato altrove nella
                          dashboard (es. griglia Compatibility Layer),
                          navigabile col controller come tutto il resto. */}
                      <Focusable
                        group="game-options"
                        id="wine-deps-expand-toggle"
                        // v1.1.109-dev.2 — collegamento esplicito verso la
                        // prima checkbox: DEFAULT_WINE_VERBS[0] è sempre la
                        // prima voce sia in vista compatta sia estesa,
                        // quindi questo id esiste sempre indipendentemente
                        // da wineDepsExpanded.
                        neighbors={{ down: `verb-${DEFAULT_WINE_VERBS[0]}` }}
                        onEnter={() => { setWineDepsExpanded(v => !v); play('select'); }}
                      >
                        {(isFocused) => (
                          <div className="ml-auto flex items-center gap-2 cursor-pointer">
                            <span className="text-[9px] font-black uppercase tracking-widest opacity-50">
                              {wineDepsExpanded ? t('gameOptions:wineDepsExpanded') : t('gameOptions:wineDepsCompact')}
                            </span>
                            <div className={cn(
                              "w-8 h-4 rounded-full transition-all relative shrink-0 border",
                              wineDepsExpanded ? "bg-blue-500 border-blue-400" : theme === 'dark' ? "bg-white/20 border-white/10" : "bg-gray-300 border-gray-400",
                              isFocused && "ring-2 ring-blue-400 ring-offset-1 ring-offset-transparent"
                            )}>
                              <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all", wineDepsExpanded ? "left-4" : "left-0.5")} />
                            </div>
                          </div>
                        )}
                      </Focusable>
                    </div>
                    <div className="space-y-1">
                      {(wineDepsExpanded ? [...DEFAULT_WINE_VERBS, ...OPTIONAL_WINE_VERBS] : [...DEFAULT_WINE_VERBS]).map((verb, verbIdx, verbsArr) => {
                        const isChecked = winetricksVerbs.includes(verb);
                        const isLastVerb = verbIdx === verbsArr.length - 1;
                        const toggleVerb = async () => {
                          const next = isChecked
                            ? winetricksVerbs.filter(v => v !== verb)
                            : [...winetricksVerbs, verb];
                          setWinetricksVerbs(next);
                          const compatRes = await fetch(`/api/games/${selectedGame.id}/compat`);
                          const current = compatRes.ok ? await compatRes.json() : {};
                          await fetch(`/api/games/${selectedGame.id}/compat`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...current, winetricksVerbs: next }),
                          });
                          play('select');
                        };
                        return (
                          <Focusable
                            key={verb}
                            group="game-options"
                            id={`verb-${verb}`}
                            onEnter={toggleVerb}
                            // v1.1.0 — ingresso deterministico nella catena
                            // env-var: l'ultimo verb collega esplicitamente
                            // alla prima riga (envvar-0, che esiste sempre —
                            // customEnvText parte da '' → split('\n') dà
                            // comunque un elemento). Un solo link di
                            // confine, non uno per riga: l'interno della
                            // catena si muove da solo (sequentialChain).
                            // v1.1.109-dev.2 — stesso principio per il
                            // confine SUPERIORE: la prima checkbox collega
                            // esplicitamente allo switch compatta/estesa,
                            // altrimenti lo scoring lo scavalcava del
                            // tutto (bug segnalato dall'utente — prima
                            // raggiungibile solo premendo destra).
                            neighbors={
                              verbIdx === 0 ? { up: 'wine-deps-expand-toggle' }
                              : isLastVerb ? { down: wineDepsExpanded ? 'os-version-default' : 'envvar-0' }
                              : undefined
                            }
                          >
                            {(isFocused) => (
                              <div className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all border",
                                isFocused
                                  ? "bg-blue-600/20 border-blue-500/60"
                                  : "border-transparent hover:bg-white/5"
                              )}>
                                {/* Checkbox visivo */}
                                <div className={cn(
                                  "w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0",
                                  isChecked
                                    ? "bg-blue-600 border-blue-500"
                                    : isFocused
                                      ? "border-blue-400"
                                      : "border-gray-500"
                                )}>
                                  {isChecked && <div className="w-2 h-2 rounded-sm bg-white" />}
                                </div>
                                <span className="text-xs font-mono flex-1">{verb}</span>
                                {DEFAULT_WINE_VERBS.includes(verb) && (
                                  <span className="text-[9px] opacity-30 uppercase tracking-widest">{t('gameOptions:recommended')}</span>
                                )}
                                {verb === 'dotnet48' && (
                                  <span className="text-[9px] text-yellow-400/60 uppercase tracking-widest">{t('gameOptions:slowOnlyIfNeeded')}</span>
                                )}
                              </div>
                            )}
                          </Focusable>
                        );
                      })}
                    </div>

                    {/* Step 19d — Versione OS: sezione separata dalla
                        checklist sopra perché semanticamente diversa —
                        verificato nel sorgente reale di winetricks
                        (w_metadata <verbo> settings): questi verb non
                        installano nulla, impostano solo la versione di
                        Windows dichiarata da Wine/Proton al programma in
                        esecuzione, e la prefix ne ha una sola attiva alla
                        volta — scelta singola (radio), non checkbox
                        cumulabili. Visibile solo a vista espansa, stesso
                        gate di dotnet35 sopra. */}
                    {wineDepsExpanded && (() => {
                      // Un gioco legato a un launcher condiviso NON può
                      // cambiare la versione OS della prefix: è la stessa
                      // "scatola" usata dal launcher stesso (es. Ubisoft
                      // Connect richiede win10) e da altri giochi che vi
                      // si appoggiano — cambiarla qui romperebbe tutti gli
                      // altri. Stesso principio già applicato al vincolo
                      // Runner Bridge per questi titoli.
                      const osVersionLocked = !!localGameConfig.requiresLauncher;
                      const options = ['', ...OS_VERSION_VERBS];
                      return (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-50">{t('gameOptions:osVersion')}</span>
                            {osVersionLocked && (
                              <span className="text-[9px] text-yellow-400/60 uppercase tracking-widest">{t('gameOptions:osVersionLockedBySharedLauncher')}</span>
                            )}
                          </div>
                          <div className="space-y-2">
                            {options.map((verb, idx, arr) => {
                              const isSelected = verb === ''
                                ? !OS_VERSION_VERBS.some(v => winetricksVerbs.includes(v))
                                : winetricksVerbs.includes(verb);
                              const isLastOption = idx === arr.length - 1;
                              const toggleOsVersion = async () => {
                                if (osVersionLocked) { play('back'); return; }
                                const withoutOsVerbs = winetricksVerbs.filter(v => !OS_VERSION_VERBS.includes(v));
                                const next = verb === '' ? withoutOsVerbs : [...withoutOsVerbs, verb];
                                setWinetricksVerbs(next);
                                const compatRes = await fetch(`/api/games/${selectedGame.id}/compat`);
                                const current = compatRes.ok ? await compatRes.json() : {};
                                await fetch(`/api/games/${selectedGame.id}/compat`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ ...current, winetricksVerbs: next }),
                                });
                                play('select');
                              };
                              return (
                                <Focusable
                                  key={verb || 'default'}
                                  group="game-options"
                                  id={`os-version-${verb || 'default'}`}
                                  onEnter={toggleOsVersion}
                                  neighbors={isLastOption ? { down: 'envvar-0' } : undefined}
                                >
                                  {(isFocused) => (
                                    <div className={cn(
                                      "flex items-center gap-3 px-3 py-2 rounded-xl transition-all border",
                                      osVersionLocked ? "opacity-40" : "cursor-pointer",
                                      isFocused
                                        ? "bg-blue-600/20 border-blue-500/60"
                                        : "border-transparent hover:bg-white/5"
                                    )}>
                                      {/* Indicatore radio, non checkbox: scelta singola */}
                                      <div className={cn(
                                        "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                                        isSelected
                                          ? "border-blue-500"
                                          : isFocused
                                            ? "border-blue-400"
                                            : "border-gray-500"
                                      )}>
                                        {isSelected && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                                      </div>
                                      <span className="text-xs font-mono flex-1">
                                        {verb === '' ? t('gameOptions:osVersionDefault') : verb}
                                      </span>
                                    </div>
                                  )}
                                </Focusable>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Step 4 — Custom Environment Variables.
                    v1.1.0 — nascosta per Classic Console: una ROM funziona
                    o non funziona con l'emulatore/core scelto, non ha
                    variabili d'ambiente da passare (a differenza di
                    Wine/Proton, dove sono spesso necessarie per singoli
                    titoli problematici) — mostrarla qui confondeva soltanto,
                    stesso trattamento già dato a Runner Bridge. */}
                {selectedGame.store !== 'Classic Console' && (
                <div className={cn("p-5 rounded-2xl", theme === 'dark' ? "bg-white/5 border border-white/5" : "bg-gray-50 border border-gray-200")}>
                  <div className="flex items-center gap-3 mb-4">
                    <Terminal size={16} className="text-blue-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Custom Env Variables</span>
                    <span className="ml-auto text-[9px] opacity-30 uppercase tracking-widest">{t('gameOptions:keyValuePerLine')}</span>
                  </div>

                  {/* v1.1.0 — un solo campo editabile per riga (prima KEY e
                      VALUE erano due Focusable separati, raggiungibili solo
                      con sx/dx e sempre passando per "Aggiungi variabile"
                      scendendo dai verbs: lo scoring geometrico su righe
                      con 3 elementi affiancati non si comportava in modo
                      prevedibile). Un campo solo = editing più semplice
                      (si apre la tastiera già con "KEY=VALUE" precompilato)
                      e navigazione verticale diretta riga per riga tramite
                      sequentialChain, senza detour. */}
                  <div className="space-y-2">
                    {customEnvText.split('\n').map((line, idx) => {
                      const eq = line.indexOf('=');
                      const k = eq > 0 ? line.slice(0, eq) : line;
                      const v = eq > 0 ? line.slice(eq + 1) : '';
                      const display = line.trim() ? line : '';
                      // v1.1.18 — default true (persistente) se il KEY
                      // corrente non è ancora nella mappa: comportamento
                      // di sempre finché l'utente non spegne esplicitamente
                      // lo switch per QUESTA variabile.
                      const isPersistent = customEnvPersistentFlags[k.trim()] !== false;

                      const commitLines = async (lines: string[], flagsOverride?: Record<string, boolean>) => {
                        const next = lines.join('\n');
                        setCustomEnvText(next);
                        // v1.1.19 — FIX BUG REALE: prima questa funzione
                        // leggeva sempre customEnvPersistentFlags dalla
                        // closure di QUESTO render — corretto per la
                        // digitazione (un semplice ri-render fra un tasto
                        // e l'altro), ma sbagliato quando il chiamante era
                        // il toggle di persistenza stesso: quel bottone
                        // aggiornava lo stato (setCustomEnvPersistentFlags)
                        // E richiamava commitLines nello stesso istante,
                        // ma la commitLines richiamata era comunque quella
                        // catturata PRIMA dell'aggiornamento — quindi
                        // ri-scriveva la variabile con la persistenza
                        // VECCHIA (opposta a quella appena impostata).
                        // Sintomo reale osservato: spegnendo lo switch, la
                        // variabile restava comunque salvata nel profilo,
                        // e riapparivo al riavvio come "prima riga di
                        // default" perché era l'unica voce in
                        // profile.customEnv. Il chiamante ora può passare
                        // la mappa aggiornata esplicitamente invece di
                        // affidarsi al timing di React.
                        const flags = flagsOverride ?? customEnvPersistentFlags;
                        const customEnv: Record<string,string> = {};
                        lines.forEach(l => {
                          const i = l.indexOf('=');
                          if (i > 0) {
                            const kk = l.slice(0, i).trim();
                            const vv = l.slice(i + 1).trim();
                            const persistent = flags[kk] !== false;
                            if (kk && persistent) customEnv[kk] = vv;
                          }
                        });
                        const compatRes = await fetch(`/api/games/${selectedGame.id}/compat`);
                        const currentCompat = compatRes.ok ? await compatRes.json() : {};
                        await fetch(`/api/games/${selectedGame.id}/compat`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ ...currentCompat, customEnv })
                        });
                      };

                      return (
                        <div key={idx} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Focusable
                            group="game-options"
                            id={`envvar-${idx}`}
                            className="flex-1"
                            sequentialChain="game-options-envvars"
                            // v1.1.18 — catena laterale estesa di uno
                            // step: campo → switch persistenza → elimina
                            // (prima campo → elimina soltanto). Confine
                            // esplicito ad ogni passo, stessa logica già
                            // stabilita per questa riga — non lasciamo
                            // che lo scoring geometrico decida fra tre
                            // elementi ravvicinati.
                            neighbors={{ right: `envvar-persist-${idx}` }}
                            onEnter={() => openKeyboardForField(
                              `envvar-${idx}`,
                              `${t('gameOptions:envVarKeyboardLabel', { n: idx + 1 })}`,
                              line,
                              (newLine) => {
                                const oldKey = k.trim();
                                const newEq = newLine.indexOf('=');
                                const newKey = (newEq > 0 ? newLine.slice(0, newEq) : newLine).trim();
                                // v1.1.18 — migrazione del flag se il KEY
                                // cambia: senza, rinominare una variabile
                                // "solo installazione" la farebbe tornare
                                // persistente per errore (il nuovo KEY non
                                // sarebbe ancora nella mappa).
                                // v1.1.19 — stesso fix del toggle qui sopra:
                                // calcolo la mappa migrata in modo sincrono
                                // e la passo esplicitamente a commitLines,
                                // invece di richiamarla senza argomenti
                                // (che avrebbe letto la mappa VECCHIA,
                                // senza la migrazione, riportando la
                                // variabile a persistente per lo stesso
                                // identico motivo del bug del toggle).
                                let flagsForCommit = customEnvPersistentFlags;
                                if (newKey && newKey !== oldKey && oldKey in customEnvPersistentFlags) {
                                  flagsForCommit = { ...customEnvPersistentFlags };
                                  flagsForCommit[newKey] = flagsForCommit[oldKey];
                                  delete flagsForCommit[oldKey];
                                  setCustomEnvPersistentFlags(flagsForCommit);
                                }
                                const lines = customEnvText.split('\n');
                                lines[idx] = newLine;
                                commitLines(lines, flagsForCommit);
                              }
                            )}
                          >
                            {(isFocused) => (
                              <div className={cn(
                                "px-3 py-2 rounded-lg text-xs font-mono cursor-pointer transition-all border truncate",
                                isFocused ? "border-blue-500 bg-blue-500/10" : "border-white/10 bg-black/30",
                                !display && "opacity-30 italic"
                              )}>
                                {display || 'KEY=VALUE'}
                              </div>
                            )}
                          </Focusable>
                          <Focusable
                            group="game-options"
                            id={`envvar-persist-${idx}`}
                            // v1.1.18 — interruttore di persistenza, stesso
                            // stile pill già usato per plugin/runner
                            // (ATTIVO/DISATTIVO). Acceso di default =
                            // comportamento di sempre (scritto nel profilo,
                            // letto al lancio). Spento = solo per la
                            // prossima installazione, mai scritto nel
                            // profilo persistente.
                            neighbors={{ left: `envvar-${idx}`, right: `envvar-del-${idx}` }}
                            onEnter={() => {
                              const key = k.trim();
                              if (!key) return; // riga senza KEY: niente da alternare
                              // v1.1.19 — calcolo la mappa aggiornata QUI,
                              // sincrono, e la passo esplicitamente a
                              // commitLines invece di affidarmi al fatto
                              // che React abbia già applicato
                              // setCustomEnvPersistentFlags prima che
                              // commitLines venga invocata — non lo fa in
                              // tempo, è esattamente il bug appena corretto.
                              const updatedFlags = { ...customEnvPersistentFlags, [key]: !isPersistent };
                              setCustomEnvPersistentFlags(updatedFlags);
                              commitLines(customEnvText.split('\n'), updatedFlags);
                              play('select');
                            }}
                          >
                            {(isFocused) => (
                              <div className={cn(
                                "px-2.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border shrink-0 whitespace-nowrap",
                                isPersistent
                                  ? (isFocused ? "border-blue-400 bg-blue-500/20 text-blue-300" : theme === 'dark' ? "border-white/10 bg-white/5 text-blue-300/70" : "border-blue-300 bg-blue-50 text-blue-700")
                                  : (isFocused ? "border-amber-400 bg-amber-500/20 text-amber-300" : theme === 'dark' ? "border-amber-500/30 bg-amber-500/5 text-amber-400/80" : "border-amber-400 bg-amber-50 text-amber-700")
                              )}>
                                {isPersistent ? t('gameOptions:persistent') : t('gameOptions:installOnly')}
                              </div>
                            )}
                          </Focusable>
                          <Focusable
                            group="game-options"
                            id={`envvar-del-${idx}`}
                            // v1.1.0 — non fa parte della catena: è
                            // un'azione laterale, raggiungibile con dx dal
                            // campo della riga, non con giù/su (altrimenti
                            // ricompariva lo stesso problema — ogni riga
                            // interromperebbe la discesa verticale).
                            neighbors={{ left: `envvar-persist-${idx}` }}
                            onEnter={() => {
                              const lines = customEnvText.split('\n').filter((_, i) => i !== idx);
                              commitLines(lines.length ? lines : ['']);
                              play('back');
                            }}
                          >
                            {(isFocused) => (
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0",
                                isFocused ? "bg-red-600 text-white" : theme === 'dark' ? "bg-white/5 text-white/40" : "bg-gray-200 text-gray-500"
                              )}>
                                <X size={14} />
                              </div>
                            )}
                          </Focusable>
                        </div>
                        {/* v1.1.18 — caption esplicita richiesta: non
                            fidarsi del solo colore/testo del pill per
                            comunicare una differenza di comportamento così
                            importante (una variabile persa per sempre dopo
                            l'installazione se non ci si fa caso). */}
                        <p className={cn(
                          "text-[9px] pl-1",
                          isPersistent
                            ? (theme === 'dark' ? "text-white/25" : "text-gray-500")
                            : "text-amber-500/80"
                        )}>
                          {isPersistent
                            ? t('gameOptions:persistentCaption')
                            : t('gameOptions:notPersistentCaption')}
                        </p>
                        </div>
                      );
                    })}

                    <Focusable
                      group="game-options"
                      id="envvar-add"
                      sequentialChain="game-options-envvars"
                      onEnter={() => {
                        const lines = customEnvText.split('\n');
                        lines.push('');
                        setCustomEnvText(lines.join('\n'));
                        play('select');
                        setTimeout(() => setFocusedId(`envvar-${lines.length - 1}`), 50);
                      }}
                    >
                      {(isFocused) => (
                        <div className={cn(
                          "flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border border-dashed",
                          isFocused ? "border-blue-500 bg-blue-500/10 text-blue-400" : theme === 'dark' ? "border-white/10 text-white/30" : "border-gray-300 text-gray-500"
                        )}>
                          {t('gameOptions:addVariable')}
                        </div>
                      )}
                    </Focusable>
                  </div>
                </div>
                )}

                {/* v0.99.35 — Switch "Disabilita sync NT veloce", solo
                    quando il gioco non è ancora installato (riguarda
                    esclusivamente la fase di creazione prefix/dipendenze,
                    non il lancio). v1.1.114-dev.1: esteso ad Amazon —
                    runAmazon() passa già disableWineSync a
                    prepareWinePrefix() esattamente come GOG/Epic, mancava
                    solo il permesso di attivarlo dall'overlay. */}
                {!selectedGame.isInstalled && (selectedGame.store === 'GOG Galaxy' || selectedGame.store === 'Epic Games' || selectedGame.store === 'Amazon Games') && (
                  <Focusable
                    group="game-options"
                    id="toggle-disable-wine-sync"
                    onEnter={async () => {
                      const next = !disableWineSync;
                      setDisableWineSync(next);
                      const compatRes = await fetch(`/api/games/${selectedGame.id}/compat`);
                      const current = compatRes.ok ? await compatRes.json() : {};
                      await fetch(`/api/games/${selectedGame.id}/compat`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...current, disableWineSync: next }),
                      });
                      play('select');
                    }}
                  >
                    {(isFocused) => (
                      <div className={cn(
                        "p-4 rounded-2xl mb-3 transition-all",
                        isFocused ? "border-2 border-blue-500 bg-blue-500/5" : theme === 'dark' ? "border border-white/10 bg-white/5" : "border border-gray-200 bg-gray-50"
                      )}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-black uppercase tracking-widest">
                            {t('gameOptions:disableWineSyncLabel')}
                          </span>
                          <div className={cn(
                            "w-11 h-6 rounded-full transition-all relative shrink-0",
                            disableWineSync ? "bg-blue-500" : theme === 'dark' ? "bg-white/10" : "bg-gray-300"
                          )}>
                            <div className={cn(
                              "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all",
                              disableWineSync ? "left-[22px]" : "left-0.5"
                            )} />
                          </div>
                        </div>
                        <p className="text-[10px] opacity-50 mt-2 leading-relaxed">
                          {t('gameOptions:disableWineSyncDesc')}
                        </p>
                      </div>
                    )}
                  </Focusable>
                )}

                {/* v0.99.35 — Switch "Usa Known Fixes (Heroic)".
                    v0.99.38 — esteso a GOG: il backend ora risolve l'ID
                    numerico GOG richiesto dal repository (vedi
                    downloadManager.ts/fetchGogNumericId) — la
                    restrizione "solo Epic" qui era rimasta dal periodo in
                    cui GOG non era ancora supportato, andava rimossa
                    insieme al resto o il toggle sarebbe stato scritto nel
                    backend ma mai visibile/attivabile per GOG dall'overlay.
                    Visibile solo quando il gioco non è ancora installato,
                    per entrambi gli store.
                    v1.1.114-dev.1 — Amazon Games DELIBERATAMENTE ESCLUSO
                    qui, non dimenticato: runAmazon() in downloadManager.ts
                    ignora task.useKnownFixes per ora (commento esplicito
                    lì) perché il percorso del repository Heroic Known
                    Fixes è verificato solo per gog/epic, non per una
                    cartella Amazon equivalente. Mostrare questo switch
                    per Amazon sarebbe fuorviante: l'utente potrebbe
                    attivarlo aspettandosi un effetto che il backend non
                    applica affatto. Va aggiunto qui SOLO insieme
                    all'implementazione reale in downloadManager.ts, non
                    prima. */}
                {!selectedGame.isInstalled && (selectedGame.store === 'Epic Games' || selectedGame.store === 'GOG Galaxy') && (
                  <Focusable
                    group="game-options"
                    id="toggle-use-known-fixes"
                    onEnter={async () => {
                      const next = !useKnownFixes;
                      setUseKnownFixes(next);
                      const compatRes = await fetch(`/api/games/${selectedGame.id}/compat`);
                      const current = compatRes.ok ? await compatRes.json() : {};
                      await fetch(`/api/games/${selectedGame.id}/compat`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...current, useKnownFixes: next }),
                      });
                      play('select');
                    }}
                  >
                    {(isFocused) => (
                      <div className={cn(
                        "p-4 rounded-2xl mb-3 transition-all",
                        isFocused ? "border-2 border-blue-500 bg-blue-500/5" : theme === 'dark' ? "border border-white/10 bg-white/5" : "border border-gray-200 bg-gray-50"
                      )}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-black uppercase tracking-widest">
                            {t('gameOptions:useKnownFixesLabel')}
                          </span>
                          <div className={cn(
                            "w-11 h-6 rounded-full transition-all relative shrink-0",
                            useKnownFixes ? "bg-blue-500" : theme === 'dark' ? "bg-white/10" : "bg-gray-300"
                          )}>
                            <div className={cn(
                              "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all",
                              useKnownFixes ? "left-[22px]" : "left-0.5"
                            )} />
                          </div>
                        </div>
                        <p className="text-[10px] opacity-50 mt-2 leading-relaxed">
                          {t('gameOptions:useKnownFixesDesc')}
                        </p>
                      </div>
                    )}
                  </Focusable>
                )}

                {/* Launch button nell'overlay */}
                {selectedGame.isInstalled ? (
                  <Focusable group="game-options" id="game-options-uninstall" onEnter={() => {
                    setPendingAction({ type: 'uninstall', gameId: selectedGame.id, gameTitle: selectedGame.title });
                    setShowGameOptions(false);
                    setShowDownloads(true);
                    setActiveGroup('downloads');
                    play('select');
                    setTimeout(() => setFocusedId('pending-confirm'), 80);
                  }}>
                    {(isFocused) => (
                      <button className={cn(
                        "w-full py-5 rounded-2xl font-black text-xl italic transition-all flex items-center justify-center gap-3 shadow-2xl",
                        isFocused ? "bg-red-500 text-white scale-[1.02]" : "bg-red-700/80 hover:bg-red-600 text-white"
                      )}>
                        <Trash2 size={24} /> {t('gameOptions:uninstall')}
                      </button>
                    )}
                  </Focusable>
                ) : (
                  <Focusable group="game-options" id="game-options-install" onEnter={() => {
                    // v1.1.18 — snapshot catturato QUI, non alla conferma:
                    // queste righe non hanno una copia nel DB da cui
                    // ri-leggere in modo sicuro (per costruzione — è
                    // proprio il punto dello switch spento). L'unica
                    // finestra affidabile per leggerle è adesso, mentre lo
                    // stato di questa sessione dell'overlay è ancora quello
                    // giusto per selectedGame.
                    const installOnlyEnv: Record<string, string> = {};
                    customEnvText.split('\n').forEach(l => {
                      const i = l.indexOf('=');
                      if (i > 0) {
                        const kk = l.slice(0, i).trim();
                        const vv = l.slice(i + 1).trim();
                        const persistent = customEnvPersistentFlags[kk] !== false;
                        if (kk && !persistent) installOnlyEnv[kk] = vv;
                      }
                    });
                    setPendingAction({
                      type: 'install', gameId: selectedGame.id, gameTitle: selectedGame.title,
                      installOnlyEnv: Object.keys(installOnlyEnv).length > 0 ? installOnlyEnv : undefined,
                    });
                    setShowGameOptions(false);
                    setShowDownloads(true);
                    setActiveGroup('downloads');
                    play('select');
                    setTimeout(() => setFocusedId('pending-confirm'), 80);
                  }}>
                    {(isFocused) => (
                      <button className={cn(
                        "w-full py-5 rounded-2xl font-black text-xl italic transition-all flex items-center justify-center gap-3 shadow-2xl",
                        isFocused ? "bg-green-500 text-white scale-[1.02]" : "bg-green-700 hover:bg-green-600 text-white"
                      )}>
                        <Download size={24} /> {t('gameOptions:install')}
                      </button>
                    )}
                  </Focusable>
                )}
              </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compatibility Overlay */}
      <AnimatePresence>
        {showKeyboard && (() => {
          // v1.5.20-dev.7 — richiesta utente: tag genere/categoria
          // selezionabili sotto al campo di ricerca, stesso identico dato
          // già usato dai chip mouse-only nella barra filtri libreria
          // (game.genres/categories, da IGDB) — qui SOLO quando si sta
          // modificando la ricerca (!activeField), mai per gli altri campi
          // (Launch Arguments, Custom Env, ecc., dove "genere di gioco"
          // non ha senso). Selezionare un tag chiama la STESSA
          // setSelectedGenre/setSelectedCategory già usata dal mouse —
          // filtro indipendente combinato in AND col testo digitato
          // (verificato in gameManager.getGames: search poi genre poi
          // category, filtri sequenziali sullo stesso risultato via
          // getGames() lato server), mai una sostituzione del testo.
          // IIFE invece di un useMemo esterno: serve condividere questi
          // valori fra il nuovo blocco tag qui sotto E la prop
          // topRowExternalUpId passata a VirtualKeyboard più in fondo
          // allo stesso JSX, senza duplicare il calcolo due volte.
          const searchGenres = !activeField ? [...new Set(games.flatMap(g => g.genres ?? []))].slice(0, 8) : [];
          const searchCats   = !activeField ? [...new Set(games.flatMap(g => g.categories ?? []))].slice(0, 5) : [];
          const topRowExternalUpId = searchCats.length > 0 ? 'tag-cat-0' : searchGenres.length > 0 ? 'tag-genre-0' : undefined;
          return (
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-end pb-8 md:pb-12 px-2 pointer-events-none bg-black/40 backdrop-blur-sm">
            {/* Testo digitato — visibile dal divano.
                v1.1.15 — prima mostrava SEMPRE searchQuery, anche quando
                si stava modificando un campo diverso (executable_path,
                custom_env, launch options...): un bug reale, non solo un
                limite di design — editando un campo qualunque, questo
                riquadro restava vuoto/mostrava "Inizia a digitare..."
                invece del valore vero. Ora riflette activeField quando
                presente, con etichetta del campo, testo che va a capo
                (non più troncato con un puntino) e scroll interno oltre
                una certa altezza per stringhe molto lunghe — l'unico
                punto in cui leggere/correggere il testo, dato che
                l'intestazione interna della tastiera è stata rimossa
                (vedi VirtualKeyboard.tsx). */}
            <div className="pointer-events-none mb-4 w-full max-w-4xl px-2">
              <div className="flex items-start gap-3 bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 min-h-[4.5rem] max-h-[9rem] overflow-y-auto">
                {activeField
                  ? <Edit3 size={20} className="text-blue-400 shrink-0 opacity-60 mt-1" />
                  : <Search size={20} className="text-blue-400 shrink-0 opacity-60 mt-1" />}
                <div className="flex-1 min-w-0">
                  {activeField && (
                    <div className="text-[10px] font-black uppercase tracking-widest text-blue-300/70 mb-1">
                      {activeField.label}
                    </div>
                  )}
                  {/* v1.1.16 — tip contestuale del suggerimento (Shift)
                      attualmente a fuoco: cosa abilita esattamente, non
                      solo il valore grezzo — utile soprattutto per le
                      variabili d'ambiente, dove "DXVK_ASYNC=1" da solo
                      non dice nulla a chi non lo conosce già. */}
                  {suggestionTip && (
                    <div className="text-[11px] text-blue-200/80 italic mb-1 leading-snug">
                      {suggestionTip}
                    </div>
                  )}
                  <div className={cn(
                    "text-white break-all whitespace-pre-wrap leading-snug",
                    activeField ? "font-mono text-lg md:text-xl" : "font-black tracking-wide text-2xl"
                  )}>
                    {(() => {
                      const currentValue = activeField ? activeField.value : searchQuery;
                      if (!currentValue) {
                        return (
                          <span className="opacity-20 italic font-normal text-lg">
                            {activeField ? t('dashboard:keyboard.emptyField') : t('dashboard:keyboard.startTyping')}
                          </span>
                        );
                      }
                      // v1.5.20-dev.5 — richiesta utente: cursore visibile
                      // che indichi dove si scriverà/correggerà, non solo
                      // il testo intero senza alcun riferimento di
                      // posizione. Clampato sempre entro i limiti della
                      // stringa CORRENTE: se vkCursorPos arriva da un
                      // report leggermente in ritardo rispetto a un
                      // cambio di campo/valore (es. appena aperta la
                      // tastiera per un campo più corto del precedente),
                      // non deve mai puntare oltre la fine.
                      const pos = Math.max(0, Math.min(currentValue.length, vkCursorPos ?? currentValue.length));
                      return (
                        <>
                          <span>{currentValue.slice(0, pos)}</span>
                          <span className="inline-block w-[2px] h-[1em] align-middle bg-blue-400 animate-pulse mx-px" />
                          <span>{currentValue.slice(pos)}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>
                {(activeField ? activeField.value : searchQuery) && (
                  <span className="text-[10px] font-mono text-white/30 shrink-0 mt-1">
                    {(activeField ? activeField.value : searchQuery).length} car.
                  </span>
                )}
              </div>
            </div>
            {(searchGenres.length > 0 || searchCats.length > 0) && (
              <div className="pointer-events-auto w-full max-w-4xl px-2 mb-3 space-y-2">
                {searchGenres.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 italic shrink-0">{t('dashboard:genres')}</span>
                    {searchGenres.map((genre, i) => (
                      <Focusable
                        key={genre}
                        id={`tag-genre-${i}`}
                        group="keyboard"
                        sequentialChain="tag-genres"
                        chainAxis="horizontal"
                        neighbors={{ down: searchCats.length > 0 ? 'tag-cat-0' : 'key-sugg-0' }}
                        onEnter={() => setSelectedGenre(selectedGenre === genre ? '' : genre)}
                      >
                        {(isFocused: boolean) => (
                          <div className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest italic transition-all",
                            isFocused
                              ? "ring-2 ring-blue-400 scale-105 bg-blue-600 text-white"
                              : selectedGenre === genre
                                ? "bg-blue-600 text-white"
                                : "bg-white/10 text-white/60"
                          )}>
                            {genre}
                          </div>
                        )}
                      </Focusable>
                    ))}
                  </div>
                )}
                {searchCats.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 italic shrink-0">{t('dashboard:categories')}</span>
                    {searchCats.map((cat, i) => (
                      <Focusable
                        key={cat}
                        id={`tag-cat-${i}`}
                        group="keyboard"
                        sequentialChain="tag-categories"
                        chainAxis="horizontal"
                        neighbors={{
                          up: searchGenres.length > 0 ? 'tag-genre-0' : undefined,
                          down: 'key-sugg-0',
                        }}
                        onEnter={() => setSelectedCategory(selectedCategory === cat ? '' : cat)}
                      >
                        {(isFocused: boolean) => (
                          <div className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest italic transition-all",
                            isFocused
                              ? "ring-2 ring-blue-400 scale-105 bg-blue-600 text-white"
                              : selectedCategory === cat
                                ? "bg-blue-600 text-white"
                                : "bg-white/10 text-white/60"
                          )}>
                            {cat}
                          </div>
                        )}
                      </Focusable>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="pointer-events-auto w-full max-w-4xl">
              <VirtualKeyboard 
                value={activeField ? activeField.value : searchQuery}
                onChange={(val) => {
                  if (activeField) {
                    setActiveField(prev => prev ? { ...prev, value: val } : null);
                  } else {
                    setSearchQuery(val);
                  }
                }}
                onCursorChange={setVkCursorPos}
                onClose={() => {
                  if (activeField) {
                    closeKeyboard();
                  } else {
                    // FIX v0.99.6: "Fatto" sulla VK durante una ricerca
                    // chiudeva solo showKeyboard, senza mai riportare
                    // activeGroup a null. La VK si chiudeva visivamente ma
                    // lo scope restava bloccato su 'keyboard' — un group
                    // ormai senza alcun Focusable montato dentro (la VK è
                    // smontata), quindi D-pad/stick non navigavano più
                    // nulla. La libreria filtrata era corretta nei dati
                    // (searchQuery non cambia), ma irraggiungibile dal
                    // controller. Ora "Fatto" riporta lo scope alla
                    // dashboard e seleziona il primo risultato filtrato,
                    // lasciando la ricerca/filtro intatti — l'utente può
                    // navigare i risultati, lanciare o aprire l'overlay su
                    // uno di essi, e premere Y in un secondo momento per
                    // chiudere la ricerca quando ha finito.
                    setShowKeyboard(false);
                    setActiveGroup(null);
                    setTimeout(() => focusFirstInGroup('dashboard'), 80);
                  }
                }}
                theme={theme}
                altSuggestions={keyboardAltSuggestions}
                onSuggestionFocus={setSuggestionTip}
                topRowExternalUpId={topRowExternalUpId}
                onOpenFileManager={activeField?.id === 'field-executablePath' ? openExecutableFileBrowser : undefined}
              />
            </div>
          </div>
          );
        })()}
      </AnimatePresence>

      {/* Footer */}
      <footer className={cn(
        "h-16 border-t flex items-center px-12 gap-16 shrink-0 z-30 transition-colors",
        theme === 'dark' ? "bg-[#090a0d] border-white/10" : "bg-white border-gray-200"
      )}>
        {inputDevice === 'controller' ? (
          <>
            <Hint icon="A" color="bg-green-500" label={t('dashboard:footer.select')} theme={theme} />
            <Hint icon="B" color="bg-red-500" label={t('dashboard:footer.back')} theme={theme} />
            <Hint icon="X" color="bg-blue-500" label={t('dashboard:footer.quickActions')} theme={theme} />
            <Hint icon="Y" color="bg-yellow-500" label={t('dashboard:footer.globalSearch')} theme={theme} />
            <div className="h-6 w-[1px] bg-blue-500/20" />
            <div className="flex items-center gap-4">
              <div className="flex gap-1.5">
                <div className="px-2 py-1 bg-blue-500/10 rounded flex items-center justify-center text-[11px] font-black text-blue-500 border border-blue-500/30">L1</div>
                <div className="px-2 py-1 bg-blue-500/10 rounded flex items-center justify-center text-[11px] font-black text-blue-500 border border-blue-500/30">R1</div>
              </div>
              <span className="text-[11px] font-black opacity-30 uppercase tracking-[0.2em] italic">{t('dashboard:footer.jumpStore')}</span>
            </div>
            <div className="h-6 w-[1px] bg-blue-500/20" />
            {/* v1.0.0 — L2/R2: stesso stile a "pill" rettangolare di L1/R1
                sopra (non il cerchio colorato di A/B/X/Y — richiesta
                esplicita di coerenza con quel gruppo). A differenza di
                L1/R1 (un'unica azione condivisa, un'unica etichetta), L2 e
                R2 aprono due pannelli diversi (Download/Notifiche), quindi
                ciascuno ha la propria etichetta affiancata invece di
                condividerne una sola. */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="px-2 py-1 bg-blue-500/10 rounded flex items-center justify-center text-[11px] font-black text-blue-500 border border-blue-500/30">L2</div>
                <span className="text-[11px] font-black opacity-30 uppercase tracking-[0.2em] italic">{t('dashboard:footer.download')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="px-2 py-1 bg-blue-500/10 rounded flex items-center justify-center text-[11px] font-black text-blue-500 border border-blue-500/30">R2</div>
                <span className="text-[11px] font-black opacity-30 uppercase tracking-[0.2em] italic">{t('dashboard:footer.notifications')}</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <Hint icon="⏎" color="bg-gray-500" label={t('dashboard:footer.execute')} theme={theme} />
            <Hint icon="⎋" color="bg-gray-500" label={t('dashboard:footer.exitView')} theme={theme} />
            <Hint icon="TAB" color="bg-blue-500" label={t('dashboard:footer.nextGroup')} theme={theme} />
            <Hint icon="/" color="bg-yellow-500" label={t('dashboard:footer.spotlight')} theme={theme} />
          </>
        )}
        
        <div className="ml-auto flex items-center gap-8 shrink-0">
          {/* Download indicator */}
          <Focusable group="footer-bar" id="footer-downloads" onEnter={() => {
            setShowDownloads(p => {
              const next = !p;
              setShowNotifications(false);
              setActiveGroup(next ? 'downloads' : null);
              if (next) setTimeout(() => setFocusedId('downloads-close'), 50);
              return next;
            });
          }}>
            {(isFocused) => (
              <button className={cn("flex items-center gap-4 transition-all", isFocused ? "opacity-100 scale-105" : "hover:opacity-80 opacity-70")}>
                <Activity size={18} className={cn("transition-colors", downloads.some(d => d.status === 'downloading') ? "text-green-500 animate-pulse" : "text-blue-500")} />
                {/* Step 19b (v1.1.59) — segnalato dall'utente: in italiano
                    questo blocco arrivava a spezzarsi su 4 righe (Net /
                    Bridge / 0.0 / MB/s) invece delle 2 attese, perché
                    nessuno spanno qui aveva whitespace-nowrap né shrink-0
                    — l'intera riga <footer> è un flex senza wrap
                    esplicito, e le etichette italiane della legenda a
                    sinistra (collettivamente un po' più larghe di quelle
                    inglesi) bastavano a far scattare lo shrink di default
                    su QUESTO blocco, il più a destra e quindi il primo a
                    cedere spazio. whitespace-nowrap blocca lo scenario
                    "una parola per riga"; shrink-0 sul contenitore (sotto)
                    impedisce che l'intero blocco venga compresso. */}
                <div className="flex flex-col text-left shrink-0">
                  <span className="text-[9px] font-black opacity-30 uppercase tracking-[0.2em] leading-none whitespace-nowrap">{t('dashboard:footer.netBridge')}</span>
                  <span className="text-sm font-mono font-black italic text-blue-500 leading-none whitespace-nowrap">
                    {downloads.find(d => d.status === 'downloading')?.speed || "0.0 MB/s"}
                  </span>
                </div>
              </button>
            )}
          </Focusable>
          <div className="h-8 w-[1px] bg-blue-500/20" />
          {/* Campanella notifiche con badge */}
          <Focusable group="footer-bar" id="footer-notifications" onEnter={() => {
            setShowNotifications(p => {
              const next = !p;
              setShowDownloads(false);
              setActiveGroup(next ? 'notifications' : null);
              if (next) {
                setTimeout(() => setFocusedId('notifications-close'), 50);
                setNotifications(prev => prev.map(n => ({ ...n, seen: true })));
              }
              return next;
            });
          }}>
            {(isFocused) => (
              <button className={cn(
                "relative flex items-center justify-center w-9 h-9 rounded-full transition-all",
                isFocused ? "bg-white/20 scale-110" : "hover:bg-white/10"
              )}>
                {unreadCount > 0
                  ? <BellDot size={20} className="text-blue-400" />
                  : <Bell size={20} className={cn(theme === 'dark' ? "opacity-40" : "opacity-50")} />}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[8px] font-black bg-blue-600 text-white flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            )}
          </Focusable>
          <div className="h-8 w-[1px] bg-blue-500/20" />
          <div className="text-xl font-black italic tracking-tighter">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </footer>
    </div>
  );
}

function OptionItem({ id, group, icon: Icon, label, value, onClick, pending }: any) {
  const { play } = useAudio();
  return (
    <Focusable id={id} group={group} onEnter={() => { onClick?.(); play('select'); }}>
      {(isFocused) => (
        <div className={cn(
          "w-full p-4 rounded-xl flex items-center justify-between gap-3 transition-all border",
          // Step 19b (v1.1.57) — segnalato dall'utente: il pulsante Esci
          // restava blu anche mentre chiedeva conferma ("Confirm A"),
          // indistinguibile dalle altre righe con focus normale. `pending`
          // (passato solo per Esci, quando `pendingExit` è true) lo rende
          // rosso finché in attesa — A conferma, B annulla e torna blu
          // (comportamento già corretto, era solo l'aspetto a non
          // rifletterlo).
          pending ? "bg-red-600 border-red-500 text-white scale-105 shadow-xl shadow-red-500/30"
            : isFocused ? "bg-blue-600 border-blue-500 text-white scale-105 shadow-xl shadow-blue-500/30" : "bg-white/5 border-transparent opacity-60"
        )}>
          {/* Step 19b (v1.1.45) — flex-1 min-w-0 qui, non prima: senza
              min-w-0 un figlio flex non si restringe mai sotto la
              larghezza del proprio contenuto (stesso principio già visto
              per overflow-y-auto in v1.1.4/v1.1.7), quindi un'etichetta
              tradotta più lunga (es. "Modalità Gamescope" in inglese)
              invece di andare a capo si sovrapponeva al valore a destra.
              Segnalato dall'utente in test: "Modalità Schermo" andava a
              capo correttamente per puro caso (il suo value "Schermo
              Intero" è abbastanza lungo da forzare comunque lo shrink),
              "Modalità Gamescope" no. */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Icon size={18} strokeWidth={3} className="shrink-0" />
            <span className="font-black italic uppercase text-sm tracking-tight">{label}</span>
          </div>
          {/* shrink-0: il valore (es. "Schermo Intero", "Confirm A") non
              deve mai essere schiacciato da un'etichetta lunga — resta
              sempre alla propria larghezza naturale; è l'etichetta a
              restringersi/andare a capo per fargli spazio, mai il
              contrario. */}
          <span className="font-mono text-xs font-bold opacity-70 text-right shrink-0">{value}</span>
        </div>
      )}
    </Focusable>
  );
}

function ToggleItem({ id, group, label, active }: { id: string, group?: string, label: string, active: boolean }) {
  const { play } = useAudio();
  return (
    <Focusable id={id} group={group} onEnter={() => play('select')}>
      {(isFocused) => (
        <div className={cn(
          "w-full p-5 rounded-2xl flex items-center justify-between transition-all border shadow-lg",
          isFocused ? "bg-blue-600 border-blue-400 text-white scale-[1.02]" : "bg-white/5 border-white/5 opacity-70"
        )}>
          <span className="font-black uppercase text-sm tracking-tight italic">{label}</span>
          <div className={cn(
             "w-12 h-6 rounded-full relative transition-colors",
             active ? "bg-green-500" : "bg-white/20"
          )}>
             <div className={cn(
               "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
               active ? "right-1" : "left-1"
             )} />
          </div>
        </div>
      )}
    </Focusable>
  );
}

function Hint({ icon, color, label, theme }: { icon: string, color: string, label: string, theme: Theme }) {
  return (
    <div className="flex items-center gap-3 group cursor-default">
      <div className={cn(
        "w-8 h-8 rounded-full text-black flex items-center justify-center font-black text-sm shadow-xl transition-transform group-hover:scale-110",
        color
      )}>
        {icon}
      </div>
      <span className={cn(
        "text-xs font-black opacity-40 group-hover:opacity-100 transition-opacity uppercase tracking-[0.2em] italic whitespace-nowrap",
        theme === 'dark' ? "text-white" : "text-black"
      )}>{label}</span>
    </div>
  );
}

export default function App() {
  return (
    <FocusProvider>
      <AudioProvider>
        <ScalingContainer>
          <MainApp />
        </ScalingContainer>
        <NavDebugOverlay />
      </AudioProvider>
    </FocusProvider>
  );
}

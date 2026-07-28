import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { navDebug } from '../lib/navDebugBus';

// Strategia di navigazione per group. Default 'geometric' — comportamento
// identico a tutte le versioni precedenti, invariato bit-a-bit. 'sequential'
// è per gruppi che sono concettualmente una LISTA (una sola dimensione:
// una riga di tab, una colonna di switch), dove le coordinate non contano,
// conta solo l'ordine — niente scoring, niente neighbors scritti a mano.
// Riservata a gruppi genuinamente 1D: un group con contenuto 2D reale
// (griglia libreria, griglia Plugins) deve restare 'geometric'.
export type NavigationStrategy = 'geometric' | 'sequential';

interface FocusContextType {
  focusedId: string | null;
  setFocusedId: (id: string | null, axis?: 'vertical' | 'horizontal') => void;
  register: (id: string, group: string, ref: React.RefObject<HTMLElement | null>, onEnterRef: React.RefObject<(() => void) | undefined>, fallbackPriority?: number, neighbors?: Partial<Record<'up' | 'down' | 'left' | 'right', string>>, sequentialChain?: string, chainAxis?: 'vertical' | 'horizontal' | 'flow') => void;
  unregister: (id: string) => void;
  moveFocus: (direction: 'up' | 'down' | 'left' | 'right') => void;
  // Congela tutta la navigazione gamepad (es. durante un gioco in esecuzione)
  setFocusFrozen: (frozen: boolean) => void;
  isFocusFrozen: boolean;
  // Scope attivo: quando impostato, moveFocus/mouse considerano SOLO i Focusable
  // di questo group. Risolve il caso "overlay aperto ma il focus scappa nella
  // dashboard sottostante" e "il mouse sulla dashboard ruba focus all'overlay".
  activeGroup: string | null;
  setActiveGroup: (group: string | null) => void;
  // Seleziona esplicitamente il primo elemento utile (priorità + posizione,
  // stesso criterio del fallback automatico di moveFocus) di un group dato.
  // Usata all'apertura di overlay/pannelli modali al posto di un
  // setFocusedId su un id hardcoded — evita di puntare per errore a un
  // pulsante di chiusura o a un elemento non più montato.
  focusFirstInGroup: (group: string) => void;
  // Invoca onEnter dell'elemento attualmente focalizzato, leggendo dal
  // REGISTRY invece che dal DOM (document.querySelector). Il vecchio
  // approccio cercava '[data-focused="true"]' nel DOM, che può restare
  // brevemente desincronizzato dallo stato React subito dopo un cambio di
  // activeGroup/focusedId (es. chiusura di un overlay che richiede un
  // setTimeout per il focus successivo): in quella finestra nessun elemento
  // ha ancora l'attributo corretto, querySelector ritorna null, e la
  // pressione di A non produce alcun effetto — senza errori, senza recovery.
  triggerFocusedAction: () => void;
  // Dichiara la strategia di navigazione di un group. Default 'geometric'
  // se mai chiamata — nessun group esistente cambia comportamento finché
  // non viene esplicitamente migrato. Va chiamata una volta (es. in un
  // useEffect al mount del componente proprietario del group), non ad ogni
  // render — la mappa è una ref, non stato, non causa re-render.
  setGroupStrategy: (group: string, strategy: NavigationStrategy) => void;
  // Ciclo sequenziale esplicito per un group — usa lo stesso criterio
  // visivo (ordine top→bottom poi left→right) indipendentemente
  // dall'ordine di registrazione/rimontaggio. Utilizzabile sia da moveFocus
  // per i group con strategy 'sequential', sia direttamente da logica ad
  // hoc (es. cicli L1/R1) al posto di un indexOf/modulo scritto a mano su
  // un array parallelo — vedi cycleSettingsTab in App.tsx, migrato a
  // questo meccanismo. Restituisce l'id scelto o null se il pool è vuoto.
  cycleSequential: (group: string, direction: 'next' | 'prev', options?: { wrap?: boolean; fromId?: string }) => string | null;
  // True se le coordinate fornite corrispondono già all'ultima posizione
  // REALE nota del cursore — cioè il mouse fisico non si è mosso da lì.
  // Usata da Focusable per ignorare i mouseenter "passivi" generati dal
  // layout che si muove sotto un cursore fermo durante la navigazione da
  // controller (vedi v0.99.19).
  isStaleMouseEnter: (x: number, y: number) => boolean;
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

interface RegistryItem {
  id: string;
  group: string;
  ref: React.RefObject<HTMLElement | null>;
  onEnterRef: React.RefObject<(() => void) | undefined>;
  // Priorità per il fallback "nessun focus valido nel pool": più alto vince.
  // Default 0. Elementi "di cornice" (es. pulsante di chiusura in alto) usano
  // un valore negativo per non essere mai scelti come target automatico
  // quando esistono alternative — altrimenti, essendo spesso il primo
  // elemento geometricamente più in alto della maschera, vincerebbero sempre
  // il calcolo "elemento più in alto" a prescindere da quanto in basso si
  // trovi il primo controllo reale del contenuto.
  fallbackPriority: number;
  // Override espliciti di navigazione: se presente per una direzione, quel
  // movimento salta del tutto lo scoring geometrico e va direttamente
  // all'id specificato. Usato per elementi piccoli/defilati (es. pulsanti
  // "Aggiorna" in un header) che lo scoring assiale penalizza sempre per
  // via della distanza laterale, indipendentemente da quanto si aggiusti
  // la formula — un link esplicito è più robusto che inseguire il
  // punteggio per ogni nuovo layout.
  neighbors?: Partial<Record<'up' | 'down' | 'left' | 'right', string>>;
  // Catena sequenziale opzionale: elementi con lo stesso sequentialChain
  // (all'interno dello stesso group) si navigano per ORDINE VISIVO fra
  // loro, ignorando lo scoring geometrico — senza dover spezzare il group
  // in uno scope a parte. Risolve il caso di una lista dinamica (righe
  // env var, in futuro potenzialmente altre) annidata in un group più
  // grande e concettualmente 2D: l'alternativa sarebbe stata spezzare
  // activeGroup, cosa che romperebbe la navigazione fra le altre sezioni
  // dello stesso overlay. Uscire dai bordi della catena (primo/ultimo
  // elemento) ricade sul normale neighbors/scoring geometrico — un solo
  // link esplicito per bordo, non uno per ogni singolo elemento.
  sequentialChain?: string;
  // Asse primario della catena: 'vertical' (default) risponde solo a
  // up/down, 'horizontal' solo a left/right. La direzione ORTOGONALE
  // all'asse non viene mai intercettata dalla catena — passa subito a
  // neighbors/scoring geometrico. Senza questa distinzione, un movimento
  // laterale (es. verso un pulsante elimina a fianco della riga) veniva
  // interpretato come "avanti nella catena" invece che come un'uscita
  // verso un elemento correlato ma non sequenziale — scoperto con le
  // righe env-var: destra veniva letta come "riga successiva", il
  // pulsante elimina a fianco non era mai raggiungibile.
  // v1.1.17 — 'flow': cattura TUTTE le direzioni (giù e destra = avanti,
  // su e sinistra = indietro), per liste "a capo" (flex-wrap) con
  // elementi di larghezza variabile il cui punto di a-capo non è
  // prevedibile — scoperto con i suggerimenti rapidi della tastiera
  // (variabili d'ambiente lunghe, 6 su una riga + 1 sola sulla
  // successiva, centrata senza allinearsi a nessuna colonna sopra):
  // destra/giù/su producevano salti incoerenti fra righe e persino verso
  // tasti della tastiera sottostante. In modalità 'flow' l'intera lista
  // si comporta come una singola sequenza in ordine di lettura,
  // indipendente da dove esattamente il testo va a capo.
  chainAxis?: 'vertical' | 'horizontal' | 'flow';
}

// Verifica che l'elemento sia visibile nel viewport e abbia dimensioni reali.
// Esclude elementi nascosti, con size zero, o fuori dalla viewport.
function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.right < 0 || rect.bottom < 0) return false;
  if (rect.left > window.innerWidth || rect.top > window.innerHeight) return false;
  // Controlla che l'elemento non sia nascosto via CSS
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  return true;
}

// Variante usata SOLO dal fallback generico "nessun focus valido nel pool"
// (quando si entra in un nuovo scope/overlay e bisogna scegliere un primo
// elemento sensato tra tanti, senza alcuna direzione di movimento a
// guidare la scelta). Qui è corretto escludere elementi attualmente
// scrollati fuori dal loro contenitore, perché altrimenti il fallback
// potrebbe scegliere qualcosa che l'utente non vede affatto in quel
// momento, senza che nessun movimento intenzionale lo giustifichi.
//
// NON va usata per lo scoring direzionale di moveFocus: lì l'utente sta
// esplicitamente navigando in una direzione, e un candidato valido in
// quella direzione deve poter essere scelto anche se richiede uno scroll
// per diventare visibile — è esattamente lo scopo dello scroll automatico
// in setFocusedId(). Usarla anche lì (errore corretto in questa revisione)
// escludeva permanentemente ogni riga oltre la seconda in un viewport più
// basso (es. la Dashboard in modalità finestra, più piccola del fullscreen):
// moveFocus non scegliendole mai come target, lo scroll non veniva mai
// innescato per raggiungerle — un classico problema "uovo e gallina".
function isVisibleInScrollContainer(el: HTMLElement): boolean {
  if (!isVisible(el)) return false;
  const rect = el.getBoundingClientRect();
  let parent = el.parentElement;
  while (parent) {
    const parentStyle = window.getComputedStyle(parent);
    const overflowY = parentStyle.overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      const parentRect = parent.getBoundingClientRect();
      if (rect.bottom < parentRect.top - 2 || rect.top > parentRect.bottom + 2) {
        return false;
      }
      break;
    }
    parent = parent.parentElement;
  }
  return true;
}

// Punteggio per movimento direzionale:
// Usa una metrica "projected + cross" per favorire la direzione primaria
// e penalizzare fortemente la deviazione laterale (evita salti diagonali).
function directionalScore(
  currentRect: DOMRect,
  targetRect: DOMRect,
  direction: 'up' | 'down' | 'left' | 'right'
): number | null {
  const cx = currentRect.left + currentRect.width / 2;
  const cy = currentRect.top + currentRect.height / 2;
  const tx = targetRect.left + targetRect.width / 2;
  const ty = targetRect.top + targetRect.height / 2;

  const dx = tx - cx;
  const dy = ty - cy;

  // La componente "primaria" deve essere positiva nella direzione richiesta
  let primary: number;
  let cross: number;
  const THRESHOLD = 8; // px minimi nella direzione principale

  switch (direction) {
    case 'up':
      primary = -dy;
      cross = Math.abs(dx);
      break;
    case 'down':
      primary = dy;
      cross = Math.abs(dx);
      break;
    case 'left':
      primary = -dx;
      cross = Math.abs(dy);
      break;
    case 'right':
      primary = dx;
      cross = Math.abs(dy);
      break;
  }

  if (primary < THRESHOLD) return null; // fuori direzione

  // Score = distanza primaria + penalità quadratica per deviazione laterale.
  // Moltiplicatore 2.5 sulla cross: favorisce fortemente elementi allineati.
  return primary + cross * 2.5;
}

export const FocusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [focusedId, setFocusedIdRaw] = useState<string | null>(null);
  const [isFocusFrozen, setIsFocusFrozen] = useState(false);
  const [activeGroup, setActiveGroupRaw] = useState<string | null>(null);
  const registry = useRef<RegistryItem[]>([]);
  // Traccia l'id di animazione (requestAnimationFrame) di scroll attualmente
  // in corso per ciascun contenitore scrollabile, per poterla annullare
  // esplicitamente se arriva una nuova richiesta prima che sia conclusa.
  const scrollAnimations = useRef<Map<HTMLElement, number>>(new Map());

  // v0.99.19 — FIX bug navigazione controller in modalità Borderless/Kiosk
  // (niente più cursore nascosto automaticamente da --kiosk reale, v0.99.12):
  // il cursore mouse, anche se rimasto fermo, genera comunque un evento
  // nativo `mouseenter` reale ogni volta che un Focusable DIVERSO finisce
  // per trovarsi sotto le sue coordinate — cosa che succede normalmente
  // durante la navigazione da controller, quando lo scroll/il layout
  // muovono gli elementi sotto un cursore che l'utente non ha mai toccato.
  // Il vecchio handleMouseEnter (Focusable, sotto) interpretava QUALUNQUE
  // mouseenter come "l'utente ha mosso il mouse qui", rubando il focus dal
  // controller — causa esatta del sintomo riportato: risalendo con lo
  // stick, la selezione "torna giù" verso l'area dove il cursore è fermo.
  //
  // Fix: un listener globale mousemove traccia l'ULTIMA POSIZIONE REALE
  // nota del cursore. handleMouseEnter confronta le coordinate
  // dell'evento con quel ref — se coincidono (il mouse fisico non si è
  // mosso, è il layout che si è mosso sotto di lui), l'evento è "passivo"
  // e viene ignorato. Esposto tramite il context perché serve a ogni
  // Focusable, non solo al provider stesso.
  const lastRealMousePos = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      lastRealMousePos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);
  // True solo se le coordinate fornite corrispondono già all'ultima
  // posizione reale nota — cioè il mouse non si è mosso da lì.
  const isStaleMouseEnter = useCallback((x: number, y: number): boolean => {
    const last = lastRealMousePos.current;
    return last !== null && last.x === x && last.y === y;
  }, []);

  const setFocusedId = useCallback((id: string | null, axis?: 'vertical' | 'horizontal') => {
    setFocusedIdRaw(id);
    if (!id) return;
    // Micro-delay per attendere che React abbia aggiornato il DOM
    setTimeout(() => {
      const item = registry.current.find(i => i.id === id);
      if (!item?.ref.current) return;

      // Scroll manuale invece di scrollIntoView nativo: per specifica del
      // browser, scrollIntoView({block:'nearest'}) può risalire TUTTA la
      // catena di antenati scrollabili finché l'elemento non è visibile —
      // questo include contenitori esterni che devono restare fissi (es.
      // l'header della maschera Settings con tab e pulsante di chiusura),
      // producendo lo scroll indesiderato dell'intera interfaccia invece
      // del solo contenuto della tab. Qui ci fermiamo deliberatamente al
      // PRIMO contenitore scrollabile più vicino, senza mai risalire oltre:
      // menu, tab e pulsanti di chiusura restano sempre fissi e leggibili,
      // indipendentemente da quale elemento riceve il focus.
      const el = item.ref.current;
      let scrollParent: HTMLElement | null = el.parentElement;
      while (scrollParent) {
        const style = window.getComputedStyle(scrollParent);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
        scrollParent = scrollParent.parentElement;
      }
      if (!scrollParent) return; // nessun contenitore scrollabile: niente da fare

      // Un movimento orizzontale (sx/dx) dentro la stessa riga non deve mai
      // ricalcolare il centraggio verticale: piccole differenze di altezza
      // tra card (badge presenti/assenti, titolo su una o due righe,
      // l'animazione layout di Framer Motion) producevano un micro-jitter
      // verticale percepibile ogni volta che ci si spostava lateralmente,
      // anche restando sulla stessa riga logica. Il riallineamento verticale
      // ha senso solo quando il movimento è verticale (cambio di riga) o
      // quando non è noto (chiamate da click/onEnter diretti, dove un
      // riallineamento di sicurezza resta corretto).
      if (axis === 'horizontal') return;

      const elRect = el.getBoundingClientRect();
      const containerRect = scrollParent.getBoundingClientRect();

      // Strategia di centraggio, non di "scroll minimo verso il bordo": il
      // centro verticale della card selezionata viene allineato al centro
      // verticale dello spazio visibile del contenitore, ogni volta che il
      // contenuto lo permette. Le righe sopra e sotto restano visibili a
      // metà come anteprima — esattamente il comportamento richiesto.
      //
      // Questo elimina alla radice il problema riportato: con lo "scroll
      // minimo" precedente, una card poteva finire esattamente al bordo del
      // contenitore (visibile per un solo pixel in più del necessario), e la
      // pressione direzionale successiva calcolava lo scoring contro quella
      // posizione di confine — a volte preferendo una card adiacente sulla
      // stessa riga rispetto a quella sottostante, producendo la "salita
      // laterale a scatti" osservata. Centrando sempre sul punto medio,
      // quel confine critico non esiste più: il riferimento è sempre lo
      // stesso punto stabile, lontano da qualunque bordo.
      const elCenter = elRect.top + elRect.height / 2;
      const containerCenter = containerRect.top + containerRect.height / 2;
      const delta = elCenter - containerCenter;

      const maxScroll = scrollParent.scrollHeight - scrollParent.clientHeight;
      const projected = scrollParent.scrollTop + delta;
      // Clamp ai bordi reali del contenuto: vicino alla cima o al fondo non
      // si può centrare oltre il limite — meglio mostrare il bordo reale
      // (scrollTop 0 o massimo) che tentare un centraggio impossibile.
      const target = Math.max(0, Math.min(maxScroll, projected));

      // Scroll animato ma cancellabile: a differenza di behavior:'smooth'
      // nativo (che il browser gestisce internamente e non si può
      // interrompere in modo pulito da codice applicativo), questa
      // animazione manuale viene esplicitamente annullata se arriva una
      // nuova richiesta di scroll prima che la precedente sia conclusa — la
      // richiesta più recente vince sempre, e moveFocus legge sempre la
      // posizione di scroll reale e attuale, mai un valore verso cui il
      // browser sta ancora animando. Risolve così la race che aveva
      // motivato il passaggio a scroll istantaneo, mantenendo però il
      // movimento fluido richiesto.
      if (Math.abs(scrollParent.scrollTop - target) > 1) {
        const sp = scrollParent;
        const existing = scrollAnimations.current.get(sp);
        if (existing) cancelAnimationFrame(existing);

        const start = sp.scrollTop;
        const distance = target - start;
        const duration = 220; // ms — breve, percepibile ma non lento
        const startTime = performance.now();

        const step = (now: number) => {
          const elapsed = now - startTime;
          const t = Math.min(1, elapsed / duration);
          // easeOutCubic: parte rapido, decelera in modo naturale verso il target
          const eased = 1 - Math.pow(1 - t, 3);
          sp.scrollTop = start + distance * eased;
          if (t < 1) {
            scrollAnimations.current.set(sp, requestAnimationFrame(step));
          } else {
            scrollAnimations.current.delete(sp);
          }
        };
        scrollAnimations.current.set(sp, requestAnimationFrame(step));
      }
    }, 30);
  }, []);

  const setFocusFrozen = useCallback((frozen: boolean) => {
    setIsFocusFrozen(frozen);
  }, []);

  const setActiveGroup = useCallback((group: string | null) => {
    setActiveGroupRaw(group);
  }, []);

  // FIX CRITICO: il registry precedente ignorava silenziosamente la
  // re-registrazione di un id già presente. Quando React smonta/rimonta un
  // Focusable con lo stesso id (filtri store, librerie che si aggiornano,
  // overlay che apre/chiude), il vecchio `ref` rimaneva agganciato a un nodo
  // DOM ormai smontato (getBoundingClientRect() restituisce tutti zero), e il
  // nuovo componente — con un ref fresco e valido — non veniva mai registrato.
  // Risultato: il registry si riempiva progressivamente di ref "fantasma"
  // mescolati a quelli reali, e moveFocus calcolava punteggi su nodi morti,
  // producendo salti casuali e blocchi totali della navigazione.
  // Ora register AGGIORNA sempre il ref se l'id esiste già.
  const register = useCallback((id: string, group: string, ref: React.RefObject<HTMLElement | null>, onEnterRef: React.RefObject<(() => void) | undefined>, fallbackPriority: number = 0, neighbors?: Partial<Record<'up' | 'down' | 'left' | 'right', string>>, sequentialChain?: string, chainAxis?: 'vertical' | 'horizontal' | 'flow') => {
    const existing = registry.current.find(i => i.id === id);
    if (existing) {
      existing.ref = ref;
      existing.group = group;
      existing.onEnterRef = onEnterRef;
      existing.fallbackPriority = fallbackPriority;
      existing.neighbors = neighbors;
      existing.sequentialChain = sequentialChain;
      existing.chainAxis = chainAxis;
    } else {
      registry.current.push({ id, group, ref, onEnterRef, fallbackPriority, neighbors, sequentialChain, chainAxis });
    }
  }, []);

  const unregister = useCallback((id: string) => {
    registry.current = registry.current.filter(i => i.id !== id);
  }, []);

  // Selezione del miglior candidato di fallback in un pool: priorità
  // esplicita (fallbackPriority) come criterio primario — più alta vince
  // sempre — con la posizione visiva (più in alto, poi più a sinistra) come
  // tie-break solo tra elementi che condividono la stessa priorità.
  // Elementi "di cornice" come i pulsanti di chiusura usano priorità
  // negativa per non essere mai scelti quando esiste un'alternativa di
  // contenuto reale, anche se sono geometricamente più in alto (es. perché
  // stanno nell'header della maschera, sopra qualunque controllo del corpo).
  // Estratta come funzione condivisa: usata sia da moveFocus (quando il
  // focus corrente non è più nel pool attivo) sia da focusFirstInGroup
  // (selezione esplicita del primo elemento utile all'apertura di un
  // overlay, invece di forzare un id specifico come il pulsante di
  // chiusura).
  const pickBestFallback = useCallback((pool: RegistryItem[]): RegistryItem | null => {
    let best: RegistryItem | null = null;
    let bestPriority = -Infinity;
    let bestTop = Infinity;
    let bestLeft = Infinity;
    pool.forEach(item => {
      if (!item.ref.current || !isVisibleInScrollContainer(item.ref.current)) return;
      const rect = item.ref.current.getBoundingClientRect();
      const priority = item.fallbackPriority ?? 0;
      if (priority > bestPriority) {
        bestPriority = priority;
        bestTop = rect.top;
        bestLeft = rect.left;
        best = item;
      } else if (priority === bestPriority) {
        if (rect.top < bestTop - 4 || (Math.abs(rect.top - bestTop) <= 4 && rect.left < bestLeft)) {
          bestTop = rect.top;
          bestLeft = rect.left;
          best = item;
        }
      }
    });
    return best;
  }, []);

  // Seleziona esplicitamente il primo elemento utile di un group, con lo
  // stesso criterio di pickBestFallback (priorità + posizione). Pensata per
  // l'apertura di overlay/pannelli modali: invece di forzare un id
  // specifico (rischio concreto — un id hardcoded può puntare al pulsante
  // di chiusura, come accadeva prima di questo fix), interroga il registry
  // per il candidato realmente corretto in quel momento, coerente con
  // qualunque Focusable sia effettivamente montato e visibile.
  const focusFirstInGroup = useCallback((group: string) => {
    const pool = registry.current.filter(i => i.group === group);
    const best = pickBestFallback(pool);
    if (best) setFocusedId(best.id);
  }, [pickBestFallback, setFocusedId]);

  // Mappa group→strategia. Ref, non state: cambia raramente (dichiarata
  // una volta dal componente proprietario del group) e non deve causare
  // re-render di tutto l'albero ad ogni chiamata.
  const groupStrategies = useRef<Map<string, NavigationStrategy>>(new Map());
  const setGroupStrategy = useCallback((group: string, strategy: NavigationStrategy) => {
    groupStrategies.current.set(group, strategy);
  }, []);

  // Pool ordinato visivamente (top→bottom, poi left→right) per un group,
  // indipendente dall'ordine di registrazione/rimontaggio nel registry —
  // un componente che si smonta e rimonta (es. filtro che cambia i risultati)
  // non deve alterare l'ordine logico "next/prev" percepito dall'utente.
  // Stessa esclusione di isVisibleInScrollContainer usata da pickBestFallback:
  // un elemento scrollato fuori dal contenitore non è un candidato valido.
  const getSequentialPool = useCallback((group: string): RegistryItem[] => {
    return registry.current
      .filter(i => i.group === group && i.ref.current && isVisibleInScrollContainer(i.ref.current))
      .map(i => ({ item: i, rect: i.ref.current!.getBoundingClientRect() }))
      .sort((a, b) => {
        // Tolleranza 4px: elementi sulla "stessa riga" (piccole differenze
        // di altezza tra card, come già gestito altrove in questo file)
        // si ordinano per sinistra, non per un confronto top che il
        // sub-pixel renderebbe instabile.
        if (Math.abs(a.rect.top - b.rect.top) > 4) return a.rect.top - b.rect.top;
        return a.rect.left - b.rect.left;
      })
      .map(x => x.item);
  }, []);

  const cycleSequential = useCallback((
    group: string,
    direction: 'next' | 'prev',
    options?: { wrap?: boolean; fromId?: string }
  ): string | null => {
    const pool = getSequentialPool(group);
    if (pool.length === 0) return null;

    const wrap = options?.wrap ?? false;
    // fromId esplicito: per cicli ancorati a uno stato diverso dal focus
    // visivo globale (es. "tab attualmente attiva", che nella maggior
    // parte dei casi NON coincide col focus — l'utente sta guardando il
    // contenuto della tab, non il bottone della tab). Senza questo,
    // findIndex su focusedId risulterebbe quasi sempre -1 durante un ciclo
    // L1/R1 e il ciclo ripartirebbe sempre dal primo elemento invece di
    // avanzare da quello davvero attivo.
    const referenceId = options?.fromId ?? focusedId;
    const currentIndex = pool.findIndex(i => i.id === referenceId);

    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = 0; // riferimento non nel pool: primo elemento utile, non un salto arbitrario
    } else if (direction === 'next') {
      nextIndex = currentIndex + 1;
      if (nextIndex >= pool.length) nextIndex = wrap ? 0 : pool.length - 1;
    } else {
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) nextIndex = wrap ? pool.length - 1 : 0;
    }

    const target = pool[nextIndex];
    navDebug.emit({
      ts: Date.now(), group, strategy: 'sequential', direction,
      fromId: referenceId, toId: target.id,
      detail: `${currentIndex === -1 ? '?' : currentIndex}→${nextIndex} di ${pool.length}`,
    });
    setFocusedId(target.id);
    return target.id;
  }, [focusedId, getSequentialPool, setFocusedId]);

  const moveFocus = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (isFocusFrozen) return;

    // Determina il pool di elementi considerati da questo movimento:
    // - se uno scope è attivo (overlay aperto), SOLO quel group
    // - altrimenti, SOLO il group 'dashboard' (libreria + top/footer bar
    //   restano escluse: sono navigabili solo con L1/R1/L2/R2, mai con
    //   stick/D-pad, per evitare ambiguità di scoring assiale ai bordi
    //   della griglia)
    const targetGroup = activeGroup ?? 'dashboard';

    // Dispatch di strategia — v1.1.0: se il group è stato dichiarato
    // 'sequential' con setGroupStrategy, salta interamente scoring
    // geometrico e neighbors: un group 1D naviga per ordine visivo, non
    // per coordinate. Default 'geometric' per qualunque group non
    // esplicitamente migrato — il ramo sotto resta identico a prima.
    const strategy = groupStrategies.current.get(targetGroup) ?? 'geometric';
    if (strategy === 'sequential') {
      const seqDirection: 'next' | 'prev' =
        (direction === 'down' || direction === 'right') ? 'next' : 'prev';
      cycleSequential(targetGroup, seqDirection);
      return;
    }

    const pool = registry.current.filter(i => i.group === targetGroup);

    if (!focusedId || !pool.some(i => i.id === focusedId)) {
      const best = pickBestFallback(pool);
      if (best) setFocusedId(best.id);
      return;
    }

    const current = pool.find(i => i.id === focusedId);
    if (!current?.ref.current) return;

    // Catena sequenziale: se l'elemento corrente appartiene a una catena,
    // prova PRIMA a muoverti al prossimo/precedente elemento della STESSA
    // catena per ordine visivo — indipendente dallo scoring geometrico.
    // Se il movimento esce dai bordi della catena (nessun elemento in quella
    // direzione all'interno della catena), si ricade sul normale
    // neighbors/scoring geometrico sotto, invariato: la catena copre solo
    // la navigazione INTERNA alla lista, i bordi restano un normale punto
    // di aggancio col resto del group.
    //
    // Guard sull'asse: una catena verticale (default, es. righe env-var)
    // risponde SOLO a up/down. Un movimento orizzontale (left/right) non
    // viene nemmeno considerato catena — passa dritto al controllo
    // neighbors sotto. Bug reale scoperto in test: senza questo guard,
    // "destra" da una riga veniva letta come "avanti nella catena" (la
    // riga successiva), rendendo irraggiungibile un pulsante laterale
    // (elimina) collegato via neighbors — la catena vinceva sempre prima
    // che neighbors avesse la possibilità di essere controllato.
    const chainAxis = current.chainAxis ?? 'vertical';
    const directionMatchesChainAxis =
      chainAxis === 'flow' ||
      (chainAxis === 'vertical' && (direction === 'up' || direction === 'down')) ||
      (chainAxis === 'horizontal' && (direction === 'left' || direction === 'right'));

    if (current.sequentialChain && directionMatchesChainAxis) {
      const chainPool = pool
        .filter(i => i.sequentialChain === current.sequentialChain && i.ref.current && isVisible(i.ref.current))
        .map(i => ({ item: i, rect: i.ref.current!.getBoundingClientRect() }))
        .sort((a, b) => {
          if (Math.abs(a.rect.top - b.rect.top) > 4) return a.rect.top - b.rect.top;
          return a.rect.left - b.rect.left;
        })
        .map(x => x.item);
      const chainIndex = chainPool.findIndex(i => i.id === focusedId);
      if (chainIndex !== -1) {
        const forward = (direction === 'down' || direction === 'right');
        const chainTargetIndex = forward ? chainIndex + 1 : chainIndex - 1;
        if (chainTargetIndex >= 0 && chainTargetIndex < chainPool.length) {
          const chainTarget = chainPool[chainTargetIndex];
          const axis = (direction === 'left' || direction === 'right') ? 'horizontal' : 'vertical';
          navDebug.emit({
            ts: Date.now(), group: targetGroup, strategy: 'sequential', direction,
            fromId: focusedId, toId: chainTarget.id,
            detail: `catena "${current.sequentialChain}" ${chainIndex}→${chainTargetIndex}`,
          });
          setFocusedId(chainTarget.id, axis);
          return;
        }
        // Fuori dai bordi della catena: prosegue sotto, neighbors/scoring
        // geometrico normali decidono come uscirne.
      }
    }

    // Override esplicito: se l'elemento corrente dichiara un vicino fisso
    // per questa direzione, usalo direttamente, senza calcolare alcun
    // punteggio geometrico. Garantisce un percorso certo per elementi che
    // lo scoring penalizzerebbe sempre (es. pulsanti piccoli/defilati in
    // un header), indipendentemente da quanto si aggiusti la formula.
    //
    // Non richiede isVisible(): un neighbor è dichiarato intenzionalmente
    // dallo sviluppatore (a differenza del fallback generico, che scansiona
    // tutto il pool e quindi deve diffidare di elementi smontati), quindi
    // non corre lo stesso rischio. Richiederlo escludeva esattamente i casi
    // per cui il meccanismo serve davvero: un elemento target scrollato
    // fuori dal contenitore (es. "Spazio disco" sotto al fold della tab
    // System) veniva rifiutato silenziosamente, ricadendo sullo scoring
    // geometrico e producendo salti erratici verso candidati non correlati.
    // Lo scroll automatico verso il target resta garantito da
    // setFocusedId(), che chiama già scrollIntoView.
    const overrideId = current.neighbors?.[direction];
    if (overrideId) {
      const overrideTarget = pool.find(i => i.id === overrideId && i.ref.current);
      if (overrideTarget) {
        navDebug.emit({
          ts: Date.now(), group: targetGroup, strategy: 'neighbor-override', direction,
          fromId: focusedId, toId: overrideTarget.id, detail: `neighbor dichiarato: ${overrideId}`,
        });
        setFocusedId(overrideTarget.id);
        return;
      }
      // Se il target dichiarato non è (più) registrato nel pool, ricade
      // sullo scoring geometrico normale invece di restare bloccati.
    }

    const currentRect = current.ref.current.getBoundingClientRect();
    let bestMatch: RegistryItem | null = null;
    let bestScore = Infinity;

    pool.forEach(item => {
      if (item.id === focusedId || !item.ref.current) return;

      // Salta elementi non visibili nel viewport
      if (!isVisible(item.ref.current)) return;

      const targetRect = item.ref.current.getBoundingClientRect();
      const score = directionalScore(currentRect, targetRect, direction);
      if (score !== null && score < bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    });

    if (bestMatch) {
      const axis = (direction === 'left' || direction === 'right') ? 'horizontal' : 'vertical';
      navDebug.emit({
        ts: Date.now(), group: targetGroup, strategy: 'geometric', direction,
        fromId: focusedId, toId: (bestMatch as RegistryItem).id,
        detail: `score ${bestScore.toFixed(0)}`,
      });
      setFocusedId((bestMatch as RegistryItem).id, axis);
    } else {
      navDebug.emit({
        ts: Date.now(), group: targetGroup, strategy: 'geometric', direction,
        fromId: focusedId, toId: null, detail: 'nessun candidato in direzione',
      });
    }
  }, [focusedId, isFocusFrozen, activeGroup, setFocusedId, cycleSequential]);

  // Invoca onEnter dell'elemento attualmente focalizzato leggendo dal
  // registry, non dal DOM. Usa lo stesso scoping di moveFocus (pool filtrato
  // su activeGroup ?? 'dashboard') così il comportamento di "quale elemento
  // è davvero quello attivo" è identico ovunque, eliminando la possibilità
  // che un focusedId stale (puntato a un id appena smontato) produca un
  // click silenzioso a vuoto.
  const triggerFocusedAction = useCallback(() => {
    if (!focusedId) return;
    const targetGroup = activeGroup ?? 'dashboard';
    const pool = registry.current.filter(i => i.group === targetGroup);
    const current = pool.find(i => i.id === focusedId);
    current?.onEnterRef.current?.();
  }, [focusedId, activeGroup]);

  return (
    <FocusContext.Provider value={{
      focusedId, setFocusedId, register, unregister, moveFocus,
      setFocusFrozen, isFocusFrozen, activeGroup, setActiveGroup, focusFirstInGroup,
      triggerFocusedAction, isStaleMouseEnter, setGroupStrategy, cycleSequential
    }}>
      {children}
    </FocusContext.Provider>
  );
};

export const useFocus = () => {
  const context = useContext(FocusContext);
  if (!context) throw new Error('useFocus must be used within FocusProvider');
  return context;
};

interface FocusableProps {
  id: string;
  group?: string;
  children: (isFocused: boolean) => React.ReactNode;
  onEnter?: () => void;
  className?: string;
  disableHoverFocus?: boolean;
  // Priorità per il fallback "nessun focus valido": default 0. Usare un
  // valore negativo (es. -1) per elementi "di cornice" come pulsanti di
  // chiusura, che non devono mai essere scelti automaticamente come target
  // quando esistono controlli di contenuto reali nello stesso scope.
  fallbackPriority?: number;
  // Override espliciti di navigazione per direzione: { up: 'id-vicino' }
  // forza quel movimento ad andare lì, ignorando lo scoring geometrico.
  neighbors?: Partial<Record<'up' | 'down' | 'left' | 'right', string>>;
  // Catena sequenziale: elementi con lo stesso id di catena si navigano fra
  // loro per ordine visivo (non scoring geometrico), restando comunque nello
  // stesso group/scope del resto dell'overlay. Vedi commento in
  // RegistryItem per il caso d'uso (liste dinamiche annidate in un group 2D).
  sequentialChain?: string;
  // Asse primario della catena — default 'vertical'. La direzione
  // ortogonale (left/right per una catena verticale) non viene mai
  // intercettata dalla catena: usarla per collegare un elemento laterale
  // (es. pulsante elimina a fianco di una riga) via neighbors, senza che
  // la catena lo scavalchi. 'flow' cattura tutte le direzioni — per
  // liste che vanno a capo in modo non prevedibile (flex-wrap con
  // elementi di larghezza variabile).
  chainAxis?: 'vertical' | 'horizontal' | 'flow';
}

export const Focusable: React.FC<FocusableProps> = ({ id, group = 'main', children, onEnter, className, disableHoverFocus = false, fallbackPriority = 0, neighbors, sequentialChain, chainAxis }) => {
  const { focusedId, register, unregister, setFocusedId, activeGroup, isStaleMouseEnter } = useFocus();
  const ref = useRef<HTMLDivElement>(null);
  const isFocused = focusedId === id;
  const onEnterRef = useRef(onEnter);

  useEffect(() => { onEnterRef.current = onEnter; }, [onEnter]);

  // Serializza neighbors per la dependency array: l'oggetto stesso cambia
  // identità ad ogni render se passato come literal inline, il che
  // causerebbe un re-register continuo. La stringa è stabile a parità di
  // contenuto.
  const neighborsKey = neighbors ? JSON.stringify(neighbors) : '';

  useEffect(() => {
    register(id, group, ref, onEnterRef, fallbackPriority, neighbors, sequentialChain, chainAxis);
    return () => unregister(id);
  }, [id, group, register, unregister, fallbackPriority, neighborsKey, sequentialChain, chainAxis]);

  useEffect(() => {
    if (!isFocused) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEnterRef.current?.();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isFocused]);

  // FIX: se è impostato uno scope attivo (un overlay è aperto) e questo
  // Focusable NON appartiene a quel group, il mouse non deve poter rubare
  // il focus. Questo era esattamente il bug del mouse che, muovendosi sulla
  // dashboard sotto un overlay aperto, cambiava selectedGameId e faceva
  // caricare nell'overlay i dati di un gioco diverso.
  //
  // v0.99.19 — FIX bug navigazione controller: ignora i mouseenter
  // "passivi", generati dal browser quando il LAYOUT si muove sotto un
  // cursore che l'utente non ha mai toccato (es. durante lo scroll/
  // l'animazione del focus da controller) — non da un vero movimento del
  // mouse fisico. Senza --kiosk reale (v0.99.12) il cursore non viene più
  // nascosto automaticamente da Chromium, quindi questi eventi passivi
  // sono ora frequenti durante la navigazione, mentre prima erano
  // mascherati dal fatto che il cursore non era mai realmente presente
  // sullo schermo in modalità kiosk.
  const handleMouseEnter = (e: React.MouseEvent) => {
    if (disableHoverFocus) return;
    if (isStaleMouseEnter(e.clientX, e.clientY)) return;
    if (activeGroup && group !== activeGroup) return;
    setFocusedId(id);
  };

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onClick={onEnter}
      className={className}
      data-focused={isFocused}
    >
      {children(isFocused)}
    </div>
  );
};

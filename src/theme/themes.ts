/**
 * themes.ts — registro dei temi della Dashboard (v3.1.7-dev.1).
 *
 * Un tema è un file `themes/<id>.json` nella radice del progetto (stessa cartella letta da
 * overlay.py). I due built-in sono inclusi nella build. Un tema ha uno `scheme` (dark | light):
 * è ciò che vale `theme` in App.tsx, così le parti non ancora migrate ai colori con nome
 * (i vecchi `theme === 'dark' ? … : …`) seguono comunque lo schema giusto anche con un tema nuovo.
 *
 * Predisposto ma non esposto: `registerTheme()` accetta temi aggiuntivi e `applyTheme()` li applica,
 * ma il quick-menu alterna solo i temi `selectable` (oggi i due built-in).
 */
import type { Theme } from '../types';
import darkTheme from '../../themes/dark.json';
import lightTheme from '../../themes/light.json';

export interface ThemeDefinition {
  id: string;
  scheme: Theme;
  name: Record<string, string>;
  colors: Record<string, string>;
  overlay?: Record<string, string>;
}

export const DEFAULT_THEME_ID = 'dark';
const THEME_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
// Nome colore → variabile CSS --xl-<nome>. Solo minuscole, cifre e trattini.
const COLOR_KEY_RE = /^[a-z][a-z0-9-]{0,39}$/;
// Valore CSS: niente `;`, `{`, `}`, `<` (un valore non può chiudere la dichiarazione).
const COLOR_VALUE_RE = /^[^;{}<>]{1,80}$/;

const registry = new Map<string, ThemeDefinition>();
// Temi mostrati dal quick-menu, in ordine di ciclo.
const selectable: string[] = [];

export function isValidThemeId(id: unknown): id is string {
  return typeof id === 'string' && THEME_ID_RE.test(id);
}

/** Aggiunge (o sostituisce) un tema. Restituisce false se la definizione non è valida. */
export function registerTheme(def: unknown, opts: { selectable?: boolean } = {}): boolean {
  const d = def as Partial<ThemeDefinition> | null;
  if (!d || !isValidThemeId(d.id)) return false;
  if (d.scheme !== 'dark' && d.scheme !== 'light') return false;
  if (!d.colors || typeof d.colors !== 'object') return false;
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(d.colors)) {
    if (COLOR_KEY_RE.test(k) && typeof v === 'string' && COLOR_VALUE_RE.test(v)) colors[k] = v;
  }
  const name = (d.name && typeof d.name === 'object') ? d.name as Record<string, string> : { it: d.id, en: d.id };
  registry.set(d.id, { id: d.id, scheme: d.scheme, name, colors, overlay: d.overlay });
  if (opts.selectable && !selectable.includes(d.id)) selectable.push(d.id);
  return true;
}

registerTheme(darkTheme, { selectable: true });
registerTheme(lightTheme, { selectable: true });

export function getTheme(id: string | null | undefined): ThemeDefinition {
  return (id && registry.get(id)) || registry.get(DEFAULT_THEME_ID)!;
}

export function isKnownTheme(id: unknown): id is string {
  return typeof id === 'string' && registry.has(id);
}

/**
 * Nome del tema nella lingua indicata (campo "name" del file del tema): prima la lingua esatta
 * ("it"), poi quella principale ("pt-BR" → "pt"), poi l'inglese, infine l'id.
 */
export function themeDisplayName(id: string, lang: string | undefined): string {
  const name = getTheme(id).name || {};
  const l = (lang || '').toLowerCase();
  return name[l] || name[l.split('-')[0]] || name.en || getTheme(id).id;
}

/** Tema successivo nel ciclo del quick-menu (dark → light → dark). */
export function nextSelectableTheme(current: string): string {
  const i = selectable.indexOf(current);
  return selectable[(i + 1) % selectable.length] ?? DEFAULT_THEME_ID;
}

/**
 * Applica il tema alla pagina: variabili --xl-<nome> su <html>, `data-theme` e `color-scheme`.
 * Le variabili assenti nel tema ricadono su quelle del tema di default (un tema parziale non
 * lascia colori vuoti).
 */
export function applyTheme(id: string): ThemeDefinition {
  const def = getTheme(id);
  const base = getTheme(DEFAULT_THEME_ID);
  const root = document.documentElement;
  const merged = { ...base.colors, ...def.colors };
  for (const [k, v] of Object.entries(merged)) root.style.setProperty(`--xl-${k}`, v);
  root.dataset.theme = def.id;
  root.style.colorScheme = def.scheme;
  return def;
}

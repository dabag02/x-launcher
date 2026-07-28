/**
 * wineVerbs.ts — v1.1.119-dev.1
 *
 * Elenco dei verb winetricks riconosciuti da X-Launcher — condiviso tra
 * frontend (App.tsx, per le checkbox del widget "Dipendenze Wine") e
 * backend (gameManager.ts, per filtrare l'output di `winetricks
 * list-installed`).
 *
 * Nato da un bug reale: `winetricks list-installed` non stampa solo nomi
 * di verb — stampa anche il proprio banner di avvio ("Using winetricks
 * <versione> - sha256sum: ... con wine-X e WINEARCH=...") e i singoli
 * font installati come componenti separati di `corefonts` (andale,
 * arial, comicsans, ecc.). Filtrare quella robaccia riga per riga con
 * un'esclusione crescente sarebbe fragile e non finirebbe mai — invece,
 * si accetta nel DB SOLO ciò che è in questo elenco: qualunque altra cosa
 * `list-installed` stampi (banner, font, output futuro imprevisto) viene
 * scartata a prescindere, senza dover inseguire ogni caso.
 */

export const DEFAULT_WINE_VERBS = ['vcrun2022', 'dxvk', 'vkd3d', 'corefonts'];

export const OPTIONAL_WINE_VERBS = [
  'vcrun2019', 'vcrun2017', 'vcrun2015',
  'xna40',
  'd3dcompiler_47', 'd3dcompiler_43', 'd3d9',
  'physx',
  'msxml6', 'mfc140',
  'dotnet48', 'dotnet40', 'dotnet35',
];

export const ALL_KNOWN_WINE_VERBS = [...DEFAULT_WINE_VERBS, ...OPTIONAL_WINE_VERBS];

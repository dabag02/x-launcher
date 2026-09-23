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

/**
 * Step 19d — verificato leggendo il sorgente reale di winetricks
 * (w_metadata <verbo> settings, w_set_winver): questi verb NON installano
 * pacchetti, impostano solo la versione di Windows che Wine/Proton
 * dichiara al programma in esecuzione — un requisito comune per launcher
 * come Ubisoft Connect (win10 minimo). A differenza dei verb sopra, sono
 * MUTUAMENTE ESCLUSIVI: la prefix ha una sola versione attiva alla volta
 * nel registro, non ha senso selezionarne più di uno insieme — trattati
 * come sezione separata nell'overlay, non nella checklist multi-selezione.
 *
 * Nota importante verificata nel sorgente: `winetricks list-installed`
 * è un log CUMULATIVO (winetricks.log, solo append) — se in passato sono
 * stati applicati sia win10 sia win7 da terminale, compaiono ENTRAMBI
 * nell'output anche se solo l'ultimo è realmente attivo nel registro.
 * La riconciliazione in gameManager.ts tiene conto di questo (vedi
 * dedupeOsVersion lì) — mai assumere che list-installed rifletta lo
 * stato attuale per questa categoria, solo la cronologia di cosa è stato
 * applicato.
 */
export const OS_VERSION_VERBS = ['win10', 'win81', 'win7', 'vista', 'winxp'];

export const ALL_KNOWN_WINE_VERBS = [...DEFAULT_WINE_VERBS, ...OPTIONAL_WINE_VERBS, ...OS_VERSION_VERBS];

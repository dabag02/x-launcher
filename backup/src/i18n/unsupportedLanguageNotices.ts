// Step 19b (v1.1.63) — messaggi per l'autorilevamento della lingua di
// sistema quando la lingua rilevata NON è ancora fra quelle supportate
// (oggi solo 'it'/'en'). Richiesta esplicita dell'utente: il messaggio
// deve comparire nella lingua del sistema dell'utente, non in italiano o
// inglese — altrimenti chi apre l'app per la prima volta in, es., tedesco
// vedrebbe comunque un messaggio in una lingua che non capisce, vanificando
// lo scopo di spiegargli perché l'interfaccia è in inglese.
//
// Deliberatamente NON un namespace i18next fra i tanti altri: queste
// stringhe non fanno parte della UI tradotta (che copre solo it/en), sono
// contenuto informativo in lingue che l'app non supporta ancora come UI
// — stesso principio della Knowledge Base multilingua, contenuto a parte
// dal chrome dell'interfaccia. Il set cresce nel tempo (vedi roadmap) mano
// a mano che emergono richieste per lingue specifiche; qualunque lingua
// rilevata non presente qui riceve il messaggio inglese generico invece di
// nessun messaggio.
export interface UnsupportedLanguageNotice {
  title: string;
  body: string;
}

const NOTICES: Record<string, UnsupportedLanguageNotice> = {
  es: {
    title: 'Idioma no disponible todavía',
    body: 'Tu idioma del sistema (español) todavía no está disponible en X-Launcher — la interfaz se mostrará en inglés. Si puedes ayudar a traducir la aplicación al español, ponte en contacto con el desarrollador.',
  },
  de: {
    title: 'Sprache noch nicht verfügbar',
    body: 'Deine Systemsprache (Deutsch) wird von X-Launcher noch nicht unterstützt — die Oberfläche wird auf Englisch angezeigt. Wenn du beim Übersetzen der App ins Deutsche helfen kannst, melde dich bitte beim Entwickler.',
  },
  fr: {
    title: 'Langue pas encore disponible',
    body: "La langue de votre système (français) n'est pas encore prise en charge par X-Launcher — l'interface s'affichera en anglais. Si vous pouvez aider à traduire l'application en français, contactez le développeur.",
  },
  zh: {
    title: '尚不支持该语言',
    body: 'X-Launcher 尚未支持您系统的语言(简体中文)——界面将显示为英文。如果您能够帮助将本应用翻译成中文,请联系开发者。',
  },
};

const ENGLISH_FALLBACK: UnsupportedLanguageNotice = {
  title: 'Language not yet supported',
  body: "Your system language isn't supported yet by X-Launcher — the interface will show in English. If you're able to help translate the app into your language, please get in touch with the developer.",
};

/**
 * `systemLang` è il primary subtag BCP-47 già estratto (es. 'es' da
 * 'es-MX', 'zh' da 'zh-CN') — vedi il chiamante in App.tsx per
 * l'estrazione da navigator.language.
 */
export function getUnsupportedLanguageNotice(systemLang: string): UnsupportedLanguageNotice {
  return NOTICES[systemLang] ?? ENGLISH_FALLBACK;
}

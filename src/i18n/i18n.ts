// Step 19b (v1.1.38) — fondamenta i18n.
//
// Scelta di i18next-http-backend (invece di importare i JSON staticamente
// nel bundle) non è incidentale: la roadmap chiedeva esplicitamente
// "pacchetti caricabili" — poter aggiungere una lingua mettendo un nuovo
// file in public/locales/<lingua>/<namespace>.json, senza ricompilare
// l'app. Con l'import statico, ogni nuova lingua richiederebbe una modifica
// al codice sorgente e un nuovo build; con l'HTTP backend, il file viene
// letto a runtime dallo stesso express.static che già serve dist/ (vedi
// server.ts) — un domani anche un pacchetto di terze parti, purché nella
// cartella giusta con lo stesso nome di namespace.
//
// Un namespace per sezione principale della UI ('settings' allo Step 19b
// iniziale, 'quickMenu'/'dashboard'/'gameOptions' aggiunti in sessioni
// successive, altre in arrivo mano a mano che la migrazione prosegue
// sezione per sezione — vedi roadmap Step 19b) invece di un unico
// namespace globale: permette di caricare solo le traduzioni della
// sezione effettivamente visibile, e tiene ogni file di traduzione a una
// dimensione gestibile invece di un unico dizionario da migliaia di
// chiavi.
import i18n from 'i18next';
import HttpBackend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    // Italiano lingua di riferimento del progetto (vedi profilo/convenzioni
    // di sviluppo) — se una chiave manca in una lingua secondaria, il
    // fallback garantisce comunque un testo sensato invece di una chiave
    // grezza a schermo.
    lng: 'it',
    fallbackLng: 'it',
    supportedLngs: ['it', 'en'],
    ns: ['settings', 'quickMenu', 'dashboard', 'gameOptions', 'downloads', 'notifications', 'avatarLibrary'],
    defaultNS: 'settings',
    backend: {
      // Percorso relativo: risolto sia dal dev server Vite (che serve
      // public/ alla radice) sia da express.static(dist) in produzione,
      // perché Vite copia public/ dentro dist/ al build — stesso percorso
      // in entrambi i casi, nessuna configurazione condizionale per
      // dev/prod.
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: {
      // React già esegue l'escaping in fase di rendering — un doppio
      // escaping qui produrrebbe entità HTML visibili a schermo.
      escapeValue: false,
    },
    react: {
      // Evita di dover avvolgere l'albero in <Suspense>: con i file di
      // lingua serviti in locale (stesso host, nessuna rete esterna) il
      // costo di un breve fallback sulla chiave durante il primissimo
      // caricamento è trascurabile, e non richiede toccare la struttura
      // di rendering esistente in App.tsx.
      useSuspense: false,
    },
  });

export default i18n;

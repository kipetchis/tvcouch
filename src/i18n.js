// Système d'internationalisation de Tv Couch (FR / EN / ES)
// Usage : import { t, getLang, setLang, onLangChange } from "./i18n";
//         t("profile.stats")  ->  texte dans la langue courante
import { useState, useEffect } from "react";

const STORAGE_KEY = "tvcouch_lang";
const SUPPORTED = ["fr", "en", "es"];

// Détecte la langue au premier lancement (navigator.language), sinon "fr"
function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch {
    // ignore
  }
  const nav = (navigator.language || "fr").slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : "fr";
}

let currentLang = detectLang();
const listeners = new Set();

export function getLang() {
  return currentLang;
}

// Code de langue pour l'API TMDB (fr-FR, en-US, es-ES)
export function getTmdbLang() {
  switch (currentLang) {
    case "en": return "en-US";
    case "es": return "es-ES";
    default: return "fr-FR";
  }
}

export function setLang(lang) {
  if (!SUPPORTED.includes(lang) || lang === currentLang) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn(lang));
}

// S'abonner aux changements de langue (retourne une fonction de désinscription)
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const LANGUAGES = [
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "es", flag: "🇪🇸", label: "Español" },
];

// ─── Dictionnaire de traductions ────────────────────
// Organisé par sections. On enrichit au fur et à mesure des composants.
const DICT = {
  // Navigation (onglets)
  "nav.shows": { fr: "Séries", en: "Shows", es: "Series" },
  "nav.movies": { fr: "Films", en: "Movies", es: "Películas" },
  "nav.explore": { fr: "Explorer", en: "Explore", es: "Explorar" },
  "nav.profile": { fr: "Profil", en: "Profile", es: "Perfil" },

  // Général / communs
  "common.search": { fr: "Rechercher", en: "Search", es: "Buscar" },
  "common.back": { fr: "← Retour", en: "← Back", es: "← Volver" },
  "common.loading": { fr: "Chargement…", en: "Loading…", es: "Cargando…" },
  "common.done": { fr: "Terminé", en: "Done", es: "Hecho" },
  "common.logout": { fr: "Déconnexion", en: "Log out", es: "Cerrar sesión" },
  "common.add": { fr: "+ Ajouter", en: "+ Add", es: "+ Añadir" },
  "common.noPoster": { fr: "Pas d'affiche", en: "No poster", es: "Sin cartel" },
  "common.results": { fr: "Résultats", en: "Results", es: "Resultados" },

  // Écran de connexion
  "login.tagline": { fr: "Suivez vos séries et films.", en: "Track your shows and movies.", es: "Sigue tus series y películas." },
  "login.email": { fr: "Adresse email", en: "Email address", es: "Correo electrónico" },
  "login.password": { fr: "Mot de passe", en: "Password", es: "Contraseña" },
  "login.signIn": { fr: "Se connecter", en: "Sign in", es: "Iniciar sesión" },
  "login.createAccount": { fr: "Créer mon compte", en: "Create account", es: "Crear cuenta" },
  "login.forgot": { fr: "Mot de passe oublié ?", en: "Forgot password?", es: "¿Olvidaste tu contraseña?" },
  "login.noAccount": { fr: "Pas encore de compte ?", en: "No account yet?", es: "¿Aún no tienes cuenta?" },
  "login.hasAccount": { fr: "Déjà un compte ?", en: "Already have an account?", es: "¿Ya tienes cuenta?" },
  "login.createLink": { fr: "Créer un compte", en: "Create one", es: "Crear una" },
  "login.or": { fr: "ou", en: "or", es: "o" },
  "login.google": { fr: "Se connecter avec Google", en: "Sign in with Google", es: "Iniciar sesión con Google" },
  "login.resetSent": { fr: "Email de réinitialisation envoyé ! Vérifiez votre boîte (et les spams).", en: "Reset email sent! Check your inbox (and spam).", es: "¡Correo de restablecimiento enviado! Revisa tu bandeja (y spam)." },
  "login.resetNeedEmail": { fr: "Saisissez d'abord votre email ci-dessus, puis recliquez.", en: "Enter your email above first, then click again.", es: "Introduce tu correo arriba primero y vuelve a hacer clic." },
  "login.fillFields": { fr: "Veuillez remplir tous les champs.", en: "Please fill in all fields.", es: "Rellena todos los campos." },

  // Profil
  "profile.stats": { fr: "STATISTIQUES", en: "STATISTICS", es: "ESTADÍSTICAS" },
  "profile.episodesWatched": { fr: "Épisodes vus", en: "Episodes watched", es: "Episodios vistos" },
  "profile.seriesTime": { fr: "Temps devant les séries", en: "Time on shows", es: "Tiempo en series" },
  "profile.moviesWatched": { fr: "Films regardés", en: "Movies watched", es: "Películas vistas" },
  "profile.moviesTime": { fr: "Temps devant les films", en: "Time on movies", es: "Tiempo en películas" },
  "profile.favShows": { fr: "❤️ SÉRIES PRÉFÉRÉES", en: "❤️ FAVORITE SHOWS", es: "❤️ SERIES FAVORITAS" },
  "profile.favMovies": { fr: "❤️ FILMS PRÉFÉRÉS", en: "❤️ FAVORITE MOVIES", es: "❤️ PELÍCULAS FAVORITAS" },
  "profile.noFavShows": { fr: "Aucune série préférée. Ajoutez-en !", en: "No favorite shows yet. Add some!", es: "Sin series favoritas. ¡Añade algunas!" },
  "profile.noFavMovies": { fr: "Aucun film préféré. Ajoutez-en !", en: "No favorite movies yet. Add some!", es: "Sin películas favoritas. ¡Añade algunas!" },
  "profile.tools": { fr: "OUTILS", en: "TOOLS", es: "HERRAMIENTAS" },
  "profile.importShows": { fr: "Importer séries TV Time", en: "Import TV Time shows", es: "Importar series de TV Time" },
  "profile.importMovies": { fr: "Importer films TV Time", en: "Import TV Time movies", es: "Importar películas de TV Time" },
  "profile.importImdb": { fr: "Importer depuis IMDb (CSV)", en: "Import from IMDb (CSV)", es: "Importar desde IMDb (CSV)" },
  "profile.language": { fr: "LANGUE", en: "LANGUAGE", es: "IDIOMA" },
  "profile.support": { fr: "❤️ SOUTENIR TV COUCH", en: "❤️ SUPPORT TV COUCH", es: "❤️ APOYAR TV COUCH" },
  "profile.supportText": { fr: "Tv Couch est gratuit et sans publicité. Si l'app te plaît, tu peux soutenir son développement — merci beaucoup !", en: "Tv Couch is free and ad-free. If you like the app, you can support its development — thank you so much!", es: "Tv Couch es gratis y sin anuncios. Si te gusta la app, puedes apoyar su desarrollo — ¡muchas gracias!" },
  "profile.trophies": { fr: "TROPHÉES", en: "TROPHIES", es: "TROFEOS" },
  "profile.unlocked": { fr: "Débloqué", en: "Unlocked", es: "Desbloqueado" },
  "profile.locked": { fr: "Verrouillé", en: "Locked", es: "Bloqueado" },
};

export function t(key) {
  const entry = DICT[key];
  if (!entry) return key; // clé manquante : on renvoie la clé (visible pour debug)
  return entry[currentLang] || entry.fr || key;
}

// Hook React : renvoie la langue courante et re-rend le composant à chaque
// changement de langue. À utiliser au sommet de l'app pour propager partout.
export function useLang() {
  const [lang, setLangState] = useState(currentLang);
  useEffect(() => {
    const unsub = onLangChange((l) => setLangState(l));
    return unsub;
  }, []);
  return lang;
}
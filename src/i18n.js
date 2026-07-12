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

// Locale pour le formatage des dates/nombres (toLocaleDateString, etc.)
export function getLocale() {
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
  // On recharge la page : garantit que l'interface ET les données TMDB
  // (synopsis, titres d'épisodes, casting…) sont toutes dans la nouvelle langue.
  try {
    window.location.reload();
  } catch {
    // ignore (environnement sans window)
  }
}

// S'abonner aux changements de langue (retourne une fonction de désinscription)
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Petits drapeaux SVG (rendu identique sur toutes les plateformes,
// contrairement aux emojis qui ne s'affichent pas sous Windows).
export const FLAGS = {
  fr: (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='2' fill='#fff'/><rect width='1' height='2' fill='#0055A4'/><rect x='2' width='1' height='2' fill='#EF4135'/></svg>`
    )
  ),
  en: (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 30'><clipPath id='s'><path d='M0,0 v30 h60 v-30 z'/></clipPath><clipPath id='t'><path d='M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z'/></clipPath><g clip-path='url(#s)'><path d='M0,0 v30 h60 v-30 z' fill='#012169'/><path d='M0,0 L60,30 M60,0 L0,30' stroke='#fff' stroke-width='6'/><path d='M0,0 L60,30 M60,0 L0,30' clip-path='url(#t)' stroke='#C8102E' stroke-width='4'/><path d='M30,0 v30 M0,15 h60' stroke='#fff' stroke-width='10'/><path d='M30,0 v30 M0,15 h60' stroke='#C8102E' stroke-width='6'/></g></svg>`
    )
  ),
  es: (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='2' fill='#c60b1e'/><rect y='0.5' width='3' height='1' fill='#ffc400'/></svg>`
    )
  ),
};

export const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
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
  "common.searchShow": { fr: "Rechercher une série…", en: "Search a show…", es: "Buscar una serie…" },
  "common.toWatch": { fr: "À voir", en: "To watch", es: "Por ver" },
  "common.upcoming": { fr: "À venir", en: "Upcoming", es: "Próximamente" },
  "common.back": { fr: "← Retour", en: "← Back", es: "← Volver" },
  "common.loading": { fr: "Chargement…", en: "Loading…", es: "Cargando…" },
  "common.done": { fr: "Terminé", en: "Done", es: "Hecho" },
  "common.logout": { fr: "Déconnexion", en: "Log out", es: "Cerrar sesión" },
  "common.add": { fr: "+ Ajouter", en: "+ Add", es: "+ Añadir" },
  "common.noPoster": { fr: "Pas d'affiche", en: "No poster", es: "Sin cartel" },
  "common.results": { fr: "Résultats", en: "Results", es: "Resultados" },
  "common.watched": { fr: "✓ Vu", en: "✓ Watched", es: "✓ Visto" },
  "common.watchlist": { fr: "+ Liste", en: "+ List", es: "+ Lista" },
  "common.follow": { fr: "+ Suivre", en: "+ Follow", es: "+ Seguir" },
  "common.following": { fr: "✓ Suivie", en: "✓ Following", es: "✓ Siguiendo" },
  "common.toSee": { fr: "📌 À voir", en: "📌 To watch", es: "📌 Por ver" },

  // Films
  "movies.searchMovie": { fr: "Rechercher un film…", en: "Search a movie…", es: "Buscar una película…" },
  "movies.watched": { fr: "Vus", en: "Watched", es: "Vistas" },
  "movies.watchlist": { fr: "À voir", en: "To watch", es: "Por ver" },
  "movies.noneWatched": { fr: "Aucun film vu. Cherchez-en un !", en: "No watched movies. Search for one!", es: "Sin películas vistas. ¡Busca una!" },
  "movies.noneWatchlist": { fr: "Aucun film dans votre liste à voir.", en: "No movies in your watchlist.", es: "No hay películas en tu lista." },
  "movies.noneFilter": { fr: "Aucun film ne correspond à ce filtre.", en: "No movie matches this filter.", es: "Ninguna película coincide con el filtro." },
  "movies.filterTitle": { fr: "Filtrer par titre…", en: "Filter by title…", es: "Filtrar por título…" },
  "sort.recent": { fr: "Ajout récent", en: "Recently added", es: "Añadido recientemente" },
  "sort.title": { fr: "Titre A→Z", en: "Title A→Z", es: "Título A→Z" },
  "sort.note": { fr: "Note ↓", en: "Rating ↓", es: "Nota ↓" },
  "sort.year": { fr: "Année ↓", en: "Year ↓", es: "Año ↓" },
  "sort.activity": { fr: "Activité récente", en: "Recent activity", es: "Actividad reciente" },

  // Explorer
  "explore.trending": { fr: "🔥 Tendances de la semaine", en: "🔥 Trending this week", es: "🔥 Tendencias de la semana" },
  "explore.popularShows": { fr: "📺 Séries populaires", en: "📺 Popular shows", es: "📺 Series populares" },
  "explore.popularMovies": { fr: "🎬 Films populaires", en: "🎬 Popular movies", es: "🎬 Películas populares" },
  "explore.topShows": { fr: "🏆 Séries les mieux notées", en: "🏆 Top rated shows", es: "🏆 Series mejor valoradas" },
  "explore.topMovies": { fr: "🏆 Films les mieux notés", en: "🏆 Top rated movies", es: "🏆 Películas mejor valoradas" },

  // Séries (ShowsPage)
  "shows.loading": { fr: "Chargement de vos séries…", en: "Loading your shows…", es: "Cargando tus series…" },
  "shows.none": { fr: "Aucune série suivie. Cherchez-en une pour commencer !", en: "No shows followed. Search for one to start!", es: "No sigues ninguna serie. ¡Busca una para empezar!" },
  "shows.noneFilter": { fr: "Aucune série ne correspond à ce filtre.", en: "No show matches this filter.", es: "Ninguna serie coincide con el filtro." },
  "shows.updating": { fr: "Mise à jour de", en: "Updating", es: "Actualizando" },
  "shows.updatingShows": { fr: "série(s)…", en: "show(s)…", es: "serie(s)…" },
  "shows.sectionToWatch": { fr: "À VOIR", en: "TO WATCH", es: "POR VER" },
  "shows.sectionStale": { fr: "PAS REGARDÉ DEPUIS UN MOMENT", en: "NOT WATCHED IN A WHILE", es: "SIN VER HACE TIEMPO" },
  "shows.sectionNotStarted": { fr: "PAS ENCORE COMMENCÉES", en: "NOT STARTED YET", es: "AÚN NO EMPEZADAS" },
  "shows.filterAll": { fr: "Toutes les rubriques", en: "All sections", es: "Todas las secciones" },
  "shows.filterInProgress": { fr: "À voir", en: "To watch", es: "Por ver" },
  "shows.filterStale": { fr: "Pas regardé depuis un moment", en: "Not watched in a while", es: "Sin ver hace tiempo" },
  "shows.filterUpToDate": { fr: "À jour", en: "Up to date", es: "Al día" },
  "shows.filterNotStarted": { fr: "Pas encore commencées", en: "Not started yet", es: "Aún no empezadas" },
  "shows.gridView": { fr: "Vue grille", en: "Grid view", es: "Vista cuadrícula" },
  "shows.listView": { fr: "Vue liste", en: "List view", es: "Vista lista" },
  "shows.sectionUpToDate": { fr: "À JOUR", en: "UP TO DATE", es: "AL DÍA" },
  "shows.filterTitle": { fr: "Filtrer par titre…", en: "Filter by title…", es: "Filtrar por título…" },
  "shows.watchedCount": { fr: "vus", en: "watched", es: "vistos" },
  "shows.caughtUp": { fr: "À jour · nouveaux épisodes à venir", en: "Caught up · new episodes coming", es: "Al día · nuevos episodios en camino" },

  // À venir (UpcomingPage)
  "upcoming.loading": { fr: "Recherche des prochains épisodes…", en: "Searching for upcoming episodes…", es: "Buscando los próximos episodios…" },
  "upcoming.none": { fr: "Aucun épisode à venir pour vos séries suivies.", en: "No upcoming episodes for your followed shows.", es: "No hay episodios próximos para tus series." },

  // Fiche série (ShowDetail)
  "detail.episodes": { fr: "épisodes", en: "episodes", es: "episodios" },
  "detail.watchedOf": { fr: "vus", en: "watched", es: "vistos" },
  "detail.follow": { fr: "+ Suivre cette série", en: "+ Follow this show", es: "+ Seguir esta serie" },
  "detail.unfollow": { fr: "Ne plus suivre", en: "Unfollow", es: "Dejar de seguir" },
  "detail.unfollowConfirm": { fr: "Ne plus suivre cette série ? Vos épisodes cochés seront perdus.", en: "Unfollow this show? Your checked episodes will be lost.", es: "¿Dejar de seguir esta serie? Se perderán los episodios marcados." },
  "detail.whereToWatch": { fr: "Où regarder", en: "Where to watch", es: "Dónde ver" },
  "detail.providersNote": { fr: "Données JustWatch via TMDB · France", en: "JustWatch data via TMDB · France", es: "Datos de JustWatch vía TMDB · Francia" },
  "detail.specials": { fr: "Spéciaux", en: "Specials", es: "Especiales" },
  "detail.season": { fr: "Saison", en: "Season", es: "Temporada" },
  "detail.epShort": { fr: "ép.", en: "ep.", es: "ep." },
  "detail.checkAll": { fr: "Tout cocher", en: "Check all", es: "Marcar todo" },
  "detail.uncheckAll": { fr: "Tout décocher", en: "Uncheck all", es: "Desmarcar todo" },
  "detail.loadingEpisodes": { fr: "Chargement des épisodes…", en: "Loading episodes…", es: "Cargando episodios…" },

  // Fiche film (MovieDetail) + note
  "detail.myRating": { fr: "Ma note", en: "My rating", es: "Mi nota" },
  "detail.myComment": { fr: "Mon commentaire", en: "My comment", es: "Mi comentario" },
  "detail.commentPlaceholder": { fr: "Vos impressions sur ce film…", en: "Your thoughts on this movie…", es: "Tus impresiones sobre esta película…" },
  "detail.save": { fr: "Enregistrer", en: "Save", es: "Guardar" },
  "detail.saved": { fr: "✓ Enregistré", en: "✓ Saved", es: "✓ Guardado" },
  "detail.deleteRating": { fr: "Supprimer la note", en: "Delete rating", es: "Eliminar nota" },
  "detail.rateMarksWatched": { fr: "Noter ce film le marque comme vu.", en: "Rating this movie marks it as watched.", es: "Calificar esta película la marca como vista." },
  "detail.trailer": { fr: "Bande-annonce", en: "Trailer", es: "Tráiler" },
  "detail.cast": { fr: "Casting", en: "Cast", es: "Reparto" },
  "detail.airedOn": { fr: "Diffusé le", en: "Aired on", es: "Emitido el" },
  "detail.commentEpisodePlaceholder": { fr: "Vos impressions sur cet épisode…", en: "Your thoughts on this episode…", es: "Tus impresiones sobre este episodio…" },
  "detail.rateEpisodeMarksWatched": { fr: "Noter cet épisode le marque comme vu.", en: "Rating this episode marks it as watched.", es: "Calificar este episodio lo marca como visto." },

  // Imports (communs)
  "import.tvtimeShows": { fr: "Importer depuis TV Time", en: "Import from TV Time", es: "Importar desde TV Time" },
  "import.tvtimeMovies": { fr: "Importer les films TV Time", en: "Import TV Time movies", es: "Importar películas de TV Time" },
  "import.imdb": { fr: "Importer depuis IMDb", en: "Import from IMDb", es: "Importar desde IMDb" },
  "import.chooseShowsFile": { fr: "Choisir le fichier séries", en: "Choose shows file", es: "Elegir archivo de series" },
  "import.chooseMoviesFile": { fr: "Choisir le fichier films", en: "Choose movies file", es: "Elegir archivo de películas" },
  "import.chooseCsv": { fr: "Choisir un fichier CSV", en: "Choose a CSV file", es: "Elegir un archivo CSV" },
  "import.running": { fr: "Import en cours…", en: "Importing…", es: "Importando…" },
  "import.dontClose": { fr: "Ne fermez pas cette page pendant l'import.", en: "Don't close this page during import.", es: "No cierres esta página durante la importación." },
  "import.doneTitle": { fr: "Import terminé 🎉", en: "Import complete 🎉", es: "Importación completa 🎉" },
  "import.seeMyShows": { fr: "Voir mes séries", en: "See my shows", es: "Ver mis series" },
  "import.seeMyMovies": { fr: "Voir mes films", en: "See my movies", es: "Ver mis películas" },
  "import.shows": { fr: "séries", en: "shows", es: "series" },
  "import.movies": { fr: "films", en: "movies", es: "películas" },
  "import.showsImported": { fr: "séries importées", en: "shows imported", es: "series importadas" },
  "import.moviesImported": { fr: "films importés", en: "movies imported", es: "películas importadas" },
  "import.episodesMarked": { fr: "épisodes marqués vus", en: "episodes marked watched", es: "episodios marcados como vistos" },
  "import.markedWatched": { fr: "marqués vus", en: "marked watched", es: "marcadas como vistas" },
  "import.notFoundShows": { fr: "série(s) non importée(s)", en: "show(s) not imported", es: "serie(s) no importada(s)" },
  "import.notFoundMovies": { fr: "film(s) non importé(s)", en: "movie(s) not imported", es: "película(s) no importada(s)" },
  "import.tvtimeShowsHelp": { fr: "Sélectionnez votre fichier tvtime-series-….json. L'import va retrouver chaque série sur TMDB et marquer vos épisodes vus. Cela peut prendre plusieurs minutes pour un gros historique.", en: "Select your tvtime-series-….json file. The import will find each show on TMDB and mark your watched episodes. This may take several minutes for a large history.", es: "Selecciona tu archivo tvtime-series-….json. La importación buscará cada serie en TMDB y marcará tus episodios vistos. Puede tardar varios minutos si el historial es grande." },
  "import.tvtimeMoviesHelp": { fr: "Sélectionnez votre fichier tvtime-movies-….json. Les films seront ajoutés à vos films vus avec leur date.", en: "Select your tvtime-movies-….json file. Movies will be added to your watched movies with their date.", es: "Selecciona tu archivo tvtime-movies-….json. Las películas se añadirán a tus vistas con su fecha." },
  "import.imdbHelp": { fr: "Exporte tes notes ou ta watchlist IMDb en CSV (sur IMDb : ta liste → bouton « Export »), puis sélectionne le fichier ci-dessous. Les films seront ajoutés comme vus, les séries comme suivies. Les notes IMDb (/10) sont converties sur 5.", en: "Export your IMDb ratings or watchlist as CSV (on IMDb: your list → « Export » button), then select the file below. Movies are added as watched, shows as followed. IMDb ratings (/10) are converted to /5.", es: "Exporta tus valoraciones o watchlist de IMDb en CSV (en IMDb: tu lista → botón « Export »), luego selecciona el archivo abajo. Las películas se añaden como vistas, las series como seguidas. Las notas de IMDb (/10) se convierten a /5." },
  "import.imdbResult": { fr: "ajoutés", en: "added", es: "añadidos" },
  "import.imdbNotFound": { fr: "non trouvé(s).", en: "not found.", es: "no encontrado(s)." },
  "import.imdbSeeNotFound": { fr: "Voir les", en: "See the", es: "Ver los" },
  "import.imdbNotFoundSuffix": { fr: "non trouvés", en: "not found", es: "no encontrados" },

  // FavoritePicker
  "fav.addShow": { fr: "Ajouter une série préférée", en: "Add a favorite show", es: "Añadir una serie favorita" },
  "fav.addMovie": { fr: "Ajouter un film préféré", en: "Add a favorite movie", es: "Añadir una película favorita" },
  "fav.added": { fr: "✓ Ajouté", en: "✓ Added", es: "✓ Añadido" },
  "fav.add": { fr: "❤️ Ajouter", en: "❤️ Add", es: "❤️ Añadir" },

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
  "profile.months": { fr: "mois", en: "mo", es: "meses" },
  "profile.days": { fr: "j", en: "d", es: "d" },
  "profile.hours": { fr: "h", en: "h", es: "h" },
  "profile.updating": { fr: "mise à jour", en: "updating", es: "actualizando" },
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
  "profile.next": { fr: "prochain", en: "next", es: "siguiente" },
  "account.delete": { fr: "Supprimer mon compte", en: "Delete my account", es: "Eliminar mi cuenta" },
  "account.deleteTitle": { fr: "Supprimer définitivement le compte ?", en: "Permanently delete account?", es: "¿Eliminar la cuenta permanentemente?" },
  "account.deleteWarning": { fr: "Cette action est irréversible. Toutes tes données (séries, films, favoris, notes) seront définitivement supprimées.", en: "This action is irreversible. All your data (shows, movies, favorites, ratings) will be permanently deleted.", es: "Esta acción es irreversible. Todos tus datos (series, películas, favoritos, notas) se eliminarán permanentemente." },
  "account.deleteConfirm": { fr: "Oui, tout supprimer", en: "Yes, delete everything", es: "Sí, eliminar todo" },
  "account.cancel": { fr: "Annuler", en: "Cancel", es: "Cancelar" },
  "account.deleting": { fr: "Suppression en cours…", en: "Deleting…", es: "Eliminando…" },
  "account.reauthNeeded": { fr: "Pour des raisons de sécurité, reconnecte-toi pour confirmer la suppression.", en: "For security reasons, sign in again to confirm deletion.", es: "Por seguridad, vuelve a iniciar sesión para confirmar la eliminación." },
  "account.passwordPrompt": { fr: "Saisis ton mot de passe pour confirmer :", en: "Enter your password to confirm:", es: "Introduce tu contraseña para confirmar:" },
  "account.deleteError": { fr: "Erreur lors de la suppression. Réessaie.", en: "Error during deletion. Please try again.", es: "Error al eliminar. Inténtalo de nuevo." },
  "app.exitPrompt": { fr: "Appuyez de nouveau pour quitter", en: "Press again to exit", es: "Pulsa de nuevo para salir" },
  "tier.Bronze": { fr: "Bronze", en: "Bronze", es: "Bronce" },
  "tier.Argent": { fr: "Argent", en: "Silver", es: "Plata" },
  "tier.Or": { fr: "Or", en: "Gold", es: "Oro" },

  // ─── Trophées (nom + phrase pour chacun) ───
  "trophy.debutant.name": { fr: "Débutant", en: "Beginner", es: "Principiante" },
  "trophy.debutant.phrase": { fr: "Le premier pas vers l'abîme.", en: "The first step into the abyss.", es: "El primer paso hacia el abismo." },
  "trophy.serievore.name": { fr: "Sérievore", en: "Show Devourer", es: "Devoraseries" },
  "trophy.serievore.phrase": { fr: "Tu ne regardes pas des séries, tu les dévores.", en: "You don't watch shows, you devour them.", es: "No ves series, las devoras." },
  "trophy.nolife.name": { fr: "No Life", en: "No Life", es: "Sin Vida" },
  "trophy.nolife.phrase": { fr: "Dehors ? Il paraît qu'il y a du soleil.", en: "Outside? They say there's sunshine.", es: "¿Afuera? Dicen que hay sol." },
  "trophy.cinephile.name": { fr: "Cinéphile", en: "Cinephile", es: "Cinéfilo" },
  "trophy.cinephile.phrase": { fr: "Le pop-corn n'a plus de secret pour toi.", en: "Popcorn holds no secrets for you.", es: "Las palomitas ya no tienen secretos para ti." },
  "trophy.ceremonie.name": { fr: "Cérémonie", en: "Ceremony", es: "Ceremonia" },
  "trophy.ceremonie.phrase": { fr: "À ce stade, tu devrais présenter les César.", en: "At this point, you should host the Oscars.", es: "A estas alturas, deberías presentar los Goya." },
  "trophy.chronophage.name": { fr: "Chronophage", en: "Time Sink", es: "Devoratiempo" },
  "trophy.chronophage.phrase": { fr: "Le temps file quand on binge.", en: "Time flies when you binge.", es: "El tiempo vuela cuando maratoneas." },
  "trophy.zombie.name": { fr: "Zombie", en: "Zombie", es: "Zombi" },
  "trophy.zombie.phrase": { fr: "Ton canapé a pris la forme de ton corps.", en: "Your couch has molded to your body.", es: "Tu sofá ha tomado la forma de tu cuerpo." },
  "trophy.glandeur.name": { fr: "Glandeur", en: "Slacker", es: "Holgazán" },
  "trophy.glandeur.phrase": { fr: "Faut pas s'étonner de ce qu'on dit.", en: "No wonder people talk.", es: "No te extrañes de lo que dicen." },
  "trophy.marathonien.name": { fr: "Marathonien", en: "Marathoner", es: "Maratonista" },
  "trophy.marathonien.phrase": { fr: "Un marathon, mais assis.", en: "A marathon, but sitting down.", es: "Un maratón, pero sentado." },
  "trophy.insomniaque.name": { fr: "Insomniaque", en: "Insomniac", es: "Insomne" },
  "trophy.insomniaque.phrase": { fr: "Le sommeil, c'est pour les faibles.", en: "Sleep is for the weak.", es: "Dormir es para los débiles." },
  "trophy.collectionneur.name": { fr: "Collectionneur", en: "Collector", es: "Coleccionista" },
  "trophy.collectionneur.phrase": { fr: "Ta watchlist a besoin d'une watchlist.", en: "Your watchlist needs a watchlist.", es: "Tu lista necesita otra lista." },
  "trophy.serievoremonde.name": { fr: "Sérievore du monde", en: "Worldwide Watcher", es: "Devoraseries mundial" },
  "trophy.serievoremonde.phrase": { fr: "Plus de séries que de pays visités.", en: "More shows than countries visited.", es: "Más series que países visitados." },
  "trophy.finisseur.name": { fr: "Finisseur", en: "Finisher", es: "Finalizador" },
  "trophy.finisseur.phrase": { fr: "Toi au moins, tu finis ce que tu commences.", en: "At least you finish what you start.", es: "Al menos tú terminas lo que empiezas." },
  "trophy.completionniste.name": { fr: "Complétionniste", en: "Completionist", es: "Completista" },
  "trophy.completionniste.phrase": { fr: "Le générique de fin, ton meilleur ami.", en: "End credits, your best friend.", es: "Los créditos finales, tu mejor amigo." },
  "trophy.critique.name": { fr: "Critique", en: "Critic", es: "Crítico" },
  "trophy.critique.phrase": { fr: "Un avis sur tout, comme sur les réseaux.", en: "An opinion on everything, like on social media.", es: "Una opinión sobre todo, como en las redes." },
  "trophy.bavard.name": { fr: "Bavard", en: "Chatterbox", es: "Parlanchín" },
  "trophy.bavard.phrase": { fr: "Tu ne notes pas, tu disserte.", en: "You don't rate, you write essays.", es: "No puntúas, escribes ensayos." },
  "trophy.genereux.name": { fr: "Généreux", en: "Generous", es: "Generoso" },
  "trophy.genereux.phrase": { fr: "Pour toi, tout mérite un chef-d'œuvre.", en: "For you, everything deserves a masterpiece score.", es: "Para ti, todo merece una obra maestra." },
  "trophy.severe.name": { fr: "Sévère", en: "Harsh", es: "Severo" },
  "trophy.severe.phrase": { fr: "Impossible à satisfaire.", en: "Impossible to please.", es: "Imposible de satisfacer." },
  "trophy.nerd.name": { fr: "Nerd", en: "Nerd", es: "Friki" },
  "trophy.nerd.phrase": { fr: "Que la force soit avec toi.", en: "May the force be with you.", es: "Que la fuerza te acompañe." },
  "trophy.frissons.name": { fr: "Frissons", en: "Chills", es: "Escalofríos" },
  "trophy.frissons.phrase": { fr: "Tu regardes à travers tes doigts.", en: "You watch through your fingers.", es: "Miras entre los dedos." },
  "trophy.boutentrain.name": { fr: "Boute-en-train", en: "Life of the Party", es: "Alma de la fiesta" },
  "trophy.boutentrain.phrase": { fr: "Le rire, c'est la santé.", en: "Laughter is the best medicine.", es: "Reír es salud." },
  "trophy.enqueteur.name": { fr: "Enquêteur", en: "Investigator", es: "Investigador" },
  "trophy.enqueteur.phrase": { fr: "Tu as résolu l'affaire avant l'inspecteur.", en: "You cracked the case before the detective.", es: "Resolviste el caso antes que el inspector." },
  "trophy.noel.name": { fr: "Joyeux Noël", en: "Merry Christmas", es: "Feliz Navidad" },
  "trophy.noel.phrase": { fr: "Même le Père Noël prend une pause série.", en: "Even Santa takes a show break.", es: "Hasta Papá Noel hace una pausa para ver series." },
  "trophy.nouvelan.name": { fr: "Nouvelle année", en: "New Year", es: "Año Nuevo" },
  "trophy.nouvelan.phrase": { fr: "Bonne résolution : finir sa watchlist.", en: "New resolution: finish the watchlist.", es: "Propósito de año nuevo: terminar la lista." },
  "trophy.halloween.name": { fr: "Halloween", en: "Halloween", es: "Halloween" },
  "trophy.halloween.phrase": { fr: "Des frissons de saison.", en: "Seasonal chills.", es: "Escalofríos de temporada." },
  "trophy.valentin.name": { fr: "Saint-Valentin", en: "Valentine's Day", es: "San Valentín" },
  "trophy.valentin.phrase": { fr: "Un date avec ta série.", en: "A date with your show.", es: "Una cita con tu serie." },
  "trophy.fidele.name": { fr: "Fidèle", en: "Loyal", es: "Fiel" },
  "trophy.fidele.phrase": { fr: "Tv Couch fait partie de ta routine.", en: "Tv Couch is part of your routine.", es: "Tv Couch es parte de tu rutina." },
  "trophy.eclectique.name": { fr: "Éclectique", en: "Eclectic", es: "Ecléctico" },
  "trophy.eclectique.phrase": { fr: "Tu ne choisis pas ton camp.", en: "You don't pick a side.", es: "No eliges bando." },
  "trophy.fan.name": { fr: "Fan", en: "Fan", es: "Fan" },
  "trophy.fan.phrase": { fr: "Tu as des chouchous, avoue.", en: "You have favorites, admit it.", es: "Tienes favoritos, admítelo." },
  "trophy.casanier.name": { fr: "Casanier", en: "Homebody", es: "Casero" },
  "trophy.casanier.phrase": { fr: "Le canapé, c'est la vie.", en: "The couch is life.", es: "El sofá es la vida." },
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


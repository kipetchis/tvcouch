// Cache local partagé des listes d'épisodes (métadonnées).
// Utilisé par ShowsPage et UpcomingPage pour éviter de re-télécharger
// tous les épisodes via TMDB à chaque ouverture.
// On ne met en cache que saison/numéro/nom/date de diffusion (quasi figés) ;
// le statut "vu" reste toujours lu en direct depuis Firestore.
// Le cache est séparé par langue (les titres d'épisodes sont traduits).
import { getLang } from "./i18n";

const CACHE_PREFIX = "tvcouch_eps_";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

function cacheKey(showId) {
  return `${CACHE_PREFIX}${getLang()}_${showId}`;
}

// Nettoyage unique des anciens caches : sans langue (ancien format) OU
// sans l'info "ongoing" (antérieurs à la classification par statut de série).
// Ça force un re-fetch propre pour que les séries en cours soient bien classées.
(function purgeLegacyCache() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      const rest = k.slice(CACHE_PREFIX.length);
      // Ancien format sans langue → à supprimer
      if (!/^(fr|en|es)_/.test(rest)) {
        toRemove.push(k);
        continue;
      }
      // Format récent mais sans champ "ongoing" OU marqué avec l'ancienne
      // définition (basée sur le statut) → à re-fetcher.
      try {
        const parsed = JSON.parse(localStorage.getItem(k) || "{}");
        if (!("ongoing" in parsed) || parsed.v !== 2) toRemove.push(k);
      } catch {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
})();

export function readEpisodeCache(showId) {
  try {
    const raw = localStorage.getItem(cacheKey(showId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ts || Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed.episodes || null;
  } catch {
    return null;
  }
}

// Titre traduit de la série mis en cache (ou null)
export function readShowTitle(showId) {
  try {
    const raw = localStorage.getItem(cacheKey(showId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ts || Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed.title || null;
  } catch {
    return null;
  }
}

// La série est-elle encore en cours de diffusion ? (ou null si inconnu)
export function readShowOngoing(showId) {
  try {
    const raw = localStorage.getItem(cacheKey(showId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ts || Date.now() - parsed.ts > CACHE_TTL) return null;
    return typeof parsed.ongoing === "boolean" ? parsed.ongoing : null;
  } catch {
    return null;
  }
}

export function writeEpisodeCache(showId, episodes, title, ongoing) {
  try {
    // On préserve les champs existants si non fournis (ex. appel depuis À venir)
    let prev = {};
    try {
      const raw = localStorage.getItem(cacheKey(showId));
      if (raw) prev = JSON.parse(raw) || {};
    } catch {
      prev = {};
    }
    const slim = episodes.map((e) => ({
      season: e.season,
      episode: e.episode,
      name: e.name,
      air_date: e.air_date || null,
    }));
    localStorage.setItem(
      cacheKey(showId),
      JSON.stringify({
        ts: Date.now(),
        v: 2,
        title: title != null ? title : (prev.title || null),
        ongoing: typeof ongoing === "boolean" ? ongoing : (typeof prev.ongoing === "boolean" ? prev.ongoing : null),
        episodes: slim,
      })
    );
  } catch {
    // quota dépassé ou indisponible : on ignore, ce n'est qu'un cache
  }
}

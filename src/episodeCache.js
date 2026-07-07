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

// Nettoyage unique des anciens caches sans langue (format "tvcouch_eps_<id>")
// pour éviter d'afficher des titres dans la mauvaise langue après mise à jour.
(function purgeLegacyCache() {
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(CACHE_PREFIX)) continue;
      const rest = k.slice(CACHE_PREFIX.length);
      // Nouveau format : "fr_123", "en_123", "es_123" → on garde
      if (/^(fr|en|es)_/.test(rest)) continue;
      // Ancien format sans langue → à supprimer
      toRemove.push(k);
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

export function writeEpisodeCache(showId, episodes, title) {
  try {
    const slim = episodes.map((e) => ({
      season: e.season,
      episode: e.episode,
      name: e.name,
      air_date: e.air_date || null,
    }));
    localStorage.setItem(
      cacheKey(showId),
      JSON.stringify({ ts: Date.now(), title: title || null, episodes: slim })
    );
  } catch {
    // quota dépassé ou indisponible : on ignore, ce n'est qu'un cache
  }
}

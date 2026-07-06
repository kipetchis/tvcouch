// Appels à l'API TMDB via le proxy Cloudflare Worker
const WORKER_URL = "https://tvcouch-proxy.kip3tchis.workers.dev";

export const IMG_BASE = "https://image.tmdb.org/t/p";

export function posterUrl(path, size = "w300") {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path}`;
}

// URL d'un logo de plateforme (fournis par TMDB)
export function logoUrl(path, size = "w92") {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path}`;
}

// URL d'une photo de personne (casting)
export function profileUrl(path, size = "w185") {
  if (!path) return null;
  return `${IMG_BASE}/${size}${path}`;
}

async function tmdbFetch(path, params = {}) {
  const url = new URL(WORKER_URL + path);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Erreur TMDB (${response.status})`);
  }
  return response.json();
}

export function searchShows(query, page = 1) {
  return tmdbFetch("/search/tv", { query, page });
}

export function searchMovies(query, page = 1) {
  return tmdbFetch("/search/movie", { query, page });
}

export function getShow(id) {
  return tmdbFetch(`/tv/${id}`);
}

export function getMovie(id) {
  return tmdbFetch(`/movie/${id}`);
}

export function getSeason(showId, seasonNumber) {
  return tmdbFetch(`/tv/${showId}/season/${seasonNumber}`);
}

export async function findShowByTvdb(tvdbId) {
  const data = await tmdbFetch(`/find/${tvdbId}`, { external_source: "tvdb_id" });
  const results = data.tv_results || [];
  return results.length > 0 ? results[0] : null;
}

export async function findMovieByImdb(imdbId) {
  const data = await tmdbFetch(`/find/${imdbId}`, { external_source: "imdb_id" });
  const results = data.movie_results || [];
  return results.length > 0 ? results[0] : null;
}

export async function findShowByImdb(imdbId) {
  const data = await tmdbFetch(`/find/${imdbId}`, { external_source: "imdb_id" });
  const results = data.tv_results || [];
  return results.length > 0 ? results[0] : null;
}

export async function getShowRuntime(showId) {
  const details = await getShow(showId);
  const rt = details.episode_run_time;
  if (Array.isArray(rt) && rt.length > 0) return rt[0];
  return null;
}

// Casting d'un film
export function getMovieCredits(id) {
  return tmdbFetch(`/movie/${id}/credits`);
}

// Vidéos d'un film (bandes-annonces, teasers…). Langue optionnelle
// pour récupérer une bande-annonce anglaise si aucune en français.
export function getMovieVideos(id, language) {
  return tmdbFetch(`/movie/${id}/videos`, language ? { language } : {});
}

// Plateformes de streaming pour la France
export async function getWatchProviders(type, id) {
  // type: "tv" ou "movie"
  const data = await tmdbFetch(`/${type}/${id}/watch/providers`);
  const fr = (data.results && data.results.FR) || null;
  if (fr && fr.flatrate) {
    const seen = new Set();
    fr.flatrate = fr.flatrate.filter((p) => {
      let name = p.provider_name.toLowerCase();
      // On retire les variantes "avec pub"
      if (name.includes("with ads") || name.includes("avec pub")) {
        return false;
      }
      // Nom de base : on enlève tout ce qui est entre parenthèses
      // (ex: "Crunchyroll (Amazon Channel)" -> "crunchyroll")
      // et les mentions de canal / standard
      const base = name
        .replace(/\(.*?\)/g, "")
        .replace(/amazon channel/g, "")
        .replace(/apple tv channel/g, "")
        .replace(/standard with ads/g, "")
        .replace(/standard/g, "")
        .trim();
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    });
  }
  return fr;
}

export async function getAllEpisodes(showId) {
  const details = await getShow(showId);
  const seasons = (details.seasons || []).filter((s) => s.season_number >= 1);

  const seasonResults = await Promise.all(
    seasons.map((s) => getSeason(showId, s.season_number).catch(() => null))
  );

  const episodes = [];
  seasonResults.forEach((s) => {
    if (!s || !s.episodes) return;
    s.episodes.forEach((ep) => {
      episodes.push({
        season: s.season_number,
        episode: ep.episode_number,
        name: ep.name,
        air_date: ep.air_date || null,
      });
    });
  });

  episodes.sort((a, b) =>
    a.season !== b.season ? a.season - b.season : a.episode - b.episode
  );

  return { details, episodes };
}

// ─────────────────────────────────────────────
// Explorer : tendances, populaires, mieux notés
// ─────────────────────────────────────────────

// Tendances de la semaine, séries + films mélangés
// Chaque résultat contient media_type: "tv" | "movie" (parfois "person", à filtrer)
export function getTrending(page = 1) {
  return tmdbFetch("/trending/all/week", { page });
}

// type: "tv" ou "movie"
export function getPopular(type, page = 1) {
  return tmdbFetch(`/${type}/popular`, { page });
}

// type: "tv" ou "movie"
export function getTopRated(type, page = 1) {
  return tmdbFetch(`/${type}/top_rated`, { page });
}

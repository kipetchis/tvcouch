// Appels à l'API TMDB via le proxy Cloudflare Worker
const WORKER_URL = "https://tvcouch-proxy.kip3tchis.workers.dev";

export const IMG_BASE = "https://image.tmdb.org/t/p";

export function posterUrl(path, size = "w300") {
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

// Durée moyenne d'un épisode de la série (en minutes)
export async function getShowRuntime(showId) {
  const details = await getShow(showId);
  const rt = details.episode_run_time;
  if (Array.isArray(rt) && rt.length > 0) return rt[0];
  return null;
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
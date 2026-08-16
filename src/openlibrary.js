// Appels à l'API Open Library via le proxy Cloudflare Worker (mêmes
// origines que tmdb.js — le Worker pose le User-Agent recommandé par
// Open Library, ce que le navigateur ne permet pas de faire lui-même).

const WORKER_URL = "https://tvcouch-proxy.kip3tchis.workers.dev";

async function olFetch(path, params = {}) {
  const url = new URL(WORKER_URL + "/ol" + path);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Erreur Open Library (${response.status})`);
  }
  return response.json();
}

// URL d'une couverture de livre à partir de son cover_id (numérique,
// fourni par la recherche et les fiches œuvre). Tailles : S, M, L.
export function coverUrl(coverId, size = "M") {
  if (!coverId) return null;
  return `${WORKER_URL}/ol-covers/b/id/${coverId}-${size}.jpg`;
}

// Recherche de livres par texte libre (titre, auteur...)
export function searchBooks(query, page = 1) {
  return olFetch("/search.json", { q: query, page, limit: 20 });
}

// Détail d'une œuvre (description, sujets/genres, couvertures, auteurs)
// workId attendu sous forme "OL12345W" (avec ou sans le préfixe /works/)
export function getWork(workId) {
  const id = workId.replace(/^\/?works\//, "").replace(/\.json$/, "");
  return olFetch(`/works/${id}.json`);
}

// Détail d'un auteur (nom, bio...)
export function getAuthor(authorKey) {
  const id = authorKey.replace(/^\/?authors\//, "").replace(/\.json$/, "");
  return olFetch(`/authors/${id}.json`);
}

// Toutes les œuvres d'un auteur (utilisé pour "Ce qui pourrait vous plaire")
export function getAuthorWorks(authorKey, limit = 20) {
  const id = authorKey.replace(/^\/?authors\//, "").replace(/\.json$/, "");
  return olFetch(`/authors/${id}/works.json`, { limit });
}

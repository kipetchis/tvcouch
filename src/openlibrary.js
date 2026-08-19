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

// URL d'une couverture. Accepte soit un cover_id numérique Open Library
// (tailles S/M/L), soit une URL directe déjà complète (Google Books, ou
// toute source http/https) qu'on renvoie telle quelle.
export function coverUrl(coverId, size = "M") {
  if (!coverId) return null;
  if (typeof coverId === "string" && /^https?:\/\//.test(coverId)) return coverId;
  return `${WORKER_URL}/ol-covers/b/id/${coverId}-${size}.jpg`;
}

// Recherche de livres par texte libre (titre, auteur...)
export function searchBooks(query, page = 1) {
  return olFetch("/search.json", { q: query, page, limit: 20 });
}

// Résout un ISBN scanné vers son édition Open Library (contient le lien
// vers l'œuvre parente ainsi qu'une couverture propre à cette édition).
export function getEditionByIsbn(isbn) {
  return olFetch(`/isbn/${isbn}.json`);
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

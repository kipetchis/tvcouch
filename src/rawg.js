// Accès à l'API RAWG (base de données de jeux vidéo) via le proxy
// Cloudflare (même Worker que TMDB/Google Books) : la clé RAWG_KEY est un
// secret côté serveur, jamais exposé dans l'app, et les réponses sont
// mises en cache 6h. RAWG impose d'attribuer la source (lien vers rawg.io)
// quelque part dans l'app — à prévoir dans une mention "Données : RAWG".

const WORKER_URL = "https://tvcouch-proxy.kip3tchis.workers.dev";

// Recherche de jeux par texte. Renvoie une liste allégée (la recherche
// RAWG ne fournit ni le studio ni la description : on les récupère à la
// fiche via getGame()).
export async function searchGames(query, pageSize = 20) {
  const url = `${WORKER_URL}/rawg/games?search=${encodeURIComponent(query)}&page_size=${pageSize}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur RAWG (${res.status})`);
  const data = await res.json();
  return (data.results || []).map(normalizeSearchResult);
}

// Fiche complète d'un jeu (studio, description, genres...).
export async function getGame(gameId) {
  const url = `${WORKER_URL}/rawg/games/${gameId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Erreur RAWG (${res.status})`);
  return res.json();
}

// Résultat de recherche -> forme allégée commune. Le studio (developer)
// n'est pas dans la recherche RAWG ; il sera complété depuis la fiche.
function normalizeSearchResult(g) {
  const yearMatch = (g.released || "").match(/\d{4}/);
  return {
    id: g.id,
    name: g.name,
    cover_url: g.background_image || null,
    release_year: yearMatch ? Number(yearMatch[0]) : null,
    released: g.released || null,
    genres: (g.genres || []).map((x) => x.name),
    platforms: (g.platforms || []).map((p) => p.platform && p.platform.name).filter(Boolean),
    metacritic: g.metacritic || null,
  };
}

// Extrait le studio (developer principal, sinon publisher) d'une fiche.
export function studioOf(gameDetail) {
  if (!gameDetail) return null;
  if (gameDetail.developers && gameDetail.developers.length > 0) {
    return gameDetail.developers[0].name;
  }
  if (gameDetail.publishers && gameDetail.publishers.length > 0) {
    return gameDetail.publishers[0].name;
  }
  return null;
}

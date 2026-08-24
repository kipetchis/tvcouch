// Grands genres de jeux vidéo (liste fixe). Les jeux stockent leurs genres
// sous forme de noms texte (issus de RAWG, ex. "Action", "Role-Playing
// Games (RPG)"). On rattache par mots-clés, façon tolérante, pour regrouper
// les variantes (ex. "RPG" ← "role-playing").
//
// L'id sert de clé i18n : gameGenre.<id>

export const GAME_GENRES = [
  { id: "action", keywords: ["action"] },
  { id: "adventure", keywords: ["adventure", "aventure"] },
  { id: "rpg", keywords: ["rpg", "role-playing", "role playing", "jdr"] },
  { id: "shooter", keywords: ["shooter", "fps", "tir"] },
  { id: "platformer", keywords: ["platformer", "platform", "plateforme"] },
  { id: "strategy", keywords: ["strategy", "stratégie", "tactics", "tactical"] },
  { id: "puzzle", keywords: ["puzzle", "réflexion"] },
  { id: "racing", keywords: ["racing", "course", "driving"] },
  { id: "sports", keywords: ["sports", "sport"] },
  { id: "fighting", keywords: ["fighting", "combat", "baston"] },
  { id: "simulation", keywords: ["simulation", "simulator", "gestion", "management"] },
  { id: "indie", keywords: ["indie", "indépendant"] },
  { id: "arcade", keywords: ["arcade"] },
  { id: "family", keywords: ["family", "familial", "casual", "educational", "éducatif"] },
  { id: "horror", keywords: ["horror", "horreur", "survival horror"] },
];

// Renvoie la liste des ids de genres correspondant aux genres (noms) d'un jeu.
export function gameGenresOf(genres) {
  if (!genres || genres.length === 0) return [];
  const hay = genres.map((g) => String(g).toLowerCase()).join(" | ");
  const found = [];
  GAME_GENRES.forEach((g) => {
    if (g.keywords.some((kw) => hay.includes(kw))) found.push(g.id);
  });
  return found;
}

export function gameMatchesGenre(genres, genreId) {
  if (!genreId) return true;
  return gameGenresOf(genres).includes(genreId);
}

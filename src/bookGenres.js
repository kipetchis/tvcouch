// Grands genres de livres (liste fixe, façon TMDB pour les films).
// Chaque genre est reconnu à partir des subjects/categories bruts d'un
// livre (Open Library + Google Books) via une liste de mots-clés : on
// teste si l'un des termes apparaît dans l'un des sujets. C'est volontaire-
// ment tolérant (recherche de sous-chaîne, insensible à la casse) car les
// sources ne sont pas normalisées.
//
// L'id sert de clé i18n : bookGenre.<id>

export const BOOK_GENRES = [
  { id: "fantasy", keywords: ["fantasy", "fantastique", "heroic", "magie", "magic", "dragons"] },
  { id: "scifi", keywords: ["science fiction", "science-fiction", "sci-fi", "dystopia", "dystopie", "space"] },
  { id: "policier", keywords: ["crime", "detective", "policier", "thriller", "mystery", "mystère", "enquête", "noir"] },
  { id: "horreur", keywords: ["horror", "horreur", "épouvante", "gothic", "vampire", "zombie"] },
  { id: "romance", keywords: ["romance", "love", "amour", "sentimental"] },
  { id: "aventure", keywords: ["adventure", "aventure", "action"] },
  { id: "historique", keywords: ["history", "historical", "histoire", "historique"] },
  { id: "manga", keywords: ["manga", "shonen", "shōnen", "seinen", "shojo", "shōjo"] },
  { id: "bd", keywords: ["comic", "comics", "bande dessinée", "graphic novel", "roman graphique"] },
  { id: "jeunesse", keywords: ["juvenile", "jeunesse", "children", "enfant", "young adult", "album"] },
  { id: "biographie", keywords: ["biography", "biographie", "autobiography", "mémoires", "memoir"] },
  { id: "humour", keywords: ["humor", "humour", "comic", "comedy", "comédie"] },
  { id: "essai", keywords: ["essay", "essai", "philosophy", "philosophie", "politique", "society", "société"] },
  { id: "classique", keywords: ["classic", "classique", "literature", "littérature"] },
];

// Renvoie la liste des ids de genres correspondant aux subjects d'un livre.
// Un livre peut appartenir à plusieurs genres.
export function bookGenresOf(subjects) {
  if (!subjects || subjects.length === 0) return [];
  const hay = subjects.map((s) => String(s).toLowerCase()).join(" | ");
  const found = [];
  BOOK_GENRES.forEach((g) => {
    if (g.keywords.some((kw) => hay.includes(kw))) found.push(g.id);
  });
  return found;
}

// Vrai si le livre correspond au genre demandé.
export function bookMatchesGenre(subjects, genreId) {
  if (!genreId) return true;
  return bookGenresOf(subjects).includes(genreId);
}

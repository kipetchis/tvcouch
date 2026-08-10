// Correspondance entre les IDs de genre TMDB et les clés i18n "genre.xxx".
// TMDB utilise deux listes distinctes pour les films et les séries (IDs
// différents, ex. 10759 "Action & Aventure" n'existe que côté séries).

export const MOVIE_GENRE_MAP = {
  28: "action",
  12: "adventure",
  16: "animation",
  35: "comedy",
  80: "crime",
  99: "documentary",
  18: "drama",
  10751: "family",
  14: "fantasy",
  36: "history",
  27: "horror",
  10402: "music",
  9648: "mystery",
  10749: "romance",
  878: "scifi",
  10770: "tvMovie",
  53: "thriller",
  10752: "war",
  37: "western",
};

export const TV_GENRE_MAP = {
  10759: "actionAdventure",
  16: "animation",
  35: "comedy",
  80: "crime",
  99: "documentary",
  18: "drama",
  10751: "family",
  10762: "kids",
  9648: "mystery",
  10763: "news",
  10764: "reality",
  10765: "scifiFantasy",
  10766: "soap",
  10767: "talk",
  10768: "warPolitics",
  37: "western",
};

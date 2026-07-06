// Système de trophées de Tv Couch.
// Tout est calculé à partir des données existantes (épisodes, films, notes,
// séries suivies, favoris) + un petit suivi de connexion en localStorage et
// un cache des genres/nombre d'épisodes récupérés via TMDB.
import { t } from "./i18n";

// Genres TMDB (séries TV)
export const GENRE = { SCIFI: 10765, MYSTERY: 9648, COMEDY: 35, CRIME: 80 };

// ─── Calcul des statistiques agrégées ───────────────
export function computeTrophyStats({
  shows,
  movies,
  favorites,
  metaMap,
  seriesMinutes,
  moviesMinutes,
  loginStreak,
}) {
  let episodes = 0;
  let showsCompleted = 0;
  let ratings = 0;
  let comments = 0;
  let five = 0;
  let one = 0;
  const dayCount = {};
  const dateFlags = { christmas: 0, newyear: 0, halloween: 0, valentine: 0 };
  const genre = { scifi: 0, mystery: 0, comedy: 0, crime: 0 };

  const checkDate = (d) => {
    if (typeof d !== "string" || d.length < 10) return;
    const md = d.slice(5, 10);
    if (md === "12-25") dateFlags.christmas = 1;
    if (md === "01-01") dateFlags.newyear = 1;
    if (md === "10-31") dateFlags.halloween = 1;
    if (md === "02-14") dateFlags.valentine = 1;
  };

  shows.forEach((s) => {
    const watched = s.watched || {};
    const keys = Object.keys(watched);
    episodes += keys.length;
    keys.forEach((k) => {
      const d = watched[k];
      if (typeof d === "string" && d.length >= 10) {
        const day = d.slice(0, 10);
        dayCount[day] = (dayCount[day] || 0) + 1;
      }
      checkDate(d);
    });

    const r = s.ratings || {};
    Object.values(r).forEach((rt) => {
      if (rt && rt.note > 0) {
        ratings += 1;
        if (rt.note === 5) five += 1;
        if (rt.note === 1) one += 1;
      }
      if (rt && rt.comment && rt.comment.trim()) comments += 1;
    });

    const meta = metaMap[s.id];
    if (meta) {
      if (meta.total > 0 && keys.length >= meta.total) showsCompleted += 1;
      (meta.genres || []).forEach((g) => {
        if (g === GENRE.SCIFI) genre.scifi += 1;
        else if (g === GENRE.MYSTERY) genre.mystery += 1;
        else if (g === GENRE.COMEDY) genre.comedy += 1;
        else if (g === GENRE.CRIME) genre.crime += 1;
      });
    }
  });

  const watchedMovies = movies.filter((m) => m.status === "watched");
  watchedMovies.forEach((m) => {
    if (m.note > 0) {
      ratings += 1;
      if (m.note === 5) five += 1;
      if (m.note === 1) one += 1;
    }
    if (m.comment && m.comment.trim()) comments += 1;
    checkDate(m.watchedDate);
  });

  const maxPerDay = Object.values(dayCount).reduce((a, b) => Math.max(a, b), 0);
  const favoritesCount =
    (favorites.shows ? favorites.shows.length : 0) +
    (favorites.movies ? favorites.movies.length : 0);
  const totalMinutes = (seriesMinutes || 0) + (moviesMinutes || 0);

  return {
    episodes,
    movies: watchedMovies.length,
    totalMinutes,
    showsFollowed: shows.length,
    showsCompleted,
    ratings,
    comments,
    five,
    one,
    maxPerDay,
    favoritesCount,
    eclectic: episodes > 0 && watchedMovies.length > 0 ? 1 : 0,
    christmas: dateFlags.christmas,
    newyear: dateFlags.newyear,
    halloween: dateFlags.halloween,
    valentine: dateFlags.valentine,
    genreScifi: genre.scifi,
    genreMystery: genre.mystery,
    genreComedy: genre.comedy,
    genreCrime: genre.crime,
    loginStreak: loginStreak || 0,
    unlockedCount: 0, // rempli après coup pour le trophée méta
  };
}

// ─── Définition des 30 trophées ─────────────────────
// tiers: [ ["Bronze", seuil], ["Argent", seuil], ["Or", seuil] ]
// goal: seuil unique (trophée simple / booléen)
export const TROPHIES = [
  // Épisodes
  { id: "debutant", emoji: "👶", metric: "episodes", goal: 1 },
  { id: "serievore", emoji: "🍿", metric: "episodes", tiers: [["Bronze", 100], ["Argent", 500], ["Or", 1000]] },
  { id: "nolife", emoji: "🌙", metric: "episodes", tiers: [["Bronze", 2000], ["Argent", 5000], ["Or", 10000]] },
  // Films
  { id: "cinephile", emoji: "🎬", metric: "movies", tiers: [["Bronze", 10], ["Argent", 50], ["Or", 100]] },
  { id: "ceremonie", emoji: "🏆", metric: "movies", goal: 250 },
  // Temps (en minutes)
  { id: "chronophage", emoji: "⌛", metric: "totalMinutes", tiers: [["Bronze", 1440], ["Argent", 10080], ["Or", 43200]] },
  { id: "zombie", emoji: "🧟", metric: "totalMinutes", goal: 129600 },
  // Binge (épisodes dans la même journée)
  { id: "glandeur", emoji: "🦥", metric: "maxPerDay", goal: 4 },
  { id: "marathonien", emoji: "🏃", metric: "maxPerDay", goal: 10 },
  { id: "insomniaque", emoji: "💀", metric: "maxPerDay", goal: 15 },
  // Séries suivies
  { id: "collectionneur", emoji: "🗂️", metric: "showsFollowed", tiers: [["Bronze", 10], ["Argent", 50], ["Or", 100]] },
  { id: "serievoremonde", emoji: "🌍", metric: "showsFollowed", goal: 200 },
  // Séries terminées
  { id: "finisseur", emoji: "🏁", metric: "showsCompleted", tiers: [["Bronze", 1], ["Argent", 10], ["Or", 25]] },
  { id: "completionniste", emoji: "👑", metric: "showsCompleted", goal: 50 },
  // Notes & commentaires
  { id: "critique", emoji: "✍️", metric: "ratings", tiers: [["Bronze", 10], ["Argent", 50], ["Or", 100]] },
  { id: "bavard", emoji: "💬", metric: "comments", goal: 25 },
  { id: "genereux", emoji: "💯", metric: "five", goal: 10 },
  { id: "severe", emoji: "🌶️", metric: "one", goal: 10 },
  // Genres
  { id: "nerd", emoji: "🦸", metric: "genreScifi", goal: 5 },
  { id: "frissons", emoji: "😱", metric: "genreMystery", goal: 5 },
  { id: "boutentrain", emoji: "😂", metric: "genreComedy", goal: 10 },
  { id: "enqueteur", emoji: "🔪", metric: "genreCrime", goal: 10 },
  // Dates
  { id: "noel", emoji: "🎄", metric: "christmas", goal: 1 },
  { id: "nouvelan", emoji: "🎆", metric: "newyear", goal: 1 },
  { id: "halloween", emoji: "🎃", metric: "halloween", goal: 1 },
  { id: "valentin", emoji: "💘", metric: "valentine", goal: 1 },
  // Divers / fun
  { id: "fidele", emoji: "📅", metric: "loginStreak", goal: 7 },
  { id: "eclectique", emoji: "🍿", metric: "eclectic", goal: 1 },
  { id: "fan", emoji: "❤️", metric: "favoritesCount", goal: 5 },
  { id: "casanier", emoji: "🛋️", metric: "unlockedCount", goal: 20 },
];

// Nom et phrase traduits d'un trophée (via i18n)
export function trophyName(def) {
  return t(`trophy.${def.id}.name`);
}
export function trophyPhrase(def) {
  return t(`trophy.${def.id}.phrase`);
}

// ─── Évaluation d'un trophée ────────────────────────
export function evaluateTrophy(def, stats) {
  const value = stats[def.metric] || 0;

  if (def.tiers) {
    let tierLabel = null;
    let reached = -1;
    def.tiers.forEach((tier, i) => {
      if (value >= tier[1]) {
        tierLabel = tier[0];
        reached = i;
      }
    });
    const unlocked = reached >= 0;
    const next = def.tiers[reached + 1];
    const maxed = reached === def.tiers.length - 1;
    return {
      unlocked,
      label: unlocked ? t(`tier.${tierLabel}`) : null,
      current: value,
      target: next ? next[1] : def.tiers[def.tiers.length - 1][1],
      nextLabel: next ? t(`tier.${next[0]}`) : null,
      maxed,
    };
  }

  const unlocked = value >= def.goal;
  return {
    unlocked,
    label: unlocked ? t("profile.unlocked") : null,
    current: value,
    target: def.goal,
    nextLabel: null,
    maxed: unlocked,
  };
}

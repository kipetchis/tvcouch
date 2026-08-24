import { useState, useEffect, useMemo } from "react";
import {
  getAllShows, getFavorites, removeFavoriteShow, removeFavoriteMovie,
  setShowRuntime, setMovieRuntime, deleteAllUserData,
} from "./store";
import { getAllMovies } from "./movieStore";
import { getAllBooks } from "./bookStore";
import { getAllGames } from "./gameStore";
import { getAllVolumes } from "./mangaStore";
import { getShow, getShowRuntime, getMovie, posterUrl } from "./tmdb";
import MovieDetail from "./MovieDetail";
import TranslatedTitle from "./TranslatedTitle";
import { TROPHIES, computeTrophyStats, evaluateTrophy, trophyName, trophyPhrase } from "./trophies";
import { LANGUAGES, FLAGS, getLang, setLang, t } from "./i18n";
import { useTheme, setTheme } from "./theme";
import { deleteAccount, reauthenticate, getAuthProvider, authErrorMessage } from "./firebase";
import { useBackClose } from "./backNav";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Formate un total de minutes en mois / jours / heures
function formatTime(totalMinutes) {
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  const remHours = totalHours % 24;
  return { months, days: remDays, hours: remHours };
}

// ─── Suivi de connexion (pour le trophée "Fidèle") ──
function recordAndGetStreak() {
  const KEY = "tvcouch_logins";
  let arr = [];
  try {
    arr = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    arr = [];
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!arr.includes(today)) arr.push(today);
  arr = arr.sort().slice(-90);
  try {
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
  const set = new Set(arr);
  let streak = 0;
  const d = new Date();
  for (;;) {
    const ds = d.toISOString().slice(0, 10);
    if (set.has(ds)) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

// ─── Cache local des méta séries (genres + nb d'épisodes) ──
const META_PREFIX = "tvcouch_meta_";
const META_TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours

function readMeta(id) {
  try {
    const raw = localStorage.getItem(META_PREFIX + id);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p.ts || Date.now() - p.ts > META_TTL) return null;
    return p;
  } catch {
    return null;
  }
}

function writeMeta(id, genres, total) {
  try {
    localStorage.setItem(
      META_PREFIX + id,
      JSON.stringify({ ts: Date.now(), genres, total })
    );
  } catch {
    // ignore
  }
}

// ---- Helpers pour les statistiques de lecture (section Livres) ----
function bookCleanSubject(raw) {
  if (!raw) return null;
  let s = String(raw);
  if (s.includes("/")) s = s.split("/").pop();
  s = s.trim().toLowerCase();
  if (s.length < 2 || s.length > 30) return null;
  return s;
}
function bookTopCounts(items, n) {
  const map = new Map();
  items.forEach((it) => { if (it) map.set(it, (map.get(it) || 0) + 1); });
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
}

export default function ProfilePage({ user, onImportShows, onImportMovies, onImportImdb, onImportTrakt, onOpenFavorites, onOpenShow, onOpenStats }) {
  const [seriesTime, setSeriesTime] = useState(0); // minutes
  const [moviesTime, setMoviesTime] = useState(0);
  const [favorites, setFavorites] = useState({ shows: [], movies: [] });
  const [openMovie, setOpenMovie] = useState(null);

  // Retour / swipe : ferme la fiche film avant de revenir à la liste
  useBackClose(!!openMovie, () => setOpenMovie(null));
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Données brutes pour les trophées
  const [showsData, setShowsData] = useState([]);
  const [moviesData, setMoviesData] = useState([]);
  const [booksData, setBooksData] = useState([]);
  const [volumesData, setVolumesData] = useState([]);
  const [gamesData, setGamesData] = useState([]);
  const [metaMap, setMetaMap] = useState({});
  const [loginStreak] = useState(() => recordAndGetStreak());
  const [openTrophy, setOpenTrophy] = useState(null);
  useBackClose(!!openTrophy, () => setOpenTrophy(null));

  // Suppression de compte
  const [showDelete, setShowDelete] = useState(false);
  useBackClose(showDelete, () => { if (!deleting) setShowDelete(false); });
  const [deleting, setDeleting] = useState(false);
  const [needPassword, setNeedPassword] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState(null);

  // Menu "..." du profil (Outils, Langue, Suppression de compte)
  const [menuOpen, setMenuOpen] = useState(false);
  const theme = useTheme();
  useBackClose(menuOpen, () => setMenuOpen(false));

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      // 1) Supprime d'abord les données Firestore
      await deleteAllUserData();
      // 2) Puis le compte Auth (peut exiger une reconnexion récente)
      await deleteAccount();
      // onAuthStateChanged basculera vers l'écran de connexion
    } catch (err) {
      if (err.code === "auth/requires-recent-login") {
        // Reconnexion nécessaire
        const provider = getAuthProvider();
        if (provider === "google.com") {
          try {
            await reauthenticate();
            await deleteAllUserData();
            await deleteAccount();
          } catch (e) {
            setDeleteError(t("account.deleteError"));
            setDeleting(false);
          }
        } else {
          // Email : on demande le mot de passe
          setNeedPassword(true);
          setDeleting(false);
        }
      } else {
        setDeleteError(t("account.deleteError"));
        setDeleting(false);
      }
    }
  };

  const handleReauthAndDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await reauthenticate(deletePassword);
      await deleteAllUserData();
      await deleteAccount();
    } catch (err) {
      setDeleteError(authErrorMessage(err.code) || t("account.deleteError"));
      setDeleting(false);
    }
  };

  // Épisodes vus (dérivé, instantané)
  const episodesWatched = useMemo(
    () => showsData.reduce((n, s) => n + Object.keys(s.watched || {}).length, 0),
    [showsData]
  );
  const moviesWatched = useMemo(
    () => moviesData.filter((m) => m.status === "watched").length,
    [moviesData]
  );

  // Chargement + calcul des temps (runtimes)
  useEffect(() => {
    let active = true;
    async function compute() {
      try {
        const [shows, movies, favs, books, volumes, gamesList] = await Promise.all([
          getAllShows(),
          getAllMovies(),
          getFavorites(),
          getAllBooks(),
          getAllVolumes(),
          getAllGames(),
        ]);
        if (!active) return;
        setFavorites(favs);
        setShowsData(shows);
        setMoviesData(movies);
        setBooksData(books);
        setVolumesData(volumes);
        setGamesData(gamesList);

        // Temps films
        const watchedMovies = movies.filter((m) => m.status === "watched");
        let mTime = 0;
        const moviesMissing = [];
        watchedMovies.forEach((m) => {
          if (m.runtime) mTime += m.runtime;
          else moviesMissing.push(m);
        });
        setMoviesTime(mTime);

        // Temps séries
        let sTime = 0;
        const showsMissing = [];
        shows.forEach((s) => {
          const epInShow = Object.keys(s.watched || {}).length;
          if (epInShow === 0) return;
          if (s.runtime) sTime += s.runtime * epInShow;
          else showsMissing.push({ show: s, epInShow });
        });
        setSeriesTime(sTime);

        // Complétion en arrière-plan des runtimes manquants
        const totalMissing = moviesMissing.length + showsMissing.length;
        if (totalMissing === 0) return;
        setProgress({ current: 0, total: totalMissing });
        let done = 0;

        for (const m of moviesMissing) {
          if (!active) return;
          let rt = 0;
          try {
            const full = await getMovie(m.id);
            rt = full.runtime || 0;
          } catch {
            // ignore
          }
          if (rt) {
            mTime += rt;
            setMoviesTime(mTime);
            setMovieRuntime(m.id, rt).catch(() => {});
          }
          done += 1;
          setProgress({ current: done, total: totalMissing });
          await sleep(40);
        }

        for (const { show, epInShow } of showsMissing) {
          if (!active) return;
          let rt = null;
          try {
            rt = await getShowRuntime(show.id);
          } catch {
            // ignore
          }
          const effective = rt || 25;
          sTime += effective * epInShow;
          setSeriesTime(sTime);
          setShowRuntime(show.id, effective).catch(() => {});
          done += 1;
          setProgress({ current: done, total: totalMissing });
          await sleep(40);
        }

        if (active) setProgress({ current: 0, total: 0 });
      } catch {
        // ignore
      }
    }
    compute();
    return () => { active = false; };
  }, []);

  // Récupération des méta séries (genres + nb épisodes) pour les trophées
  useEffect(() => {
    if (showsData.length === 0) return;
    let active = true;

    // 1) charge d'abord depuis le cache
    const initial = {};
    const toFetch = [];
    showsData.forEach((s) => {
      const cached = readMeta(s.id);
      if (cached) initial[s.id] = { genres: cached.genres, total: cached.total };
      else toFetch.push(s);
    });
    setMetaMap(initial);

    // 2) complète en arrière-plan (en parallèle, doux)
    toFetch.forEach(async (s) => {
      try {
        const d = await getShow(s.id);
        if (!active) return;
        const genres = (d.genres || []).map((g) => g.id);
        const total = d.number_of_episodes || 0;
        writeMeta(s.id, genres, total);
        setMetaMap((prev) => ({ ...prev, [s.id]: { genres, total } }));
      } catch {
        // ignore
      }
    });

    return () => { active = false; };
  }, [showsData]);

  // Calcul des trophées
  const trophyResults = useMemo(() => {
    const stats = computeTrophyStats({
      shows: showsData,
      movies: moviesData,
      books: booksData,
      volumes: volumesData,
      games: gamesData,
      favorites,
      metaMap,
      seriesMinutes: seriesTime,
      moviesMinutes: moviesTime,
      loginStreak,
    });
    // 1er passage (tous sauf le méta)
    const results = TROPHIES.map((def) => ({ def, res: evaluateTrophy(def, stats) }));
    const unlockedCount = results.filter(
      (r) => r.def.id !== "casanier" && r.res.unlocked
    ).length;
    stats.unlockedCount = unlockedCount;
    // 2e passage pour le trophée méta "Casanier"
    return TROPHIES.map((def) => ({ def, res: evaluateTrophy(def, stats) }));
  }, [showsData, moviesData, booksData, volumesData, gamesData, favorites, metaMap, seriesTime, moviesTime, loginStreak]);

  // Séparation en trois grilles : films/séries, livres, jeux
  const screenTrophies = trophyResults.filter(
    (t) => t.def.category !== "books" && t.def.category !== "games"
  );
  const bookTrophies = trophyResults.filter((t) => t.def.category === "books");
  const gameTrophies = trophyResults.filter((t) => t.def.category === "games");
  const screenUnlocked = screenTrophies.filter((t) => t.res.unlocked).length;
  const gameUnlocked = gameTrophies.filter((t) => t.res.unlocked).length;
  const bookUnlocked = bookTrophies.filter((t) => t.res.unlocked).length;

  const st = formatTime(seriesTime);
  const mt = formatTime(moviesTime);
  const completing = progress.total > 0;

  // ---- Statistiques de lecture (section Livres) ----
  const bookStats = useMemo(() => {
    const readBooks = booksData.filter((b) => b.status === "read");
    const readVolumes = volumesData.filter((v) => v.status === "read");
    const mangaSeries = new Set(readVolumes.map((v) => v.seriesName || v.title));

    const authors = [
      ...readBooks.map((b) => b.author),
      ...readVolumes.map((v) => v.author),
    ].filter(Boolean);

    const subjects = [];
    [...readBooks, ...readVolumes].forEach((item) => {
      (item.subjects || []).forEach((s) => {
        const c = bookCleanSubject(s);
        if (c) subjects.push(c);
      });
    });

    return {
      totalRead: readBooks.length + readVolumes.length,
      novelsRead: readBooks.length,
      volumesRead: readVolumes.length,
      seriesCount: mangaSeries.size,
      topAuthors: bookTopCounts(authors, 5),
      topSubjects: bookTopCounts(subjects, 5),
    };
  }, [booksData, volumesData]);

  // ---- Aperçu jeux (compteurs pour le Profil) ----
  const gameStats = useMemo(() => {
    const done = gamesData.filter((g) => g.status === "done");
    const todo = gamesData.filter((g) => g.status === "todo");
    const replays = done.reduce((sum, g) => sum + (g.replayCount || 0), 0);
    const studios = new Set(done.map((g) => g.studio).filter(Boolean));
    return {
      doneCount: done.length,
      todoCount: todo.length,
      replays,
      studios: studios.size,
    };
  }, [gamesData]);

  const handleRemoveFavShow = async (id) => {
    await removeFavoriteShow(id);
    setFavorites((f) => ({ ...f, shows: f.shows.filter((s) => s.id !== id) }));
  };
  const handleRemoveFavMovie = async (id) => {
    await removeFavoriteMovie(id);
    setFavorites((f) => ({ ...f, movies: f.movies.filter((m) => m.id !== id) }));
  };

  return (
    <div className="profile">
      <div className="profile-header">
        <h2 className="profile-name">{user.displayName}</h2>
        <div className="profile-menu-wrap">
          <button
            className="profile-menu-trigger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={t("profile.menu")}
          >
            ⋮
          </button>
          {menuOpen && (
            <>
              <div className="profile-menu-overlay" onClick={() => setMenuOpen(false)} />
              <div className="profile-menu">
                <button
                  className="profile-menu-item"
                  onClick={() => { setMenuOpen(false); onImportShows(); }}
                >
                  {t("profile.importShows")}
                </button>
                <button
                  className="profile-menu-item"
                  onClick={() => { setMenuOpen(false); onImportMovies(); }}
                >
                  {t("profile.importMovies")}
                </button>
                <button
                  className="profile-menu-item"
                  onClick={() => { setMenuOpen(false); onImportImdb(); }}
                >
                  {t("profile.importImdb")}
                </button>
                <button
                  className="profile-menu-item"
                  onClick={() => { setMenuOpen(false); onImportTrakt(); }}
                >
                  {t("profile.importTrakt")}
                </button>

                <div className="profile-menu-sep" />
                <div className="profile-menu-label">🎨 {t("profile.appearance")}</div>
                <div className="lang-switch profile-menu-lang">
                  <button
                    className={`lang-btn ${theme === "dark" ? "lang-active" : ""}`}
                    onClick={() => setTheme("dark")}
                  >
                    {t("profile.dark")}
                  </button>
                  <button
                    className={`lang-btn ${theme === "light" ? "lang-active" : ""}`}
                    onClick={() => setTheme("light")}
                  >
                    {t("profile.light")}
                  </button>
                </div>

                <div className="profile-menu-sep" />
                <div className="profile-menu-label">🌐 {t("profile.language")}</div>
                <div className="lang-switch profile-menu-lang">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      className={`lang-btn ${getLang() === l.code ? "lang-active" : ""}`}
                      onClick={() => setLang(l.code)}
                    >
                      <img className="lang-flag" src={FLAGS[l.code]} alt="" /> {l.label}
                    </button>
                  ))}
                </div>

                <div className="profile-menu-sep" />
                <button
                  className="profile-menu-item profile-menu-danger"
                  onClick={() => { setMenuOpen(false); setShowDelete(true); }}
                >
                  {t("account.delete")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Statistiques */}
      <h3 className="section-pill">{t("profile.stats")}</h3>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📺</div>
          <div className="stat-value">{episodesWatched.toLocaleString()}</div>
          <div className="stat-label">{t("profile.episodesWatched")}</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-value-time">
            {st.months > 0 && <span><b>{st.months}</b> {t("profile.months")} </span>}
            <span><b>{st.days}</b> {t("profile.days")} </span>
            <span><b>{st.hours}</b> {t("profile.hours")}</span>
          </div>
          <div className="stat-label">
            {t("profile.seriesTime")}
            {completing && ` (${t("profile.updating")} ${progress.current}/${progress.total}…)`}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🎬</div>
          <div className="stat-value">{moviesWatched}</div>
          <div className="stat-label">{t("profile.moviesWatched")}</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🍿</div>
          <div className="stat-value-time">
            {mt.months > 0 && <span><b>{mt.months}</b> {t("profile.months")} </span>}
            <span><b>{mt.days}</b> {t("profile.days")} </span>
            <span><b>{mt.hours}</b> {t("profile.hours")}</span>
          </div>
          <div className="stat-label">{t("profile.moviesTime")}</div>
        </div>
      </div>

      {/* Statistiques de lecture (Livres) */}
      {bookStats.totalRead > 0 && (
        <>
          <h3 className="section-pill">📚 {t("profile.booksStats")}</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">📖</div>
              <div className="stat-value">{bookStats.novelsRead}</div>
              <div className="stat-label">{t("stats.novelsRead")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📗</div>
              <div className="stat-value">{bookStats.volumesRead}</div>
              <div className="stat-label">{t("stats.volumesRead")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📚</div>
              <div className="stat-value">{bookStats.seriesCount}</div>
              <div className="stat-label">{t("stats.mangaSeries")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-value">{bookStats.totalRead}</div>
              <div className="stat-label">{t("stats.totalRead")}</div>
            </div>
          </div>
        </>
      )}

      {(gameStats.doneCount > 0 || gameStats.todoCount > 0) && (
        <>
          <h3 className="section-pill">🎮 {t("stats.gamesSection")}</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">🎮</div>
              <div className="stat-value">{gameStats.doneCount}</div>
              <div className="stat-label">{t("stats.gamesDone")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📋</div>
              <div className="stat-value">{gameStats.todoCount}</div>
              <div className="stat-label">{t("stats.gamesTodo")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🔁</div>
              <div className="stat-value">{gameStats.replays}</div>
              <div className="stat-label">{t("stats.gamesReplays")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">🏢</div>
              <div className="stat-value">{gameStats.studios}</div>
              <div className="stat-label">{t("stats.gamesStudios")}</div>
            </div>
          </div>
        </>
      )}

      {/* Accès aux statistiques détaillées (barres auteurs/genres, lectures
          par année, etc. — déplacées ici pour alléger le Profil) */}
      <button className="btn stats-detail-btn" onClick={onOpenStats}>
        📊 {t("stats.seeDetailed")}
      </button>

      {/* Soutenir l'app */}
      <h3 className="section-pill">{t("profile.support")}</h3>
      <div className="support-box">
        <p className="muted small support-text">
          {t("profile.supportText")}
        </p>
        <div className="support-actions">
          <a
            className="btn support-btn"
            href="https://fr.tipeee.com/kip3tchis"
            target="_blank"
            rel="noopener noreferrer"
          >
            💛 Tipeee
          </a>
          <a
            className="btn-small support-btn"
            href="https://paypal.me/kip3tchis"
            target="_blank"
            rel="noopener noreferrer"
          >
            ❤️ PayPal
          </a>
        </div>
      </div>

      {/* Trophées séries & films */}
      <h3 className="section-pill">🏆 {t("profile.trophies")} · {screenUnlocked}/{screenTrophies.length}</h3>
      <div className="trophy-grid">
        {screenTrophies.map(({ def, res }) => (
          <button
            key={def.id}
            className={`trophy ${res.unlocked ? "trophy-unlocked" : "trophy-locked"}`}
            onClick={() => setOpenTrophy({ def, res })}
          >
            <div className="trophy-emoji">{def.emoji}</div>
            <div className="trophy-name">{trophyName(def)}</div>
            <div className="trophy-state">
              {res.unlocked ? (
                res.label
              ) : (
                <>🔒 {res.current.toLocaleString()}/{res.target.toLocaleString()}</>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Trophées livres (section distincte) */}
      <h3 className="section-pill">📚 {t("profile.bookTrophies")} · {bookUnlocked}/{bookTrophies.length}</h3>
      <div className="trophy-grid">
        {bookTrophies.map(({ def, res }) => (
          <button
            key={def.id}
            className={`trophy ${res.unlocked ? "trophy-unlocked" : "trophy-locked"}`}
            onClick={() => setOpenTrophy({ def, res })}
          >
            <div className="trophy-emoji">{def.emoji}</div>
            <div className="trophy-name">{trophyName(def)}</div>
            <div className="trophy-state">
              {res.unlocked ? (
                res.label
              ) : (
                <>🔒 {res.current.toLocaleString()}/{res.target.toLocaleString()}</>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Trophées jeux (section distincte) */}
      <h3 className="section-pill">🎮 {t("profile.gameTrophies")} · {gameUnlocked}/{gameTrophies.length}</h3>
      <div className="trophy-grid">
        {gameTrophies.map(({ def, res }) => (
          <button
            key={def.id}
            className={`trophy ${res.unlocked ? "trophy-unlocked" : "trophy-locked"}`}
            onClick={() => setOpenTrophy({ def, res })}
          >
            <div className="trophy-emoji">{def.emoji}</div>
            <div className="trophy-name">{trophyName(def)}</div>
            <div className="trophy-state">
              {res.unlocked ? (
                res.label
              ) : (
                <>🔒 {res.current.toLocaleString()}/{res.target.toLocaleString()}</>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Séries préférées */}
      <div className="fav-header">
        <h3 className="section-pill">{t("profile.favShows")}</h3>
        <button className="btn-small" onClick={() => onOpenFavorites("show")}>{t("common.add")}</button>
      </div>
      {favorites.shows && favorites.shows.length > 0 ? (
        <div className="grid">
          {favorites.shows.map((s) => (
            <div key={s.id} className="card">
              <div onClick={() => onOpenShow && onOpenShow(s)}>
                {posterUrl(s.poster_path) ? (
                  <img src={posterUrl(s.poster_path)} alt={s.name} />
                ) : (
                  <div className="no-poster">{t("common.noPoster")}</div>
                )}
                <div className="card-title"><TranslatedTitle type="tv" id={s.id} fallback={s.name} /></div>
              </div>
              <div className="movie-actions">
                <button className="btn-small" onClick={() => handleRemoveFavShow(s.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">{t("profile.noFavShows")}</p>
      )}

      {/* Films préférés */}
      <div className="fav-header">
        <h3 className="section-pill">{t("profile.favMovies")}</h3>
        <button className="btn-small" onClick={() => onOpenFavorites("movie")}>{t("common.add")}</button>
      </div>
      {favorites.movies && favorites.movies.length > 0 ? (
        <div className="grid">
          {favorites.movies.map((m) => (
            <div key={m.id} className="card">
              <div onClick={() => setOpenMovie(m)}>
                {posterUrl(m.poster_path) ? (
                  <img src={posterUrl(m.poster_path)} alt={m.title} />
                ) : (
                  <div className="no-poster">{t("common.noPoster")}</div>
                )}
                <div className="card-title"><TranslatedTitle type="movie" id={m.id} fallback={m.title} /></div>
              </div>
              <div className="movie-actions">
                <button className="btn-small" onClick={() => handleRemoveFavMovie(m.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">{t("profile.noFavMovies")}</p>
      )}

      {/* Suppression de compte : le modal reste, seul le déclencheur a bougé dans le menu ... */}

      {showDelete && (
        <div className="ep-detail-overlay" onClick={() => !deleting && setShowDelete(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="delete-modal-title">{t("account.deleteTitle")}</h2>
            <p className="delete-modal-warning">{t("account.deleteWarning")}</p>

            {needPassword && (
              <>
                <p className="muted small">{t("account.passwordPrompt")}</p>
                <input
                  type="password"
                  className="filter-input"
                  style={{ width: "100%", marginBottom: 10 }}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  autoComplete="current-password"
                />
              </>
            )}

            {deleteError && <p className="error">{deleteError}</p>}

            <div className="delete-modal-actions">
              <button
                className="btn-small"
                onClick={() => { setShowDelete(false); setNeedPassword(false); setDeletePassword(""); setDeleteError(null); }}
                disabled={deleting}
              >
                {t("account.cancel")}
              </button>
              <button
                className="delete-confirm-btn"
                onClick={needPassword ? handleReauthAndDelete : handleDeleteAccount}
                disabled={deleting || (needPassword && !deletePassword)}
              >
                {deleting ? t("account.deleting") : t("account.deleteConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup détail trophée */}
      {openTrophy && (
        <div className="ep-detail-overlay" onClick={() => setOpenTrophy(null)}>
          <div className="trophy-modal" onClick={(e) => e.stopPropagation()}>
            <button className="btn-small ep-detail-close" onClick={() => setOpenTrophy(null)}>✕</button>
            <div className={`trophy-modal-emoji ${openTrophy.res.unlocked ? "" : "trophy-modal-locked"}`}>
              {openTrophy.def.emoji}
            </div>
            <h2 className="trophy-modal-name">{trophyName(openTrophy.def)}</h2>
            <p className="trophy-modal-phrase">{trophyPhrase(openTrophy.def)}</p>
            <div className="trophy-modal-status">
              {openTrophy.res.unlocked ? (
                <span className="trophy-modal-badge">
                  ✓ {openTrophy.res.label}
                  {openTrophy.res.nextLabel &&
                    ` · ${t("profile.next")} : ${openTrophy.res.nextLabel} (${openTrophy.res.current.toLocaleString()}/${openTrophy.res.target.toLocaleString()})`}
                </span>
              ) : (
                <span className="muted small">
                  🔒 {t("profile.locked")} — {openTrophy.res.current.toLocaleString()}/{openTrophy.res.target.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {openMovie && (
        <MovieDetail
          movie={openMovie}
          onClose={() => setOpenMovie(null)}
        />
      )}
    </div>
  );
}

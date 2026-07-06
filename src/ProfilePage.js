import { useState, useEffect, useMemo } from "react";
import {
  getAllShows, getFavorites, removeFavoriteShow, removeFavoriteMovie,
  setShowRuntime, setMovieRuntime,
} from "./store";
import { getAllMovies } from "./movieStore";
import { getShow, getShowRuntime, getMovie, posterUrl } from "./tmdb";
import MovieDetail from "./MovieDetail";
import { TROPHIES, computeTrophyStats, evaluateTrophy } from "./trophies";

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

export default function ProfilePage({ user, onImportShows, onImportMovies, onImportImdb, onOpenFavorites, onOpenShow }) {
  const [seriesTime, setSeriesTime] = useState(0); // minutes
  const [moviesTime, setMoviesTime] = useState(0);
  const [favorites, setFavorites] = useState({ shows: [], movies: [] });
  const [openMovie, setOpenMovie] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  // Données brutes pour les trophées
  const [showsData, setShowsData] = useState([]);
  const [moviesData, setMoviesData] = useState([]);
  const [metaMap, setMetaMap] = useState({});
  const [loginStreak] = useState(() => recordAndGetStreak());
  const [openTrophy, setOpenTrophy] = useState(null);

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
        const [shows, movies, favs] = await Promise.all([
          getAllShows(),
          getAllMovies(),
          getFavorites(),
        ]);
        if (!active) return;
        setFavorites(favs);
        setShowsData(shows);
        setMoviesData(movies);

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
  }, [showsData, moviesData, favorites, metaMap, seriesTime, moviesTime, loginStreak]);

  const unlockedTotal = trophyResults.filter((t) => t.res.unlocked).length;

  const st = formatTime(seriesTime);
  const mt = formatTime(moviesTime);
  const completing = progress.total > 0;

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
      <h2 className="profile-name">{user.displayName}</h2>

      {/* Statistiques */}
      <h3 className="section-pill">STATISTIQUES</h3>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📺</div>
          <div className="stat-value">{episodesWatched.toLocaleString("fr-FR")}</div>
          <div className="stat-label">Épisodes vus</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-value-time">
            {st.months > 0 && <span><b>{st.months}</b> mois </span>}
            <span><b>{st.days}</b> j </span>
            <span><b>{st.hours}</b> h</span>
          </div>
          <div className="stat-label">
            Temps devant les séries
            {completing && ` (mise à jour ${progress.current}/${progress.total}…)`}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🎬</div>
          <div className="stat-value">{moviesWatched}</div>
          <div className="stat-label">Films regardés</div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🍿</div>
          <div className="stat-value-time">
            {mt.months > 0 && <span><b>{mt.months}</b> mois </span>}
            <span><b>{mt.days}</b> j </span>
            <span><b>{mt.hours}</b> h</span>
          </div>
          <div className="stat-label">Temps devant les films</div>
        </div>
      </div>

      {/* Soutenir l'app */}
      <h3 className="section-pill">❤️ SOUTENIR TV COUCH</h3>
      <div className="support-box">
        <p className="muted small support-text">
          Tv Couch est gratuit et sans publicité. Si l'app te plaît, tu peux
          soutenir son développement — merci beaucoup&nbsp;!
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

      {/* Trophées */}
      <h3 className="section-pill">🏆 TROPHÉES · {unlockedTotal}/{TROPHIES.length}</h3>
      <div className="trophy-grid">
        {trophyResults.map(({ def, res }) => (
          <button
            key={def.id}
            className={`trophy ${res.unlocked ? "trophy-unlocked" : "trophy-locked"}`}
            onClick={() => setOpenTrophy({ def, res })}
          >
            <div className="trophy-emoji">{def.emoji}</div>
            <div className="trophy-name">{def.name}</div>
            <div className="trophy-state">
              {res.unlocked ? (
                res.label
              ) : (
                <>🔒 {res.current.toLocaleString("fr-FR")}/{res.target.toLocaleString("fr-FR")}</>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Séries préférées */}
      <div className="fav-header">
        <h3 className="section-pill">❤️ SÉRIES PRÉFÉRÉES</h3>
        <button className="btn-small" onClick={() => onOpenFavorites("show")}>+ Ajouter</button>
      </div>
      {favorites.shows && favorites.shows.length > 0 ? (
        <div className="grid">
          {favorites.shows.map((s) => (
            <div key={s.id} className="card">
              <div onClick={() => onOpenShow && onOpenShow(s)}>
                {posterUrl(s.poster_path) ? (
                  <img src={posterUrl(s.poster_path)} alt={s.name} />
                ) : (
                  <div className="no-poster">Pas d'affiche</div>
                )}
                <div className="card-title">{s.name}</div>
              </div>
              <div className="movie-actions">
                <button className="btn-small" onClick={() => handleRemoveFavShow(s.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">Aucune série préférée. Ajoutez-en !</p>
      )}

      {/* Films préférés */}
      <div className="fav-header">
        <h3 className="section-pill">❤️ FILMS PRÉFÉRÉS</h3>
        <button className="btn-small" onClick={() => onOpenFavorites("movie")}>+ Ajouter</button>
      </div>
      {favorites.movies && favorites.movies.length > 0 ? (
        <div className="grid">
          {favorites.movies.map((m) => (
            <div key={m.id} className="card">
              <div onClick={() => setOpenMovie(m)}>
                {posterUrl(m.poster_path) ? (
                  <img src={posterUrl(m.poster_path)} alt={m.title} />
                ) : (
                  <div className="no-poster">Pas d'affiche</div>
                )}
                <div className="card-title">{m.title}</div>
              </div>
              <div className="movie-actions">
                <button className="btn-small" onClick={() => handleRemoveFavMovie(m.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">Aucun film préféré. Ajoutez-en !</p>
      )}

      {/* Outils */}
      <h3 className="section-pill">OUTILS</h3>
      <div className="profile-tools">
        <button className="btn-small" onClick={onImportShows}>Importer séries TV Time</button>
        <button className="btn-small" onClick={onImportMovies}>Importer films TV Time</button>
        <button className="btn-small" onClick={onImportImdb}>Importer depuis IMDb (CSV)</button>
      </div>

      {/* Popup détail trophée */}
      {openTrophy && (
        <div className="ep-detail-overlay" onClick={() => setOpenTrophy(null)}>
          <div className="trophy-modal" onClick={(e) => e.stopPropagation()}>
            <button className="btn-small ep-detail-close" onClick={() => setOpenTrophy(null)}>✕</button>
            <div className={`trophy-modal-emoji ${openTrophy.res.unlocked ? "" : "trophy-modal-locked"}`}>
              {openTrophy.def.emoji}
            </div>
            <h2 className="trophy-modal-name">{openTrophy.def.name}</h2>
            <p className="trophy-modal-phrase">{openTrophy.def.phrase}</p>
            <div className="trophy-modal-status">
              {openTrophy.res.unlocked ? (
                <span className="trophy-modal-badge">
                  ✓ {openTrophy.res.label}
                  {openTrophy.res.nextLabel &&
                    ` · prochain : ${openTrophy.res.nextLabel} (${openTrophy.res.current.toLocaleString("fr-FR")}/${openTrophy.res.target.toLocaleString("fr-FR")})`}
                </span>
              ) : (
                <span className="muted small">
                  🔒 Verrouillé — {openTrophy.res.current.toLocaleString("fr-FR")}/{openTrophy.res.target.toLocaleString("fr-FR")}
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

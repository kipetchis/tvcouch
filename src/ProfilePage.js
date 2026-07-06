import { useState, useEffect } from "react";
import {
  getAllShows, getFavorites, removeFavoriteShow, removeFavoriteMovie,
  setShowRuntime, setMovieRuntime,
} from "./store";
import { getAllMovies } from "./movieStore";
import { getShowRuntime, getMovie, posterUrl } from "./tmdb";
import MovieDetail from "./MovieDetail";

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

export default function ProfilePage({ user, onImportShows, onImportMovies, onOpenFavorites, onOpenShow }) {
  const [episodesWatched, setEpisodesWatched] = useState(0);
  const [seriesTime, setSeriesTime] = useState(0); // minutes
  const [moviesWatched, setMoviesWatched] = useState(0);
  const [moviesTime, setMoviesTime] = useState(0);
  const [favorites, setFavorites] = useState({ shows: [], movies: [] });
  const [openMovie, setOpenMovie] = useState(null); // fiche film favori ouverte
  // Complétion en arrière-plan des runtimes manquants (one-shot :
  // une fois écrits en base, les prochaines ouvertures sont instantanées)
  const [progress, setProgress] = useState({ current: 0, total: 0 });

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

        // --- Épisodes vus (instantané) ---
        let epCount = 0;
        shows.forEach((s) => {
          epCount += Object.keys(s.watched || {}).length;
        });
        setEpisodesWatched(epCount);

        // --- Films : temps depuis les runtimes stockés ---
        const watchedMovies = movies.filter((m) => m.status === "watched");
        setMoviesWatched(watchedMovies.length);
        let mTime = 0;
        const moviesMissing = [];
        watchedMovies.forEach((m) => {
          if (m.runtime) mTime += m.runtime;
          else moviesMissing.push(m);
        });
        setMoviesTime(mTime);

        // --- Séries : temps depuis les runtimes stockés ---
        let sTime = 0;
        const showsMissing = [];
        shows.forEach((s) => {
          const epInShow = Object.keys(s.watched || {}).length;
          if (epInShow === 0) return;
          if (s.runtime) sTime += s.runtime * epInShow;
          else showsMissing.push({ show: s, epInShow });
        });
        setSeriesTime(sTime);

        // --- Complétion en arrière-plan des runtimes manquants ---
        // (récupérés une seule fois via TMDB, puis sauvegardés en base)
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
          const effective = rt || 25; // 25 min par défaut si TMDB ne sait pas
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

      {openMovie && (
        <MovieDetail
          movie={openMovie}
          onClose={() => setOpenMovie(null)}
        />
      )}
    </div>
  );
}

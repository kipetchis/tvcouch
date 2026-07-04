import { useState, useEffect } from "react";
import { getAllShows, getFavorites, removeFavoriteShow, removeFavoriteMovie } from "./store";
import { getAllMovies } from "./movieStore";
import { getShowRuntime, getMovie, posterUrl } from "./tmdb";

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

export default function ProfilePage({ user, onImportShows, onImportMovies, onOpenFavorites }) {
  const [episodesWatched, setEpisodesWatched] = useState(0);
  const [seriesTime, setSeriesTime] = useState(null); // minutes
  const [moviesWatched, setMoviesWatched] = useState(0);
  const [moviesTime, setMoviesTime] = useState(0);
  const [favorites, setFavorites] = useState({ shows: [], movies: [] });
  const [computing, setComputing] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    let active = true;
    async function compute() {
      setComputing(true);
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

        // --- Films ---
        const watchedMovies = movies.filter((m) => m.status === "watched");
        setMoviesWatched(watchedMovies.length);
        let mTime = 0;
        for (let i = 0; i < watchedMovies.length; i++) {
          const m = watchedMovies[i];
          if (m.runtime) {
            mTime += m.runtime;
          } else {
            try {
              const full = await getMovie(m.id);
              mTime += full.runtime || 0;
            } catch {
              // ignore
            }
            await sleep(40);
          }
          if (!active) return;
        }
        setMoviesTime(mTime);

        // --- Temps séries (à la volée, par lots avec pauses) ---
        setProgress({ current: 0, total: shows.length });
        let totalMinutes = 0;
        for (let i = 0; i < shows.length; i++) {
          const s = shows[i];
          const epInShow = Object.keys(s.watched || {}).length;
          if (epInShow > 0) {
            try {
              const runtime = await getShowRuntime(s.id);
              totalMinutes += (runtime || 25) * epInShow; // 25 min par défaut
            } catch {
              totalMinutes += 25 * epInShow;
            }
          }
          if (!active) return;
          setProgress({ current: i + 1, total: shows.length });
          await sleep(40);
        }
        setSeriesTime(totalMinutes);
      } catch {
        // ignore
      } finally {
        if (active) setComputing(false);
      }
    }
    compute();
    return () => { active = false; };
  }, []);

  const st = seriesTime !== null ? formatTime(seriesTime) : null;
  const mt = formatTime(moviesTime);

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
          {st ? (
            <>
              <div className="stat-value-time">
                {st.months > 0 && <span><b>{st.months}</b> mois </span>}
                <span><b>{st.days}</b> j </span>
                <span><b>{st.hours}</b> h</span>
              </div>
              <div className="stat-label">Temps devant les séries</div>
            </>
          ) : (
            <>
              <div className="stat-value-small">
                Calcul… {progress.current}/{progress.total}
              </div>
              <div className="stat-label">Temps devant les séries</div>
            </>
          )}
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
              {posterUrl(s.poster_path) ? (
                <img src={posterUrl(s.poster_path)} alt={s.name} />
              ) : (
                <div className="no-poster">Pas d'affiche</div>
              )}
              <div className="card-title">{s.name}</div>
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
              {posterUrl(m.poster_path) ? (
                <img src={posterUrl(m.poster_path)} alt={m.title} />
              ) : (
                <div className="no-poster">Pas d'affiche</div>
              )}
              <div className="card-title">{m.title}</div>
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
    </div>
  );
}
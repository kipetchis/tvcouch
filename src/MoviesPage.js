import { useState, useEffect } from "react";
import { getAllMovies, saveMovie, removeMovie } from "./movieStore";
import { searchMovies, getMovie, posterUrl } from "./tmdb";
import MovieDetail from "./MovieDetail";

export default function MoviesPage() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("watched"); // watched | watchlist
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [openMovie, setOpenMovie] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const all = await getAllMovies();
      setMovies(all);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await searchMovies(query.trim());
      setResults(data.results || []);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
  };

  const addAsWatched = async (movie) => {
    let runtime = null;
    try {
      const full = await getMovie(movie.id);
      runtime = full.runtime || null;
    } catch {}
    await saveMovie(
      { ...movie, runtime },
      "watched",
      new Date().toISOString().slice(0, 10)
    );
    clearSearch();
    reload();
  };

  const addToWatchlist = async (movie) => {
    await saveMovie(movie, "watchlist");
    clearSearch();
    reload();
  };

  const markWatched = async (movie) => {
    let runtime = movie.runtime;
    if (!runtime) {
      try {
        const full = await getMovie(movie.id);
        runtime = full.runtime || null;
      } catch {}
    }
    await saveMovie({ ...movie, runtime }, "watched", new Date().toISOString().slice(0, 10));
    reload();
  };

  const handleRemove = async (movieId) => {
    await removeMovie(movieId);
    reload();
  };

  const handleRated = (movieId, rating) => {
    // Si le film noté n'est pas encore dans la liste (venu de la recherche),
    // on recharge pour le faire apparaître dans "Vus".
    const known = movies.some((m) => m.id === movieId);
    if (!known) {
      reload();
    } else {
      setMovies((prev) =>
        prev.map((m) =>
          m.id === movieId
            ? {
                ...m,
                note: rating ? rating.note : null,
                comment: rating ? rating.comment : "",
                status: rating ? "watched" : m.status,
              }
            : m
        )
      );
    }
    // met à jour le film ouvert aussi
    setOpenMovie((prev) =>
      prev && prev.id === movieId
        ? { ...prev, note: rating ? rating.note : null, comment: rating ? rating.comment : "" }
        : prev
    );
  };

  const watched = movies.filter((m) => m.status === "watched");
  const watchlist = movies.filter((m) => m.status === "watchlist");
  const shown = view === "watched" ? watched : watchlist;

  return (
    <div>
      <form className="search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Rechercher un film…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="submit">Rechercher</button>
        {results.length > 0 && (
          <button type="button" className="btn-small" onClick={clearSearch}>
            ✕
          </button>
        )}
      </form>

      {searching && <p className="center">Recherche…</p>}

      {results.length > 0 ? (
        <>
          <h3 className="section-title">Résultats</h3>
          <div className="grid">
            {results.map((movie) => (
              <div key={movie.id} className="card movie-result">
                <div onClick={() => setOpenMovie(movie)}>
                  {posterUrl(movie.poster_path) ? (
                    <img src={posterUrl(movie.poster_path)} alt={movie.title} />
                  ) : (
                    <div className="no-poster">Pas d'affiche</div>
                  )}
                  <div className="card-title">{movie.title}</div>
                  <div className="card-year">
                    {movie.release_date ? movie.release_date.slice(0, 4) : "—"}
                  </div>
                </div>
                <div className="movie-actions">
                  <button className="btn-small" onClick={() => addAsWatched(movie)}>
                    ✓ Vu
                  </button>
                  <button className="btn-small" onClick={() => addToWatchlist(movie)}>
                    + Liste
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="movie-tabs">
            <button
              className={view === "watched" ? "movie-tab active" : "movie-tab"}
              onClick={() => setView("watched")}
            >
              Vus ({watched.length})
            </button>
            <button
              className={view === "watchlist" ? "movie-tab active" : "movie-tab"}
              onClick={() => setView("watchlist")}
            >
              À voir ({watchlist.length})
            </button>
          </div>

          {loading ? (
            <p className="center">Chargement…</p>
          ) : shown.length === 0 ? (
            <p className="muted" style={{ textAlign: "center", marginTop: 30 }}>
              {view === "watched"
                ? "Aucun film vu. Cherchez-en un !"
                : "Aucun film dans votre liste à voir."}
            </p>
          ) : (
            <div className="grid">
              {shown
                .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
                .map((movie) => (
                  <div key={movie.id} className="card">
                    <div onClick={() => setOpenMovie(movie)}>
                      {posterUrl(movie.poster_path) ? (
                        <img src={posterUrl(movie.poster_path)} alt={movie.title} />
                      ) : (
                        <div className="no-poster">Pas d'affiche</div>
                      )}
                      <div className="card-title">
                        {movie.title}
                        {movie.note > 0 && (
                          <span className="ep-rating-badge"> ★ {movie.note}</span>
                        )}
                      </div>
                      <div className="card-year">
                        {movie.release_date ? movie.release_date.slice(0, 4) : "—"}
                      </div>
                    </div>
                    <div className="movie-actions">
                      {view === "watchlist" && (
                        <button
                          className="btn-small"
                          onClick={() => markWatched(movie)}
                        >
                          ✓ Vu
                        </button>
                      )}
                      <button
                        className="btn-small"
                        onClick={() => handleRemove(movie.id)}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </>
      )}

      {openMovie && (
        <MovieDetail
          movie={openMovie}
          onClose={() => setOpenMovie(null)}
          onRated={handleRated}
        />
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { getAllMovies, saveMovie, removeMovie, setMovieRewatchCount, unwatchMovie, setMovieGenres } from "./movieStore";
import { searchMovies, getMovie, posterUrl } from "./tmdb";
import MovieDetail from "./MovieDetail";
import TranslatedTitle from "./TranslatedTitle";
import RewatchMenu from "./RewatchMenu";
import FilterSheet from "./FilterSheet";
import { MOVIE_GENRE_MAP } from "./genres";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

// Tri de la collection de films
function sortMovies(list, sort) {
  const arr = [...list];
  switch (sort) {
    case "title":
      arr.sort((a, b) => (a.title || "").localeCompare(b.title || "", "fr"));
      break;
    case "note":
      arr.sort((a, b) => (b.note || 0) - (a.note || 0));
      break;
    case "year":
      arr.sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""));
      break;
    default: // "recent"
      arr.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  return arr;
}

export default function MoviesPage() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("watched"); // watched | watchlist
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [openMovie, setOpenMovie] = useState(null);
  const [rewatchMovie, setRewatchMovie] = useState(null); // film pour lequel la popup est ouverte

  // Retour / swipe : ferme la fiche film avant de revenir à la liste
  useBackClose(!!openMovie, () => setOpenMovie(null));
  useBackClose(!!rewatchMovie, () => setRewatchMovie(null));

  // Tri + filtre de la collection
  const [sort, setSort] = useState("recent");
  const [filter, setFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  useBackClose(controlsOpen, () => setControlsOpen(false));

  const reload = async () => {
    setLoading(true);
    try {
      const all = await getAllMovies();
      setMovies(all);
      backfillGenres(all);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Rattrapage silencieux : renseigne les genres des films ajoutés avant
  // cette fonctionnalité. Par petits paquets (pas tous à la fois) avec une
  // pause entre chacun, pour ne pas cumuler avec d'autres appels TMDB en
  // cours (ex. chargement des séries) et déclencher un 429 côté API.
  const backfillGenres = async (all) => {
    const missing = all.filter((m) => !(m.genre_ids && m.genre_ids.length));
    const CHUNK = 3;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(async (m) => {
          try {
            const full = await getMovie(m.id);
            const genreIds = (full.genres || []).map((g) => g.id);
            if (genreIds.length === 0) return;
            await setMovieGenres(m.id, genreIds);
            setMovies((prev) =>
              prev.map((mv) => (mv.id === m.id ? { ...mv, genre_ids: genreIds } : mv))
            );
          } catch {
            // ignore, on retentera au prochain chargement de la page
          }
        })
      );
      // Petite pause entre chaque paquet pour rester à distance de la
      // limite de débit TMDB, même en cas de retry déjà en cours ailleurs.
      if (i + CHUNK < missing.length) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
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
    let genres = movie.genres;
    try {
      const full = await getMovie(movie.id);
      runtime = full.runtime || null;
      genres = full.genres || genres;
    } catch {}
    await saveMovie(
      { ...movie, runtime, genres },
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
    let genres = movie.genres;
    // On rappelle TMDB si la durée manque OU si le film n'a pas encore ses
    // genres enregistrés (ex. ajouté à la watchlist avant cette fonctionnalité).
    if (!runtime || !(movie.genre_ids && movie.genre_ids.length)) {
      try {
        const full = await getMovie(movie.id);
        runtime = full.runtime || runtime;
        genres = full.genres || genres;
      } catch {}
    }
    await saveMovie({ ...movie, runtime, genres }, "watched", new Date().toISOString().slice(0, 10));
    reload();
  };

  const handleRemove = async (movieId) => {
    await removeMovie(movieId);
    reload();
  };

  const handleUnwatchMovie = async () => {
    if (!rewatchMovie) return;
    const movieId = rewatchMovie.id;
    setMovies((prev) =>
      prev.map((m) => (m.id === movieId ? { ...m, status: "watchlist", rewatchCount: 0 } : m))
    );
    setRewatchMovie(null);
    try {
      await unwatchMovie(movieId);
    } catch {
      // ignore
    }
  };

  const handleRewatchMovie = async () => {
    if (!rewatchMovie) return;
    const movieId = rewatchMovie.id;
    const newCount = (rewatchMovie.rewatchCount || 0) + 1;
    setMovies((prev) =>
      prev.map((m) => (m.id === movieId ? { ...m, rewatchCount: newCount } : m))
    );
    setRewatchMovie(null);
    try {
      await setMovieRewatchCount(movieId, newCount);
    } catch {
      // ignore
    }
  };

  const handleRated = (movieId, rating) => {
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
    setOpenMovie((prev) =>
      prev && prev.id === movieId
        ? { ...prev, note: rating ? rating.note : null, comment: rating ? rating.comment : "" }
        : prev
    );
  };

  const watched = movies.filter((m) => m.status === "watched");
  const watchlist = movies.filter((m) => m.status === "watchlist");

  const base = view === "watched" ? watched : watchlist;
  const f = filter.trim().toLowerCase();
  const filtered = base
    .filter((m) => !f || (m.title || "").toLowerCase().includes(f))
    .filter((m) => !genreFilter || (m.genre_ids || []).includes(genreFilter));
  const shown = sortMovies(filtered, sort);

  // Options de genre disponibles, calculées sur l'onglet courant (Vus/À voir)
  const genreOptions = Array.from(new Set(base.flatMap((m) => m.genre_ids || [])))
    .filter((id) => MOVIE_GENRE_MAP[id])
    .map((id) => ({ id, label: t(`genre.${MOVIE_GENRE_MAP[id]}`) }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  return (
    <div>
      <form className="search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder={t("movies.searchMovie")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="submit">{t("common.search")}</button>
        {results.length > 0 && (
          <button type="button" className="btn-small" onClick={clearSearch}>
            ✕
          </button>
        )}
      </form>

      {searching && <p className="center">Recherche…</p>}

      {results.length > 0 ? (
        <>
          <h3 className="section-title">{t("common.results")}</h3>
          <div className="grid">
            {results.map((movie) => (
              <div key={movie.id} className="card movie-result">
                <div onClick={() => setOpenMovie(movie)}>
                  {posterUrl(movie.poster_path) ? (
                    <img src={posterUrl(movie.poster_path)} alt={movie.title} />
                  ) : (
                    <div className="no-poster">{t("common.noPoster")}</div>
                  )}
                  <div className="card-title">{movie.title}</div>
                  <div className="card-year">
                    {movie.release_date ? movie.release_date.slice(0, 4) : "—"}
                  </div>
                </div>
                <div className="movie-actions">
                  <button className="btn-small" onClick={() => addAsWatched(movie)}>
                    {t("common.watched")}
                  </button>
                  <button className="btn-small" onClick={() => addToWatchlist(movie)}>
                    {t("common.watchlist")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="subtabs-row">
            <div className="movie-tabs">
              <button
                className={view === "watched" ? "movie-tab active" : "movie-tab"}
                onClick={() => { setView("watched"); setGenreFilter(null); }}
              >
                {t("movies.watched")} ({watched.length})
              </button>
              <button
                className={view === "watchlist" ? "movie-tab active" : "movie-tab"}
                onClick={() => { setView("watchlist"); setGenreFilter(null); }}
              >
                {t("movies.watchlist")} ({watchlist.length})
              </button>
            </div>

            {base.length > 0 && (
              <div className="controls-menu-wrap">
                <button
                  className="controls-menu-trigger"
                  onClick={() => setControlsOpen((o) => !o)}
                  aria-label={t("movies.controlsMenu")}
                >
                  ⋮
                  {(filter.trim() !== "" || sort !== "recent" || genreFilter) && (
                    <span className="filter-trigger-dot controls-menu-trigger-dot" />
                  )}
                </button>
                {controlsOpen && (
                  <>
                    <div className="controls-menu-overlay" onClick={() => setControlsOpen(false)} />
                    <div className="controls-menu">
                      <input
                        type="text"
                        className="filter-input controls-menu-input"
                        placeholder={t("movies.filterTitle")}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      <select
                        className="sort-select controls-menu-select"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="recent">{t("sort.recent")}</option>
                        <option value="title">{t("sort.title")}</option>
                        <option value="note">{t("sort.note")}</option>
                        <option value="year">{t("sort.year")}</option>
                      </select>

                      <div className="controls-menu-sep" />
                      <button
                        className="controls-menu-item"
                        onClick={() => { setControlsOpen(false); setFilterOpen(true); }}
                      >
                        ▾ {t("filter.genre")}
                        {genreFilter && <span className="filter-trigger-dot" />}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <FilterSheet
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            genreOptions={genreOptions}
            genre={genreFilter}
            onGenreChange={setGenreFilter}
          />

          {loading ? (
            <p className="center">{t("common.loading")}</p>
          ) : shown.length === 0 ? (
            <p className="muted" style={{ textAlign: "center", marginTop: 30 }}>
              {base.length === 0
                ? view === "watched"
                  ? t("movies.noneWatched")
                  : t("movies.noneWatchlist")
                : t("movies.noneFilter")}
            </p>
          ) : (
            <div className="grid">
              {shown.map((movie) => (
                <div key={movie.id} className="card">
                  {view === "watched" && (
                    <div
                      className={`movie-watch-badge ${movie.rewatchCount > 0 ? "rewatched" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRewatchMovie(movie);
                      }}
                    >
                      {movie.rewatchCount > 0 ? `×${movie.rewatchCount + 1}` : "✓"}
                    </div>
                  )}
                  <div onClick={() => setOpenMovie(movie)}>
                    {posterUrl(movie.poster_path) ? (
                      <img src={posterUrl(movie.poster_path)} alt={movie.title} />
                    ) : (
                      <div className="no-poster">{t("common.noPoster")}</div>
                    )}
                    <div className="card-title">
                      <TranslatedTitle type="movie" id={movie.id} fallback={movie.title} />
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
                        {t("common.watched")}
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

      {rewatchMovie && (
        <RewatchMenu
          count={rewatchMovie.rewatchCount || 0}
          onUnwatch={handleUnwatchMovie}
          onRewatch={handleRewatchMovie}
          onClose={() => setRewatchMovie(null)}
        />
      )}
    </div>
  );
}

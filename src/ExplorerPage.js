import { useState, useEffect } from "react";
import { getTrending, getPopular, getTopRated, getMovie, posterUrl } from "./tmdb";
import { getAllMovies, saveMovie } from "./movieStore";
import { getAllShows, followShow } from "./store";
import MovieDetail from "./MovieDetail";
import { t } from "./i18n";

// ─── Cartes ──────────────────────────────────────────

function ShowCard({ show, mine, busy, onOpen, onFollow }) {
  return (
    <div className="card" style={{ flex: "0 0 110px", width: 110 }}>
      <div onClick={() => onOpen(show)}>
        {posterUrl(show.poster_path) ? (
          <img src={posterUrl(show.poster_path)} alt={show.name} />
        ) : (
          <div className="no-poster">{t("common.noPoster")}</div>
        )}
        <div className="card-title">{show.name}</div>
        <div className="card-year">
          {show.first_air_date ? show.first_air_date.slice(0, 4) : "—"}
        </div>
      </div>
      {mine ? (
        <div className="muted small" style={{ marginTop: 4, textAlign: "center" }}>
          {t("common.following")}
        </div>
      ) : (
        <div className="movie-actions">
          <button
            className="btn-small"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onFollow(show);
            }}
          >
            {t("common.follow")}
          </button>
        </div>
      )}
    </div>
  );
}

function MovieCard({ movie, mine, busy, onOpen, onWatched, onWatchlist }) {
  // On ouvre la fiche avec les données de collection si dispo (note/commentaire),
  // sinon avec les données brutes du catalogue (synopsis/plateformes seront chargés).
  return (
    <div className="card" style={{ flex: "0 0 110px", width: 110 }}>
      <div onClick={() => onOpen(mine || movie)}>
        {posterUrl(movie.poster_path) ? (
          <img src={posterUrl(movie.poster_path)} alt={movie.title} />
        ) : (
          <div className="no-poster">{t("common.noPoster")}</div>
        )}
        <div className="card-title">
          {movie.title}
          {mine && mine.note > 0 && (
            <span className="ep-rating-badge"> ★ {mine.note}</span>
          )}
        </div>
        <div className="card-year">
          {movie.release_date ? movie.release_date.slice(0, 4) : "—"}
        </div>
      </div>
      {mine ? (
        <div className="muted small" style={{ marginTop: 4, textAlign: "center" }}>
          {mine.status === "watched" ? t("common.watched") : t("common.toSee")}
        </div>
      ) : (
        <div className="movie-actions">
          <button
            className="btn-small"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onWatched(movie);
            }}
          >
            {t("common.watched")}
          </button>
          <button
            className="btn-small"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onWatchlist(movie);
            }}
          >
            {t("common.watchlist")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Rangée horizontale ──────────────────────────────

function Row({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 className="section-title">{title}</h3>
      <div
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          paddingBottom: 8,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Page Explorer ───────────────────────────────────

export default function ExplorerPage({ onOpenShow }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [trending, setTrending] = useState([]);
  const [popTv, setPopTv] = useState([]);
  const [popMovies, setPopMovies] = useState([]);
  const [topTv, setTopTv] = useState([]);
  const [topMovies, setTopMovies] = useState([]);

  // Mes films et séries (map id -> objet) pour les badges "déjà en collection"
  const [myMovies, setMyMovies] = useState({});
  const [myShows, setMyShows] = useState({});
  const [openMovie, setOpenMovie] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tr, ptv, pmv, ttv, tmv, mineMovies, mineShows] = await Promise.all([
          getTrending(),
          getPopular("tv"),
          getPopular("movie"),
          getTopRated("tv"),
          getTopRated("movie"),
          getAllMovies().catch(() => []),
          getAllShows().catch(() => []),
        ]);
        if (cancelled) return;

        setTrending(
          (tr.results || []).filter(
            (x) => x.media_type === "tv" || x.media_type === "movie"
          )
        );
        setPopTv(ptv.results || []);
        setPopMovies(pmv.results || []);
        setTopTv(ttv.results || []);
        setTopMovies(tmv.results || []);

        const movieMap = {};
        mineMovies.forEach((m) => {
          movieMap[m.id] = m;
        });
        setMyMovies(movieMap);

        const showMap = {};
        mineShows.forEach((s) => {
          showMap[s.id] = s;
        });
        setMyShows(showMap);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Actions films ──

  const addAsWatched = async (movie) => {
    setBusyId(movie.id);
    try {
      let runtime = null;
      try {
        const full = await getMovie(movie.id);
        runtime = full.runtime || null;
      } catch {}
      const date = new Date().toISOString().slice(0, 10);
      await saveMovie({ ...movie, runtime }, "watched", date);
      setMyMovies((prev) => ({
        ...prev,
        [movie.id]: { ...movie, runtime, status: "watched", watchedDate: date },
      }));
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  };

  const addToWatchlist = async (movie) => {
    setBusyId(movie.id);
    try {
      await saveMovie(movie, "watchlist");
      setMyMovies((prev) => ({
        ...prev,
        [movie.id]: { ...movie, status: "watchlist" },
      }));
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  };

  const handleRated = (movieId, rating) => {
    setMyMovies((prev) => {
      const m = prev[movieId];
      // Film noté depuis le catalogue (pas encore en collection) : on l'ajoute
      if (!m) {
        const fromOpen = openMovie && openMovie.id === movieId ? openMovie : {};
        return {
          ...prev,
          [movieId]: {
            ...fromOpen,
            id: movieId,
            note: rating ? rating.note : null,
            comment: rating ? rating.comment : "",
            status: "watched",
          },
        };
      }
      return {
        ...prev,
        [movieId]: {
          ...m,
          note: rating ? rating.note : null,
          comment: rating ? rating.comment : "",
          status: rating ? "watched" : m.status,
        },
      };
    });
    setOpenMovie((prev) =>
      prev && prev.id === movieId
        ? {
            ...prev,
            note: rating ? rating.note : null,
            comment: rating ? rating.comment : "",
          }
        : prev
    );
  };

  // ── Actions séries ──

  const handleFollow = async (show) => {
    setBusyId(show.id);
    try {
      await followShow(show);
      setMyShows((prev) => ({ ...prev, [show.id]: { ...show } }));
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  };

  // ── Rendu ──

  const renderMovie = (movie) => (
    <MovieCard
      key={`m${movie.id}`}
      movie={movie}
      mine={myMovies[movie.id] || null}
      busy={busyId === movie.id}
      onOpen={setOpenMovie}
      onWatched={addAsWatched}
      onWatchlist={addToWatchlist}
    />
  );

  const renderShow = (show) => (
    <ShowCard
      key={`s${show.id}`}
      show={show}
      mine={myShows[show.id] || null}
      busy={busyId === show.id}
      onOpen={onOpenShow}
      onFollow={handleFollow}
    />
  );

  if (loading) return <p className="center">{t("common.loading")}</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <div>
      <Row title={t("explore.trending")}>
        {trending.map((item) =>
          item.media_type === "tv" ? renderShow(item) : renderMovie(item)
        )}
      </Row>

      <Row title={t("explore.popularShows")}>{popTv.map(renderShow)}</Row>

      <Row title={t("explore.popularMovies")}>{popMovies.map(renderMovie)}</Row>

      <Row title={t("explore.topShows")}>{topTv.map(renderShow)}</Row>

      <Row title={t("explore.topMovies")}>{topMovies.map(renderMovie)}</Row>

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

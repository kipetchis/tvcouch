import { useState, useEffect, useMemo } from "react";
import { getAllShows } from "./store";
import { getAllMovies } from "./movieStore";
import { getAllBooks } from "./bookStore";
import { getAllVolumes } from "./mangaStore";
import { getAllGames } from "./gameStore";
import { posterUrl } from "./tmdb";
import { coverUrl } from "./openlibrary";
import { MOVIE_GENRE_MAP, TV_GENRE_MAP } from "./genres";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

// Rétrospective annuelle : bilan de ce que l'utilisateur a vu / lu / joué sur
// une année donnée, calculé à partir des dates déjà enregistrées (date par
// épisode pour les séries, watchedDate / readDate / doneDate pour le reste).
// Lecture seule, avec un sélecteur d'année.

const yearOf = (iso) =>
  (typeof iso === "string" && iso.length >= 4 && /^\d{4}/.test(iso)) ? iso.slice(0, 4) : null;

// Minutes -> "Xj Yh" ou "Yh"
function fmtTime(min) {
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  const rh = h % 24;
  if (d > 0) return `${d} ${t("profile.days")} ${rh} ${t("profile.hours")}`;
  return `${h} ${t("profile.hours")}`;
}

export default function RetrospectivePage({ onClose }) {
  const [data, setData] = useState(null); // { shows, movies, books, volumes, games }
  const [year, setYear] = useState(null);

  useBackClose(true, onClose);

  useEffect(() => {
    let active = true;
    Promise.all([getAllShows(), getAllMovies(), getAllBooks(), getAllVolumes(), getAllGames()])
      .then(([shows, movies, books, volumes, games]) => {
        if (active) setData({ shows, movies, books, volumes, games });
      })
      .catch(() => { if (active) setData({ shows: [], movies: [], books: [], volumes: [], games: [] }); });
    return () => { active = false; };
  }, []);

  // Années disponibles (toutes catégories), de la plus récente à la plus ancienne.
  const years = useMemo(() => {
    if (!data) return [];
    const set = new Set();
    data.shows.forEach((s) => Object.values(s.watched || {}).forEach((d) => { const y = yearOf(d); if (y) set.add(y); }));
    data.movies.forEach((m) => { if (m.status === "watched") { const y = yearOf(m.watchedDate); if (y) set.add(y); } });
    data.books.forEach((b) => { if (b.status === "read") { const y = yearOf(b.readDate); if (y) set.add(y); } });
    data.volumes.forEach((v) => { if (v.status === "read") { const y = yearOf(v.readDate); if (y) set.add(y); } });
    data.games.forEach((g) => { if (g.status === "done") { const y = yearOf(g.doneDate); if (y) set.add(y); } });
    return Array.from(set).sort().reverse();
  }, [data]);

  // Année sélectionnée par défaut : l'année en cours si elle a de l'activité,
  // sinon la plus récente qui en a, sinon l'année en cours.
  useEffect(() => {
    if (year || !data) return;
    const current = String(new Date().getFullYear());
    if (years.includes(current)) setYear(current);
    else if (years.length > 0) setYear(years[0]);
    else setYear(current);
  }, [data, years, year]);

  // Calcul du bilan pour l'année sélectionnée.
  const stats = useMemo(() => {
    if (!data || !year) return null;
    const Y = year;

    // Séries : épisodes vus cette année + temps + top séries + genres.
    let episodes = 0;
    let seriesMin = 0;
    const showItems = [];
    data.shows.forEach((s) => {
      let c = 0;
      Object.values(s.watched || {}).forEach((d) => { if (yearOf(d) === Y) c += 1; });
      if (c > 0) {
        episodes += c;
        seriesMin += c * (s.runtime || 25);
        showItems.push({ title: s.name || "", count: c, poster: s.poster_path || null, genres: s.genre_ids || [] });
      }
    });
    showItems.sort((a, b) => b.count - a.count);

    // Films vus cette année.
    const yMovies = data.movies.filter((m) => m.status === "watched" && yearOf(m.watchedDate) === Y);
    let movieMin = 0;
    yMovies.forEach((m) => { movieMin += (m.runtime || 0); });
    const topMovies = [...yMovies].filter((m) => m.note > 0).sort((a, b) => b.note - a.note).slice(0, 3);

    // Livres / tomes lus cette année.
    const yBooks = data.books.filter((b) => b.status === "read" && yearOf(b.readDate) === Y);
    const yVolumes = data.volumes.filter((v) => v.status === "read" && yearOf(v.readDate) === Y);

    // Jeux terminés cette année.
    const yGames = data.games.filter((g) => g.status === "done" && yearOf(g.doneDate) === Y);
    const topGames = [...yGames].filter((g) => g.note > 0).sort((a, b) => b.note - a.note).slice(0, 3);

    // Genres favoris (séries + films, taxonomie TMDB traduite).
    const tally = {};
    yMovies.forEach((m) => (m.genre_ids || []).forEach((id) => {
      const k = MOVIE_GENRE_MAP[id]; if (k) tally[k] = (tally[k] || 0) + 1;
    }));
    showItems.forEach((s) => (s.genres || []).forEach((id) => {
      const k = TV_GENRE_MAP[id]; if (k) tally[k] = (tally[k] || 0) + 1;
    }));
    const topGenres = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([k, n]) => ({ label: t(`genre.${k}`), n }));

    // Coup de cœur : item le mieux noté de l'année (films, livres, tomes, jeux).
    const rated = [
      ...yMovies.filter((m) => m.note > 0).map((m) => ({ title: m.title || "", note: m.note, icon: "🎬" })),
      ...yBooks.filter((b) => b.note > 0).map((b) => ({ title: b.title || "", note: b.note, icon: "📖" })),
      ...yVolumes.filter((v) => v.note > 0).map((v) => ({
        title: v.seriesName ? `${v.seriesName}${v.seriesPosition ? ` T${v.seriesPosition}` : ""}` : (v.title || ""),
        note: v.note, icon: "📗",
      })),
      ...yGames.filter((g) => g.note > 0).map((g) => ({ title: g.name || "", note: g.note, icon: "🎮" })),
    ].sort((a, b) => b.note - a.note);
    const favorite = rated[0] || null;

    const total = episodes + yMovies.length + yBooks.length + yVolumes.length + yGames.length;

    return {
      episodes,
      showsCount: showItems.length,
      moviesCount: yMovies.length,
      booksCount: yBooks.length,
      volumesCount: yVolumes.length,
      gamesCount: yGames.length,
      screenMin: seriesMin + movieMin,
      topShows: showItems.slice(0, 3),
      topMovies,
      topGames,
      topGenres,
      favorite,
      total,
    };
  }, [data, year]);

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        <div className="ep-detail-body">
          <h2 className="ep-detail-title">📅 {t("retro.title")} {year || ""}</h2>

          {!data && <p className="center">{t("common.loading")}</p>}

          {data && years.length > 1 && (
            <div className="movie-tabs" style={{ marginTop: 8, flexWrap: "wrap" }}>
              {years.map((y) => (
                <button
                  key={y}
                  className={y === year ? "movie-tab active" : "movie-tab"}
                  onClick={() => setYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {stats && stats.total === 0 && (
            <p className="muted small" style={{ marginTop: 16 }}>{t("retro.empty")}</p>
          )}

          {stats && stats.total > 0 && (
            <>
              <div className="stats-grid" style={{ marginTop: 12 }}>
                <div className="stat-card"><div className="stat-icon">📺</div><div className="stat-value">{stats.episodes}</div><div className="stat-label">{t("retro.episodes")}</div></div>
                <div className="stat-card"><div className="stat-icon">🎬</div><div className="stat-value">{stats.moviesCount}</div><div className="stat-label">{t("retro.movies")}</div></div>
                <div className="stat-card"><div className="stat-icon">📖</div><div className="stat-value">{stats.booksCount}</div><div className="stat-label">{t("retro.books")}</div></div>
                <div className="stat-card"><div className="stat-icon">📗</div><div className="stat-value">{stats.volumesCount}</div><div className="stat-label">{t("retro.volumes")}</div></div>
                <div className="stat-card"><div className="stat-icon">🎮</div><div className="stat-value">{stats.gamesCount}</div><div className="stat-label">{t("retro.games")}</div></div>
                <div className="stat-card"><div className="stat-icon">⏱️</div><div className="stat-value-time">{fmtTime(stats.screenMin)}</div><div className="stat-label">{t("retro.screenTime")}</div></div>
              </div>

              {stats.favorite && (
                <>
                  <h3 className="section-pill">💖 {t("retro.favorite")}</h3>
                  <p style={{ margin: "4px 0 8px" }}>
                    {stats.favorite.icon} <strong>{stats.favorite.title}</strong>
                    <span className="ep-rating-badge"> ★ {stats.favorite.note}</span>
                  </p>
                </>
              )}

              {stats.topShows.length > 0 && (
                <>
                  <h3 className="section-pill">📺 {t("retro.topShows")}</h3>
                  {stats.topShows.map((s, i) => (
                    <div key={i} className="friend-row">
                      <span className="friend-name">{i + 1}. {s.title}</span>
                      <span className="muted small">{s.count} {t("retro.episodesShort")}</span>
                    </div>
                  ))}
                </>
              )}

              {stats.topMovies.length > 0 && (
                <>
                  <h3 className="section-pill">🎬 {t("retro.topMovies")}</h3>
                  {stats.topMovies.map((m, i) => (
                    <div key={i} className="friend-row">
                      <span className="friend-name">{i + 1}. {m.title}</span>
                      <span className="ep-rating-badge">★ {m.note}</span>
                    </div>
                  ))}
                </>
              )}

              {stats.topGames.length > 0 && (
                <>
                  <h3 className="section-pill">🎮 {t("retro.topGames")}</h3>
                  {stats.topGames.map((g, i) => (
                    <div key={i} className="friend-row">
                      <span className="friend-name">{i + 1}. {g.name || g.title}</span>
                      <span className="ep-rating-badge">★ {g.note}</span>
                    </div>
                  ))}
                </>
              )}

              {stats.topGenres.length > 0 && (
                <>
                  <h3 className="section-pill">🏷️ {t("retro.topGenres")}</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {stats.topGenres.map((g, i) => (
                      <span key={i} className="movie-tab" style={{ pointerEvents: "none" }}>
                        {g.label} · {g.n}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

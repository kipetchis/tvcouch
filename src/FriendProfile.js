import { useState, useEffect } from "react";
import { getFriendData } from "./social";
import { posterUrl } from "./tmdb";
import { coverUrl } from "./openlibrary";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

// Consultation du profil public d'un ami : ses listes (séries, films, livres,
// mangas, jeux) et ses compteurs, lus depuis le résumé friendData/{uid}.
// Lecture seule — on ne peut rien modifier chez un ami.
export default function FriendProfile({ uid, name, onClose }) {
  const [data, setData] = useState(undefined); // undefined = chargement, null = introuvable
  const [tab, setTab] = useState("shows");

  useBackClose(true, onClose);

  useEffect(() => {
    let active = true;
    getFriendData(uid)
      .then((d) => { if (active) setData(d); })
      .catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [uid]);

  const displayName = (data && data.displayName) || name || "";

  const renderGrid = (items, coverFn, titleFn, keyFn) => {
    if (!items || items.length === 0) {
      return <p className="muted small" style={{ textAlign: "center", marginTop: 20 }}>{t("friend.emptyList")}</p>;
    }
    return (
      <div className="grid">
        {items.map((it) => {
          const cover = coverFn(it);
          return (
            <div key={keyFn(it)} className="card">
              {cover ? (
                <img src={cover} alt={titleFn(it)} />
              ) : (
                <div className="no-poster">{titleFn(it)}</div>
              )}
              <div className="card-title">
                {titleFn(it)}
                {it.note > 0 && <span className="ep-rating-badge"> ★ {it.note}</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        <div className="ep-detail-body">
          <h2 className="ep-detail-title">👤 {displayName}</h2>

          {data === undefined && <p className="center">{t("common.loading")}</p>}

          {data === null && (
            <p className="muted small" style={{ marginTop: 16 }}>
              {t("friend.noData")}
            </p>
          )}

          {data && (
            <>
              {/* Compteurs */}
              <div className="stats-grid" style={{ marginTop: 12 }}>
                <div className="stat-card">
                  <div className="stat-icon">📺</div>
                  <div className="stat-value">{data.stats.showsFollowed}</div>
                  <div className="stat-label">{t("friend.shows")}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🎬</div>
                  <div className="stat-value">{data.stats.moviesWatched}</div>
                  <div className="stat-label">{t("friend.movies")}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">📖</div>
                  <div className="stat-value">{data.stats.booksRead}</div>
                  <div className="stat-label">{t("friend.books")}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">📗</div>
                  <div className="stat-value">{data.stats.volumesRead}</div>
                  <div className="stat-label">{t("friend.volumes")}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🎮</div>
                  <div className="stat-value">{data.stats.gamesDone}</div>
                  <div className="stat-label">{t("friend.games")}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">📼</div>
                  <div className="stat-value">{data.stats.episodesWatched}</div>
                  <div className="stat-label">{t("friend.episodes")}</div>
                </div>
              </div>

              {/* Sous-onglets par catégorie */}
              <div className="movie-tabs" style={{ marginTop: 16, flexWrap: "wrap" }}>
                {[
                  ["shows", `📺 ${t("friend.tabShows")}`],
                  ["movies", `🎬 ${t("friend.tabMovies")}`],
                  ["books", `📖 ${t("friend.tabBooks")}`],
                  ["volumes", `📚 ${t("friend.tabManga")}`],
                  ["games", `🎮 ${t("friend.tabGames")}`],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={tab === key ? "movie-tab active" : "movie-tab"}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                {tab === "shows" &&
                  renderGrid(
                    data.shows,
                    (s) => posterUrl(s.poster_path),
                    (s) => s.name,
                    (s) => s.id
                  )}
                {tab === "movies" &&
                  renderGrid(
                    data.movies,
                    (m) => posterUrl(m.poster_path),
                    (m) => m.title,
                    (m) => m.id
                  )}
                {tab === "books" &&
                  renderGrid(
                    data.books,
                    (b) => coverUrl(b.cover_url || b.cover_i),
                    (b) => b.title,
                    (b) => b.id
                  )}
                {tab === "volumes" &&
                  renderGrid(
                    data.volumes,
                    (v) => coverUrl(v.cover_url || v.cover_i),
                    (v) => (v.seriesName ? `${v.seriesName}${v.seriesPosition ? ` T${v.seriesPosition}` : ""}` : v.title),
                    (v) => v.id
                  )}
                {tab === "games" &&
                  renderGrid(
                    data.games,
                    (g) => g.cover_url || null,
                    (g) => g.name,
                    (g) => g.id
                  )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

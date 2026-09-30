import { useState, useEffect } from "react";
import { getAllShows } from "./store";
import { getAllMovies } from "./movieStore";
import { getAllGames } from "./gameStore";
import { getAllEpisodes, posterUrl } from "./tmdb";
import { readEpisodeCache, readShowTitle, writeEpisodeCache } from "./episodeCache";
import { t, getLocale } from "./i18n";

// Onglet « À venir » : agenda chronologique des prochaines sorties de ce que
// l'utilisateur suit — prochains épisodes des séries en cours, films « à voir »
// pas encore sortis, jeux « à faire » pas encore sortis. Lecture seule (les
// séries sont cliquables pour ouvrir leur fiche).

const today = () => new Date().toISOString().slice(0, 10);

// Prochain épisode daté à venir (le plus proche dans le futur, aujourd'hui inclus).
function nextUpcomingEpisode(episodes) {
  const t0 = today();
  let best = null;
  (episodes || []).forEach((ep) => {
    if (ep.air_date && ep.air_date >= t0) {
      if (!best || ep.air_date < best.air_date) best = ep;
    }
  });
  return best;
}

// Nombre de jours entre aujourd'hui et une date "AAAA-MM-JJ".
function daysUntil(dateStr) {
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(`${dateStr}T00:00:00`);
  const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((d0 - t0) / 86400000);
}

// Libellé de date : aujourd'hui / demain / date courte localisée.
function whenLabel(dateStr) {
  const n = daysUntil(dateStr);
  if (n <= 0) return t("agenda.today");
  if (n === 1) return t("agenda.tomorrow");
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(getLocale(), { weekday: "short", day: "numeric", month: "short" });
}

const sortByDate = (arr) => [...arr].sort((a, b) => a.date.localeCompare(b.date));

const ICON = { show: "📺", movie: "🎬", game: "🎮" };

export default function AgendaPage({ onOpenShow }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(0); // séries encore en cours de chargement

  useEffect(() => {
    let active = true;

    (async () => {
      // 1) Films + jeux : lecture directe, immédiate.
      const [movies, games] = await Promise.all([
        getAllMovies().catch(() => []),
        getAllGames().catch(() => []),
      ]);
      if (!active) return;
      const t0 = today();
      const base = [];
      movies
        .filter((m) => m.status === "watchlist" && m.release_date && m.release_date >= t0)
        .forEach((m) => base.push({
          kind: "movie", id: `m${m.id}`, date: m.release_date,
          title: m.title || "", cover: posterUrl(m.poster_path),
        }));
      games
        .filter((g) => g.status === "todo" && g.released && g.released >= t0)
        .forEach((g) => base.push({
          kind: "game", id: `g${g.id}`, date: g.released,
          title: g.name || "", cover: g.cover_url || null,
        }));
      setItems(sortByDate(base));
      setLoading(false);

      // 2) Séries : prochain épisode daté, via le cache puis TMDB au besoin.
      const shows = await getAllShows().catch(() => []);
      if (!active) return;
      setPending(shows.length);

      shows.forEach(async (show) => {
        try {
          let eps = readEpisodeCache(show.id);
          let title = readShowTitle(show.id) || show.name;
          if (!eps) {
            const { details, episodes } = await getAllEpisodes(show.id);
            eps = episodes;
            title = (details && details.name) || show.name;
            const ongoing = !!(details && details.next_episode_to_air);
            writeEpisodeCache(show.id, episodes, title, ongoing);
          }
          const next = nextUpcomingEpisode(eps);
          if (next && active) {
            setItems((prev) => {
              const others = prev.filter((it) => it.id !== `s${show.id}`);
              return sortByDate([...others, {
                kind: "show", id: `s${show.id}`, date: next.air_date,
                title, cover: posterUrl(show.poster_path),
                sub: `S${next.season}E${next.episode}`, show,
              }]);
            });
          }
        } catch {
          // série ignorée si TMDB échoue
        } finally {
          if (active) setPending((p) => Math.max(0, p - 1));
        }
      });
    })();

    return () => { active = false; };
  }, []);

  return (
    <div className="agenda-page">
      <h2 className="section-pill" style={{ marginTop: 8 }}>🗓️ {t("agenda.title")}</h2>

      {loading && <p className="center">{t("common.loading")}</p>}

      {!loading && items.length === 0 && pending === 0 && (
        <p className="muted small" style={{ marginTop: 16 }}>{t("agenda.empty")}</p>
      )}

      {items.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {items.map((it) => {
            const clickable = it.kind === "show" && it.show && onOpenShow;
            return (
              <div
                key={it.id}
                onClick={clickable ? () => onOpenShow(it.show) : undefined}
                style={{
                  display: "flex", gap: 10, alignItems: "center",
                  padding: "8px 0", borderBottom: "1px solid var(--border, rgba(128,128,128,0.15))",
                  cursor: clickable ? "pointer" : "default",
                }}
              >
                {it.cover ? (
                  <img src={it.cover} alt={it.title} style={{ width: 40, borderRadius: 4, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 40, height: 56, borderRadius: 4, flexShrink: 0, background: "rgba(128,128,128,0.15)" }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="small" style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ICON[it.kind]} {it.title}
                    {it.sub && <span className="muted"> · {it.sub}</span>}
                  </div>
                  <div className="muted small">{whenLabel(it.date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pending > 0 && (
        <p className="muted small center" style={{ marginTop: 12 }}>
          {t("common.loading")} ({pending})
        </p>
      )}
    </div>
  );
}

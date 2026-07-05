import { useState, useEffect } from "react";
import { getAllShows } from "./store";
import { getAllEpisodes, posterUrl } from "./tmdb";

function findNextEpisode(episodes, watched) {
  const today = new Date().toISOString().slice(0, 10);
  for (const ep of episodes) {
    const key = `${ep.season}_${ep.episode}`;
    const isAired = ep.air_date && ep.air_date <= today;
    if (!watched[key] && isAired) {
      return ep;
    }
  }
  return null;
}

// Tri d'une liste d'items (chaque item = { show, next, lastWatchedAt, ... })
function sortItems(list, sort) {
  const arr = [...list];
  switch (sort) {
    case "title":
      arr.sort((a, b) => a.show.name.localeCompare(b.show.name, "fr"));
      break;
    case "year":
      arr.sort((a, b) =>
        (b.show.first_air_date || "").localeCompare(a.show.first_air_date || "")
      );
      break;
    default: // "recent"
      arr.sort((a, b) => b.lastWatchedAt - a.lastWatchedAt);
  }
  return arr;
}

const controlStyle = {
  background: "#1a1a1a",
  color: "inherit",
  border: "1px solid #333",
  borderRadius: 8,
  padding: "8px 10px",
};

export default function ShowsPage({ onOpenShow }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  const [sort, setSort] = useState("recent");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const shows = await getAllShows();

        const enriched = await Promise.all(
          shows.map(async (show) => {
            try {
              const { episodes } = await getAllEpisodes(show.id);
              const watched = show.watched || {};
              const next = findNextEpisode(episodes, watched);
              const watchedCount = Object.keys(watched).length;
              return {
                show,
                next,
                watchedCount,
                total: episodes.length,
                lastWatchedAt: show.lastWatchedAt || show.addedAt || 0,
              };
            } catch {
              return null;
            }
          })
        );

        if (!active) return;
        setItems(enriched.filter(Boolean));
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  if (loading) return <p className="center">Chargement de vos séries…</p>;
  if (error) return <p className="error">{error}</p>;

  if (items.length === 0) {
    return (
      <p className="muted" style={{ textAlign: "center", marginTop: 40 }}>
        Aucune série suivie. Cherchez-en une pour commencer !
      </p>
    );
  }

  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Filtre par titre
  const f = filter.trim().toLowerCase();
  const visible = f
    ? items.filter((it) => it.show.name.toLowerCase().includes(f))
    : items;

  const toWatch = [];
  const stale = [];
  const upToDate = [];

  visible.forEach((it) => {
    if (!it.next) {
      upToDate.push(it);
    } else if (now - it.lastWatchedAt < THIRTY_DAYS) {
      toWatch.push(it);
    } else {
      stale.push(it);
    }
  });

  const toWatchSorted = sortItems(toWatch, sort);
  const staleSorted = sortItems(stale, sort);
  const upToDateSorted = sortItems(upToDate, sort);

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          margin: "0 0 14px",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Filtrer par titre…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ ...controlStyle, flex: "1 1 160px" }}
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={controlStyle}
        >
          <option value="recent">Activité récente</option>
          <option value="title">Titre A→Z</option>
          <option value="year">Année ↓</option>
        </select>
      </div>

      {visible.length === 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: 30 }}>
          Aucune série ne correspond à ce filtre.
        </p>
      )}

      {toWatchSorted.length > 0 && (
        <>
          <h3 className="section-pill">À VOIR</h3>
          {toWatchSorted.map((it) => (
            <NextEpRow key={it.show.id} item={it} onOpen={onOpenShow} />
          ))}
        </>
      )}

      {staleSorted.length > 0 && (
        <>
          <h3 className="section-pill">PAS REGARDÉ DEPUIS UN MOMENT</h3>
          {staleSorted.map((it) => (
            <NextEpRow key={it.show.id} item={it} onOpen={onOpenShow} />
          ))}
        </>
      )}

      {upToDateSorted.length > 0 && (
        <>
          <h3 className="section-pill">À JOUR</h3>
          <div className="grid">
            {upToDateSorted.map((it) => (
              <div
                key={it.show.id}
                className="card"
                onClick={() => onOpenShow(it.show)}
              >
                {posterUrl(it.show.poster_path) ? (
                  <img src={posterUrl(it.show.poster_path)} alt={it.show.name} />
                ) : (
                  <div className="no-poster">Pas d'affiche</div>
                )}
                <div className="card-title">{it.show.name}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NextEpRow({ item, onOpen }) {
  const { show, next, watchedCount, total } = item;
  return (
    <div className="ep-row" onClick={() => onOpen(show)}>
      <div className="ep-row-poster">
        {posterUrl(show.poster_path, "w200") ? (
          <img src={posterUrl(show.poster_path, "w200")} alt={show.name} />
        ) : (
          <div className="no-poster small-poster">—</div>
        )}
      </div>
      <div className="ep-row-info">
        <div className="ep-row-title">{show.name}</div>
        <div className="ep-row-ep">
          S{String(next.season).padStart(2, "0")} | E
          {String(next.episode).padStart(2, "0")}
        </div>
        <div className="ep-row-name">{next.name}</div>
        <div className="ep-row-progress muted small">
          {watchedCount} / {total} vus
        </div>
      </div>
    </div>
  );
}

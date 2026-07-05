import { useState, useEffect } from "react";
import { getAllShows } from "./store";
import { getAllEpisodes, posterUrl } from "./tmdb";

// ─── Cache local des listes d'épisodes ───────────────
// On ne met en cache que les métadonnées d'épisodes (saison, numéro, nom,
// date de diffusion), qui changent très rarement. Le statut "vu" reste
// toujours lu en direct depuis Firestore.
const CACHE_PREFIX = "tvcouch_eps_";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

function readCache(showId) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + showId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.ts || Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed.episodes || null;
  } catch {
    return null;
  }
}

function writeCache(showId, episodes) {
  try {
    // On garde uniquement les champs utiles pour limiter la taille
    const slim = episodes.map((e) => ({
      season: e.season,
      episode: e.episode,
      name: e.name,
      air_date: e.air_date || null,
    }));
    localStorage.setItem(
      CACHE_PREFIX + showId,
      JSON.stringify({ ts: Date.now(), episodes: slim })
    );
  } catch {
    // quota dépassé ou indisponible : on ignore, ce n'est qu'un cache
  }
}

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

// Construit un item d'affichage à partir d'une série et de ses épisodes
function buildItem(show, episodes) {
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
}

// Tri d'une liste d'items
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

export default function ShowsPage({ onOpenShow }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState(0); // séries encore en cours de chargement
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
        if (!active) return;

        if (shows.length === 0) {
          setItems([]);
          setLoading(false);
          return;
        }

        // 1) Affichage immédiat depuis le cache
        const initial = [];
        const toFetch = [];
        shows.forEach((show) => {
          const cached = readCache(show.id);
          if (cached) initial.push(buildItem(show, cached));
          else toFetch.push(show);
        });

        setItems(initial);
        if (initial.length > 0) setLoading(false);

        if (toFetch.length === 0) {
          setLoading(false);
          return;
        }

        // 2) Complétion progressive des séries non cachées (en parallèle)
        setPending(toFetch.length);
        let firstArrived = initial.length > 0;

        toFetch.forEach(async (show) => {
          try {
            const { episodes } = await getAllEpisodes(show.id);
            if (!active) return;
            writeCache(show.id, episodes);
            const item = buildItem(show, episodes);
            setItems((prev) => {
              const others = prev.filter((it) => it.show.id !== show.id);
              return [...others, item];
            });
            if (!firstArrived) {
              firstArrived = true;
              setLoading(false);
            }
          } catch {
            // série ignorée si TMDB échoue
          } finally {
            if (active) setPending((p) => Math.max(0, p - 1));
          }
        });
      } catch (e) {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      }
    }

    load();
    return () => { active = false; };
  }, []);

  if (loading) return <p className="center">Chargement de vos séries…</p>;
  if (error) return <p className="error">{error}</p>;

  if (items.length === 0 && pending === 0) {
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
      <div className="list-controls">
        <input
          type="text"
          className="filter-input"
          placeholder="Filtrer par titre…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">Activité récente</option>
          <option value="title">Titre A→Z</option>
          <option value="year">Année ↓</option>
        </select>
      </div>

      {pending > 0 && (
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          Mise à jour de {pending} série{pending > 1 ? "s" : ""}…
        </p>
      )}

      {visible.length === 0 && pending === 0 && (
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

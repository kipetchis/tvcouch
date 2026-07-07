import { useState, useEffect } from "react";
import { getAllShows } from "./store";
import { getAllEpisodes, posterUrl } from "./tmdb";
import { readEpisodeCache, writeEpisodeCache, readShowTitle } from "./episodeCache";
import { t } from "./i18n";

function findNextEpisode(episodes, watched) {
  const today = new Date().toISOString().slice(0, 10);
  let firstUnwatched = null;
  for (const ep of episodes) {
    const key = `${ep.season}_${ep.episode}`;
    if (watched[key]) continue;
    // On mémorise le tout premier épisode non vu (même pas encore diffusé)
    if (firstUnwatched === null) firstUnwatched = ep;
    // On privilégie le prochain épisode DÉJÀ diffusé (regardable maintenant)
    const isAired = ep.air_date && ep.air_date <= today;
    if (isAired) return ep;
  }
  // Aucun épisode diffusé à voir : on renvoie le prochain à venir (série en cours)
  return firstUnwatched;
}

// Construit un item d'affichage à partir d'une série et de ses épisodes
function buildItem(show, episodes, title) {
  const watched = show.watched || {};
  const next = findNextEpisode(episodes, watched);
  const watchedCount = Object.keys(watched).length;
  return {
    show,
    title: title || show.name,
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
      arr.sort((a, b) => a.title.localeCompare(b.title, "fr"));
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
          const cached = readEpisodeCache(show.id);
          if (cached) initial.push(buildItem(show, cached, readShowTitle(show.id)));
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
            const { details, episodes } = await getAllEpisodes(show.id);
            if (!active) return;
            const title = (details && details.name) || show.name;
            writeEpisodeCache(show.id, episodes, title);
            const item = buildItem(show, episodes, title);
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

  if (loading) return <p className="center">{t("shows.loading")}</p>;
  if (error) return <p className="error">{error}</p>;

  if (items.length === 0 && pending === 0) {
    return (
      <p className="muted" style={{ textAlign: "center", marginTop: 40 }}>
        {t("shows.none")}
      </p>
    );
  }

  // Filtre par titre
  const f = filter.trim().toLowerCase();
  const visible = f
    ? items.filter((it) => it.title.toLowerCase().includes(f))
    : items;

  const toWatch = [];
  const stale = [];
  const upToDate = [];

  visible.forEach((it) => {
    if (!it.next) {
      // Plus d'épisode à voir → à jour
      upToDate.push(it);
    } else if (it.watchedCount > 0) {
      // En cours (au moins un épisode vu) → À voir, en haut
      toWatch.push(it);
    } else {
      // Suivie mais jamais commencée
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
          placeholder={t("shows.filterTitle")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">{t("sort.activity")}</option>
          <option value="title">{t("sort.title")}</option>
          <option value="year">{t("sort.year")}</option>
        </select>
      </div>

      {pending > 0 && (
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          {t("shows.updating")} {pending} {t("shows.updatingShows")}
        </p>
      )}

      {visible.length === 0 && pending === 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: 30 }}>
          {t("shows.noneFilter")}
        </p>
      )}

      {toWatchSorted.length > 0 && (
        <>
          <h3 className="section-pill">{t("shows.sectionToWatch")}</h3>
          {toWatchSorted.map((it) => (
            <NextEpRow key={it.show.id} item={it} onOpen={onOpenShow} />
          ))}
        </>
      )}

      {staleSorted.length > 0 && (
        <>
          <h3 className="section-pill">{t("shows.sectionStale")}</h3>
          {staleSorted.map((it) => (
            <NextEpRow key={it.show.id} item={it} onOpen={onOpenShow} />
          ))}
        </>
      )}

      {upToDateSorted.length > 0 && (
        <>
          <h3 className="section-pill">{t("shows.sectionUpToDate")}</h3>
          <div className="grid">
            {upToDateSorted.map((it) => (
              <div
                key={it.show.id}
                className="card"
                onClick={() => onOpenShow(it.show)}
              >
                {posterUrl(it.show.poster_path) ? (
                  <img src={posterUrl(it.show.poster_path)} alt={it.title} />
                ) : (
                  <div className="no-poster">{t("common.noPoster")}</div>
                )}
                <div className="card-title">{it.title}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NextEpRow({ item, onOpen }) {
  const { show, title, next, watchedCount, total } = item;
  return (
    <div className="ep-row" onClick={() => onOpen(show)}>
      <div className="ep-row-poster">
        {posterUrl(show.poster_path, "w200") ? (
          <img src={posterUrl(show.poster_path, "w200")} alt={title} />
        ) : (
          <div className="no-poster small-poster">—</div>
        )}
      </div>
      <div className="ep-row-info">
        <div className="ep-row-title">{title}</div>
        <div className="ep-row-ep">
          S{String(next.season).padStart(2, "0")} | E
          {String(next.episode).padStart(2, "0")}
        </div>
        <div className="ep-row-name">{next.name}</div>
        <div className="ep-row-progress muted small">
          {watchedCount} / {total} {t("shows.watchedCount")}
        </div>
      </div>
    </div>
  );
}

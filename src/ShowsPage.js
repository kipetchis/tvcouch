import { useState, useEffect } from "react";
import { getAllShows, setShowGenres } from "./store";
import { getAllEpisodes, posterUrl } from "./tmdb";
import { readEpisodeCache, writeEpisodeCache, readShowTitle, readShowOngoing } from "./episodeCache";
import { TV_GENRE_MAP } from "./genres";
import FilterSheet from "./FilterSheet";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

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
function buildItem(show, episodes, title, ongoing, genreIds) {
  const watched = show.watched || {};
  const next = findNextEpisode(episodes, watched);
  const watchedCount = Object.keys(watched).length;
  return {
    show,
    title: title || show.name,
    ongoing: ongoing === true,
    next,
    watchedCount,
    total: episodes.length,
    lastWatchedAt: show.lastWatchedAt || show.addedAt || 0,
    genreIds: genreIds || [],
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

export default function ShowsPage({ onOpenShow, subTab, onSubTabChange }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState(0); // séries encore en cours de chargement
  const [error, setError] = useState(null);

  const [sort, setSort] = useState("recent");
  const [filter, setFilter] = useState("");
  const [section, setSection] = useState("all"); // all | inProgress | stale | upToDate | notStarted
  const [genreFilter, setGenreFilter] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  useBackClose(controlsOpen, () => setControlsOpen(false));
  const [layout, setLayout] = useState(() => {
    try {
      return localStorage.getItem("tvcouch_shows_layout") === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });

  const toggleLayout = () => {
    setLayout((prev) => {
      const next = prev === "list" ? "grid" : "list";
      try {
        localStorage.setItem("tvcouch_shows_layout", next);
      } catch {
        // ignore
      }
      return next;
    });
  };

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
          if (cached) initial.push(buildItem(show, cached, readShowTitle(show.id), readShowOngoing(show.id), show.genre_ids));
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
            // « Nouvel épisode réellement annoncé » : fiable, contrairement au
            // statut TMDB souvent optimiste. Si tout est vu et qu'il n'y a pas
            // de prochain épisode daté → la série passera en « À jour ».
            const ongoing = !!(details && details.next_episode_to_air);
            writeEpisodeCache(show.id, episodes, title, ongoing);
            const fetchedGenreIds = (details && details.genres) ? details.genres.map((g) => g.id) : [];
            const genreIds = (show.genre_ids && show.genre_ids.length) ? show.genre_ids : fetchedGenreIds;
            // Rattrapage silencieux : si la série n'avait pas encore ses genres
            // enregistrés (suivie avant cette fonctionnalité), on les pose
            // maintenant — sans appel TMDB en plus, on les a déjà sous la main.
            if ((!show.genre_ids || show.genre_ids.length === 0) && fetchedGenreIds.length > 0) {
              setShowGenres(show.id, fetchedGenreIds).catch(() => {});
            }
            const item = buildItem(show, episodes, title, ongoing, genreIds);
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

  const subTabsRow = (
    <div className="subtabs-row">
      <div className="movie-tabs">
        <button
          className={subTab === "towatch" ? "movie-tab active" : "movie-tab"}
          onClick={() => onSubTabChange("towatch")}
        >
          {t("common.toWatch")}
        </button>
        <button
          className={subTab === "upcoming" ? "movie-tab active" : "movie-tab"}
          onClick={() => onSubTabChange("upcoming")}
        >
          {t("common.upcoming")}
        </button>
      </div>
      <div className="controls-menu-wrap">
        <button
          className="controls-menu-trigger"
          onClick={() => setControlsOpen((o) => !o)}
          aria-label={t("shows.controlsMenu")}
        >
          ⋮
          {(filter.trim() !== "" || sort !== "recent" || section !== "all" || genreFilter) && (
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
                placeholder={t("shows.filterTitle")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <select
                className="sort-select controls-menu-select"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="recent">{t("sort.activity")}</option>
                <option value="title">{t("sort.title")}</option>
                <option value="year">{t("sort.year")}</option>
              </select>

              <div className="controls-menu-sep" />
              <button
                className="controls-menu-item"
                onClick={() => { setControlsOpen(false); setFilterOpen(true); }}
              >
                ▾ {t("filter.button")}
                {(section !== "all" || genreFilter) && <span className="filter-trigger-dot" />}
              </button>
              <button className="controls-menu-item" onClick={toggleLayout}>
                {layout === "list" ? "▦" : "☰"}{" "}
                {layout === "list" ? t("shows.gridView") : t("shows.listView")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (loading) return (<div>{subTabsRow}<p className="center">{t("shows.loading")}</p></div>);
  if (error) return (<div>{subTabsRow}<p className="error">{error}</p></div>);

  if (items.length === 0 && pending === 0) {
    return (
      <div>
        {subTabsRow}
        <p className="muted" style={{ textAlign: "center", marginTop: 40 }}>
          {t("shows.none")}
        </p>
      </div>
    );
  }

  // Filtre par titre
  const f = filter.trim().toLowerCase();
  let visible = f
    ? items.filter((it) => it.title.toLowerCase().includes(f))
    : items;
  if (genreFilter) {
    visible = visible.filter((it) => (it.genreIds || []).includes(genreFilter));
  }

  // Options de genre disponibles, calculées à partir de toute la collection
  const genreOptions = Array.from(new Set(items.flatMap((it) => it.genreIds || [])))
    .filter((id) => TV_GENRE_MAP[id])
    .map((id) => ({ id, label: t(`genre.${TV_GENRE_MAP[id]}`) }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));

  const RECENT = 30 * 24 * 60 * 60 * 1000; // 30 jours
  const now = Date.now();

  const inProgress = [];   // À voir (en cours)
  const stale = [];        // Pas regardé depuis un moment
  const upToDate = [];     // À jour
  const notStarted = [];   // Pas encore commencées

  visible.forEach((it) => {
    if (it.watchedCount === 0) {
      // Suivie mais aucun épisode vu
      notStarted.push(it);
    } else if (it.next) {
      // Il reste un épisode à voir : récent → en cours, sinon → pas regardé
      if (now - it.lastWatchedAt < RECENT) inProgress.push(it);
      else stale.push(it);
    } else if (it.ongoing) {
      // À jour mais série encore en cours de diffusion → on garde en haut
      inProgress.push(it);
    } else {
      // Tout vu et série terminée → à jour
      upToDate.push(it);
    }
  });

  const inProgressSorted = sortItems(inProgress, sort);
  const staleSorted = sortItems(stale, sort);
  const upToDateSorted = sortItems(upToDate, sort);
  const notStartedSorted = sortItems(notStarted, sort);

  return (
    <div>
      {subTabsRow}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        statusOptions={[
          ["all", t("shows.filterAll")],
          ["inProgress", t("shows.filterInProgress")],
          ["stale", t("shows.filterStale")],
          ["upToDate", t("shows.filterUpToDate")],
          ["notStarted", t("shows.filterNotStarted")],
        ].map(([value, label]) => ({ value, label }))}
        status={section}
        onStatusChange={setSection}
        genreOptions={genreOptions}
        genre={genreFilter}
        onGenreChange={setGenreFilter}
      />

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

      {(section === "all" || section === "inProgress") && inProgressSorted.length > 0 && (
        <>
          <h3 className="section-pill">{t("shows.sectionToWatch")}</h3>
          {layout === "grid" ? (
            <div className="shows-grid">
              {inProgressSorted.map((it) => (
                <ShowGridCard key={it.show.id} item={it} onOpen={onOpenShow} />
              ))}
            </div>
          ) : (
            inProgressSorted.map((it) => (
              <NextEpRow key={it.show.id} item={it} onOpen={onOpenShow} />
            ))
          )}
        </>
      )}

      {(section === "all" || section === "stale") && staleSorted.length > 0 && (
        <>
          <h3 className="section-pill">{t("shows.sectionStale")}</h3>
          {layout === "grid" ? (
            <div className="shows-grid">
              {staleSorted.map((it) => (
                <ShowGridCard key={it.show.id} item={it} onOpen={onOpenShow} />
              ))}
            </div>
          ) : (
            staleSorted.map((it) => (
              <NextEpRow key={it.show.id} item={it} onOpen={onOpenShow} />
            ))
          )}
        </>
      )}

      {(section === "all" || section === "upToDate") && upToDateSorted.length > 0 && (
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

      {(section === "all" || section === "notStarted") && notStartedSorted.length > 0 && (
        <>
          <h3 className="section-pill">{t("shows.sectionNotStarted")}</h3>
          <div className="grid">
            {notStartedSorted.map((it) => (
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
        {next ? (
          <>
            <div className="ep-row-ep">
              S{String(next.season).padStart(2, "0")} | E
              {String(next.episode).padStart(2, "0")}
            </div>
            <div className="ep-row-name">{next.name}</div>
          </>
        ) : (
          <div className="ep-row-name">{t("shows.caughtUp")}</div>
        )}
        <div className="ep-row-progress muted small">
          {watchedCount} / {total} {t("shows.watchedCount")}
        </div>
      </div>
    </div>
  );
}

// Carte compacte pour la vue grille : affiche + fine barre de progression
function ShowGridCard({ item, onOpen }) {
  const { show, title, watchedCount, total } = item;
  const pct = total > 0 ? Math.min(100, Math.round((watchedCount / total) * 100)) : 0;
  return (
    <div className="show-grid-card" onClick={() => onOpen(show)}>
      {posterUrl(show.poster_path) ? (
        <img src={posterUrl(show.poster_path)} alt={title} />
      ) : (
        <div className="no-poster">{title}</div>
      )}
      <div className="show-grid-bar">
        <div className="show-grid-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

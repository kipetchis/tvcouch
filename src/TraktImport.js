import { useState } from "react";
import JSZip from "jszip";
import {
  findMovieByImdb, findShowByTvdb, findShowByImdb,
  searchMovies, searchShows, getMovie, getShow,
} from "./tmdb";
import { saveMovie, setMovieRating } from "./movieStore";
import { importShow } from "./store";
import { t } from "./i18n";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Convertit "2022-08-17T18:49:00.000Z" en "2022-08-17"
function toDateOnly(str) {
  if (!str) return null;
  return str.slice(0, 10);
}

// Note Trakt (1-10) -> note Tv Couch (1-5)
function toFiveScale(rating10) {
  const n = Number(rating10);
  if (!n) return 0;
  return Math.max(1, Math.min(5, Math.round(n / 2)));
}

// Lit un fichier JSON précis dans le zip. Renvoie [] s'il est absent,
// vide, ou illisible (le compte Trakt n'a peut-être jamais utilisé cette
// fonctionnalité — c'est normal, pas une erreur).
async function readJsonFromZip(zip, filename) {
  const entry = zip.file(filename);
  if (!entry) return [];
  try {
    const text = await entry.async("text");
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default function TraktImport({ onDone }) {
  const [status, setStatus] = useState("idle"); // idle | running | done
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null);

  const addLog = (msg) => setLog((prev) => [msg, ...prev].slice(0, 12));

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    let zip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      addLog("❌ Fichier zip illisible.");
      setStatus("done");
      setResult({ moviesImported: 0, showsImported: 0, episodesTotal: 0, notFound: [] });
      return;
    }

    const [watchedMovies, watchedShows, ratingsMovies, watchlist] = await Promise.all([
      readJsonFromZip(zip, "watched-movies.json"),
      readJsonFromZip(zip, "watched-shows.json"),
      readJsonFromZip(zip, "ratings-movies.json"),
      readJsonFromZip(zip, "lists-watchlist.json"),
    ]);

    // ---- Fusionne les films : vus + notés + à voir, un seul passage par film ----
    const movieMap = new Map(); // trakt id -> { movie, watched, watchedAt, rating }
    watchedMovies.forEach((entry) => {
      const key = entry.movie?.ids?.trakt;
      if (!key) return;
      movieMap.set(key, { movie: entry.movie, watched: true, watchedAt: entry.last_watched_at });
    });
    ratingsMovies.forEach((entry) => {
      const key = entry.movie?.ids?.trakt;
      if (!key) return;
      const prev = movieMap.get(key) || { movie: entry.movie, watched: false };
      prev.rating = entry.rating;
      movieMap.set(key, prev);
    });
    watchlist
      .filter((entry) => entry.type === "movie")
      .forEach((entry) => {
        const key = entry.movie?.ids?.trakt;
        if (key && !movieMap.has(key)) {
          movieMap.set(key, { movie: entry.movie, watched: false });
        }
      });

    // ---- Fusionne les séries : vues (avec épisodes) + à voir ----
    const showMap = new Map();
    watchedShows.forEach((entry) => {
      const key = entry.show?.ids?.trakt;
      if (!key) return;
      const watched = {};
      let lastDate = 0;
      (entry.seasons || []).forEach((season) => {
        (season.episodes || []).forEach((ep) => {
          const d = toDateOnly(ep.last_watched_at);
          watched[`${season.number}_${ep.number}`] = d || true;
          if (d) {
            const ts = new Date(d).getTime();
            if (ts > lastDate) lastDate = ts;
          }
        });
      });
      showMap.set(key, { show: entry.show, watched, lastDate });
    });
    watchlist
      .filter((entry) => entry.type === "show")
      .forEach((entry) => {
        const key = entry.show?.ids?.trakt;
        if (key && !showMap.has(key)) {
          showMap.set(key, { show: entry.show, watched: {}, lastDate: 0 });
        }
      });

    const movieEntries = Array.from(movieMap.values());
    const showEntries = Array.from(showMap.values());
    const total = movieEntries.length + showEntries.length;

    if (total === 0) {
      addLog("Aucune donnée exploitable trouvée dans ce fichier.");
      setResult({ moviesImported: 0, showsImported: 0, episodesTotal: 0, notFound: [] });
      setStatus("done");
      return;
    }

    setStatus("running");
    setProgress({ current: 0, total });

    let moviesImported = 0;
    let showsImported = 0;
    let episodesTotal = 0;
    const notFound = [];
    let done = 0;

    // ---- Films ----
    for (const entry of movieEntries) {
      const { movie, watched, watchedAt, rating } = entry;
      const title = movie?.title || "Film sans titre";
      const ids = movie?.ids || {};

      let tmdbId = ids.tmdb || null;
      try {
        if (!tmdbId && ids.imdb) {
          const found = await findMovieByImdb(ids.imdb);
          if (found) tmdbId = found.id;
        }
        if (!tmdbId) {
          const res = await searchMovies(title);
          tmdbId = (res.results || [])[0]?.id || null;
        }
      } catch {}

      if (!tmdbId) {
        notFound.push(title);
        addLog(`⚠️ Introuvable : ${title}`);
        done++;
        setProgress({ current: done, total });
        await sleep(40);
        continue;
      }

      try {
        // Fiche complète TMDB pour avoir affiche/titre/durée/genres à jour
        const full = await getMovie(tmdbId);
        const movieStatus = watched ? "watched" : "watchlist";
        const date = watched
          ? toDateOnly(watchedAt) || new Date().toISOString().slice(0, 10)
          : null;
        await saveMovie(
          {
            id: full.id,
            title: full.title || title,
            poster_path: full.poster_path || null,
            release_date: full.release_date || null,
            runtime: full.runtime || null,
            genres: full.genres,
          },
          movieStatus,
          date
        );
        if (rating) {
          await setMovieRating(full.id, toFiveScale(rating), "", { genres: full.genres });
        }
        moviesImported++;
        addLog(`🎬 ${full.title || title}${watched ? "" : " (à voir)"}`);
      } catch {
        notFound.push(title + " (erreur écriture)");
      }

      done++;
      setProgress({ current: done, total });
      await sleep(60);
    }

    // ---- Séries ----
    for (const entry of showEntries) {
      const { show, watched, lastDate } = entry;
      const title = show?.title || "Série sans titre";
      const ids = show?.ids || {};
      const episodeCount = Object.keys(watched).length;

      let tmdbShow = null;
      try {
        if (ids.tmdb) {
          tmdbShow = await getShow(ids.tmdb);
        } else if (ids.tvdb) {
          tmdbShow = await findShowByTvdb(ids.tvdb);
        } else if (ids.imdb) {
          tmdbShow = await findShowByImdb(ids.imdb);
        }
        if (!tmdbShow) {
          const res = await searchShows(title);
          tmdbShow = (res.results || [])[0] || null;
        }
      } catch {}

      if (!tmdbShow) {
        notFound.push(title);
        addLog(`⚠️ Introuvable : ${title}`);
        done++;
        setProgress({ current: done, total });
        await sleep(40);
        continue;
      }

      try {
        await importShow({
          id: tmdbShow.id,
          name: tmdbShow.name || title,
          poster_path: tmdbShow.poster_path || null,
          first_air_date: tmdbShow.first_air_date || null,
          genre_ids: (tmdbShow.genres || []).map((g) => g.id),
          watched,
          addedAt: Date.now(),
          lastWatchedAt: lastDate || Date.now(),
        });
        showsImported++;
        episodesTotal += episodeCount;
        addLog(`📺 ${tmdbShow.name || title}${episodeCount ? ` (${episodeCount} ép.)` : " (à voir)"}`);
      } catch {
        notFound.push(title + " (erreur écriture)");
      }

      done++;
      setProgress({ current: done, total });
      await sleep(60);
    }

    setResult({ moviesImported, showsImported, episodesTotal, notFound });
    setStatus("done");
  };

  return (
    <div className="import-page">
      <h2>{t("import.trakt")}</h2>

      {status === "idle" && (
        <>
          <p className="muted">{t("import.traktHelp")}</p>
          <label className="btn file-btn">
            {t("import.chooseZip")}
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={handleFile}
              style={{ display: "none" }}
            />
          </label>
        </>
      )}

      {status === "running" && (
        <>
          <p className="progress-text">
            {t("import.running")} {progress.current} / {progress.total}
          </p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: progress.total ? `${(progress.current / progress.total) * 100}%` : "0%",
              }}
            />
          </div>
          <p className="muted small">{t("import.dontClose")}</p>
          <div className="import-log">
            {log.map((line, i) => (
              <div key={i} className="log-line">{line}</div>
            ))}
          </div>
        </>
      )}

      {status === "done" && result && (
        <>
          <h3>{t("import.doneTitle")}</h3>
          <p className="progress-text">
            {result.moviesImported} {t("import.movies")} · {result.showsImported} {t("import.shows")}
            {result.episodesTotal > 0 && ` · ${result.episodesTotal} ${t("import.episodesMarked")}`}
          </p>
          {result.notFound.length > 0 && (
            <details className="notfound">
              <summary>{result.notFound.length} {t("import.traktNotFound")}</summary>
              <ul>
                {result.notFound.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          <button className="btn" onClick={onDone}>
            {t("common.done")}
          </button>
        </>
      )}
    </div>
  );
}

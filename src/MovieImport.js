import { useState } from "react";
import { findMovieByImdb, searchMovies } from "./tmdb";
import { saveMovie } from "./movieStore";
import { t } from "./i18n";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toDateOnly(str) {
  if (!str) return null;
  return str.slice(0, 10);
}

export default function MovieImport({ onDone }) {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null);

  const addLog = (msg) => setLog((prev) => [msg, ...prev].slice(0, 12));

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      addLog("❌ Fichier illisible.");
      return;
    }
    if (!Array.isArray(data)) {
      addLog("❌ Format inattendu.");
      return;
    }

    setStatus("running");
    setProgress({ current: 0, total: data.length });

    let imported = 0;
    let watchedCount = 0;
    const notFound = [];

    for (let i = 0; i < data.length; i++) {
      const m = data[i];
      const title = m.title || "Film sans titre";
      const imdbId = m.id?.imdb;

      let tmdbMovie = null;
      try {
        if (imdbId) tmdbMovie = await findMovieByImdb(imdbId);
        if (!tmdbMovie) {
          const res = await searchMovies(title);
          tmdbMovie = (res.results || [])[0] || null;
        }
      } catch {}

      if (!tmdbMovie) {
        notFound.push(title);
        addLog(`⚠️ Introuvable : ${title}`);
        setProgress({ current: i + 1, total: data.length });
        await sleep(50);
        continue;
      }

      const isWatched = m.is_watched === true;
      try {
        await saveMovie(
          {
            id: tmdbMovie.id,
            title: tmdbMovie.title || title,
            poster_path: tmdbMovie.poster_path || null,
            release_date: tmdbMovie.release_date || null,
            runtime: null,
          },
          isWatched ? "watched" : "watchlist",
          isWatched ? toDateOnly(m.watched_at) : null
        );
        imported++;
        if (isWatched) watchedCount++;
        addLog(`✅ ${tmdbMovie.title || title}${isWatched ? " (vu)" : ""}`);
      } catch {
        notFound.push(title + " (erreur écriture)");
      }

      setProgress({ current: i + 1, total: data.length });
      await sleep(55);
    }

    setResult({ imported, watchedCount, notFound });
    setStatus("done");
  };

  return (
    <div className="import-page">
      <h2>{t("import.tvtimeMovies")}</h2>

      {status === "idle" && (
        <>
          <p className="muted">{t("import.tvtimeMoviesHelp")}</p>
          <label className="btn file-btn">
            {t("import.chooseMoviesFile")}
            <input
              type="file"
              accept=".json"
              onChange={handleFile}
              style={{ display: "none" }}
            />
          </label>
        </>
      )}

      {status === "running" && (
        <>
          <p className="progress-text">
            {t("import.running")} {progress.current} / {progress.total} {t("import.movies")}
          </p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width: progress.total
                  ? `${(progress.current / progress.total) * 100}%`
                  : "0%",
              }}
            />
          </div>
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
            {result.imported} {t("import.moviesImported")} · {result.watchedCount} {t("import.markedWatched")}
          </p>
          {result.notFound.length > 0 && (
            <details className="notfound">
              <summary>{result.notFound.length} {t("import.notFoundMovies")}</summary>
              <ul>
                {result.notFound.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          <button className="btn" onClick={onDone}>
            {t("import.seeMyMovies")}
          </button>
        </>
      )}
    </div>
  );
}
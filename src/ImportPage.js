import { useState } from "react";
import { findShowByTvdb, searchShows } from "./tmdb";
import { importShow } from "./store";
import { t } from "./i18n";

// Petite pause pour ne pas marteler l'API
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Convertit "2022-08-17 18:49:00" ou "2022-08-17T18:49:00Z" en "2022-08-17"
function toDateOnly(str) {
  if (!str) return null;
  return str.slice(0, 10);
}

export default function ImportPage({ onDone }) {
  const [status, setStatus] = useState("idle"); // idle | running | done
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null);

  const addLog = (msg) => setLog((prev) => [msg, ...prev].slice(0, 12));

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    let data;
    try {
      const text = await file.text();
      data = JSON.parse(text);
    } catch {
      addLog("❌ Fichier illisible (JSON invalide).");
      return;
    }

    if (!Array.isArray(data)) {
      addLog("❌ Format inattendu (tableau de séries attendu).");
      return;
    }

    setStatus("running");
    setProgress({ current: 0, total: data.length });

    let imported = 0;
    let episodesTotal = 0;
    const notFound = [];

    for (let i = 0; i < data.length; i++) {
      const serie = data[i];
      const title = serie.title || "Série sans titre";
      const tvdbId = serie.id?.tvdb;

      // Construit l'objet "watched" à partir des épisodes vus
      const watched = {};
      let lastDate = 0;
      (serie.seasons || []).forEach((season) => {
        if (season.is_specials) return; // on ignore les spéciaux (saison 0)
        (season.episodes || []).forEach((ep) => {
          if (ep.is_watched) {
            const key = `${season.number}_${ep.number}`;
            const d = toDateOnly(ep.watched_at);
            watched[key] = d || true;
            if (d) {
              const t = new Date(d).getTime();
              if (t > lastDate) lastDate = t;
            }
          }
        });
      });

      const episodeCount = Object.keys(watched).length;

      // On n'importe que les séries avec au moins 1 épisode vu
      if (episodeCount === 0) {
        setProgress({ current: i + 1, total: data.length });
        continue;
      }

      // Résolution TMDB : d'abord par TVDB, sinon par nom
      let tmdbShow = null;
      try {
        if (tvdbId) {
          tmdbShow = await findShowByTvdb(tvdbId);
        }
        if (!tmdbShow) {
          const search = await searchShows(title);
          tmdbShow = (search.results || [])[0] || null;
        }
      } catch {
        // erreur réseau ponctuelle : on réessaiera au prochain import
      }

      if (!tmdbShow) {
        notFound.push(title);
        addLog(`⚠️ Introuvable : ${title}`);
        setProgress({ current: i + 1, total: data.length });
        await sleep(50);
        continue;
      }

      // Écriture Firestore
      try {
        await importShow({
          id: tmdbShow.id,
          name: tmdbShow.name || title,
          poster_path: tmdbShow.poster_path || null,
          first_air_date: tmdbShow.first_air_date || null,
          watched,
          addedAt: Date.now(),
          lastWatchedAt: lastDate || Date.now(),
        });
        imported++;
        episodesTotal += episodeCount;
        addLog(`✅ ${tmdbShow.name || title} (${episodeCount} ép.)`);
      } catch (err) {
        notFound.push(title + " (erreur écriture)");
        addLog(`❌ Échec écriture : ${title}`);
      }

      setProgress({ current: i + 1, total: data.length });
      await sleep(60); // throttle doux
    }

    setResult({ imported, episodesTotal, notFound });
    setStatus("done");
  };

  return (
    <div className="import-page">
      <h2>{t("import.tvtimeShows")}</h2>

      {status === "idle" && (
        <>
          <p className="muted">{t("import.tvtimeShowsHelp")}</p>
          <label className="btn file-btn">
            {t("import.chooseShowsFile")}
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFile}
              style={{ display: "none" }}
            />
          </label>
        </>
      )}

      {status === "running" && (
        <>
          <p className="progress-text">
            {t("import.running")} {progress.current} / {progress.total} {t("import.shows")}
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
          <p className="muted small">
            {t("import.dontClose")}
          </p>
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
            {result.imported} {t("import.showsImported")} · {result.episodesTotal} {t("import.episodesMarked")}
          </p>
          {result.notFound.length > 0 && (
            <details className="notfound">
              <summary>{result.notFound.length} {t("import.notFoundShows")}</summary>
              <ul>
                {result.notFound.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </details>
          )}
          <button className="btn" onClick={onDone}>
            {t("import.seeMyShows")}
          </button>
        </>
      )}
    </div>
  );
}
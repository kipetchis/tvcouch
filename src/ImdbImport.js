import { useState } from "react";
import Papa from "papaparse";
import { findMovieByImdb, findShowByImdb, getMovie } from "./tmdb";
import { saveMovie, setMovieRating } from "./movieStore";
import { followShow } from "./store";

// Convertit une note IMDb (/10) en note /5 (arrondie, min 1)
function toFiveScale(rating10) {
  const n = parseFloat(rating10);
  if (!n || isNaN(n)) return 0;
  return Math.max(1, Math.round(n / 2));
}

// Normalise le type IMDb -> "movie" | "show" | null (ignoré)
function classifyType(titleType) {
  const t = (titleType || "").toLowerCase();
  if (t.includes("episode")) return null; // épisodes ignorés
  if (t.includes("movie")) return "movie"; // "Movie", "TV Movie"
  if (t.includes("series") || t.includes("mini")) return "show";
  if (t === "video" || t.includes("game") || t.includes("short")) return null;
  // Par défaut, on tente film (les vieux exports disent "Feature Film")
  if (t.includes("feature")) return "movie";
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function ImdbImport({ onDone }) {
  const [status, setStatus] = useState("idle"); // idle | running | done
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [log, setLog] = useState([]);
  const [summary, setSummary] = useState(null);
  const [notFound, setNotFound] = useState([]);

  const addLog = (line) => setLog((prev) => [...prev, line]);

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setStatus("running");
    setLog([]);
    setSummary(null);
    setNotFound([]);
    setProgress({ current: 0, total: 0 });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res) => {
        const rows = res.data || [];
        await runImport(rows);
      },
      error: (err) => {
        addLog("Erreur de lecture du fichier : " + err.message);
        setStatus("done");
      },
    });
  };

  const runImport = async (rows) => {
    // On récupère les colonnes en tolérant les variantes de casse/nom
    const getField = (row, names) => {
      for (const n of names) {
        if (row[n] !== undefined) return row[n];
      }
      return undefined;
    };

    // Prépare les entrées valides
    const entries = [];
    rows.forEach((row) => {
      const constId = getField(row, ["Const", "const"]);
      const titleType = getField(row, ["Title Type", "Title type"]);
      const title = getField(row, ["Title"]);
      const rating = getField(row, ["Your Rating", "You rated", "your rating"]);
      if (!constId || !constId.startsWith("tt")) return;
      const kind = classifyType(titleType);
      if (!kind) return;
      entries.push({ constId, kind, title, rating });
    });

    setProgress({ current: 0, total: entries.length });

    let moviesAdded = 0;
    let showsAdded = 0;
    let failed = 0;
    const missing = [];

    for (let i = 0; i < entries.length; i++) {
      const { constId, kind, title, rating } = entries[i];
      try {
        if (kind === "movie") {
          const found = await findMovieByImdb(constId);
          if (found) {
            // runtime pour les stats
            let runtime = null;
            try {
              const full = await getMovie(found.id);
              runtime = full.runtime || null;
            } catch {}
            const note = toFiveScale(rating);
            const date = new Date().toISOString().slice(0, 10);
            await saveMovie({ ...found, runtime }, "watched", date);
            if (note > 0) {
              await setMovieRating(found.id, note, "", { ...found, runtime });
            }
            moviesAdded += 1;
            addLog(`🎬 ${found.title}${note ? ` (★${note})` : ""}`);
          } else {
            failed += 1;
            missing.push(title || constId);
          }
        } else if (kind === "show") {
          const found = await findShowByImdb(constId);
          if (found) {
            await followShow(found);
            showsAdded += 1;
            addLog(`📺 ${found.name} (suivie)`);
          } else {
            failed += 1;
            missing.push(title || constId);
          }
        }
      } catch (err) {
        failed += 1;
        missing.push(title || constId);
      }
      setProgress({ current: i + 1, total: entries.length });
      await sleep(50); // on ménage TMDB
    }

    setNotFound(missing);
    setSummary({ moviesAdded, showsAdded, failed, total: entries.length });
    setStatus("done");
  };

  return (
    <div className="import-page">
      <h2>Importer depuis IMDb</h2>

      {status === "idle" && (
        <>
          <p className="muted small">
            Exporte tes notes ou ta watchlist IMDb en CSV (sur IMDb : ta liste →
            bouton « Export »), puis sélectionne le fichier ci-dessous. Les films
            seront ajoutés comme vus, les séries comme suivies. Les notes IMDb
            (/10) sont converties sur 5.
          </p>
          <label className="btn file-btn">
            Choisir un fichier CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFile}
              style={{ display: "none" }}
            />
          </label>
        </>
      )}

      {status === "running" && (
        <>
          <p className="center">Import en cours… {progress.current}/{progress.total}</p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width:
                  progress.total > 0
                    ? `${(progress.current / progress.total) * 100}%`
                    : "0%",
              }}
            />
          </div>
          <div className="import-log">
            {log.slice(-40).map((line, i) => (
              <div key={i} className="log-line">{line}</div>
            ))}
          </div>
        </>
      )}

      {status === "done" && summary && (
        <>
          <h3 className="section-title">Import terminé 🎉</h3>
          <p className="muted small">
            {summary.moviesAdded} film{summary.moviesAdded > 1 ? "s" : ""} ajouté
            {summary.moviesAdded > 1 ? "s" : ""}, {summary.showsAdded} série
            {summary.showsAdded > 1 ? "s" : ""} suivie
            {summary.showsAdded > 1 ? "s" : ""}.
            {summary.failed > 0 && ` ${summary.failed} non trouvé(s).`}
          </p>

          {notFound.length > 0 && (
            <details className="notfound">
              <summary>Voir les {notFound.length} non trouvés</summary>
              <ul>
                {notFound.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </details>
          )}

          <button className="btn" onClick={onDone} style={{ marginTop: 16 }}>
            Terminé
          </button>
        </>
      )}
    </div>
  );
}
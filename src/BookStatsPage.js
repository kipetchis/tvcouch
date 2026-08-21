import { useState, useEffect } from "react";
import { getAllBooks } from "./bookStore";
import { getAllVolumes } from "./mangaStore";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

// Normalise un sujet/genre Open Library ou une catégorie Google Books en
// une étiquette courte et lisible. Google renvoie souvent des chemins type
// "Fiction / Fantasy / Epic" — on ne garde que le dernier segment.
function cleanSubject(raw) {
  if (!raw) return null;
  let s = String(raw);
  if (s.includes("/")) s = s.split("/").pop();
  s = s.trim().toLowerCase();
  if (s.length < 2 || s.length > 30) return null;
  return s;
}

// Compte les occurrences dans une liste et renvoie le top N trié.
function topCounts(items, n) {
  const map = new Map();
  items.forEach((it) => {
    if (!it) return;
    map.set(it, (map.get(it) || 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// Petit graphe à barres horizontales (réutilise le style des barres déjà
// présentes ailleurs dans l'app).
function BarList({ rows }) {
  const max = rows.length ? Math.max(...rows.map((r) => r[1])) : 1;
  return (
    <div className="stat-bars">
      {rows.map(([label, count]) => (
        <div key={label} className="stat-bar-row">
          <div className="stat-bar-label">{label}</div>
          <div className="stat-bar-track">
            <div
              className="stat-bar-fill"
              style={{ width: `${Math.round((count / max) * 100)}%` }}
            />
          </div>
          <div className="stat-bar-count">{count}</div>
        </div>
      ))}
    </div>
  );
}

export default function BookStatsPage({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState([]);
  const [volumes, setVolumes] = useState([]);

  useBackClose(true, onBack);

  useEffect(() => {
    let active = true;
    Promise.all([getAllBooks(), getAllVolumes()])
      .then(([b, v]) => {
        if (!active) return;
        setBooks(b);
        setVolumes(v);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="detail">
        <button className="btn-small back" onClick={onBack}>← Retour</button>
        <p className="center">{t("common.loading")}</p>
      </div>
    );
  }

  const readBooks = books.filter((b) => b.status === "read");
  const readVolumes = volumes.filter((v) => v.status === "read");

  // Nombre de séries de manga distinctes (au moins un tome lu)
  const mangaSeries = new Set(readVolumes.map((v) => v.seriesName || v.title));

  // Top auteurs (romans uniquement — les tomes de manga n'ont pas toujours
  // l'auteur renseigné de façon fiable, mais on les inclut s'ils l'ont)
  const authors = [
    ...readBooks.map((b) => b.author),
    ...readVolumes.map((v) => v.author),
  ].filter(Boolean);
  const topAuthors = topCounts(authors, 8);

  // Top genres/sujets (romans + mangas confondus)
  const subjects = [];
  [...readBooks, ...readVolumes].forEach((item) => {
    (item.subjects || []).forEach((s) => {
      const c = cleanSubject(s);
      if (c) subjects.push(c);
    });
  });
  const topSubjects = topCounts(subjects, 8);

  // Lectures par année (à partir de la date de lecture, romans + tomes)
  const years = [
    ...readBooks.map((b) => b.readDate),
    ...readVolumes.map((v) => v.readDate),
  ]
    .filter(Boolean)
    .map((d) => String(d).slice(0, 4));
  const byYear = topCounts(years, 20).sort((a, b) => b[0].localeCompare(a[0]));

  const totalRead = readBooks.length + readVolumes.length;

  return (
    <div className="detail book-stats">
      <button className="btn-small back" onClick={onBack}>← Retour</button>
      <h2>{t("stats.title")}</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{totalRead}</div>
          <div className="stat-label">{t("stats.totalRead")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{readBooks.length}</div>
          <div className="stat-label">{t("stats.novelsRead")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{readVolumes.length}</div>
          <div className="stat-label">{t("stats.volumesRead")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{mangaSeries.size}</div>
          <div className="stat-label">{t("stats.mangaSeries")}</div>
        </div>
      </div>

      {topAuthors.length > 0 && (
        <>
          <h3 className="section-pill">{t("stats.topAuthors")}</h3>
          <BarList rows={topAuthors} />
        </>
      )}

      {topSubjects.length > 0 && (
        <>
          <h3 className="section-pill">{t("stats.topGenres")}</h3>
          <BarList rows={topSubjects} />
        </>
      )}

      {byYear.length > 0 && (
        <>
          <h3 className="section-pill">{t("stats.byYear")}</h3>
          <BarList rows={byYear} />
        </>
      )}

      {totalRead === 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: 30 }}>
          {t("stats.empty")}
        </p>
      )}
    </div>
  );
}

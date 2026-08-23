import { useState, useEffect, useMemo } from "react";
import { getAllShows } from "./store";
import { getAllMovies } from "./movieStore";
import { getAllBooks } from "./bookStore";
import { getAllVolumes } from "./mangaStore";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

function formatTime(totalMinutes) {
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  const remHours = totalHours % 24;
  return { months, days: remDays, hours: remHours };
}

function cleanSubject(raw) {
  if (!raw) return null;
  let s = String(raw);
  if (s.includes("/")) s = s.split("/").pop();
  s = s.trim().toLowerCase();
  if (s.length < 2 || s.length > 30) return null;
  return s;
}

function topCounts(items, n) {
  const map = new Map();
  items.forEach((it) => { if (it) map.set(it, (map.get(it) || 0) + 1); });
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function BarList({ rows }) {
  const max = rows.length ? rows[0][1] : 1;
  return (
    <div className="stat-bars">
      {rows.map(([label, count]) => (
        <div key={label} className="stat-bar-row">
          <div className="stat-bar-label">{label}</div>
          <div className="stat-bar-track">
            <div className="stat-bar-fill" style={{ width: `${Math.round((count / max) * 100)}%` }} />
          </div>
          <div className="stat-bar-count">{count}</div>
        </div>
      ))}
    </div>
  );
}

export default function StatsPage({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [shows, setShows] = useState([]);
  const [movies, setMovies] = useState([]);
  const [books, setBooks] = useState([]);
  const [volumes, setVolumes] = useState([]);

  useBackClose(true, onBack);

  useEffect(() => {
    let active = true;
    Promise.all([getAllShows(), getAllMovies(), getAllBooks(), getAllVolumes()])
      .then(([sh, mv, bk, vol]) => {
        if (!active) return;
        setShows(sh);
        setMovies(mv);
        setBooks(bk);
        setVolumes(vol);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const screen = useMemo(() => {
    // Épisodes vus + temps séries : même logique que ProfilePage
    // (nombre de clés dans watched, runtime par épisode = s.runtime).
    let episodesWatched = 0;
    let seriesMinutes = 0;
    shows.forEach((s) => {
      const n = Object.keys(s.watched || {}).length;
      episodesWatched += n;
      if (n > 0 && s.runtime) seriesMinutes += n * s.runtime;
    });
    const watchedMovies = movies.filter((m) => m.status === "watched");
    let moviesMinutes = 0;
    watchedMovies.forEach((m) => { if (m.runtime) moviesMinutes += m.runtime; });

    return {
      showsCount: shows.length,
      episodesWatched,
      seriesTime: formatTime(seriesMinutes),
      moviesWatched: watchedMovies.length,
      moviesTime: formatTime(moviesMinutes),
    };
  }, [shows, movies]);

  const bookStats = useMemo(() => {
    const readBooks = books.filter((b) => b.status === "read");
    const readVolumes = volumes.filter((v) => v.status === "read");
    const mangaSeries = new Set(readVolumes.map((v) => v.seriesName || v.title));

    const authors = [
      ...readBooks.map((b) => b.author),
      ...readVolumes.map((v) => v.author),
    ].filter(Boolean);

    const subjects = [];
    [...readBooks, ...readVolumes].forEach((item) => {
      (item.subjects || []).forEach((s) => {
        const c = cleanSubject(s);
        if (c) subjects.push(c);
      });
    });

    const years = [
      ...readBooks.map((b) => b.readDate),
      ...readVolumes.map((v) => v.readDate),
    ].filter(Boolean).map((d) => String(d).slice(0, 4));

    return {
      totalRead: readBooks.length + readVolumes.length,
      novelsRead: readBooks.length,
      volumesRead: readVolumes.length,
      seriesCount: mangaSeries.size,
      topAuthors: topCounts(authors, 8),
      topSubjects: topCounts(subjects, 8),
      byYear: topCounts(years, 10).sort((a, b) => b[0].localeCompare(a[0])),
    };
  }, [books, volumes]);

  if (loading) {
    return (
      <div className="detail">
        <button className="btn-small back" onClick={onBack}>← Retour</button>
        <p className="center">{t("common.loading")}</p>
      </div>
    );
  }

  const { seriesTime: st, moviesTime: mt } = screen;

  return (
    <div className="detail">
      <button className="btn-small back" onClick={onBack}>← Retour</button>
      <h2>{t("stats.detailedTitle")}</h2>

      {/* ── Écran : séries & films ── */}
      <h3 className="section-pill">📺 {t("stats.screenSection")}</h3>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📺</div>
          <div className="stat-value">{screen.episodesWatched}</div>
          <div className="stat-label">{t("stats.episodesWatched")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-value-time">
            {st.months > 0 && <span><b>{st.months}</b> {t("profile.months")} </span>}
            <span><b>{st.days}</b> {t("profile.days")} </span>
            <span><b>{st.hours}</b> {t("profile.hours")}</span>
          </div>
          <div className="stat-label">{t("profile.seriesTime")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🎬</div>
          <div className="stat-value">{screen.moviesWatched}</div>
          <div className="stat-label">{t("stats.moviesWatched")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🍿</div>
          <div className="stat-value-time">
            {mt.months > 0 && <span><b>{mt.months}</b> {t("profile.months")} </span>}
            <span><b>{mt.days}</b> {t("profile.days")} </span>
            <span><b>{mt.hours}</b> {t("profile.hours")}</span>
          </div>
          <div className="stat-label">{t("profile.moviesTime")}</div>
        </div>
      </div>

      {/* ── Lecture ── */}
      {bookStats.totalRead > 0 && (
        <>
          <h3 className="section-pill">📚 {t("profile.booksStats")}</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">📖</div>
              <div className="stat-value">{bookStats.novelsRead}</div>
              <div className="stat-label">{t("stats.novelsRead")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📗</div>
              <div className="stat-value">{bookStats.volumesRead}</div>
              <div className="stat-label">{t("stats.volumesRead")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">📚</div>
              <div className="stat-value">{bookStats.seriesCount}</div>
              <div className="stat-label">{t("stats.mangaSeries")}</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">✅</div>
              <div className="stat-value">{bookStats.totalRead}</div>
              <div className="stat-label">{t("stats.totalRead")}</div>
            </div>
          </div>

          {bookStats.topAuthors.length > 0 && (
            <>
              <div className="stat-sublabel">{t("stats.topAuthors")}</div>
              <BarList rows={bookStats.topAuthors} />
            </>
          )}
          {bookStats.topSubjects.length > 0 && (
            <>
              <div className="stat-sublabel">{t("stats.topGenres")}</div>
              <BarList rows={bookStats.topSubjects} />
            </>
          )}
          {bookStats.byYear.length > 0 && (
            <>
              <div className="stat-sublabel">{t("stats.byYear")}</div>
              <BarList rows={bookStats.byYear} />
            </>
          )}
        </>
      )}
    </div>
  );
}

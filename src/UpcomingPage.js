import { useState, useEffect } from "react";
import { getAllShows } from "./store";
import { getAllEpisodes, posterUrl } from "./tmdb";
import { t, getLocale } from "./i18n";

// Formate une date "2026-08-15" selon la langue courante
function formatDate(dateStr) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(getLocale(), {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function UpcomingPage({ onOpenShow }) {
  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const shows = await getAllShows();
        const today = new Date().toISOString().slice(0, 10);

        const results = await Promise.all(
          shows.map(async (show) => {
            try {
              const { episodes } = await getAllEpisodes(show.id);
              // Épisodes à venir (date future)
              const future = episodes.filter(
                (ep) => ep.air_date && ep.air_date > today
              );
              return future.map((ep) => ({ show, ep }));
            } catch {
              return [];
            }
          })
        );

        if (!active) return;
        // On aplatit et on trie par date
        const flat = results.flat();
        flat.sort((a, b) => a.ep.air_date.localeCompare(b.ep.air_date));
        setUpcoming(flat);
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  if (loading) return <p className="center">{t("upcoming.loading")}</p>;
  if (error) return <p className="error">{error}</p>;

  if (upcoming.length === 0) {
    return (
      <div className="center" style={{ minHeight: "40vh" }}>
        <p className="muted">{t("upcoming.none")}</p>
      </div>
    );
  }

  return (
    <div>
      {upcoming.map(({ show, ep }) => (
        <div
          key={`${show.id}_${ep.season}_${ep.episode}`}
          className="ep-row"
          onClick={() => onOpenShow(show)}
        >
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
              S{String(ep.season).padStart(2, "0")} | E
              {String(ep.episode).padStart(2, "0")}
            </div>
            <div className="ep-row-name">{ep.name}</div>
            <div className="upcoming-date">📅 {formatDate(ep.air_date)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

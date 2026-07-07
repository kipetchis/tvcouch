import { useState, useEffect } from "react";
import { getAllShows } from "./store";
import { getAllEpisodes, posterUrl } from "./tmdb";
import { readEpisodeCache, writeEpisodeCache, readShowTitle } from "./episodeCache";
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

// Extrait les épisodes à venir (date future) d'une série
function futureEpisodesOf(show, episodes, today, title) {
  const displayTitle = title || show.name;
  return episodes
    .filter((ep) => ep.air_date && ep.air_date > today)
    .map((ep) => ({ show, ep, title: displayTitle }));
}

export default function UpcomingPage({ onOpenShow }) {
  const [loading, setLoading] = useState(true);
  const [upcoming, setUpcoming] = useState([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const shows = await getAllShows();
        if (!active) return;

        if (shows.length === 0) {
          setUpcoming([]);
          setLoading(false);
          return;
        }

        const today = new Date().toISOString().slice(0, 10);

        // 1) Affichage immédiat depuis le cache
        let collected = [];
        const toFetch = [];
        shows.forEach((show) => {
          const cached = readEpisodeCache(show.id);
          if (cached) {
            collected = collected.concat(futureEpisodesOf(show, cached, today, readShowTitle(show.id)));
          } else {
            toFetch.push(show);
          }
        });
        collected.sort((a, b) => a.ep.air_date.localeCompare(b.ep.air_date));
        setUpcoming(collected);
        if (collected.length > 0 || toFetch.length === 0) setLoading(false);

        if (toFetch.length === 0) {
          setLoading(false);
          return;
        }

        // 2) Complétion progressive des séries non cachées
        setPending(toFetch.length);
        let firstArrived = collected.length > 0;

        toFetch.forEach(async (show) => {
          try {
            const { details, episodes } = await getAllEpisodes(show.id);
            if (!active) return;
            const title = (details && details.name) || show.name;
            writeEpisodeCache(show.id, episodes, title);
            const future = futureEpisodesOf(show, episodes, today, title);
            if (future.length > 0) {
              setUpcoming((prev) => {
                const merged = [...prev, ...future];
                merged.sort((a, b) => a.ep.air_date.localeCompare(b.ep.air_date));
                return merged;
              });
            }
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

  if (loading) return <p className="center">{t("upcoming.loading")}</p>;
  if (error) return <p className="error">{error}</p>;

  if (upcoming.length === 0 && pending === 0) {
    return (
      <div className="center" style={{ minHeight: "40vh" }}>
        <p className="muted">{t("upcoming.none")}</p>
      </div>
    );
  }

  return (
    <div>
      {pending > 0 && (
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          {t("shows.updating")} {pending} {t("shows.updatingShows")}
        </p>
      )}

      {upcoming.map(({ show, ep, title }) => (
        <div
          key={`${show.id}_${ep.season}_${ep.episode}`}
          className="ep-row"
          onClick={() => onOpenShow(show)}
        >
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

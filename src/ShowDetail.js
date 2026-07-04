import { useState, useEffect } from "react";
import { getShow, getSeason, getWatchProviders, posterUrl, logoUrl } from "./tmdb";
import {
  followShow, unfollowShow, getFollowedShow,
  setEpisodeWatched, setEpisodesWatched, touchShow,
} from "./store";

export default function ShowDetail({ show, onBack }) {
  const [details, setDetails] = useState(null);
  const [watched, setWatched] = useState({});
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openSeason, setOpenSeason] = useState(null);
  const [seasonData, setSeasonData] = useState({});
  const [error, setError] = useState(null);
  const [providers, setProviders] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [d, f] = await Promise.all([
          getShow(show.id),
          getFollowedShow(show.id),
        ]);
        if (!active) return;
        setDetails(d);
        if (f) {
          setFollowed(true);
          setWatched(f.watched || {});
        }
        // Plateformes (non bloquant)
        getWatchProviders("tv", show.id)
          .then((p) => { if (active) setProviders(p); })
          .catch(() => {});
      } catch (e) {
        if (active && e.name !== "AbortError") setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [show.id]);

  const handleFollow = async () => {
    const s = {
      id: show.id,
      name: details?.name || show.name,
      poster_path: details?.poster_path ?? show.poster_path,
      first_air_date: details?.first_air_date ?? show.first_air_date,
    };
    await followShow(s);
    setFollowed(true);
  };

  const handleUnfollow = async () => {
    if (!window.confirm("Ne plus suivre cette série ? Vos épisodes cochés seront perdus.")) return;
    await unfollowShow(show.id);
    setFollowed(false);
    setWatched({});
  };

  const ensureFollowed = async () => {
    if (!followed) await handleFollow();
  };

  const toggleSeason = async (seasonNumber) => {
    if (openSeason === seasonNumber) {
      setOpenSeason(null);
      return;
    }
    setOpenSeason(seasonNumber);
    if (!seasonData[seasonNumber]) {
      try {
        const s = await getSeason(show.id, seasonNumber);
        setSeasonData((prev) => ({ ...prev, [seasonNumber]: s.episodes || [] }));
      } catch (e) {
        if (e.name !== "AbortError") setError(e.message);
      }
    }
  };

  const toggleEpisode = async (seasonNumber, episodeNumber) => {
    await ensureFollowed();
    const key = `${seasonNumber}_${episodeNumber}`;
    const wasWatched = !!watched[key];
    const newValue = wasWatched ? false : new Date().toISOString().slice(0, 10);
    setWatched((prev) => {
      const next = { ...prev };
      if (newValue) next[key] = newValue;
      else delete next[key];
      return next;
    });
    try {
      await setEpisodeWatched(show.id, seasonNumber, episodeNumber, newValue);
      if (newValue) await touchShow(show.id);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    }
  };

  const markSeason = async (seasonNumber, episodes, mark) => {
    await ensureFollowed();
    const today = new Date().toISOString().slice(0, 10);
    const updates = {};
    episodes.forEach((ep) => {
      updates[`${seasonNumber}_${ep.episode_number}`] = mark ? today : false;
    });
    setWatched((prev) => {
      const next = { ...prev };
      Object.entries(updates).forEach(([k, v]) => {
        if (v) next[k] = v;
        else delete next[k];
      });
      return next;
    });
    try {
      await setEpisodesWatched(show.id, updates);
      if (mark) await touchShow(show.id);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    }
  };

  const countWatchedInSeason = (seasonNumber, episodes) =>
    episodes.filter((ep) => watched[`${seasonNumber}_${ep.episode_number}`]).length;

  const totalWatched = Object.keys(watched).length;

  if (loading) return <div className="center">Chargement…</div>;
  if (error) return (
    <div className="detail">
      <button className="btn-small" onClick={onBack}>← Retour</button>
      <p className="error">{error}</p>
    </div>
  );
  if (!details) return null;

  const seasons = (details.seasons || []).filter((s) => s.season_number >= 0);
  const flatrate = providers && providers.flatrate ? providers.flatrate : [];

  return (
    <div className="detail">
      <button className="btn-small back" onClick={onBack}>← Retour</button>

      <div className="detail-head">
        {posterUrl(details.poster_path) && (
          <img src={posterUrl(details.poster_path)} alt={details.name} />
        )}
        <div className="detail-info">
          <h2>{details.name}</h2>
          <p className="muted">
            {details.first_air_date ? details.first_air_date.slice(0, 4) : "—"}
            {" · "}
            {details.number_of_episodes} épisodes
          </p>
          {followed ? (
            <>
              <p className="progress-text">
                {totalWatched} / {details.number_of_episodes} vus
              </p>
              <button className="btn-small" onClick={handleUnfollow}>
                Ne plus suivre
              </button>
            </>
          ) : (
            <button className="btn" onClick={handleFollow}>
              + Suivre cette série
            </button>
          )}
          {details.overview && <p className="overview">{details.overview}</p>}
        </div>
      </div>

      {/* Où regarder */}
      {flatrate.length > 0 && (
        <div className="providers">
          <h3 className="providers-title">Où regarder</h3>
          <div className="providers-list">
            {flatrate.map((p) => (
              <div key={p.provider_id} className="provider" title={p.provider_name}>
                {logoUrl(p.logo_path) ? (
                  <img src={logoUrl(p.logo_path)} alt={p.provider_name} />
                ) : (
                  <span>{p.provider_name}</span>
                )}
              </div>
            ))}
          </div>
          <p className="muted small providers-note">
            Données JustWatch via TMDB · France
          </p>
        </div>
      )}

      <div className="seasons">
        {seasons.map((s) => {
          const episodes = seasonData[s.season_number] || [];
          const isOpen = openSeason === s.season_number;
          const seenCount = countWatchedInSeason(s.season_number, episodes);
          return (
            <div key={s.id} className="season">
              <button
                className="season-header"
                onClick={() => toggleSeason(s.season_number)}
              >
                <span>
                  {s.season_number === 0 ? "Spéciaux" : `Saison ${s.season_number}`}
                  <span className="muted"> · {s.episode_count} ép.</span>
                </span>
                <span className="chevron">{isOpen ? "▾" : "▸"}</span>
              </button>

              {isOpen && (
                <div className="episodes">
                  {episodes.length > 0 && (
                    <div className="season-actions">
                      <button
                        className="btn-small"
                        onClick={() => markSeason(s.season_number, episodes, true)}
                      >
                        Tout cocher
                      </button>
                      <button
                        className="btn-small"
                        onClick={() => markSeason(s.season_number, episodes, false)}
                      >
                        Tout décocher
                      </button>
                      <span className="muted small">
                        {seenCount}/{episodes.length}
                      </span>
                    </div>
                  )}
                  {episodes.map((ep) => {
                    const key = `${s.season_number}_${ep.episode_number}`;
                    const isWatched = !!watched[key];
                    return (
                      <div
                        key={ep.id}
                        className="episode"
                        onClick={() => toggleEpisode(s.season_number, ep.episode_number)}
                      >
                        <div className="ep-text">
                          <span className="ep-num">E{ep.episode_number}</span>
                          <span className="ep-name">{ep.name}</span>
                          {ep.air_date && (
                            <span className="muted small"> · {ep.air_date}</span>
                          )}
                        </div>
                        <div className={`check ${isWatched ? "checked" : ""}`}>
                          {isWatched ? "✓" : ""}
                        </div>
                      </div>
                    );
                  })}
                  {episodes.length === 0 && (
                    <p className="muted small">Chargement des épisodes…</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
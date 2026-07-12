import { useState, useEffect } from "react";
import {
  getShow, getSeason, getWatchProviders, getShowCredits, getShowVideos,
  posterUrl, logoUrl, profileUrl,
} from "./tmdb";
import {
  followShow, unfollowShow, getFollowedShow,
  setEpisodeWatched, setEpisodesWatched, touchShow,
} from "./store";
import EpisodeDetail from "./EpisodeDetail";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

// Choisit la meilleure vidéo YouTube (bande-annonce officielle en priorité)
function pickTrailer(videos) {
  if (!videos || videos.length === 0) return null;
  const yt = videos.filter((v) => v.site === "YouTube");
  return (
    yt.find((v) => v.type === "Trailer" && v.official) ||
    yt.find((v) => v.type === "Trailer") ||
    yt.find((v) => v.type === "Teaser") ||
    yt[0] ||
    null
  );
}

export default function ShowDetail({ show, onBack }) {
  const [details, setDetails] = useState(null);
  const [watched, setWatched] = useState({});
  const [ratings, setRatings] = useState({});
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openSeason, setOpenSeason] = useState(null);
  const [seasonData, setSeasonData] = useState({});
  const [error, setError] = useState(null);
  const [providers, setProviders] = useState(null);
  const [cast, setCast] = useState([]);
  const [trailer, setTrailer] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [openEpisode, setOpenEpisode] = useState(null); // { seasonNumber, episode }

  // Retour / swipe : ferme le détail d'épisode avant de revenir à la série
  useBackClose(!!openEpisode, () => setOpenEpisode(null));

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
          setRatings(f.ratings || {});
        }
        getWatchProviders("tv", show.id)
          .then((p) => { if (active) setProviders(p); })
          .catch(() => {});
        getShowCredits(show.id)
          .then((c) => { if (active) setCast((c.cast || []).slice(0, 12)); })
          .catch(() => {});
        // Bande-annonce : français d'abord, repli anglais
        (async () => {
          try {
            const fr = await getShowVideos(show.id);
            let tr = pickTrailer(fr.results || []);
            if (!tr) {
              const en = await getShowVideos(show.id, "en-US");
              tr = pickTrailer(en.results || []);
            }
            if (active) setTrailer(tr);
          } catch {
            // ignore
          }
        })();
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
    if (!window.confirm(t("detail.unfollowConfirm"))) return;
    await unfollowShow(show.id);
    setFollowed(false);
    setWatched({});
    setRatings({});
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

  const openEpisodeDetail = async (seasonNumber, episode) => {
    await ensureFollowed();
    setOpenEpisode({ seasonNumber, episode });
  };

  // Callback quand une note est enregistrée depuis le détail
  const handleRated = (seasonNumber, episodeNumber, rating) => {
    const key = `${seasonNumber}_${episodeNumber}`;
    setRatings((prev) => {
      const next = { ...prev };
      if (rating) next[key] = rating;
      else delete next[key];
      return next;
    });
    // Noter marque comme vu
    if (rating) {
      setWatched((prev) => ({ ...prev, [key]: new Date().toISOString().slice(0, 10) }));
    }
  };

  const countWatchedInSeason = (seasonNumber, episodes) =>
    episodes.filter((ep) => watched[`${seasonNumber}_${ep.episode_number}`]).length;

  const totalWatched = Object.keys(watched).length;

  if (loading) return <div className="center">{t("common.loading")}</div>;
  if (error) return (
    <div className="detail">
      <button className="btn-small" onClick={onBack}>{t("common.back")}</button>
      <p className="error">{error}</p>
    </div>
  );
  if (!details) return null;

  const seasons = (details.seasons || []).filter((s) => s.season_number >= 0);
  const flatrate = providers && providers.flatrate ? providers.flatrate : [];

  return (
    <div className="detail">
      <button className="btn-small back" onClick={onBack}>{t("common.back")}</button>

      <div className="detail-head">
        {posterUrl(details.poster_path) && (
          <img src={posterUrl(details.poster_path)} alt={details.name} />
        )}
        <div className="detail-info">
          <h2>{details.name}</h2>
          <p className="muted">
            {details.first_air_date ? details.first_air_date.slice(0, 4) : "—"}
            {" · "}
            {details.number_of_episodes} {t("detail.episodes")}
          </p>
          {followed ? (
            <>
              <p className="progress-text">
                {totalWatched} / {details.number_of_episodes} {t("detail.watchedOf")}
              </p>
              <button className="btn-small" onClick={handleUnfollow}>
                {t("detail.unfollow")}
              </button>
            </>
          ) : (
            <button className="btn" onClick={handleFollow}>
              {t("detail.follow")}
            </button>
          )}
          {details.overview && <p className="overview">{details.overview}</p>}
        </div>
      </div>

      {trailer && (
        <div className="trailer-section">
          <h3 className="trailer-title">{t("detail.trailer")}</h3>
          <div className="trailer-media">
            {playing ? (
              <iframe
                src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`}
                title={t("detail.trailer")}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div
                className="trailer-thumb"
                onClick={() => setPlaying(true)}
                style={{ width: "100%", height: "100%" }}
              >
                <img
                  src={`https://img.youtube.com/vi/${trailer.key}/hqdefault.jpg`}
                  alt={t("detail.trailer")}
                />
                <div className="trailer-play"><span>▶</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {cast.length > 0 && (
        <div className="cast-section">
          <h3 className="cast-title">{t("detail.cast")}</h3>
          <div className="cast-list">
            {cast.map((person) => (
              <div key={person.id} className="cast-member">
                {profileUrl(person.profile_path) ? (
                  <img
                    className="cast-photo"
                    src={profileUrl(person.profile_path)}
                    alt={person.name}
                  />
                ) : (
                  <div className="cast-photo-fallback">
                    {person.name ? person.name.charAt(0) : "?"}
                  </div>
                )}
                <div className="cast-name">{person.name}</div>
                {person.character && (
                  <div className="cast-char">{person.character}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {flatrate.length > 0 && (
        <div className="providers">
          <h3 className="providers-title">{t("detail.whereToWatch")}</h3>
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
            {t("detail.providersNote")}
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
                  {s.season_number === 0 ? t("detail.specials") : `${t("detail.season")} ${s.season_number}`}
                  <span className="muted"> · {s.episode_count} {t("detail.epShort")}</span>
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
                        {t("detail.checkAll")}
                      </button>
                      <button
                        className="btn-small"
                        onClick={() => markSeason(s.season_number, episodes, false)}
                      >
                        {t("detail.uncheckAll")}
                      </button>
                      <span className="muted small">
                        {seenCount}/{episodes.length}
                      </span>
                    </div>
                  )}
                  {episodes.map((ep) => {
                    const key = `${s.season_number}_${ep.episode_number}`;
                    const isWatched = !!watched[key];
                    const rating = ratings[key];
                    return (
                      <div key={ep.id} className="episode">
                        <div
                          className="ep-text"
                          onClick={() => openEpisodeDetail(s.season_number, ep)}
                        >
                          <span className="ep-num">E{ep.episode_number}</span>
                          <span className="ep-name">{ep.name}</span>
                          {ep.air_date && (
                            <span className="muted small"> · {ep.air_date}</span>
                          )}
                          {rating && rating.note > 0 && (
                            <span className="ep-rating-badge">★ {rating.note}</span>
                          )}
                        </div>
                        <div
                          className={`check ${isWatched ? "checked" : ""}`}
                          onClick={() => toggleEpisode(s.season_number, ep.episode_number)}
                        >
                          {isWatched ? "✓" : ""}
                        </div>
                      </div>
                    );
                  })}
                  {episodes.length === 0 && (
                    <p className="muted small">{t("detail.loadingEpisodes")}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openEpisode && (
        <EpisodeDetail
          showId={show.id}
          seasonNumber={openEpisode.seasonNumber}
          episode={openEpisode.episode}
          initialRating={ratings[`${openEpisode.seasonNumber}_${openEpisode.episode.episode_number}`]}
          onClose={() => setOpenEpisode(null)}
          onRated={handleRated}
        />
      )}
    </div>
  );
}
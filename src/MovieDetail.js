import { useState, useEffect } from "react";
import { setMovieRating, removeMovieRating } from "./movieStore";
import {
  getMovie, getMovieCredits, getMovieVideos, getWatchProviders,
  posterUrl, logoUrl, profileUrl,
} from "./tmdb";

// Formate une durée en minutes -> "2 h 08" ou "47 min"
function formatRuntime(min) {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

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

export default function MovieDetail({ movie, onClose, onRated }) {
  const [note, setNote] = useState(movie.note || 0);
  const [comment, setComment] = useState(movie.comment || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false); // reste vrai tant qu'on ne modifie rien

  const [details, setDetails] = useState(null);
  const [providers, setProviders] = useState(null);
  const [cast, setCast] = useState([]);
  const [trailer, setTrailer] = useState(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let active = true;

    getMovie(movie.id)
      .then((d) => { if (active) setDetails(d); })
      .catch(() => {});
    getWatchProviders("movie", movie.id)
      .then((p) => { if (active) setProviders(p); })
      .catch(() => {});
    getMovieCredits(movie.id)
      .then((c) => { if (active) setCast((c.cast || []).slice(0, 12)); })
      .catch(() => {});

    // Bande-annonce : on tente en français, sinon en anglais
    (async () => {
      try {
        const fr = await getMovieVideos(movie.id);
        let t = pickTrailer(fr.results || []);
        if (!t) {
          const en = await getMovieVideos(movie.id, "en-US");
          t = pickTrailer(en.results || []);
        }
        if (active) setTrailer(t);
      } catch {
        // ignore
      }
    })();

    return () => { active = false; };
  }, [movie.id]);

  const changeNote = (n) => { setNote(n); setSaved(false); };
  const changeComment = (c) => { setComment(c); setSaved(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setMovieRating(movie.id, note, comment, {
        id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        release_date: movie.release_date,
        runtime: movie.runtime,
      });
      setSaved(true);
      if (onRated) onRated(movie.id, { note, comment });
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await removeMovieRating(movie.id);
      setNote(0);
      setComment("");
      setSaved(false);
      if (onRated) onRated(movie.id, null);
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const year =
    (details && details.release_date) || movie.release_date
      ? ((details && details.release_date) || movie.release_date).slice(0, 4)
      : null;
  const runtime = formatRuntime(details && details.runtime);
  const genres = details && details.genres ? details.genres.map((g) => g.name) : [];
  const overview = (details && details.overview) || "";
  const flatrate = providers && providers.flatrate ? providers.flatrate : [];
  const hasRating = note > 0 || comment.trim().length > 0;

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        <div className="movie-detail-head">
          {posterUrl(movie.poster_path) && (
            <img src={posterUrl(movie.poster_path)} alt={movie.title} />
          )}
          <div>
            <h2 className="ep-detail-title">{movie.title}</h2>
            <p className="muted small">
              {year || "—"}
              {runtime && <> · {runtime}</>}
            </p>
            {genres.length > 0 && (
              <p className="muted small">{genres.join(" · ")}</p>
            )}
          </div>
        </div>

        <div className="ep-detail-body">
          {overview && <p className="overview">{overview}</p>}

          {trailer && (
            <div className="trailer-section">
              <h3 className="trailer-title">Bande-annonce</h3>
              <div className="trailer-media">
                {playing ? (
                  <iframe
                    src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0`}
                    title="Bande-annonce"
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
                      alt="Bande-annonce"
                    />
                    <div className="trailer-play"><span>▶</span></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {cast.length > 0 && (
            <div className="cast-section">
              <h3 className="cast-title">Casting</h3>
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

          <div className="rating-section">
            <div className="rating-label">Ma note</div>
            <div className="stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`star ${n <= note ? "star-filled" : ""}`}
                  onClick={() => changeNote(n === note ? 0 : n)}
                  aria-label={`${n} étoiles`}
                >
                  ★
                </button>
              ))}
            </div>

            <div className="rating-label">Mon commentaire</div>
            <textarea
              className="comment-box"
              placeholder="Vos impressions sur ce film…"
              value={comment}
              onChange={(e) => changeComment(e.target.value)}
              rows={3}
            />

            <div className="rating-actions">
              <button className="btn" onClick={handleSave} disabled={saving || saved}>
                {saved ? "✓ Enregistré" : "Enregistrer"}
              </button>
              {hasRating && (
                <button className="btn-small" onClick={handleRemove} disabled={saving}>
                  Supprimer la note
                </button>
              )}
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              Noter ce film le marque comme vu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

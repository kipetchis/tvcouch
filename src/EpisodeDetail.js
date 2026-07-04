import { useState } from "react";
import { setEpisodeRating, removeEpisodeRating } from "./store";

const IMG_BASE = "https://image.tmdb.org/t/p";

export default function EpisodeDetail({ showId, seasonNumber, episode, initialRating, onClose, onRated }) {
  const [note, setNote] = useState(initialRating?.note || 0);
  const [comment, setComment] = useState(initialRating?.comment || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const stillPath = episode.still_path
    ? `${IMG_BASE}/w300${episode.still_path}`
    : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await setEpisodeRating(showId, seasonNumber, episode.episode_number, note, comment);
      setSaved(true);
      if (onRated) onRated(seasonNumber, episode.episode_number, { note, comment });
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await removeEpisodeRating(showId, seasonNumber, episode.episode_number);
      setNote(0);
      setComment("");
      if (onRated) onRated(seasonNumber, episode.episode_number, null);
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        {stillPath && (
          <img className="ep-detail-still" src={stillPath} alt={episode.name} />
        )}

        <div className="ep-detail-body">
          <div className="ep-row-ep">
            S{String(seasonNumber).padStart(2, "0")} | E
            {String(episode.episode_number).padStart(2, "0")}
          </div>
          <h2 className="ep-detail-title">{episode.name}</h2>
          {episode.air_date && (
            <p className="muted small">Diffusé le {episode.air_date}</p>
          )}
          {episode.overview && (
            <p className="ep-detail-overview">{episode.overview}</p>
          )}

          <div className="rating-section">
            <div className="rating-label">Ma note</div>
            <div className="stars">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`star ${n <= note ? "star-filled" : ""}`}
                  onClick={() => setNote(n === note ? 0 : n)}
                  aria-label={`${n} étoiles`}
                >
                  ★
                </button>
              ))}
            </div>

            <div className="rating-label">Mon commentaire</div>
            <textarea
              className="comment-box"
              placeholder="Vos impressions sur cet épisode…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />

            <div className="rating-actions">
              <button className="btn" onClick={handleSave} disabled={saving}>
                {saved ? "✓ Enregistré" : "Enregistrer"}
              </button>
              {(initialRating?.note || initialRating?.comment) && (
                <button className="btn-small" onClick={handleRemove} disabled={saving}>
                  Supprimer la note
                </button>
              )}
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              Noter cet épisode le marque comme vu.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
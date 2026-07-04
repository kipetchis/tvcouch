import { useState } from "react";
import { setMovieRating, removeMovieRating } from "./movieStore";
import { posterUrl } from "./tmdb";

export default function MovieDetail({ movie, onClose, onRated }) {
  const [note, setNote] = useState(movie.note || 0);
  const [comment, setComment] = useState(movie.comment || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await setMovieRating(movie.id, note, comment);
      setSaved(true);
      if (onRated) onRated(movie.id, { note, comment });
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
      await removeMovieRating(movie.id);
      setNote(0);
      setComment("");
      if (onRated) onRated(movie.id, null);
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

        <div className="movie-detail-head">
          {posterUrl(movie.poster_path) && (
            <img src={posterUrl(movie.poster_path)} alt={movie.title} />
          )}
          <div>
            <h2 className="ep-detail-title">{movie.title}</h2>
            {movie.release_date && (
              <p className="muted small">{movie.release_date.slice(0, 4)}</p>
            )}
          </div>
        </div>

        <div className="ep-detail-body">
          <div className="rating-section" style={{ borderTop: "none", paddingTop: 0 }}>
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
              placeholder="Vos impressions sur ce film…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />

            <div className="rating-actions">
              <button className="btn" onClick={handleSave} disabled={saving}>
                {saved ? "✓ Enregistré" : "Enregistrer"}
              </button>
              {(movie.note || movie.comment) && (
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
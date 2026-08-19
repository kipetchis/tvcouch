import { useState, useEffect } from "react";
import { setVolumeRating, removeVolumeRating, getVolumeDoc } from "./mangaStore";
import { coverUrl } from "./openlibrary";
import { t } from "./i18n";

// Formate une date stockée "YYYY-MM-DD" -> "JJ/MM/AAAA"
function formatReadDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export default function VolumeDetail({ volume, onClose, onRated, onRemove }) {
  const [note, setNote] = useState(volume.note || 0);
  const [comment, setComment] = useState(volume.comment || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [readDate, setReadDate] = useState(volume.readDate || null);

  useEffect(() => {
    let active = true;
    getVolumeDoc(volume.id)
      .then((data) => {
        if (!active || !data) return;
        if (data.note) setNote(data.note);
        if (data.comment) setComment(data.comment);
        if (data.readDate) setReadDate(data.readDate);
        if (data.note || data.comment) setSaved(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [volume.id]);

  const changeNote = (n) => { setNote(n); setSaved(false); };
  const changeComment = (c) => { setComment(c); setSaved(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setVolumeRating(volume.id, note, comment, volume);
      setSaved(true);
      if (!readDate) setReadDate(new Date().toISOString().slice(0, 10));
      if (onRated) onRated(volume.id, { note, comment });
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveRating = async () => {
    setSaving(true);
    try {
      await removeVolumeRating(volume.id);
      setNote(0);
      setComment("");
      setSaved(false);
      if (onRated) onRated(volume.id, null);
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const hasRating = note > 0 || comment.trim().length > 0;
  const cover = coverUrl(volume.cover_url || volume.cover_i, "L");

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        <div className="movie-detail-head">
          {cover && <img src={cover} alt={volume.title} />}
          <div>
            <h2 className="ep-detail-title">{volume.title}</h2>
            {volume.seriesName && (
              <p className="muted small">
                {volume.seriesName}{volume.seriesPosition ? ` · T${volume.seriesPosition}` : ""}
              </p>
            )}
            {readDate && (
              <p className="watched-badge">✓ {t("book.readOn")} {formatReadDate(readDate)}</p>
            )}
          </div>
        </div>

        <div className="ep-detail-body">
          <div className="rating-section">
            <div className="rating-label">{t("detail.myRating")}</div>
            <div className="rating-scale">
              {[1, 2, 3, 4, 5].map((n, i) => (
                <button
                  key={n}
                  className={`rating-choice ${n === note ? "rating-choice-selected" : ""}`}
                  onClick={() => changeNote(n === note ? 0 : n)}
                >
                  <span className="rating-choice-star">★</span>
                  <span className="rating-choice-label">
                    {t(["rating.bad", "rating.meh", "rating.good", "rating.great", "rating.wow"][i])}
                  </span>
                </button>
              ))}
            </div>

            <div className="rating-label">{t("detail.myComment")}</div>
            <textarea
              className="comment-box"
              placeholder={t("detail.commentPlaceholder")}
              value={comment}
              onChange={(e) => changeComment(e.target.value)}
              rows={3}
            />

            <div className="rating-actions">
              <button className="btn" onClick={handleSave} disabled={saving || saved}>
                {saved ? t("detail.saved") : t("detail.save")}
              </button>
              {hasRating && (
                <button className="btn-small" onClick={handleRemoveRating} disabled={saving}>
                  {t("detail.deleteRating")}
                </button>
              )}
              {onRemove && (
                <button className="btn-small" onClick={onRemove} disabled={saving}>
                  🗑 {t("manga.removeVolume")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

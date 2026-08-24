import { useState, useEffect } from "react";
import { setGameRating, removeGameRating, getGameDoc, setGameReplayCount } from "./gameStore";
import { getGame, studioOf } from "./rawg";
import { t } from "./i18n";

// Formate une date stockée "YYYY-MM-DD" -> "JJ/MM/AAAA"
function formatDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

export default function GameDetail({ game, onClose, onRated }) {
  const [note, setNote] = useState(game.note || 0);
  const [comment, setComment] = useState(game.comment || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [doneDate, setDoneDate] = useState(game.doneDate || null);
  const [replayCount, setReplayCount] = useState(game.replayCount || 0);

  // Détails RAWG (studio + description) chargés à l'ouverture. On part des
  // infos déjà connues (jaquette, genres) pour un affichage immédiat.
  const [details, setDetails] = useState(null);

  useEffect(() => {
    let active = true;
    getGame(game.id)
      .then((d) => { if (active) setDetails(d); })
      .catch(() => {});
    return () => { active = false; };
  }, [game.id]);

  useEffect(() => {
    let active = true;
    getGameDoc(game.id)
      .then((data) => {
        if (!active || !data) return;
        if (data.note) setNote(data.note);
        if (data.comment) setComment(data.comment);
        if (data.doneDate) setDoneDate(data.doneDate);
        if (data.replayCount) setReplayCount(data.replayCount);
        if (data.note || data.comment) setSaved(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [game.id]);

  const changeNote = (n) => { setNote(n); setSaved(false); };
  const changeComment = (c) => { setComment(c); setSaved(false); };

  const studio = studioOf(details) || game.studio || null;
  const genres =
    details && details.genres ? details.genres.map((g) => g.name) : (game.genres || []);
  const description = (details && details.description_raw) || "";
  const year =
    game.release_year ||
    ((details && details.released) ? Number(String(details.released).slice(0, 4)) : null);
  const cover = game.cover_url || (details && details.background_image) || null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await setGameRating(game.id, note, comment, {
        id: game.id,
        name: game.name,
        cover_url: cover,
        release_year: year,
        released: (details && details.released) || game.released,
        studio,
        genres,
      });
      setSaved(true);
      if (!doneDate) setDoneDate(new Date().toISOString().slice(0, 10));
      if (onRated) onRated(game.id, { note, comment });
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await removeGameRating(game.id);
      setNote(0);
      setComment("");
      setSaved(false);
      if (onRated) onRated(game.id, null);
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const addReplay = async () => {
    const next = replayCount + 1;
    setReplayCount(next);
    try { await setGameReplayCount(game.id, next); } catch {}
  };
  const removeReplay = async () => {
    const next = Math.max(0, replayCount - 1);
    setReplayCount(next);
    try { await setGameReplayCount(game.id, next); } catch {}
  };

  const hasRating = note > 0 || comment.trim().length > 0;

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        <div className="movie-detail-head game-detail-head">
          {cover && <img className="game-detail-cover" src={cover} alt={game.name} />}
          <div>
            <h2 className="ep-detail-title">{game.name}</h2>
            <p className="muted small">{year || "—"}</p>
            {studio && <p className="muted small">🏢 {studio}</p>}
            {genres.length > 0 && <p className="muted small">{genres.join(" · ")}</p>}
            {doneDate && (
              <p className="watched-badge">✓ {t("game.doneOn")} {formatDate(doneDate)}</p>
            )}
            {doneDate && (
              <div className="reread-row">
                <span className="reread-label">
                  {replayCount > 0
                    ? `${t("replay.done")} ×${replayCount + 1}`
                    : t("replay.doneOnce")}
                </span>
                <div className="reread-buttons">
                  {replayCount > 0 && (
                    <button className="btn-small" onClick={removeReplay}>−</button>
                  )}
                  <button className="btn-small" onClick={addReplay}>
                    +1 {t("replay.again")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="ep-detail-body">
          {description && <p className="overview">{description}</p>}

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
                <button className="btn-small" onClick={handleRemove} disabled={saving}>
                  {t("detail.deleteRating")}
                </button>
              )}
            </div>
            {!doneDate && (
              <p className="muted small" style={{ marginTop: 8 }}>
                {t("game.rateMarksDone")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

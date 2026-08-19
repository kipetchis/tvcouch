import { useState, useEffect } from "react";
import { setBookRating, removeBookRating, getBookDoc } from "./bookStore";
import { getWork, getAuthorWorks, coverUrl } from "./openlibrary";
import { t } from "./i18n";

// Formate une date stockée "YYYY-MM-DD" -> "JJ/MM/AAAA"
function formatReadDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

// Extrait un texte lisible depuis "description", qui peut être une simple
// chaîne ou un objet { value, type } selon les œuvres Open Library.
function extractDescription(description) {
  if (!description) return "";
  if (typeof description === "string") return description;
  if (typeof description === "object" && description.value) return description.value;
  return "";
}

export default function BookDetail({ book, onClose, onRated, onOpenBook }) {
  const [note, setNote] = useState(book.note || 0);
  const [comment, setComment] = useState(book.comment || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [readDate, setReadDate] = useState(book.readDate || null);

  const [details, setDetails] = useState(null);
  const [recommendations, setRecommendations] = useState([]);

  const workId = (book.key || book.id || "").replace(/^\/?works\//, "");
  const authorName = (book.author_name && book.author_name[0]) || book.author || null;
  const authorKey = (book.author_key && book.author_key[0]) || book.authorKey || null;
  const isOL = /^OL\d+W$/i.test(workId);

  useEffect(() => {
    let active = true;

    // getWork/getAuthorWorks n'existent que côté Open Library. Pour un livre
    // Google Books (id "gb:…"), on se sert de la description et des sujets
    // déjà fournis à l'ajout — pas de recommandations "même auteur" pour eux.
    if (isOL) {
      getWork(workId)
        .then((d) => { if (active) setDetails(d); })
        .catch(() => {});

      if (authorKey) {
        getAuthorWorks(authorKey)
          .then((res) => {
            if (!active) return;
            const works = (res.entries || [])
              .filter((w) => (w.key || "").replace(/^\/?works\//, "") !== workId)
              .filter((w) => w.covers && w.covers.length > 0 && w.covers[0] > 0)
              .slice(0, 10);
            setRecommendations(works);
          })
          .catch(() => {});
      }
    } else if (book.description) {
      // Livre Google Books : la description est déjà dans l'objet reçu.
      setDetails({ description: book.description, subjects: book.subjects || [] });
    }

    return () => { active = false; };
  }, [workId, authorKey, isOL, book.description, book.subjects]);

  // Relit systématiquement les vraies valeurs enregistrées dans Firestore
  useEffect(() => {
    let active = true;
    getBookDoc(workId)
      .then((data) => {
        if (!active || !data) return;
        if (data.note) setNote(data.note);
        if (data.comment) setComment(data.comment);
        if (data.readDate) setReadDate(data.readDate);
        if (data.note || data.comment) setSaved(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [workId]);

  const changeNote = (n) => { setNote(n); setSaved(false); };
  const changeComment = (c) => { setComment(c); setSaved(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const subjects = details ? (details.subjects || []).slice(0, 20) : undefined;
      await setBookRating(workId, note, comment, {
        id: workId,
        title: book.title,
        author: authorName,
        authorKey,
        cover_i: book.cover_i,
        cover_url: book.cover_url,
        first_publish_year: book.first_publish_year,
        subjects,
      });
      setSaved(true);
      if (!readDate) setReadDate(new Date().toISOString().slice(0, 10));
      if (onRated) onRated(workId, { note, comment });
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await removeBookRating(workId);
      setNote(0);
      setComment("");
      setSaved(false);
      // readDate n'est pas effacée : le livre reste marqué comme lu en base
      if (onRated) onRated(workId, null);
    } catch (e) {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const description = extractDescription(details && details.description);
  const hasRating = note > 0 || comment.trim().length > 0;
  const cover = coverUrl(book.cover_url || book.cover_i, "L");

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        <div className="movie-detail-head">
          {cover && <img src={cover} alt={book.title} />}
          <div>
            <h2 className="ep-detail-title">{book.title}</h2>
            {authorName && <p className="muted small">{t("book.by")} {authorName}</p>}
            {book.first_publish_year && (
              <p className="muted small">{book.first_publish_year}</p>
            )}
            {readDate && (
              <p className="watched-badge">
                ✓ {t("book.readOn")} {formatReadDate(readDate)}
              </p>
            )}
          </div>
        </div>

        <div className="ep-detail-body">
          {description && <p className="overview">{description}</p>}

          {recommendations.length > 0 && (
            <div className="cast-section">
              <h3 className="cast-title">{t("book.recommendations")}</h3>
              <div className="cast-list">
                {recommendations.map((w) => {
                  const recCover = coverUrl(w.covers && w.covers[0], "M");
                  const recId = (w.key || "").replace(/^\/?works\//, "");
                  return (
                    <div
                      key={recId}
                      className="cast-member"
                      onClick={() =>
                        onOpenBook &&
                        onOpenBook({
                          key: recId,
                          title: w.title,
                          author_name: authorName ? [authorName] : [],
                          author_key: authorKey ? [authorKey] : [],
                          cover_i: w.covers && w.covers[0],
                          first_publish_year: w.first_publish_date
                            ? Number(String(w.first_publish_date).slice(0, 4))
                            : null,
                        })
                      }
                    >
                      {recCover ? (
                        <img className="cast-photo" style={{ borderRadius: 6 }} src={recCover} alt={w.title} />
                      ) : (
                        <div className="cast-photo-fallback" style={{ borderRadius: 6 }}>
                          {w.title ? w.title.charAt(0) : "?"}
                        </div>
                      )}
                      <div className="cast-name">{w.title}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
            {!readDate && (
              <p className="muted small" style={{ marginTop: 8 }}>
                {t("book.rateMarksRead")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

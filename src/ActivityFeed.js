import { useState, useEffect } from "react";
import { getFriendsActivity } from "./social";
import { posterUrl } from "./tmdb";
import { coverUrl } from "./openlibrary";
import { t, getLocale } from "./i18n";
import { useBackClose } from "./backNav";

// Fil d'activité des amis : liste fusionnée des dernières actions de tes amis
// (épisodes vus, films vus, romans/tomes lus, jeux terminés), triée par date.
// Lecture seule ; les données viennent du résumé friendData/{uid} de chaque ami.

// Résout la jaquette selon le type (la référence stockée est brute).
function resolveCover(type, cover) {
  if (!cover) return null;
  if (type === "show" || type === "movie") return posterUrl(cover);
  if (type === "book" || type === "volume") return coverUrl(cover);
  return cover; // game : URL directe
}

// Verbe d'action selon le type.
function verbFor(type) {
  const map = {
    show: "feed.verbShow",
    movie: "feed.verbMovie",
    book: "feed.verbBook",
    volume: "feed.verbVolume",
    game: "feed.verbGame",
  };
  return t(map[type] || "feed.verbShow");
}

// Libellé de date : aujourd'hui / hier / date locale.
function dateLabel(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diffDays <= 0) return t("feed.today");
  if (diffDays === 1) return t("feed.yesterday");
  return d.toLocaleDateString(getLocale());
}

export default function ActivityFeed({ onClose }) {
  const [items, setItems] = useState(undefined); // undefined = chargement
  useBackClose(true, onClose);

  useEffect(() => {
    let active = true;
    getFriendsActivity()
      .then((list) => { if (active) setItems(list); })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, []);

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        <div className="ep-detail-body">
          <h2 className="ep-detail-title">📰 {t("feed.title")}</h2>

          {items === undefined && <p className="center">{t("common.loading")}</p>}

          {items && items.length === 0 && (
            <p className="muted small" style={{ marginTop: 16 }}>{t("feed.empty")}</p>
          )}

          {items && items.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {items.map((a, i) => {
                const c = resolveCover(a.type, a.cover);
                return (
                  <div
                    key={`${a.friendUid}:${a.type}:${a.id}:${i}`}
                    style={{
                      display: "flex", gap: 10, alignItems: "center",
                      padding: "8px 0", borderBottom: "1px solid var(--border, rgba(128,128,128,0.15))",
                    }}
                  >
                    {c ? (
                      <img src={c} alt={a.title} style={{ width: 40, borderRadius: 4, flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 40, height: 56, borderRadius: 4, flexShrink: 0, background: "rgba(128,128,128,0.15)" }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="small">
                        <strong>{a.friendName}</strong> {verbFor(a.type)} <strong>{a.title}</strong>
                        {a.note > 0 && <span className="ep-rating-badge"> ★ {a.note}</span>}
                      </div>
                      <div className="muted small">{dateLabel(a.date)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

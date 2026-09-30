import { useState, useEffect } from "react";
import { getFriendData, sendRecommendation } from "./social";
import { getAllShows } from "./store";
import { getAllMovies } from "./movieStore";
import { getAllBooks } from "./bookStore";
import { getAllVolumes } from "./mangaStore";
import { getAllGames } from "./gameStore";
import { posterUrl } from "./tmdb";
import { coverUrl } from "./openlibrary";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

// Consultation du profil public d'un ami : ses listes (séries, films, livres,
// mangas, jeux) et ses compteurs, lus depuis le résumé friendData/{uid}.
// Deux modes : "Son profil" (listes de l'ami) et "Comparer" (en commun /
// chez lui seulement / chez toi seulement). Lecture seule.
//
// Dans le bloc "Toi seulement" de la comparaison, chaque œuvre porte un bouton
// "Recommander" qui envoie une recommandation à cet ami (étape 4b).

// Config par catégorie : comment lire la jaquette / le titre / la clé d'un
// item, et comment extraire MES items de cette catégorie. Les objets de
// l'ami (résumé) et les miens partagent les mêmes champs, donc les mêmes
// fonctions marchent pour les deux.
const CATEGORIES = {
  shows: {
    cover: (s) => posterUrl(s.poster_path),
    title: (s) => s.name || s.title || "",
    mine: (mine) => mine.shows || [],
    friend: (d) => d.shows || [],
  },
  movies: {
    cover: (m) => posterUrl(m.poster_path),
    title: (m) => m.title || "",
    mine: (mine) => (mine.movies || []).filter((m) => m.status === "watched"),
    friend: (d) => d.movies || [],
  },
  books: {
    cover: (b) => coverUrl(b.cover_url || b.cover_i),
    title: (b) => b.title || "",
    mine: (mine) => (mine.books || []).filter((b) => b.status === "read"),
    friend: (d) => d.books || [],
  },
  volumes: {
    cover: (v) => coverUrl(v.cover_url || v.cover_i),
    title: (v) => (v.seriesName ? `${v.seriesName}${v.seriesPosition ? ` T${v.seriesPosition}` : ""}` : v.title || ""),
    mine: (mine) => (mine.volumes || []).filter((v) => v.status === "read"),
    friend: (d) => d.volumes || [],
  },
  games: {
    cover: (g) => g.cover_url || null,
    title: (g) => g.name || "",
    mine: (mine) => (mine.games || []).filter((g) => g.status === "done"),
    friend: (d) => d.games || [],
  },
};

// Grille d'items. Si `onRecommend` est fourni, chaque carte affiche un petit
// bouton "Recommander" (ou "Envoyé ✓" si déjà recommandé dans cette session).
function ItemGrid({ items, cover, title, onRecommend, sentIds, category }) {
  if (!items || items.length === 0) {
    return <p className="muted small" style={{ textAlign: "center", marginTop: 12 }}>{t("friend.emptyList")}</p>;
  }
  return (
    <div className="grid">
      {items.map((it) => {
        const c = cover(it);
        const key = `${category}:${it.id}`;
        const already = sentIds && sentIds.has(key);
        return (
          <div key={it.id} className="card">
            {c ? <img src={c} alt={title(it)} /> : <div className="no-poster">{title(it)}</div>}
            <div className="card-title">
              {title(it)}
              {it.note > 0 && <span className="ep-rating-badge"> ★ {it.note}</span>}
            </div>
            {onRecommend && (
              already ? (
                <span className="muted small" style={{ display: "block", textAlign: "center", marginTop: 4 }}>
                  {t("reco.sent")}
                </span>
              ) : (
                <button
                  className="btn-small"
                  style={{ width: "100%", marginTop: 4 }}
                  onClick={() => onRecommend(it)}
                >
                  ✉️ {t("reco.button")}
                </button>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function FriendProfile({ uid, name, onClose }) {
  const [data, setData] = useState(undefined); // undefined = chargement, null = introuvable
  const [tab, setTab] = useState("shows");
  const [mode, setMode] = useState("profile"); // profile | compare

  // Mes propres listes, chargées paresseusement (seulement à la 1re
  // comparaison) pour ne pas relire tout Firestore si on ne compare pas.
  const [mine, setMine] = useState(null);
  const [loadingMine, setLoadingMine] = useState(false);

  // Recommandation en cours de composition (null = pas de formulaire ouvert).
  const [recoTarget, setRecoTarget] = useState(null); // { id, title, cover, category }
  const [recoMsg, setRecoMsg] = useState("");
  const [recoSending, setRecoSending] = useState(false);
  const [recoError, setRecoError] = useState(null);
  const [sentIds, setSentIds] = useState(new Set()); // clés "category:id" déjà recommandées

  useBackClose(true, onClose);
  useBackClose(!!recoTarget, () => setRecoTarget(null));

  useEffect(() => {
    let active = true;
    getFriendData(uid)
      .then((d) => { if (active) setData(d); })
      .catch(() => { if (active) setData(null); });
    return () => { active = false; };
  }, [uid]);

  // Charge mes listes la première fois qu'on passe en mode comparaison.
  useEffect(() => {
    // Ne dépend PAS de loadingMine (sinon le setLoadingMine(true) relance
    // l'effet, son nettoyage passe active=false, et le résultat du chargement
    // est ignoré → chargement infini).
    if (mode !== "compare" || mine) return;
    let active = true;
    setLoadingMine(true);
    Promise.all([getAllShows(), getAllMovies(), getAllBooks(), getAllVolumes(), getAllGames()])
      .then(([shows, movies, books, volumes, games]) => {
        if (!active) return;
        setMine({ shows, movies, books, volumes, games });
      })
      .catch(() => {})
      .finally(() => { if (active) setLoadingMine(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, mine]);

  const displayName = (data && data.displayName) || name || "";

  // Ouvre le formulaire de reco pour un de MES items (catégorie = onglet courant).
  const openReco = (it) => {
    const cat = CATEGORIES[tab];
    setRecoTarget({
      id: String(it.id),
      title: cat.title(it),
      cover: cat.cover(it),
      category: tab,
    });
    setRecoMsg("");
    setRecoError(null);
  };

  const doSendReco = async () => {
    if (!recoTarget || recoSending) return;
    setRecoSending(true);
    setRecoError(null);
    const res = await sendRecommendation(uid, displayName, recoTarget.category, recoTarget, recoMsg);
    setRecoSending(false);
    if (res.ok) {
      setSentIds((prev) => {
        const next = new Set(prev);
        next.add(`${recoTarget.category}:${recoTarget.id}`);
        return next;
      });
      setRecoTarget(null);
    } else {
      setRecoError(t("reco.error"));
    }
  };

  const catTabs = (
    <div className="movie-tabs" style={{ marginTop: 12, flexWrap: "wrap" }}>
      {[
        ["shows", `📺 ${t("friend.tabShows")}`],
        ["movies", `🎬 ${t("friend.tabMovies")}`],
        ["books", `📖 ${t("friend.tabBooks")}`],
        ["volumes", `📚 ${t("friend.tabManga")}`],
        ["games", `🎮 ${t("friend.tabGames")}`],
      ].map(([key, label]) => (
        <button
          key={key}
          className={tab === key ? "movie-tab active" : "movie-tab"}
          onClick={() => setTab(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // Calcul des trois ensembles pour la catégorie courante (mode comparaison).
  const computeCompare = () => {
    const cat = CATEGORIES[tab];
    const myItems = cat.mine(mine || {});
    const friendItems = cat.friend(data || {});
    const myIds = new Set(myItems.map((it) => String(it.id)));
    const friendIds = new Set(friendItems.map((it) => String(it.id)));
    const common = myItems.filter((it) => friendIds.has(String(it.id)));
    const youOnly = myItems.filter((it) => !friendIds.has(String(it.id)));
    const friendOnly = friendItems.filter((it) => !myIds.has(String(it.id)));
    return { cat, common, youOnly, friendOnly };
  };

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        <div className="ep-detail-body">
          <h2 className="ep-detail-title">👤 {displayName}</h2>

          {data === undefined && <p className="center">{t("common.loading")}</p>}

          {data === null && (
            <p className="muted small" style={{ marginTop: 16 }}>{t("friend.noData")}</p>
          )}

          {data && (
            <>
              {/* Bascule Profil / Comparer */}
              <div className="movie-tabs" style={{ marginTop: 12 }}>
                <button
                  className={mode === "profile" ? "movie-tab active" : "movie-tab"}
                  onClick={() => setMode("profile")}
                >
                  {t("friend.modeProfile")}
                </button>
                <button
                  className={mode === "compare" ? "movie-tab active" : "movie-tab"}
                  onClick={() => setMode("compare")}
                >
                  {t("friend.modeCompare")}
                </button>
              </div>

              {mode === "profile" && (
                <>
                  <div className="stats-grid" style={{ marginTop: 12 }}>
                    <div className="stat-card"><div className="stat-icon">📺</div><div className="stat-value">{data.stats.showsFollowed}</div><div className="stat-label">{t("friend.shows")}</div></div>
                    <div className="stat-card"><div className="stat-icon">🎬</div><div className="stat-value">{data.stats.moviesWatched}</div><div className="stat-label">{t("friend.movies")}</div></div>
                    <div className="stat-card"><div className="stat-icon">📖</div><div className="stat-value">{data.stats.booksRead}</div><div className="stat-label">{t("friend.books")}</div></div>
                    <div className="stat-card"><div className="stat-icon">📗</div><div className="stat-value">{data.stats.volumesRead}</div><div className="stat-label">{t("friend.volumes")}</div></div>
                    <div className="stat-card"><div className="stat-icon">🎮</div><div className="stat-value">{data.stats.gamesDone}</div><div className="stat-label">{t("friend.games")}</div></div>
                    <div className="stat-card"><div className="stat-icon">📼</div><div className="stat-value">{data.stats.episodesWatched}</div><div className="stat-label">{t("friend.episodes")}</div></div>
                  </div>

                  {catTabs}

                  <div style={{ marginTop: 12 }}>
                    {(() => {
                      const cat = CATEGORIES[tab];
                      return <ItemGrid items={cat.friend(data)} cover={cat.cover} title={cat.title} category={tab} />;
                    })()}
                  </div>
                </>
              )}

              {mode === "compare" && (
                <>
                  {catTabs}

                  {(loadingMine || !mine) ? (
                    <p className="center" style={{ marginTop: 16 }}>{t("common.loading")}</p>
                  ) : (
                    (() => {
                      const { cat, common, youOnly, friendOnly } = computeCompare();
                      return (
                        <>
                          <h3 className="section-pill">🤝 {t("friend.common")} ({common.length})</h3>
                          <ItemGrid items={common} cover={cat.cover} title={cat.title} category={tab} />

                          <h3 className="section-pill">👤 {displayName} ({friendOnly.length})</h3>
                          <ItemGrid items={friendOnly} cover={cat.cover} title={cat.title} category={tab} />

                          <h3 className="section-pill">🫵 {t("friend.youOnly")} ({youOnly.length})</h3>
                          <ItemGrid
                            items={youOnly}
                            cover={cat.cover}
                            title={cat.title}
                            category={tab}
                            onRecommend={openReco}
                            sentIds={sentIds}
                          />
                        </>
                      );
                    })()
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Formulaire de recommandation */}
      {recoTarget && (
        <div className="ep-detail-overlay" onClick={() => setRecoTarget(null)}>
          <div className="ep-detail" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <button className="btn-small ep-detail-close" onClick={() => setRecoTarget(null)}>✕</button>
            <div className="ep-detail-body">
              <h2 className="ep-detail-title">✉️ {t("reco.recommendTo")} {displayName}</h2>

              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
                {recoTarget.cover && (
                  <img
                    src={recoTarget.cover}
                    alt={recoTarget.title}
                    style={{ width: 60, borderRadius: 6, flexShrink: 0 }}
                  />
                )}
                <strong>{recoTarget.title}</strong>
              </div>

              <textarea
                className="reco-message"
                placeholder={t("reco.messagePlaceholder")}
                value={recoMsg}
                onChange={(e) => setRecoMsg(e.target.value)}
                rows={3}
                maxLength={500}
                style={{ width: "100%", marginTop: 12, resize: "vertical" }}
              />

              {recoError && <p className="small" style={{ color: "var(--danger, #c0392b)" }}>{recoError}</p>}

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={doSendReco} disabled={recoSending} style={{ flex: 1 }}>
                  {recoSending ? t("reco.sending") : t("reco.send")}
                </button>
                <button className="btn-small" onClick={() => setRecoTarget(null)}>
                  {t("social.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

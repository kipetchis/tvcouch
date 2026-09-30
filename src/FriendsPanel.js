import { useState, useEffect } from "react";
import {
  findUserByUsername, sendFriendRequest, acceptFriendRequest,
  removeFriendship, getFriendships,
  getReceivedRecommendations, markRecommendationRead, dismissRecommendation,
} from "./social";
import FriendProfile from "./FriendProfile";
import ActivityFeed from "./ActivityFeed";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

// Libellé de catégorie pour l'affichage d'une reco ("une série", "un film"…).
function catLabel(cat) {
  const map = {
    shows: "reco.catShows",
    movies: "reco.catMovies",
    books: "reco.catBooks",
    volumes: "reco.catVolumes",
    games: "reco.catGames",
  };
  return t(map[cat] || "reco.catShows");
}

export default function FriendsPanel({ onClose }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState(undefined); // undefined = pas cherché, null = rien trouvé
  const [notice, setNotice] = useState(null);

  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [recos, setRecos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFriend, setOpenFriend] = useState(null); // ami dont on consulte le profil
  const [showFeed, setShowFeed] = useState(false);

  useBackClose(true, onClose);
  useBackClose(!!openFriend, () => setOpenFriend(null));
  useBackClose(showFeed, () => setShowFeed(false));

  const reload = async () => {
    const [{ friends, incoming, outgoing }, recs] = await Promise.all([
      getFriendships(),
      getReceivedRecommendations(),
    ]);
    setFriends(friends);
    setIncoming(incoming);
    setOutgoing(outgoing);
    setRecos(recs);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setFound(undefined);
    setNotice(null);
    const res = await findUserByUsername(query.trim());
    setFound(res);
    setSearching(false);
  };

  const relationWith = (uid) => {
    if (friends.some((x) => x.uid === uid)) return "friend";
    if (outgoing.some((x) => x.uid === uid)) return "outgoing";
    if (incoming.some((x) => x.uid === uid)) return "incoming";
    return null;
  };

  const doSend = async (target) => {
    const res = await sendFriendRequest(target.uid, target.displayName);
    if (res.ok) {
      setNotice(t("social.requestSent"));
      setFound(undefined);
      setQuery("");
      reload();
    } else {
      const map = {
        self: t("social.cantAddSelf"),
        "already-friends": t("social.alreadyFriends"),
        "already-pending": t("social.alreadyPending"),
      };
      setNotice(map[res.reason] || t("social.requestError"));
    }
  };

  const doAccept = async (uid) => { await acceptFriendRequest(uid); reload(); };
  const doRemove = async (uid) => { await removeFriendship(uid); reload(); };

  // Marque une reco comme lue (met à jour l'état local sans tout recharger).
  const doMarkReco = async (id) => {
    await markRecommendationRead(id);
    setRecos((prev) => prev.map((r) => (r.id === id ? { ...r, status: "read" } : r)));
  };
  // Supprime une reco reçue.
  const doDismissReco = async (id) => {
    await dismissRecommendation(id);
    setRecos((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        <div className="ep-detail-body">
          <h2 className="ep-detail-title">👥 {t("social.section")}</h2>

          {/* Accès au fil d'activité des amis */}
          {friends.length > 0 && (
            <button className="btn" style={{ marginTop: 8 }} onClick={() => setShowFeed(true)}>
              📰 {t("feed.open")}
            </button>
          )}

          {/* Recommandations reçues */}
          {recos.length > 0 && (
            <>
              <h3 className="section-pill">{t("reco.received")} ({recos.length})</h3>
              {recos.map((r) => {
                const it = r.item || {};
                const unread = r.status !== "read";
                return (
                  <div
                    key={r.id}
                    className="reco-card"
                    style={{
                      display: "flex", gap: 10, alignItems: "flex-start",
                      padding: 10, marginBottom: 8, borderRadius: 8,
                      background: unread ? "var(--accent-bg, rgba(120,120,255,0.08))" : "var(--card-bg, rgba(255,255,255,0.03))",
                    }}
                  >
                    {it.cover && (
                      <img src={it.cover} alt={it.title} style={{ width: 48, borderRadius: 4, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="small">
                        <strong>{r.fromName}</strong> {t("reco.recommendsYou")} {catLabel(r.category)}
                        {unread && <span className="ep-rating-badge" style={{ marginLeft: 6 }}>{t("reco.newBadge")}</span>}
                      </div>
                      <div style={{ fontWeight: 600, marginTop: 2 }}>{it.title}</div>
                      {r.message && (
                        <div className="muted small" style={{ marginTop: 4, fontStyle: "italic" }}>« {r.message} »</div>
                      )}
                      <div className="friend-actions" style={{ marginTop: 6 }}>
                        {unread && (
                          <button className="btn-small" onClick={() => doMarkReco(r.id)}>{t("reco.markRead")}</button>
                        )}
                        <button className="btn-small" onClick={() => doDismissReco(r.id)}>{t("reco.dismiss")}</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Recherche par pseudo */}
          <form className="search" onSubmit={handleSearch} style={{ marginTop: 12 }}>
            <input
              type="text"
              placeholder={t("social.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn" type="submit">{t("common.search")}</button>
          </form>

          {searching && <p className="muted small">{t("social.checking")}</p>}
          {notice && <p className="small" style={{ color: "var(--accent-fg)" }}>{notice}</p>}

          {found === null && (
            <p className="muted small">{t("social.noUserFound")}</p>
          )}
          {found && (
            <div className="friend-row">
              <span className="friend-name">{found.displayName}</span>
              {(() => {
                const rel = relationWith(found.uid);
                if (rel === "friend") return <span className="muted small">✓ {t("social.friendLabel")}</span>;
                if (rel === "outgoing") return <span className="muted small">{t("social.pendingLabel")}</span>;
                if (rel === "incoming") return (
                  <button className="btn-small" onClick={() => doAccept(found.uid)}>{t("social.accept")}</button>
                );
                return <button className="btn-small" onClick={() => doSend(found)}>{t("social.addFriend")}</button>;
              })()}
            </div>
          )}

          {loading ? (
            <p className="center">{t("common.loading")}</p>
          ) : (
            <>
              {/* Demandes reçues */}
              {incoming.length > 0 && (
                <>
                  <h3 className="section-pill">{t("social.incoming")}</h3>
                  {incoming.map((r) => (
                    <div key={r.uid} className="friend-row">
                      <span className="friend-name">{r.name}</span>
                      <div className="friend-actions">
                        <button className="btn-small" onClick={() => doAccept(r.uid)}>{t("social.accept")}</button>
                        <button className="btn-small" onClick={() => doRemove(r.uid)}>{t("social.decline")}</button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Demandes envoyées */}
              {outgoing.length > 0 && (
                <>
                  <h3 className="section-pill">{t("social.outgoing")}</h3>
                  {outgoing.map((r) => (
                    <div key={r.uid} className="friend-row">
                      <span className="friend-name">{r.name}</span>
                      <button className="btn-small" onClick={() => doRemove(r.uid)}>{t("social.cancel")}</button>
                    </div>
                  ))}
                </>
              )}

              {/* Amis */}
              <h3 className="section-pill">{t("social.myFriends")} ({friends.length})</h3>
              {friends.length === 0 ? (
                <p className="muted small">{t("social.noFriends")}</p>
              ) : (
                friends.map((f) => (
                  <div key={f.uid} className="friend-row">
                    <button
                      className="friend-name friend-name-btn"
                      onClick={() => setOpenFriend(f)}
                    >
                      {f.name}
                    </button>
                    <button className="btn-small" onClick={() => doRemove(f.uid)}>{t("social.removeFriend")}</button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      {openFriend && (
        <FriendProfile
          uid={openFriend.uid}
          name={openFriend.name}
          onClose={() => setOpenFriend(null)}
        />
      )}

      {showFeed && <ActivityFeed onClose={() => setShowFeed(false)} />}
    </div>
  );
}

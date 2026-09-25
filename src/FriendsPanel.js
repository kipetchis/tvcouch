import { useState, useEffect } from "react";
import {
  findUserByUsername, sendFriendRequest, acceptFriendRequest,
  removeFriendship, getFriendships,
} from "./social";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

export default function FriendsPanel({ onClose }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState(undefined); // undefined = pas cherché, null = rien trouvé
  const [notice, setNotice] = useState(null);

  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);

  useBackClose(true, onClose);

  const reload = async () => {
    const { friends, incoming, outgoing } = await getFriendships();
    setFriends(friends);
    setIncoming(incoming);
    setOutgoing(outgoing);
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

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>

        <div className="ep-detail-body">
          <h2 className="ep-detail-title">👥 {t("social.section")}</h2>

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
                    <span className="friend-name">{f.name}</span>
                    <button className="btn-small" onClick={() => doRemove(f.uid)}>{t("social.removeFriend")}</button>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

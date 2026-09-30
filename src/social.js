// Espace communautaire — étape 1 : gestion du pseudo unique.
//
// Deux collections Firestore :
//   usernames/{pseudoMinuscule}  -> { uid, displayName }   (annuaire public)
//   profiles/{uid}               -> { username, displayName, createdAt }
//
// L'unicité du pseudo est garantie de façon ATOMIQUE en utilisant le pseudo
// (en minuscules) comme identifiant du document dans "usernames" : une
// transaction qui tente de créer ce document échoue si quelqu'un l'a déjà
// pris entre-temps. C'est la technique standard et sûre sur Firestore.
import { db, auth } from "./firebase";
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp,
  collection, query, where, getDocs,
} from "firebase/firestore";

// Règles de validation d'un pseudo : 3 à 20 caractères, lettres/chiffres/
// tiret/underscore. La casse est conservée pour l'affichage mais ignorée
// pour l'unicité (on réserve toujours la version en minuscules).
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

export function isValidUsername(name) {
  return USERNAME_RE.test(name || "");
}

// Forme normalisée (clé d'annuaire) : minuscules.
export function normalizeUsername(name) {
  return (name || "").toLowerCase();
}

function usernameRef(nameLower) {
  return doc(db, "usernames", nameLower);
}
function profileRef(uid) {
  return doc(db, "profiles", uid);
}

// Le pseudo est-il libre ? (true = disponible)
export async function isUsernameAvailable(name) {
  const lower = normalizeUsername(name);
  if (!isValidUsername(lower)) return false;
  try {
    const snap = await getDoc(usernameRef(lower));
    return !snap.exists();
  } catch {
    return false;
  }
}

// Profil public de l'utilisateur courant (ou null s'il n'a pas encore de pseudo)
export async function getMyProfile() {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const snap = await getDoc(profileRef(user.uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

// Réserve un pseudo pour l'utilisateur courant. Renvoie { ok: true } en cas
// de succès, ou { ok: false, reason } sinon (reason: "invalid" | "taken" |
// "no-user" | "has-username" | "error").
//
// Tout se fait dans une transaction : on relit dans la transaction que le
// pseudo est toujours libre ET que l'utilisateur n'en a pas déjà un, puis on
// écrit les deux documents (annuaire + profil) d'un seul coup. Si un autre
// utilisateur réserve le même pseudo au même instant, la transaction échoue
// et personne ne se retrouve avec un doublon.
export async function claimUsername(name) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "no-user" };

  const displayName = (name || "").trim();
  const lower = normalizeUsername(displayName);
  if (!isValidUsername(lower)) return { ok: false, reason: "invalid" };

  try {
    await runTransaction(db, async (tx) => {
      const unameSnap = await tx.get(usernameRef(lower));
      if (unameSnap.exists()) {
        throw new Error("taken");
      }
      const profSnap = await tx.get(profileRef(user.uid));
      if (profSnap.exists() && profSnap.data().username) {
        // L'utilisateur a déjà un pseudo : on ne le change pas ici (le
        // changement de pseudo, s'il est un jour permis, devra aussi libérer
        // l'ancien — hors périmètre de cette étape).
        throw new Error("has-username");
      }
      tx.set(usernameRef(lower), {
        uid: user.uid,
        displayName,
        createdAt: serverTimestamp(),
      });
      tx.set(profileRef(user.uid), {
        username: lower,
        displayName,
        createdAt: serverTimestamp(),
      });
    });
    return { ok: true };
  } catch (e) {
    const reason = ["taken", "has-username"].includes(e.message) ? e.message : "error";
    return { ok: false, reason };
  }
}


// ─────────────────────────────────────────────────────────────
// Étape 2 : amitiés (recherche, demandes, acceptation, retrait)
// ─────────────────────────────────────────────────────────────
//
// Une amitié = UN document dans "friendships", partagé par les deux
// utilisateurs. Son id est déterministe : les deux uid triés puis joints
// par "_", donc une seule et même clé quel que soit qui envoie la demande
// (pas de doublon possible). Contenu :
//   users:       [uidA, uidB]      (triés)
//   status:      "pending" | "accepted"
//   requestedBy: uid de l'envoyeur
//   names:       { [uid]: displayName }  (pour l'affichage sans relire les profils)
//   createdAt / updatedAt

// Id déterministe d'une paire d'utilisateurs.
export function pairId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

function friendshipRef(uid1, uid2) {
  return doc(db, "friendships", pairId(uid1, uid2));
}

// Cherche un utilisateur par pseudo EXACT (insensible à la casse).
// Renvoie { uid, displayName } ou null si introuvable.
export async function findUserByUsername(name) {
  const lower = normalizeUsername(name);
  if (!isValidUsername(lower)) return null;
  try {
    const snap = await getDoc(doc(db, "usernames", lower));
    if (!snap.exists()) return null;
    const data = snap.data();
    return { uid: data.uid, displayName: data.displayName || lower };
  } catch {
    return null;
  }
}

// Envoie une demande d'ami à l'utilisateur d'uid cible.
// Renvoie { ok } ou { ok:false, reason }.
export async function sendFriendRequest(targetUid, targetDisplayName) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "no-user" };
  if (targetUid === user.uid) return { ok: false, reason: "self" };

  // Nom d'affichage de l'envoyeur (depuis son profil).
  let myName = user.uid;
  try {
    const me = await getMyProfile();
    if (me && (me.displayName || me.username)) myName = me.displayName || me.username;
  } catch {}

  const ref = friendshipRef(user.uid, targetUid);
  try {
    // On ne pré-lit PAS le document : les règles interdisent de lire une
    // relation dont on n'est pas déjà membre, et un document encore
    // inexistant n'a pas de membres. La détection "déjà ami / en attente"
    // se fait côté interface à partir des relations déjà chargées. Ici on
    // tente directement la création ; si une relation existe déjà, la règle
    // create la refusera (doc déjà présent) et on renverra une erreur douce.
    await setDoc(ref, {
      users: [user.uid, targetUid].sort(),
      status: "pending",
      requestedBy: user.uid,
      names: { [user.uid]: myName, [targetUid]: targetDisplayName || targetUid },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// Accepte une demande d'ami (le destinataire passe le doc en "accepted").
export async function acceptFriendRequest(otherUid) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "no-user" };
  try {
    await updateDoc(friendshipRef(user.uid, otherUid), {
      status: "accepted",
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// Refuse une demande reçue, ou annule une demande envoyée, ou retire un ami :
// dans tous les cas, on supprime le document de relation.
export async function removeFriendship(otherUid) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "no-user" };
  try {
    await deleteDoc(friendshipRef(user.uid, otherUid));
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// Liste toutes les relations où l'utilisateur courant apparaît, classées en
// trois groupes : amis (accepted), demandes reçues (pending, envoyées par
// l'autre), demandes envoyées (pending, envoyées par moi).
export async function getFriendships() {
  const user = auth.currentUser;
  if (!user) return { friends: [], incoming: [], outgoing: [] };
  try {
    const q = query(
      collection(db, "friendships"),
      where("users", "array-contains", user.uid)
    );
    const snap = await getDocs(q);
    const friends = [];
    const incoming = [];
    const outgoing = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const otherUid = (d.users || []).find((u) => u !== user.uid);
      if (!otherUid) return;
      const entry = {
        uid: otherUid,
        name: (d.names && d.names[otherUid]) || otherUid,
        status: d.status,
      };
      if (d.status === "accepted") friends.push(entry);
      else if (d.status === "pending" && d.requestedBy === user.uid) outgoing.push(entry);
      else if (d.status === "pending") incoming.push(entry);
    });
    return { friends, incoming, outgoing };
  } catch {
    return { friends: [], incoming: [], outgoing: [] };
  }
}


// ─────────────────────────────────────────────────────────────
// Étape 3 : profil public-amis (résumé lisible par les amis)
// ─────────────────────────────────────────────────────────────
//
// On NE donne PAS aux amis l'accès direct aux collections privées
// users/{uid}/... (qui contiennent aussi commentaires, dates, etc.).
// À la place, l'app génère un document résumé friendData/{uid} contenant
// uniquement ce qu'on accepte de montrer : les listes de titres et des
// compteurs. Les amis lisent ce résumé, jamais les données brutes.
//
// Le résumé est régénéré au plus une fois par jour (throttle localStorage),
// à l'ouverture du Profil — voir maybePublishFriendData().

const FRIENDDATA_TS_KEY = "tvcouch_frienddata_ts";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const LIST_CAP = 500; // borne de sécurité par liste (taille du document)

function slimShow(s) {
  const watched = s.watched || {};
  return {
    id: s.id,
    name: s.name || "",
    poster_path: s.poster_path || null,
    watchedCount: Object.keys(watched).length,
  };
}
function slimMovie(m) {
  return {
    id: m.id,
    title: m.title || "",
    poster_path: m.poster_path || null,
    note: m.note || null,
    status: m.status || "watched",
  };
}
function slimBook(b) {
  return {
    id: b.id,
    title: b.title || "",
    author: b.author || null,
    cover_i: b.cover_i || null,
    cover_url: b.cover_url || null,
    note: b.note || null,
    status: b.status || "read",
  };
}
function slimVolume(v) {
  return {
    id: v.id,
    title: v.title || "",
    seriesName: v.seriesName || null,
    seriesPosition: v.seriesPosition || null,
    cover_i: v.cover_i || null,
    cover_url: v.cover_url || null,
    note: v.note || null,
    status: v.status || "read",
  };
}
function slimGame(g) {
  return {
    id: g.id,
    name: g.name || "",
    cover_url: g.cover_url || null,
    note: g.note || null,
    status: g.status || "done",
  };
}

// Construit puis publie le résumé friendData/{uid} pour l'utilisateur courant.
// Les fonctions de lecture des stores sont passées en paramètres pour éviter
// une dépendance circulaire entre modules.
export async function publishFriendData({ shows, movies, books, volumes, games }) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "no-user" };

  // Nom d'affichage depuis le profil public (déjà défini si on a un pseudo).
  let displayName = user.displayName || user.uid;
  let username = null;
  try {
    const prof = await getMyProfile();
    if (prof) {
      displayName = prof.displayName || displayName;
      username = prof.username || null;
    }
  } catch {}

  const watchedMovies = (movies || []).filter((m) => m.status === "watched");
  const readBooks = (books || []).filter((b) => b.status === "read");
  const readVolumes = (volumes || []).filter((v) => v.status === "read");
  const doneGames = (games || []).filter((g) => g.status === "done");

  let episodesWatched = 0;
  (shows || []).forEach((s) => { episodesWatched += Object.keys(s.watched || {}).length; });

  const data = {
    displayName,
    username,
    updatedAt: serverTimestamp(),
    stats: {
      showsFollowed: (shows || []).length,
      episodesWatched,
      moviesWatched: watchedMovies.length,
      booksRead: readBooks.length,
      volumesRead: readVolumes.length,
      gamesDone: doneGames.length,
    },
    shows: (shows || []).slice(0, LIST_CAP).map(slimShow),
    movies: watchedMovies.slice(0, LIST_CAP).map(slimMovie),
    books: readBooks.slice(0, LIST_CAP).map(slimBook),
    volumes: readVolumes.slice(0, LIST_CAP).map(slimVolume),
    games: doneGames.slice(0, LIST_CAP).map(slimGame),
  };

  try {
    await setDoc(doc(db, "friendData", user.uid), data);
    try { localStorage.setItem(FRIENDDATA_TS_KEY, String(Date.now())); } catch {}
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// Régénère le résumé au plus une fois par jour. À appeler à l'ouverture du
// Profil (seulement si l'utilisateur a un pseudo). Renvoie true si publié.
export async function maybePublishFriendData(loaders) {
  const user = auth.currentUser;
  if (!user) return false;
  // Pas de pseudo → pas d'espace amis → rien à publier.
  try {
    const prof = await getMyProfile();
    if (!prof || !prof.username) return false;
  } catch {
    return false;
  }
  // Throttle : une fois par jour maximum.
  try {
    const last = Number(localStorage.getItem(FRIENDDATA_TS_KEY) || 0);
    if (last && Date.now() - last < ONE_DAY_MS) return false;
  } catch {}

  const [shows, movies, books, volumes, games] = await Promise.all([
    loaders.getAllShows().catch(() => []),
    loaders.getAllMovies().catch(() => []),
    loaders.getAllBooks().catch(() => []),
    loaders.getAllVolumes().catch(() => []),
    loaders.getAllGames().catch(() => []),
  ]);
  const res = await publishFriendData({ shows, movies, books, volumes, games });
  return res.ok;
}

// Lit le résumé public d'un ami (friendData/{uid}). Renvoie null si absent
// ou si les règles refusent l'accès (pas amis).
export async function getFriendData(uid) {
  try {
    const snap = await getDoc(doc(db, "friendData", uid));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}


// ─────────────────────────────────────────────────────────────
// Étape 4b : recommandations (recommander une œuvre à un ami)
// ─────────────────────────────────────────────────────────────
//
// Une recommandation = UN document dans "recommendations" (id auto) :
//   from:      uid de l'expéditeur
//   fromName:  nom affiché de l'expéditeur (pour l'affichage sans relecture)
//   to:        uid du destinataire
//   category:  "shows" | "movies" | "books" | "volumes" | "games"
//   item:      { id, title, cover }  (résumé auto-suffisant à afficher)
//   message:   petit mot facultatif (chaîne, éventuellement vide)
//   status:    "unread" | "read"
//   createdAt
//
// Règles : seul l'expéditeur crée (et doit être ami accepté avec le
// destinataire) ; expéditeur et destinataire peuvent lire et supprimer ;
// seul le destinataire peut mettre à jour, et uniquement le champ "status".

// Envoie une recommandation. `item` doit contenir { id, title, cover }.
// Renvoie { ok } ou { ok:false, reason }.
export async function sendRecommendation(toUid, toName, category, item, message) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "no-user" };
  if (!toUid || toUid === user.uid) return { ok: false, reason: "self" };
  if (!item || item.id == null) return { ok: false, reason: "bad-item" };

  // Nom d'affichage de l'expéditeur (depuis son profil public).
  let myName = user.uid;
  try {
    const me = await getMyProfile();
    if (me && (me.displayName || me.username)) myName = me.displayName || me.username;
  } catch {}

  try {
    await addDoc(collection(db, "recommendations"), {
      from: user.uid,
      fromName: myName,
      to: toUid,
      category: category || "",
      item: {
        id: String(item.id),
        title: item.title || "",
        cover: item.cover || null,
      },
      message: (message || "").slice(0, 500),
      status: "unread",
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// Liste les recommandations REÇUES par l'utilisateur courant, triées de la
// plus récente à la plus ancienne (tri côté client pour éviter un index
// composite). Chaque entrée : { id, from, fromName, category, item, message,
// status, createdAt }.
export async function getReceivedRecommendations() {
  const user = auth.currentUser;
  if (!user) return [];
  try {
    const q = query(collection(db, "recommendations"), where("to", "==", user.uid));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      list.push({ id: docSnap.id, ...d });
    });
    list.sort((a, b) => {
      const ta = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  } catch {
    return [];
  }
}

// Nombre de recommandations reçues non lues (pour la pastille du Profil).
// Une seule condition where (pas d'index composite nécessaire).
export async function getUnreadRecoCount() {
  const user = auth.currentUser;
  if (!user) return 0;
  try {
    const q = query(collection(db, "recommendations"), where("to", "==", user.uid));
    const snap = await getDocs(q);
    let n = 0;
    snap.forEach((docSnap) => { if (docSnap.data().status !== "read") n += 1; });
    return n;
  } catch {
    return 0;
  }
}

// Marque une recommandation reçue comme lue.
export async function markRecommendationRead(recoId) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "no-user" };
  try {
    await updateDoc(doc(db, "recommendations", recoId), { status: "read" });
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// Supprime une recommandation (expéditeur ou destinataire).
export async function dismissRecommendation(recoId) {
  const user = auth.currentUser;
  if (!user) return { ok: false, reason: "no-user" };
  try {
    await deleteDoc(doc(db, "recommendations", recoId));
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

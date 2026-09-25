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
  doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp,
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

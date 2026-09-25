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
  doc, getDoc, setDoc, runTransaction, serverTimestamp,
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

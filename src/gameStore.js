// Fonctions Firestore pour les jeux vidéo. Chaque jeu est un document
// dans users/{uid}/games, identifié par l'id RAWG. Même modèle que les
// films : statut "done" (fait) / "todo" (à faire), note, commentaire, et
// un compteur "replayCount" (refait, équivalent du revisionnage).
import { db, auth } from "./firebase";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, getDocs, collection,
} from "firebase/firestore";

function gameRef(gameId) {
  const uid = auth.currentUser.uid;
  return doc(db, "users", uid, "games", String(gameId));
}

export async function getGameDoc(gameId) {
  const snap = await getDoc(gameRef(gameId));
  return snap.exists() ? snap.data() : null;
}

// Ajoute/met à jour un jeu. status: "done" (fait) | "todo" (à faire)
export async function saveGame(game, status, doneDate = null) {
  const data = {
    id: game.id,
    name: game.name,
    cover_url: game.cover_url || null,
    release_year: game.release_year || null,
    released: game.released || null,
    studio: game.studio || null,
    genres: game.genres && game.genres.length > 0 ? game.genres : null,
    status,
    doneDate: doneDate || null,
    addedAt: Date.now(),
  };
  await setDoc(gameRef(game.id), data, { merge: true });
}

export async function removeGame(gameId) {
  await deleteDoc(gameRef(gameId));
}

export async function getAllGames() {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(collection(db, "users", uid, "games"));
  return snap.docs.map((d) => d.data());
}

// Bascule un jeu "fait" en "à faire" (annule la complétion et le compteur
// de parties refaites). La note/le commentaire sont conservés.
export async function untogglGame(gameId) {
  await updateDoc(gameRef(gameId), {
    status: "todo",
    doneDate: deleteField(),
    replayCount: deleteField(),
  });
}

// Nombre de fois où le jeu a été REFAIT (en plus de la première fois).
// 0 ou absent = fait une seule fois. 1 = refait une fois (affiché "×2").
export async function setGameReplayCount(gameId, count) {
  await updateDoc(gameRef(gameId), {
    replayCount: count > 0 ? count : deleteField(),
  });
}

// Note (1-5) + commentaire pour un jeu. Marque le jeu comme fait. La date
// de complétion n'est posée qu'une seule fois (comme les films) : si déjà
// renseignée, on la conserve plutôt que de la remplacer par la date du jour.
export async function setGameRating(gameId, note, comment, game = null) {
  const existingSnap = await getDoc(gameRef(gameId));
  const existing = existingSnap.exists() ? existingSnap.data() : null;
  const doneDate = (existing && existing.doneDate) || new Date().toISOString().slice(0, 10);

  const data = {
    id: game ? game.id : gameId,
    note: note || null,
    comment: comment || "",
    status: "done",
    doneDate,
    ratedAt: Date.now(),
  };
  if (game) {
    if (game.name != null) data.name = game.name;
    if (game.cover_url !== undefined) data.cover_url = game.cover_url || null;
    if (game.release_year !== undefined) data.release_year = game.release_year || null;
    if (game.released !== undefined) data.released = game.released || null;
    if (game.studio !== undefined) data.studio = game.studio || null;
    if (game.genres && game.genres.length > 0) data.genres = game.genres;
    if (data.addedAt === undefined) data.addedAt = Date.now();
  }
  await setDoc(gameRef(gameId), data, { merge: true });
}

export async function removeGameRating(gameId) {
  await updateDoc(gameRef(gameId), {
    note: deleteField(),
    comment: deleteField(),
  });
}

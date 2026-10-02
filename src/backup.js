// Sauvegarde / export des données de l'utilisateur en JSON.
// Lit toutes les collections (séries, films, romans, tomes, jeux, favoris)
// et déclenche le téléchargement d'un fichier unique, pour que l'utilisateur
// garde une copie de son suivi (sécurité + portabilité).
import { db, auth } from "./firebase";
import { doc, getDoc, setDoc, writeBatch } from "firebase/firestore";
import { getAllShows, getFavorites } from "./store";
import { getAllMovies } from "./movieStore";
import { getAllBooks } from "./bookStore";
import { getAllVolumes } from "./mangaStore";
import { getAllGames } from "./gameStore";

// Construit l'objet de sauvegarde complet.
export async function buildBackup() {
  const [shows, movies, books, volumes, games, favorites] = await Promise.all([
    getAllShows().catch(() => []),
    getAllMovies().catch(() => []),
    getAllBooks().catch(() => []),
    getAllVolumes().catch(() => []),
    getAllGames().catch(() => []),
    getFavorites().catch(() => ({ shows: [], movies: [] })),
  ]);

  return {
    app: "Tv Couch",
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      shows: shows.length,
      movies: movies.length,
      books: books.length,
      volumes: volumes.length,
      games: games.length,
    },
    data: { shows, movies, books, volumes, games, favorites },
  };
}

// Génère la sauvegarde puis déclenche le téléchargement du fichier .json.
// Renvoie les compteurs (pour un éventuel message de confirmation).
export async function downloadBackup() {
  const backup = await buildBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `tvcouch-sauvegarde-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Laisse au navigateur le temps de lancer le téléchargement avant de libérer l'URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return backup.counts;
}

// Vérifie qu'un objet ressemble à une sauvegarde Tv Couch valide.
export function isValidBackup(backup) {
  return !!(backup && backup.app === "Tv Couch" && backup.data && typeof backup.data === "object");
}

// Restaure une sauvegarde par FUSION : chaque élément est réécrit dans sa
// sous-collection (merge), ce qui ajoute ou met à jour sans jamais supprimer
// ce qui n'est pas dans le fichier. Les favoris sont fusionnés par id (union).
// Renvoie les compteurs d'éléments restaurés.
export async function restoreBackup(backup) {
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) throw new Error("no-user");
  if (!isValidBackup(backup)) throw new Error("invalid");

  const d = backup.data;
  // [nom de sous-collection, tableau, fonction id]
  const collections = [
    ["shows", d.shows],
    ["movies", d.movies],
    ["books", d.books],
    ["manga", d.volumes],
    ["games", d.games],
  ];

  const counts = { shows: 0, movies: 0, books: 0, volumes: 0, games: 0 };
  const countKey = { shows: "shows", movies: "movies", books: "books", manga: "volumes", games: "games" };

  let batch = writeBatch(db);
  let ops = 0;
  const flush = async () => {
    if (ops >= 450) { await batch.commit(); batch = writeBatch(db); ops = 0; }
  };

  for (const [name, arr] of collections) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || item.id == null) continue;
      batch.set(doc(db, "users", uid, name, String(item.id)), item, { merge: true });
      counts[countKey[name]] += 1;
      ops += 1;
      await flush();
    }
  }
  if (ops > 0) await batch.commit();

  // Favoris : fusion par id (on conserve les favoris actuels non présents
  // dans la sauvegarde).
  const fav = d.favorites || {};
  if (fav && (Array.isArray(fav.shows) || Array.isArray(fav.movies))) {
    const favReference = doc(db, "users", uid, "meta", "favorites");
    let current = { shows: [], movies: [] };
    try {
      const snap = await getDoc(favReference);
      if (snap.exists()) current = snap.data() || current;
    } catch {}
    const mergeById = (a, b) => {
      const out = Array.isArray(a) ? [...a] : [];
      (Array.isArray(b) ? b : []).forEach((item) => {
        if (item && item.id != null && !out.find((x) => x.id === item.id)) out.push(item);
      });
      return out;
    };
    const merged = {
      shows: mergeById(current.shows, fav.shows),
      movies: mergeById(current.movies, fav.movies),
    };
    await setDoc(favReference, merged, { merge: true });
  }

  return counts;
}

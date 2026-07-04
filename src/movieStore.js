// Fonctions Firestore pour les films
import { db, auth } from "./firebase";
import {
  doc, setDoc, deleteDoc, getDocs, collection, writeBatch,
} from "firebase/firestore";

function movieRef(movieId) {
  const uid = auth.currentUser.uid;
  return doc(db, "users", uid, "movies", String(movieId));
}

// Ajoute/mre à jour un film. status: "watched" | "watchlist"
export async function saveMovie(movie, status, watchedDate = null) {
  await setDoc(
    movieRef(movie.id),
    {
      id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path || null,
      release_date: movie.release_date || null,
      runtime: movie.runtime || null,
      status,
      watchedDate: watchedDate || null,
      addedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function removeMovie(movieId) {
  await deleteDoc(movieRef(movieId));
}

export async function getAllMovies() {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(collection(db, "users", uid, "movies"));
  return snap.docs.map((d) => d.data());
}

// Import par lots
export async function importMoviesBatch(moviesData) {
  const uid = auth.currentUser.uid;
  const batch = writeBatch(db);
  moviesData.forEach((m) => {
    const ref = doc(db, "users", uid, "movies", String(m.id));
    batch.set(ref, m, { merge: true });
  });
  await batch.commit();
}
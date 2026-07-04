// Fonctions Firestore pour les films
import { db, auth } from "./firebase";
import {
  doc, setDoc, updateDoc, deleteDoc, deleteField, getDocs, collection, writeBatch,
} from "firebase/firestore";

function movieRef(movieId) {
  const uid = auth.currentUser.uid;
  return doc(db, "users", uid, "movies", String(movieId));
}

// Ajoute/met à jour un film. status: "watched" | "watchlist"
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

export async function importMoviesBatch(moviesData) {
  const uid = auth.currentUser.uid;
  const batch = writeBatch(db);
  moviesData.forEach((m) => {
    const ref = doc(db, "users", uid, "movies", String(m.id));
    batch.set(ref, m, { merge: true });
  });
  await batch.commit();
}

// Note (1-5) + commentaire pour un film. Marque le film comme vu.
export async function setMovieRating(movieId, note, comment) {
  const today = new Date().toISOString().slice(0, 10);
  await updateDoc(movieRef(movieId), {
    note: note || null,
    comment: comment || "",
    status: "watched",       // noter = vu
    watchedDate: today,
    ratedAt: Date.now(),
  });
}

export async function removeMovieRating(movieId) {
  await updateDoc(movieRef(movieId), {
    note: deleteField(),
    comment: deleteField(),
  });
}
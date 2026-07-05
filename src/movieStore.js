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
// `movie` est optionnel : s'il est fourni (titre/affiche/date), on crée
// proprement le document au cas où le film n'existait pas encore en base.
export async function setMovieRating(movieId, note, comment, movie = null) {
  const today = new Date().toISOString().slice(0, 10);
  const data = {
    id: movie ? movie.id : movieId,
    note: note || null,
    comment: comment || "",
    status: "watched",       // noter = vu
    watchedDate: today,
    ratedAt: Date.now(),
  };
  if (movie) {
    // Renseigné uniquement si connu, pour ne pas écraser d'infos existantes
    if (movie.title != null) data.title = movie.title;
    if (movie.poster_path !== undefined) data.poster_path = movie.poster_path || null;
    if (movie.release_date !== undefined) data.release_date = movie.release_date || null;
    if (movie.runtime !== undefined && movie.runtime != null) data.runtime = movie.runtime;
    if (data.addedAt === undefined) data.addedAt = Date.now();
  }
  // setDoc + merge : crée le document s'il n'existe pas, sinon met à jour.
  await setDoc(movieRef(movieId), data, { merge: true });
}

export async function removeMovieRating(movieId) {
  await updateDoc(movieRef(movieId), {
    note: deleteField(),
    comment: deleteField(),
  });
}

// Fonctions de lecture/écriture Firestore pour le suivi des séries
import { db, auth } from "./firebase";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField,
  collection, getDocs, writeBatch,
} from "firebase/firestore";

function showRef(showId) {
  const uid = auth.currentUser.uid;
  return doc(db, "users", uid, "shows", String(showId));
}

function movieRef(movieId) {
  const uid = auth.currentUser.uid;
  return doc(db, "users", uid, "movies", String(movieId));
}

function favRef() {
  const uid = auth.currentUser.uid;
  return doc(db, "users", uid, "meta", "favorites");
}

export async function followShow(show) {
  await setDoc(
    showRef(show.id),
    {
      id: show.id,
      name: show.name,
      poster_path: show.poster_path || null,
      first_air_date: show.first_air_date || null,
      addedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function unfollowShow(showId) {
  await deleteDoc(showRef(showId));
}

export async function getFollowedShow(showId) {
  const snap = await getDoc(showRef(showId));
  return snap.exists() ? snap.data() : null;
}

export async function getAllShows() {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(collection(db, "users", uid, "shows"));
  return snap.docs.map((d) => d.data());
}

export async function setEpisodeWatched(showId, seasonNumber, episodeNumber, watchedDate) {
  const key = `watched.${seasonNumber}_${episodeNumber}`;
  await updateDoc(showRef(showId), {
    [key]: watchedDate ? watchedDate : deleteField(),
  });
}

export async function setEpisodesWatched(showId, updates) {
  const data = {};
  Object.entries(updates).forEach(([k, v]) => {
    data[`watched.${k}`] = v ? v : deleteField();
  });
  await updateDoc(showRef(showId), data);
}

export async function touchShow(showId) {
  await updateDoc(showRef(showId), { lastWatchedAt: Date.now() });
}

export async function importShow(showData) {
  await setDoc(showRef(showData.id), showData, { merge: true });
}

export async function importShowsBatch(showsData) {
  const uid = auth.currentUser.uid;
  const batch = writeBatch(db);
  showsData.forEach((s) => {
    const ref = doc(db, "users", uid, "shows", String(s.id));
    batch.set(ref, s, { merge: true });
  });
  await batch.commit();
}

// ---- Runtimes (durée d'un épisode / d'un film, en minutes) ----
// Stockés en base pour que le Profil calcule les stats sans appeler TMDB.

export async function setShowRuntime(showId, runtime) {
  await updateDoc(showRef(showId), { runtime });
}

export async function setMovieRuntime(movieId, runtime) {
  await updateDoc(movieRef(movieId), { runtime });
}

// ---- Notes / commentaires d'épisodes ----
// Enregistre une note (1-5) et/ou un commentaire pour un épisode.
// Marque aussi l'épisode comme vu (on ne note que ce qu'on a vu).
export async function setEpisodeRating(showId, seasonNumber, episodeNumber, note, comment) {
  const epKey = `${seasonNumber}_${episodeNumber}`;
  const ratingKey = `ratings.${epKey}`;
  const watchedKey = `watched.${epKey}`;
  const today = new Date().toISOString().slice(0, 10);

  const data = {
    [ratingKey]: {
      note: note || null,
      comment: comment || "",
      updatedAt: Date.now(),
    },
    [watchedKey]: today, // noter = marquer vu
    lastWatchedAt: Date.now(),
  };
  await updateDoc(showRef(showId), data);
}

// Supprime la note/commentaire d'un épisode (ne touche pas au statut "vu")
export async function removeEpisodeRating(showId, seasonNumber, episodeNumber) {
  const ratingKey = `ratings.${seasonNumber}_${episodeNumber}`;
  await updateDoc(showRef(showId), { [ratingKey]: deleteField() });
}

// ---- Favoris (séries et films préférés) ----
export async function getFavorites() {
  const snap = await getDoc(favRef());
  return snap.exists() ? snap.data() : { shows: [], movies: [] };
}

export async function addFavoriteShow(show) {
  const fav = await getFavorites();
  const shows = fav.shows || [];
  if (shows.find((s) => s.id === show.id)) return;
  shows.push({
    id: show.id,
    name: show.name,
    poster_path: show.poster_path || null,
  });
  await setDoc(favRef(), { ...fav, shows }, { merge: true });
}

export async function removeFavoriteShow(showId) {
  const fav = await getFavorites();
  const shows = (fav.shows || []).filter((s) => s.id !== showId);
  await setDoc(favRef(), { ...fav, shows }, { merge: true });
}

export async function addFavoriteMovie(movie) {
  const fav = await getFavorites();
  const movies = fav.movies || [];
  if (movies.find((m) => m.id === movie.id)) return;
  movies.push({
    id: movie.id,
    title: movie.title,
    poster_path: movie.poster_path || null,
  });
  await setDoc(favRef(), { ...fav, movies }, { merge: true });
}

export async function removeFavoriteMovie(movieId) {
  const fav = await getFavorites();
  const movies = (fav.movies || []).filter((m) => m.id !== movieId);
  await setDoc(favRef(), { ...fav, movies }, { merge: true });
}

// Supprime toutes les données Firestore de l'utilisateur (séries, films, favoris).
// Utilisé lors de la suppression de compte.
export async function deleteAllUserData() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  // Supprime les sous-collections "shows" et "movies" par lots
  for (const sub of ["shows", "movies"]) {
    const snap = await getDocs(collection(db, "users", uid, sub));
    let batch = writeBatch(db);
    let count = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      count += 1;
      // Firestore limite à 500 opérations par lot
      if (count % 450 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }
    await batch.commit();
  }

  // Supprime le document meta/favorites
  try {
    await deleteDoc(doc(db, "users", uid, "meta", "favorites"));
  } catch {
    // ignore
  }
}

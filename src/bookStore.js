// Fonctions Firestore pour les romans / livres isolés
import { db, auth } from "./firebase";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, getDocs, collection, writeBatch,
} from "firebase/firestore";

// Les identifiants Open Library sont déjà des chaînes (ex. "OL82563W"),
// contrairement aux ID numériques TMDB — pas besoin de String(...).
function bookRef(bookId) {
  const uid = auth.currentUser.uid;
  return doc(db, "users", uid, "books", bookId);
}

// Lit le document Firestore canonique d'un livre (note, commentaire, statut…).
export async function getBookDoc(bookId) {
  const snap = await getDoc(bookRef(bookId));
  return snap.exists() ? snap.data() : null;
}

// Ajoute/met à jour un livre. status: "read" | "toread"
export async function saveBook(book, status, readDate = null) {
  const data = {
    id: book.id,
    title: book.title,
    author: book.author || null,
    authorKey: book.authorKey || null,
    cover_i: book.cover_i || null,
    cover_url: book.cover_url || null,
    first_publish_year: book.first_publish_year || null,
    status,
    readDate: readDate || null,
    addedAt: Date.now(),
  };
  // subjects (équivalent genre) : on ne l'écrit que si connu, pour ne
  // jamais écraser une valeur déjà enregistrée par du vide.
  if (book.subjects && book.subjects.length > 0) data.subjects = book.subjects.slice(0, 20);

  await setDoc(bookRef(book.id), data, { merge: true });
}

export async function removeBook(bookId) {
  await deleteDoc(bookRef(bookId));
}

export async function getAllBooks() {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(collection(db, "users", uid, "books"));
  return snap.docs.map((d) => d.data());
}

// Note (1-5) + commentaire pour un livre. Marque le livre comme lu.
// La date de lecture n'est posée qu'UNE SEULE FOIS : si le livre a déjà
// une readDate enregistrée (ex. on modifie juste le commentaire plus
// tard), on la conserve plutôt que de la remplacer par la date du jour.
export async function setBookRating(bookId, note, comment, book = null) {
  const existingSnap = await getDoc(bookRef(bookId));
  const existing = existingSnap.exists() ? existingSnap.data() : null;
  const readDate = (existing && existing.readDate) || new Date().toISOString().slice(0, 10);

  const data = {
    id: book ? book.id : bookId,
    note: note || null,
    comment: comment || "",
    status: "read",
    readDate,
    ratedAt: Date.now(),
  };
  if (book) {
    if (book.title != null) data.title = book.title;
    if (book.author !== undefined) data.author = book.author || null;
    if (book.authorKey !== undefined) data.authorKey = book.authorKey || null;
    if (book.cover_i !== undefined) data.cover_i = book.cover_i || null;
    if (book.cover_url !== undefined) data.cover_url = book.cover_url || null;
    if (book.first_publish_year !== undefined) data.first_publish_year = book.first_publish_year || null;
    if (book.subjects && book.subjects.length > 0) data.subjects = book.subjects.slice(0, 20);
    if (data.addedAt === undefined) data.addedAt = Date.now();
  }
  await setDoc(bookRef(bookId), data, { merge: true });
}

export async function removeBookRating(bookId) {
  await updateDoc(bookRef(bookId), {
    note: deleteField(),
    comment: deleteField(),
  });
}

// Renseigne les sujets (genre-équivalent) d'un livre après coup —
// rattrapage pour les livres ajoutés avant cette info, sans appel réseau
// en plus quand on l'a déjà sous la main (ex. fiche déjà chargée).
export async function setBookSubjects(bookId, subjects) {
  if (!subjects || subjects.length === 0) return;
  await updateDoc(bookRef(bookId), { subjects: subjects.slice(0, 20) });
}

export async function importBooksBatch(booksData) {
  const uid = auth.currentUser.uid;
  const batch = writeBatch(db);
  booksData.forEach((b) => {
    const ref = doc(db, "users", uid, "books", b.id);
    batch.set(ref, b, { merge: true });
  });
  await batch.commit();
}

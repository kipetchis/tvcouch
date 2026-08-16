// Fonctions Firestore pour les tomes de manga / BD. Chaque tome est un
// document séparé (comme un roman), rattaché à une série par un simple
// champ "seriesName" — Open Library n'ayant pas d'équivalent fiable à la
// liste complète des épisodes TMDB, le regroupement se fait côté appli à
// partir des tomes que l'utilisateur ajoute lui-même.
import { db, auth } from "./firebase";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, getDocs, collection,
} from "firebase/firestore";

function volumeRef(volumeId) {
  const uid = auth.currentUser.uid;
  return doc(db, "users", uid, "manga", volumeId);
}

export async function getVolumeDoc(volumeId) {
  const snap = await getDoc(volumeRef(volumeId));
  return snap.exists() ? snap.data() : null;
}

// Ajoute/met à jour un tome. status: "read" | "toread"
export async function saveVolume(volume, status, readDate = null) {
  const data = {
    id: volume.id,
    title: volume.title,
    author: volume.author || null,
    authorKey: volume.authorKey || null,
    cover_i: volume.cover_i || null,
    first_publish_year: volume.first_publish_year || null,
    seriesName: volume.seriesName,
    seriesPosition: volume.seriesPosition || null,
    status,
    readDate: readDate || null,
    addedAt: Date.now(),
  };
  if (volume.subjects && volume.subjects.length > 0) data.subjects = volume.subjects.slice(0, 20);

  await setDoc(volumeRef(volume.id), data, { merge: true });
}

export async function removeVolume(volumeId) {
  await deleteDoc(volumeRef(volumeId));
}

export async function getAllVolumes() {
  const uid = auth.currentUser.uid;
  const snap = await getDocs(collection(db, "users", uid, "manga"));
  return snap.docs.map((d) => d.data());
}

// Coche/décoche un tome comme lu directement depuis la liste des tomes
// d'une série, sans passer par la fiche détaillée.
export async function setVolumeRead(volumeId, read) {
  await updateDoc(volumeRef(volumeId), {
    status: read ? "read" : "toread",
    readDate: read ? new Date().toISOString().slice(0, 10) : deleteField(),
  });
}

// Note (1-5) + commentaire pour un tome. Marque le tome comme lu. La date
// de lecture n'est posée qu'une seule fois (même logique que les romans) :
// si déjà lue, elle est conservée plutôt que remplacée par la date du jour.
export async function setVolumeRating(volumeId, note, comment, volume = null) {
  const existingSnap = await getDoc(volumeRef(volumeId));
  const existing = existingSnap.exists() ? existingSnap.data() : null;
  const readDate = (existing && existing.readDate) || new Date().toISOString().slice(0, 10);

  const data = {
    id: volume ? volume.id : volumeId,
    note: note || null,
    comment: comment || "",
    status: "read",
    readDate,
    ratedAt: Date.now(),
  };
  if (volume) {
    if (volume.title != null) data.title = volume.title;
    if (volume.author !== undefined) data.author = volume.author || null;
    if (volume.authorKey !== undefined) data.authorKey = volume.authorKey || null;
    if (volume.cover_i !== undefined) data.cover_i = volume.cover_i || null;
    if (volume.first_publish_year !== undefined) data.first_publish_year = volume.first_publish_year || null;
    if (volume.seriesName !== undefined) data.seriesName = volume.seriesName;
    if (volume.seriesPosition !== undefined) data.seriesPosition = volume.seriesPosition || null;
    if (volume.subjects && volume.subjects.length > 0) data.subjects = volume.subjects.slice(0, 20);
    if (data.addedAt === undefined) data.addedAt = Date.now();
  }
  await setDoc(volumeRef(volumeId), data, { merge: true });
}

export async function removeVolumeRating(volumeId) {
  await updateDoc(volumeRef(volumeId), {
    note: deleteField(),
    comment: deleteField(),
  });
}

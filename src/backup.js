// Sauvegarde / export des données de l'utilisateur en JSON.
// Lit toutes les collections (séries, films, romans, tomes, jeux, favoris)
// et déclenche le téléchargement d'un fichier unique, pour que l'utilisateur
// garde une copie de son suivi (sécurité + portabilité).
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

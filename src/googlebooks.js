// Recherche via l'API Google Books (gratuite, sans clé pour la lecture,
// bien meilleure couverture francophone qu'Open Library). Les résultats
// sont normalisés au MÊME format qu'un résultat de recherche Open Library
// (champs key / title / author_name / cover_i / first_publish_year) pour
// que le reste de l'app — fiches, ajout, manga — fonctionne sans changement.
//
// Astuce couvertures : Google fournit des URL d'image directes plutôt qu'un
// identifiant numérique comme Open Library. On stocke donc l'URL complète
// dans le champ cover_url, et coverUrl() (openlibrary.js) sait déjà
// renvoyer une URL telle quelle si elle commence par http.

const GB_URL = "https://www.googleapis.com/books/v1/volumes";

// Convertit un item Google Books vers la forme d'un résultat Open Library.
function normalize(item) {
  const info = item.volumeInfo || {};
  const yearMatch = (info.publishedDate || "").match(/\d{4}/);
  // Google renvoie des miniatures en http:// — on force https:// pour
  // éviter le blocage "contenu mixte" sur une page servie en https.
  let cover = null;
  if (info.imageLinks) {
    cover = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || null;
    if (cover) cover = cover.replace(/^http:\/\//, "https://");
  }
  return {
    // Préfixe "gb:" pour distinguer un id Google Books d'une clé Open
    // Library (OL...W) : ça évite toute collision dans Firestore et permet
    // de savoir de quelle source vient un livre déjà enregistré.
    key: `gb:${item.id}`,
    title: info.title + (info.subtitle ? ` : ${info.subtitle}` : ""),
    author_name: info.authors || [],
    author_key: [],
    cover_i: null,
    cover_url: cover,
    first_publish_year: yearMatch ? Number(yearMatch[0]) : null,
    subjects: info.categories || [],
    description: info.description || "",
  };
}

async function gbFetch(params) {
  const url = new URL(GB_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Erreur Google Books (${response.status})`);
  return response.json();
}

// Recherche par texte libre (titre, auteur...). langRestrict=fr privilégie
// les éditions francophones sans pour autant masquer le reste.
export async function searchBooksGoogle(query, max = 20) {
  const data = await gbFetch({ q: query, maxResults: Math.min(max, 40), langRestrict: "fr" });
  return (data.items || []).filter((it) => it.volumeInfo && it.volumeInfo.title).map(normalize);
}

// Recherche par ISBN (scan de code-barres). Renvoie un seul résultat
// normalisé, ou null si Google Books ne connaît pas cet ISBN.
export async function findBookByIsbnGoogle(isbn) {
  const data = await gbFetch({ q: `isbn:${isbn}` });
  const first = (data.items || [])[0];
  return first ? normalize(first) : null;
}

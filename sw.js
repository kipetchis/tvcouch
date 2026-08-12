// Service worker de Tv Couch — coquille de l'app hors ligne uniquement.
// Les données (Firestore) et les épisodes (localStorage) sont gérées
// ailleurs ; ici on s'assure juste que l'app peut s'OUVRIR sans réseau,
// une fois qu'elle a déjà été visitée au moins une fois en ligne.

const CACHE_NAME = "tvcouch-shell-v1";

// Chemin de base du site (ex. "/tvcouch/" sur GitHub Pages), calculé à
// partir de l'emplacement du service worker lui-même — pas de valeur en
// dur, ça reste correct si l'hébergement change un jour.
const BASE = self.location.pathname.replace(/sw\.js$/, "");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([BASE, `${BASE}index.html`, `${BASE}manifest.json`]))
      .catch(() => {
        // Pas grave si le pré-cache initial échoue (ex. offline dès
        // l'install) : le cache se remplira au fil de la navigation.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // On ne touche JAMAIS aux appels vers le proxy TMDB (Cloudflare Worker)
  // ni vers Firebase/Firestore : ces requêtes doivent toujours passer par
  // le réseau normalement (ou échouer proprement), leur mise en cache est
  // gérée à un autre niveau (persistance Firestore, cache localStorage).
  if (
    url.hostname.endsWith("workers.dev") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("firebaseio.com")
  ) {
    return;
  }

  // Navigation (ouverture/rechargement de l'app) : réseau d'abord, repli
  // sur la coquille mise en cache si hors ligne.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(`${BASE}index.html`, copy));
          return response;
        })
        .catch(() => caches.match(`${BASE}index.html`))
    );
    return;
  }

  // Fichiers statiques du même site (JS, CSS, icônes) : on sert le cache
  // tout de suite si dispo (rapide + fonctionne hors ligne), et on le
  // rafraîchit en arrière-plan dès que le réseau répond.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

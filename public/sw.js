// Service worker de Tv Couch — coquille de l'app hors ligne uniquement.
// Les données (Firestore) et les épisodes (localStorage) sont gérées
// ailleurs ; ici on s'assure juste que l'app peut s'OUVRIR sans réseau,
// une fois qu'elle a déjà été visitée au moins une fois en ligne.

const CACHE_NAME = "tvcouch-shell-v2";

// Chemin de base du site (ex. "/tvcouch/" sur GitHub Pages), calculé à
// partir de l'emplacement du service worker lui-même — pas de valeur en
// dur, ça reste correct si l'hébergement change un jour.
const BASE = self.location.pathname.replace(/sw\.js$/, "");

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // index.html + les fichiers JS/CSS qu'il référence. Leurs noms
      // contiennent un hash de build qu'on ne peut pas connaître à
      // l'avance : on les découvre en lisant la page elle-même, fraîche
      // (pas depuis le cache HTTP du navigateur), plutôt que de deviner.
      try {
        const htmlResponse = await fetch(`${BASE}index.html`, { cache: "reload" });
        const html = await htmlResponse.clone().text();
        await cache.put(`${BASE}index.html`, htmlResponse);

        const assetUrls = Array.from(html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)).map(
          (m) => m[1]
        );
        await Promise.all(
          assetUrls.map((url) =>
            fetch(url)
              .then((res) => (res.ok ? cache.put(url, res) : null))
              .catch(() => {
                // Un fichier manquant ne doit pas empêcher les autres
                // d'être mis en cache — chacun est indépendant ici,
                // contrairement à un cache.addAll() qui est tout-ou-rien.
              })
          )
        );
      } catch {
        // Hors ligne dès l'installation (rare) : le cache se remplira au
        // fil de la navigation en ligne suivante à la place.
      }

      try {
        await cache.add(`${BASE}manifest.json`);
      } catch {
        // Pas bloquant : le manifest sert surtout à l'installation PWA,
        // pas au fonctionnement hors ligne de l'app elle-même.
      }
    })()
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

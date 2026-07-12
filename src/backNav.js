// Système central de navigation "retour" pour Tv Couch.
//
// Sur Android (app TWA), le bouton retour ET le geste de swipe déclenchent
// tous les deux un événement navigateur `popstate`. Comme notre app gère sa
// navigation interne avec de simples useState (pas de vraies URLs), il n'y a
// par défaut rien dans l'historique du navigateur : le premier retour ferme
// direct l'application.
//
// Ce module resout ça avec une pile globale : chaque écran ouvert (fiche
// série, détail épisode, import...) pousse une entrée d'historique. Un
// retour/swipe dépile l'écran du dessus. Quand la pile est vide (écran
// principal), on demande une confirmation avant de vraiment quitter.

import { useEffect, useRef } from "react";

const stack = [];
let guardPushed = false;
let lastExitPromptAt = 0;
const EXIT_WINDOW_MS = 2200;

const exitListeners = new Set();

function notifyExitPrompt() {
  exitListeners.forEach((fn) => fn());
}

// À appeler une seule fois (depuis le composant racine) pour s'abonner
// à l'affichage du toast "Appuyez de nouveau pour quitter".
export function onExitPrompt(fn) {
  exitListeners.add(fn);
  return () => exitListeners.delete(fn);
}

function ensureGuard() {
  if (guardPushed) return;
  guardPushed = true;
  try {
    window.history.pushState({ tvcouchGuard: true }, "");
  } catch {
    // ignore (environnement sans window.history, ex. SSR)
  }
}

function handlePopState() {
  const entry = stack.pop();
  if (entry) {
    entry.onBack();
    return;
  }
  // Pile vide : on est sur l'écran principal, on demande confirmation
  const now = Date.now();
  if (now - lastExitPromptAt < EXIT_WINDOW_MS) {
    // Deuxième retour rapide : on laisse l'app se fermer normalement
    return;
  }
  lastExitPromptAt = now;
  notifyExitPrompt();
  // On repousse une garde pour neutraliser cette navigation et rester dans l'app
  ensureGuard();
}

let listenerAttached = false;
function ensureListener() {
  if (listenerAttached) return;
  listenerAttached = true;
  ensureGuard();
  window.addEventListener("popstate", handlePopState);
}

// Enregistre un écran comme "ouvert" dans la pile de navigation.
// Retourne une fonction de nettoyage à appeler à la fermeture.
function pushBackHandler(onBack) {
  ensureListener();
  const entry = { onBack };
  stack.push(entry);
  try {
    window.history.pushState({ tvcouchDepth: stack.length }, "");
  } catch {
    // ignore
  }
  return () => {
    const idx = stack.indexOf(entry);
    if (idx === -1) return;
    stack.splice(idx, 1);
    // Si l'écran se ferme sans passer par le bouton retour (ex. clic sur
    // une croix), on dépile aussi l'entrée d'historique correspondante.
    if (idx === stack.length) {
      try {
        window.history.back();
      } catch {
        // ignore
      }
    }
  };
}

// Hook React : tant que `isOpen` est vrai, l'écran est enregistré dans la
// pile de navigation. `onClose` est appelé quand l'utilisateur fait
// retour/swipe pour fermer CET écran précisément.
export function useBackClose(isOpen, onClose) {
  const cleanupRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isOpen) {
      cleanupRef.current = pushBackHandler(() => onCloseRef.current());
    }
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}

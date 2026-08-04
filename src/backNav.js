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

// Quand un écran se ferme par une action explicite (bouton, clic en dehors,
// etc.) plutôt que par retour/swipe, on retire son entrée de la pile ET on
// appelle window.history.back() pour garder l'historique réel du navigateur
// synchronisé. Ce history.back() déclenche lui-même un `popstate`, mais ce
// n'est PAS un vrai retour utilisateur : il ne faut pas le laisser dépiler
// une deuxième entrée (ce qui refermait aussi l'écran parent). Ce compteur
// dit à handlePopState combien de popstate à venir sont "de notre fait" et
// doivent être ignorés silencieusement.
let ignorePopStates = 0;

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

// Simule un retour navigateur "silencieux" : l'entrée d'historique est bien
// retirée, mais le popstate qui en résulte ne doit dépiler aucun écran (on
// vient déjà de le faire nous-mêmes, à la main).
function silentHistoryBack() {
  ignorePopStates += 1;
  try {
    window.history.back();
  } catch {
    // L'appel a échoué avant de déclencher un popstate : on annule le
    // crédit posé, sinon un futur vrai retour serait ignoré à tort.
    ignorePopStates -= 1;
  }
}

// Tentative de sortie de l'app : au premier appel, affiche le toast
// d'avertissement. Si un second appel arrive dans la fenêtre de temps qui
// suit, on ferme vraiment l'application. Utilisé à la fois par le bouton
// retour Android (popstate) et par le geste de swipe personnalisé.
function attemptExit() {
  const now = Date.now();
  if (now - lastExitPromptAt < EXIT_WINDOW_MS) {
    // Deuxième tentative rapide : on ferme réellement l'app
    lastExitPromptAt = 0;
    try {
      window.close();
    } catch {
      // ignore
    }
    return;
  }
  lastExitPromptAt = now;
  notifyExitPrompt();
  // On repousse une garde pour neutraliser une éventuelle navigation en
  // cours et rester dans l'app (utile pour le chemin popstate).
  ensureGuard();
}

// À appeler depuis n'importe où (ex. un geste de swipe personnalisé) pour
// déclencher la même logique de confirmation de sortie que le bouton retour.
export function requestExit() {
  attemptExit();
}

function handlePopState() {
  if (ignorePopStates > 0) {
    // Ce popstate vient de notre propre silentHistoryBack(), pas d'un vrai
    // geste utilisateur : on l'absorbe sans toucher à la pile.
    ignorePopStates -= 1;
    return;
  }
  const entry = stack.pop();
  if (entry) {
    entry.onBack();
    return;
  }
  // Pile vide : on est sur l'écran principal, on demande confirmation
  attemptExit();
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
    // une croix), on dépile aussi l'entrée d'historique correspondante —
    // silencieusement, pour ne pas fermer un autre écran par effet de bord.
    if (idx === stack.length) {
      silentHistoryBack();
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

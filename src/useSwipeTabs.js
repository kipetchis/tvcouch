import { useRef, useCallback } from "react";

// Zones où un geste horizontal doit rester un défilement natif (carrousels
// d'affiches, rangées d'onglets qui défilent, champs de texte) et ne doit
// donc JAMAIS déclencher un changement d'onglet.
const IGNORE_SELECTOR = "input, textarea, .hscroll, .cast-list, .section-tabs";

const MIN_DISTANCE = 55; // px minimum pour compter comme un vrai swipe
const MAX_DURATION = 600; // ms — au-delà, on considère que ce n'est pas un swipe franc
const DIRECTION_RATIO = 1.4; // le geste doit être nettement plus horizontal que vertical

// Marge laissée libre tout près des bords gauche/droit de l'écran : Android y
// gère son propre geste système de "retour" (retour prédictif). Si on
// intercepte aussi ces swipes-là pour changer d'onglet, on entre en conflit
// avec ce geste système — ce qui peut empêcher notre gestion normale du
// bouton retour (et le message "Appuyez de nouveau pour quitter") de se
// déclencher. On laisse donc cette bande de bord entièrement à Android.
const EDGE_MARGIN = 32; // px

// Hook générique : swipe gauche/droite pour naviguer dans une liste ordonnée
// d'onglets. À poser sur le conteneur principal du contenu (onTouchStart /
// onTouchEnd), pas sur toute la page, pour ne pas gêner le reste de l'UI.
export function useSwipeTabs(tabs, currentTab, onChangeTab) {
  const start = useRef(null);

  const onTouchStart = useCallback((e) => {
    const target = e.target;
    if (target && target.closest && target.closest(IGNORE_SELECTOR)) {
      start.current = null;
      return;
    }
    if (e.touches.length !== 1) {
      start.current = null;
      return;
    }
    const touch = e.touches[0];
    const width = window.innerWidth || document.documentElement.clientWidth;
    if (touch.clientX < EDGE_MARGIN || touch.clientX > width - EDGE_MARGIN) {
      // Tout près d'un bord : on laisse Android gérer son geste système
      start.current = null;
      return;
    }
    start.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const onTouchEnd = useCallback(
    (e) => {
      if (!start.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;
      const dt = Date.now() - start.current.time;
      start.current = null;

      if (dt > MAX_DURATION) return;
      if (Math.abs(dx) < MIN_DISTANCE) return;
      if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;

      const idx = tabs.indexOf(currentTab);
      if (idx === -1) return;

      if (dx < 0 && idx < tabs.length - 1) {
        onChangeTab(tabs[idx + 1]); // swipe vers la gauche → onglet suivant
      } else if (dx > 0 && idx > 0) {
        onChangeTab(tabs[idx - 1]); // swipe vers la droite → onglet précédent
      }
    },
    [tabs, currentTab, onChangeTab]
  );

  return { onTouchStart, onTouchEnd };
}

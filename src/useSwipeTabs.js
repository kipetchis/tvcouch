import { useRef, useCallback } from "react";
import { requestExit } from "./backNav";

// Zones où un geste horizontal doit rester un défilement natif (carrousels
// d'affiches, rangées d'onglets qui défilent, champs de texte) et ne doit
// donc JAMAIS déclencher un changement d'onglet.
const IGNORE_SELECTOR = "input, textarea, .hscroll, .cast-list, .section-tabs";

const MIN_DISTANCE = 55; // px minimum pour compter comme un vrai swipe
const MAX_DURATION = 600; // ms — au-delà, on considère que ce n'est pas un swipe franc
const DIRECTION_RATIO = 1.4; // le geste doit être nettement plus horizontal que vertical

// Hook générique : swipe gauche/droite pour naviguer dans une liste ordonnée
// d'onglets. À poser sur le conteneur principal du contenu (onTouchStart /
// onTouchEnd), pas sur toute la page, pour ne pas gêner le reste de l'UI.
//
// Sur le geste système de retour d'Android (bord de l'écran) : il s'est
// avéré peu fiable selon les appareils/versions pour déclencher notre
// gestion habituelle (popstate). On ne s'appuie donc plus dessus : swiper
// une fois qu'on est déjà au premier ou dernier onglet ("swipe dans le
// vide") déclenche directement notre propre confirmation de sortie
// (requestExit), avec le même toast "Appuyez de nouveau pour quitter".
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

      if (dx < 0) {
        if (idx < tabs.length - 1) {
          onChangeTab(tabs[idx + 1]); // swipe vers la gauche → onglet suivant
        } else {
          // Déjà sur le dernier onglet : swipe "dans le vide" → tentative de sortie
          requestExit();
        }
      } else {
        if (idx > 0) {
          onChangeTab(tabs[idx - 1]); // swipe vers la droite → onglet précédent
        } else {
          // Déjà sur le premier onglet : swipe "dans le vide" → tentative de sortie
          requestExit();
        }
      }
    },
    [tabs, currentTab, onChangeTab]
  );

  return { onTouchStart, onTouchEnd };
}

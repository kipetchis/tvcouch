import { t } from "./i18n";

// Popup affichée quand on clique sur un épisode/film déjà marqué comme vu.
// Propose de le décocher ("Pas vu") ou d'ajouter un revisionnage ("+1").
// Le retour/swipe Android est géré par l'écran parent (celui qui possède
// l'état d'ouverture), pas ici — sinon on enregistre deux fois le même
// écran dans la pile de navigation, ce qui referme aussi la fiche série/
// film en plus de la popup au moment de la fermer.
export default function RewatchMenu({ count, onUnwatch, onRewatch, onClose }) {
  const total = (count || 0) + 1;
  const title =
    count > 0 ? t("rewatch.watchedTimes").replace("{n}", total) : t("rewatch.watchedOnce");

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="rewatch-menu" onClick={(e) => e.stopPropagation()}>
        <div className="rewatch-menu-title">✓ {title}</div>

        <button className="rewatch-btn rewatch-btn-add" onClick={onRewatch}>
          {t("rewatch.addRewatch")}
        </button>
        <button className="rewatch-btn rewatch-btn-unwatch" onClick={onUnwatch}>
          {t("rewatch.markUnwatched")}
        </button>
        <button className="rewatch-btn rewatch-btn-cancel" onClick={onClose}>
          {t("rewatch.cancel")}
        </button>
      </div>
    </div>
  );
}

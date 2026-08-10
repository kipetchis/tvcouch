import { useBackClose } from "./backNav";
import { t } from "./i18n";

// Bottom sheet de filtre générique : une section "Statut" (optionnelle) +
// une section "Genre" (optionnelle), chacune en boutons radio empilés.
// Passer statusOptions=null pour n'afficher que la section Genre (ex. sur
// la page Films, où le statut Vus/À voir est déjà géré par des onglets).
export default function FilterSheet({
  open,
  onClose,
  statusOptions,
  status,
  onStatusChange,
  genreOptions,
  genre,
  onGenreChange,
}) {
  useBackClose(open, onClose);

  if (!open) return null;

  return (
    <div className="filter-sheet-overlay" onClick={onClose}>
      <div className="filter-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="filter-sheet-handle" />

        {statusOptions && (
          <>
            <div className="filter-sheet-label">{t("filter.status")}</div>
            {statusOptions.map((opt) => (
              <label key={opt.value} className="filter-radio-row">
                <span className={`filter-radio ${status === opt.value ? "filter-radio-checked" : ""}`} />
                <input
                  type="radio"
                  className="filter-radio-input"
                  checked={status === opt.value}
                  onChange={() => onStatusChange(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </>
        )}

        {genreOptions && (
          <>
            <div className="filter-sheet-label">{t("filter.genre")}</div>
            <label className="filter-radio-row">
              <span className={`filter-radio ${!genre ? "filter-radio-checked" : ""}`} />
              <input
                type="radio"
                className="filter-radio-input"
                checked={!genre}
                onChange={() => onGenreChange(null)}
              />
              {t("filter.allGenres")}
            </label>
            {genreOptions.map((opt) => (
              <label key={opt.id} className="filter-radio-row">
                <span className={`filter-radio ${genre === opt.id ? "filter-radio-checked" : ""}`} />
                <input
                  type="radio"
                  className="filter-radio-input"
                  checked={genre === opt.id}
                  onChange={() => onGenreChange(opt.id)}
                />
                {opt.label}
              </label>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

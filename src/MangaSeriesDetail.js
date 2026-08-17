import { useState, useEffect } from "react";
import { getAllVolumes, saveVolume, setVolumeRead, removeVolume } from "./mangaStore";
import { searchBooks, getWork, coverUrl } from "./openlibrary";
import VolumeDetail from "./VolumeDetail";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

function sortVolumes(list) {
  return [...list].sort((a, b) => {
    const pa = parseFloat(a.seriesPosition);
    const pb = parseFloat(b.seriesPosition);
    if (!isNaN(pa) && !isNaN(pb)) return pa - pb;
    return (a.title || "").localeCompare(b.title || "", "fr");
  });
}

// Petit formulaire d'ajout d'un tome trouvé par recherche : nom de série
// et numéro de tome pré-remplis quand Open Library les connaît, sinon à
// saisir soi-même (c'est ce qui permet le regroupement par série).
function AddVolumeForm({ result, seriesName, onClose, onAdded }) {
  const [name, setName] = useState(
    seriesName || (result.series_name && result.series_name[0]) || result.title
  );
  const [position, setPosition] = useState(
    (result.series_position && result.series_position[0]) || ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const add = async (status) => {
    setSaving(true);
    setError(null);
    try {
      const shape = {
        id: (result.key || "").replace(/^\/?works\//, ""),
        title: result.title,
        author: (result.author_name && result.author_name[0]) || null,
        authorKey: (result.author_key && result.author_key[0]) || null,
        cover_i: result.cover_i || null,
        first_publish_year: result.first_publish_year || null,
        seriesName: name.trim(),
        seriesPosition: position.trim() || null,
      };
      let subjects;
      try {
        const full = await getWork(shape.id);
        subjects = (full.subjects || []).slice(0, 20);
      } catch {}
      await saveVolume(
        { ...shape, subjects },
        status,
        status === "read" ? new Date().toISOString().slice(0, 10) : null
      );
      onAdded();
    } catch (e) {
      setError((e && e.message) || "Erreur lors de l'ajout.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
      <div className="rewatch-menu" onClick={(e) => e.stopPropagation()}>
        <div className="rewatch-menu-title">{result.title}</div>

        <div className="rating-label">{t("manga.seriesName")}</div>
        <input
          type="text"
          className="filter-input"
          style={{ width: "100%", marginBottom: 10 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="rating-label">{t("manga.volumeNumber")}</div>
        <input
          type="text"
          className="filter-input"
          style={{ width: "100%", marginBottom: 16 }}
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder={t("manga.volumeNumberPlaceholder")}
        />

        <button className="rewatch-btn rewatch-btn-add" disabled={saving || !name.trim()} onClick={() => add("read")}>
          {t("books.read")}
        </button>
        <button
          className="rewatch-btn"
          disabled={saving || !name.trim()}
          onClick={() => add("toread")}
          style={{ background: "var(--surface-3)", color: "var(--text)" }}
        >
          {t("books.toRead")}
        </button>
        <button className="rewatch-btn rewatch-btn-cancel" onClick={onClose}>
          {t("rewatch.cancel")}
        </button>
        {error && <p className="error small" style={{ marginTop: 10 }}>{error}</p>}
      </div>
    </div>
  );
}

export default function MangaSeriesDetail({ seriesName, onBack }) {
  const [volumes, setVolumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [openVolume, setOpenVolume] = useState(null);
  useBackClose(!!openVolume, () => setOpenVolume(null));

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addingResult, setAddingResult] = useState(null);
  useBackClose(!!addingResult, () => setAddingResult(null));

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const all = await getAllVolumes();
      setVolumes(sortVolumes(all.filter((v) => v.seriesName === seriesName)));
    } catch (e) {
      setLoadError((e && e.message) || "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesName]);

  const toggleRead = async (v) => {
    const next = v.status !== "read";
    setVolumes((prev) =>
      prev.map((x) => (x.id === v.id ? { ...x, status: next ? "read" : "toread" } : x))
    );
    try {
      await setVolumeRead(v.id, next);
    } catch {
      load();
    }
  };

  const handleRemoveVolume = async (id) => {
    await removeVolume(id);
    load();
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await searchBooks(query.trim());
      setResults((data.docs || []).filter((d) => d.title));
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => { setQuery(""); setResults([]); };
  const readCount = volumes.filter((v) => v.status === "read").length;

  return (
    <div className="detail">
      <button className="btn-small back" onClick={onBack}>← Retour</button>
      <h2>{seriesName}</h2>
      <p className="progress-text">{readCount} / {volumes.length} {t("manga.volumesRead")}</p>

      <form className="search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder={t("manga.searchVolume")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="submit">{t("common.search")}</button>
        {results.length > 0 && (
          <button type="button" className="btn-small" onClick={clearSearch}>✕</button>
        )}
      </form>

      {searching && <p className="center">{t("common.loading")}</p>}
      {loadError && <p className="error">{loadError}</p>}

      {results.length > 0 && (
        <div className="grid" style={{ marginBottom: 20 }}>
          {results.map((r) => {
            const cover = coverUrl(r.cover_i);
            return (
              <div key={r.key} className="card" onClick={() => setAddingResult(r)}>
                {cover ? (
                  <img src={cover} alt={r.title} />
                ) : (
                  <div className="no-poster">{t("common.noPoster")}</div>
                )}
                <div className="card-title">{r.title}</div>
                <div className="card-year">{r.first_publish_year || "—"}</div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <p className="center">{t("common.loading")}</p>
      ) : (
        <div className="seasons">
          <div className="season">
            <div className="episodes">
              {volumes.map((v) => (
                <div key={v.id} className="episode" onClick={() => setOpenVolume(v)}>
                  <div className="ep-text">
                    {v.seriesPosition && <span className="ep-num">T{v.seriesPosition}</span>}
                    <span className="ep-name">{v.title}</span>
                  </div>
                  <div
                    className={`check ${v.status === "read" ? "checked" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleRead(v); }}
                  >
                    {v.status === "read" ? "✓" : ""}
                  </div>
                </div>
              ))}
              {volumes.length === 0 && (
                <p className="muted small" style={{ padding: 10 }}>{t("manga.noVolumesYet")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {addingResult && (
        <AddVolumeForm
          result={addingResult}
          seriesName={seriesName}
          onClose={() => setAddingResult(null)}
          onAdded={() => { setAddingResult(null); clearSearch(); load(); }}
        />
      )}

      {openVolume && (
        <VolumeDetail
          volume={openVolume}
          onClose={() => setOpenVolume(null)}
          onRated={() => load()}
          onRemove={() => { setOpenVolume(null); handleRemoveVolume(openVolume.id); }}
        />
      )}
    </div>
  );
}

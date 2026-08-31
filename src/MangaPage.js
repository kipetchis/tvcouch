import { useState, useEffect } from "react";
import { getAllVolumes, saveVolume } from "./mangaStore";
import { searchBooks, getWork, coverUrl } from "./openlibrary";
import { searchBooksGoogle } from "./googlebooks";
import MangaSeriesDetail from "./MangaSeriesDetail";
import BookScanner from "./BookScanner";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

function groupBySeries(volumes) {
  const groups = new Map();
  volumes.forEach((v) => {
    const key = v.seriesName || v.title;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  });
  return Array.from(groups.entries()).map(([seriesName, vols]) => {
    const sorted = [...vols].sort((a, b) => {
      const pa = parseFloat(a.seriesPosition);
      const pb = parseFloat(b.seriesPosition);
      if (!isNaN(pa) && !isNaN(pb)) return pa - pb;
      return (a.title || "").localeCompare(b.title || "", "fr");
    });
    const readCount = sorted.filter((v) => v.status === "read").length;
    const lastUpdate = Math.max(0, ...sorted.map((v) => v.addedAt || 0));
    return { seriesName, volumes: sorted, total: sorted.length, readCount, lastUpdate };
  });
}

function SeriesRow({ s, onOpen }) {
  const firstVol = s.volumes[0];
  const cover = firstVol ? coverUrl(firstVol.cover_url || firstVol.cover_i, "M") : null;
  return (
    <div className="ep-row" onClick={onOpen}>
      <div className="ep-row-poster">
        {cover ? (
          <img src={cover} alt={s.seriesName} />
        ) : (
          <div className="no-poster small-poster">—</div>
        )}
      </div>
      <div className="ep-row-info">
        <div className="ep-row-title">{s.seriesName}</div>
        <div className="ep-row-progress muted small">
          {s.readCount} / {s.total} {t("manga.volumesRead")}
        </div>
      </div>
    </div>
  );
}

// Même petit formulaire d'ajout que dans MangaSeriesDetail (nom de série +
// numéro de tome), utilisé ici pour démarrer une toute nouvelle série.
function AddVolumeForm({ result, onClose, onAdded }) {
  const [name, setName] = useState((result.series_name && result.series_name[0]) || result.title);
  const [position, setPosition] = useState((result.series_position && result.series_position[0]) || "");
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
        cover_url: result.cover_url || null,
        first_publish_year: result.first_publish_year || null,
        seriesName: name.trim(),
        seriesPosition: position.trim() || null,
      };
      // Sujets déjà présents (Google Books) ; sinon getWork, mais seulement
      // pour un id Open Library (OL...W) — un id "gb:" n'a pas d'œuvre OL.
      let subjects = result.subjects || [];
      if ((!subjects || !subjects.length) && /^OL\d+W$/i.test(shape.id)) {
        try {
          const full = await getWork(shape.id);
          subjects = (full.subjects || []).slice(0, 20);
        } catch {}
      }
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

export default function MangaPage({ subTab, onSubTabChange }) {
  const [volumes, setVolumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [openSeries, setOpenSeries] = useState(null);
  useBackClose(!!openSeries, () => setOpenSeries(null));

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  useBackClose(results.length > 0, () => setResults([]));
  const [searching, setSearching] = useState(false);
  const [addingResult, setAddingResult] = useState(null);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const all = await getAllVolumes();
      setVolumes(all);
    } catch (e) {
      setLoadError((e && e.message) || "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      // L'échec de Google Books (quota, réseau…) ne doit pas bloquer la
      // recherche : on retombe sur Open Library dans ce cas.
      let list = [];
      try {
        list = await searchBooksGoogle(query.trim());
      } catch {}
      if (list.length === 0) {
        const data = await searchBooks(query.trim());
        list = (data.docs || []).filter((d) => d.title);
      }
      setResults(list);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => { setQuery(""); setResults([]); };

  if (openSeries) {
    return (
      <MangaSeriesDetail
        seriesName={openSeries}
        onBack={() => { setOpenSeries(null); load(); }}
      />
    );
  }

  const series = groupBySeries(volumes).sort((a, b) => b.lastUpdate - a.lastUpdate);
  const inProgress = series.filter((s) => s.readCount > 0 && s.readCount < s.total);
  const upToDate = series.filter((s) => s.total > 0 && s.readCount === s.total);
  const notStarted = series.filter((s) => s.readCount === 0);

  return (
    <div>
      <div className="movie-tabs">
        <button
          className={subTab === "romans" ? "movie-tab active" : "movie-tab"}
          onClick={() => onSubTabChange("romans")}
        >
          {t("books.tabRomans")}
        </button>
        <button
          className={subTab === "manga" ? "movie-tab active" : "movie-tab"}
          onClick={() => onSubTabChange("manga")}
        >
          {t("books.tabManga")}
        </button>
      </div>

      <form className="search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder={t("manga.searchVolume")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="submit">{t("common.search")}</button>
        <button
          type="button"
          className="scan-btn"
          onClick={() => setScanning(true)}
          aria-label={t("scan.button")}
          title={t("scan.button")}
        >
          📷
        </button>
        {results.length > 0 && (
          <button type="button" className="btn-small" onClick={clearSearch}>✕</button>
        )}
      </form>

      {scanning && (
        <BookScanner
          onFound={(shape) => { setScanning(false); setAddingResult(shape); }}
          onClose={() => setScanning(false)}
        />
      )}

      {searching && <p className="center">{t("common.loading")}</p>}
      {loadError && <p className="error">{loadError}</p>}

      {results.length > 0 ? (
        <div className="grid">
          {results.map((r) => {
            const cover = coverUrl(r.cover_url || r.cover_i);
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
      ) : loading ? (
        <p className="center">{t("common.loading")}</p>
      ) : series.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 30 }}>{t("manga.none")}</p>
      ) : (
        <>
          {inProgress.length > 0 && (
            <>
              <h3 className="section-pill">{t("manga.sectionInProgress")}</h3>
              {inProgress.map((s) => (
                <SeriesRow key={s.seriesName} s={s} onOpen={() => setOpenSeries(s.seriesName)} />
              ))}
            </>
          )}
          {upToDate.length > 0 && (
            <>
              <h3 className="section-pill">{t("manga.sectionUpToDate")}</h3>
              {upToDate.map((s) => (
                <SeriesRow key={s.seriesName} s={s} onOpen={() => setOpenSeries(s.seriesName)} />
              ))}
            </>
          )}
          {notStarted.length > 0 && (
            <>
              <h3 className="section-pill">{t("manga.sectionNotStarted")}</h3>
              {notStarted.map((s) => (
                <SeriesRow key={s.seriesName} s={s} onOpen={() => setOpenSeries(s.seriesName)} />
              ))}
            </>
          )}
        </>
      )}

      {addingResult && (
        <AddVolumeForm
          result={addingResult}
          onClose={() => setAddingResult(null)}
          onAdded={() => {
            setResults((prev) => prev.filter((r) => r.key !== addingResult.key));
            setAddingResult(null);
            load();
          }}
        />
      )}
    </div>
  );
}

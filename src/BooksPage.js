import { useState, useEffect } from "react";
import { getAllBooks, saveBook, removeBook, setBookSubjects } from "./bookStore";
import { searchBooks, getWork, coverUrl } from "./openlibrary";
import { searchBooksGoogle } from "./googlebooks";
import BookDetail from "./BookDetail";
import BookScanner from "./BookScanner";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

function toBookShape(result) {
  return {
    key: (result.key || "").replace(/^\/?works\//, ""),
    id: (result.key || "").replace(/^\/?works\//, ""),
    title: result.title,
    author: (result.author_name && result.author_name[0]) || null,
    author_name: result.author_name || [],
    authorKey: (result.author_key && result.author_key[0]) || null,
    author_key: result.author_key || [],
    cover_i: result.cover_i || null,
    cover_url: result.cover_url || null,
    first_publish_year: result.first_publish_year || null,
    subjects: result.subjects || [],
  };
}

// Un id commençant par "gb:" vient de Google Books : il n'a pas d'œuvre
// Open Library associée, donc pas de getWork() à tenter dessus.
function isOpenLibraryId(id) {
  return typeof id === "string" && /^OL\d+W$/i.test(id);
}

function sortBooks(list, sort) {
  const arr = [...list];
  switch (sort) {
    case "title":
      arr.sort((a, b) => (a.title || "").localeCompare(b.title || "", "fr"));
      break;
    case "note":
      arr.sort((a, b) => (b.note || 0) - (a.note || 0));
      break;
    case "year":
      arr.sort((a, b) => (b.first_publish_year || 0) - (a.first_publish_year || 0));
      break;
    default: // "recent"
      arr.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  return arr;
}

export default function BooksPage({ subTab, onSubTabChange }) {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("read"); // read | toread
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [openBook, setOpenBook] = useState(null);
  const [scanning, setScanning] = useState(false);

  useBackClose(!!openBook, () => setOpenBook(null));

  const [sort, setSort] = useState("recent");
  const [filter, setFilter] = useState("");
  const [controlsOpen, setControlsOpen] = useState(false);
  useBackClose(controlsOpen, () => setControlsOpen(false));

  const reload = async () => {
    setLoading(true);
    try {
      const all = await getAllBooks();
      setBooks(all);
      backfillSubjects(all);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Rattrapage silencieux des sujets (genre-équivalent) manquants, par
  // petits paquets — même logique que pour les films.
  const backfillSubjects = async (all) => {
    const missing = all.filter(
      (b) => !(b.subjects && b.subjects.length) && isOpenLibraryId(b.id)
    );
    const CHUNK = 3;
    for (let i = 0; i < missing.length; i += CHUNK) {
      const chunk = missing.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map(async (b) => {
          try {
            const full = await getWork(b.id);
            const subjects = (full.subjects || []).slice(0, 20);
            if (subjects.length === 0) return;
            await setBookSubjects(b.id, subjects);
            setBooks((prev) =>
              prev.map((bk) => (bk.id === b.id ? { ...bk, subjects } : bk))
            );
          } catch {
            // ignore, on retentera au prochain chargement
          }
        })
      );
      if (i + CHUNK < missing.length) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      // Google Books d'abord (meilleure couverture FR). Son échec (quota,
      // réseau…) ne doit jamais bloquer la recherche : on retombe alors sur
      // Open Library. On ne remonte une erreur que si les DEUX échouent.
      let list = [];
      let googleFailed = false;
      try {
        list = await searchBooksGoogle(query.trim());
      } catch {
        googleFailed = true;
      }
      if (list.length === 0) {
        const data = await searchBooks(query.trim());
        list = (data.docs || []).filter((d) => d.title);
      }
      // (googleFailed sert seulement à ne pas masquer un vrai souci réseau)
      void googleFailed;
      setResults(list);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
  };

  const addAsRead = async (result) => {
    const shape = toBookShape(result);
    let subjects = shape.subjects;
    // Les sujets ne se complètent via getWork que pour un id Open Library ;
    // les résultats Google Books portent déjà leurs catégories.
    if ((!subjects || !subjects.length) && isOpenLibraryId(shape.id)) {
      try {
        const full = await getWork(shape.id);
        subjects = (full.subjects || []).slice(0, 20);
      } catch {}
    }
    await saveBook({ ...shape, subjects }, "read", new Date().toISOString().slice(0, 10));
    clearSearch();
    reload();
  };

  const addToToRead = async (result) => {
    await saveBook(toBookShape(result), "toread");
    clearSearch();
    reload();
  };

  const markRead = async (book) => {
    let subjects = book.subjects;
    if ((!subjects || !subjects.length) && isOpenLibraryId(book.id)) {
      try {
        const full = await getWork(book.id);
        subjects = (full.subjects || []).slice(0, 20);
      } catch {}
    }
    await saveBook({ ...book, subjects }, "read", new Date().toISOString().slice(0, 10));
    reload();
  };

  const handleRemove = async (bookId) => {
    await removeBook(bookId);
    reload();
  };

  const handleRated = (bookId, rating) => {
    const known = books.some((b) => b.id === bookId);
    if (!known) {
      reload();
    } else {
      setBooks((prev) =>
        prev.map((b) =>
          b.id === bookId
            ? {
                ...b,
                note: rating ? rating.note : null,
                comment: rating ? rating.comment : "",
                status: rating ? "read" : b.status,
              }
            : b
        )
      );
    }
    setOpenBook((prev) =>
      prev && (prev.id === bookId || prev.key === bookId)
        ? { ...prev, note: rating ? rating.note : null, comment: rating ? rating.comment : "" }
        : prev
    );
  };

  const read = books.filter((b) => b.status === "read");
  const toRead = books.filter((b) => b.status === "toread");

  const base = view === "read" ? read : toRead;
  const f = filter.trim().toLowerCase();
  const filtered = base.filter((b) => !f || (b.title || "").toLowerCase().includes(f));
  const shown = sortBooks(filtered, sort);

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
          placeholder={t("books.searchBook")}
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
          <button type="button" className="btn-small" onClick={clearSearch}>
            ✕
          </button>
        )}
      </form>

      {scanning && (
        <BookScanner
          onFound={(shape) => { setScanning(false); setResults([shape]); }}
          onClose={() => setScanning(false)}
        />
      )}

      {searching && <p className="center">{t("common.loading")}</p>}

      {results.length > 0 ? (
        <>
          <h3 className="section-title">{t("common.results")}</h3>
          <div className="grid">
            {results.map((result) => {
              const shape = toBookShape(result);
              const cover = coverUrl(result.cover_url || result.cover_i);
              return (
                <div key={shape.id} className="card movie-result">
                  <div onClick={() => setOpenBook(result)}>
                    {cover ? (
                      <img src={cover} alt={shape.title} />
                    ) : (
                      <div className="no-poster">{t("common.noPoster")}</div>
                    )}
                    <div className="card-title">{shape.title}</div>
                    <div className="card-year">{shape.first_publish_year || "—"}</div>
                  </div>
                  <div className="movie-actions">
                    <button className="btn-small" onClick={() => addAsRead(result)}>
                      {t("books.read")}
                    </button>
                    <button className="btn-small" onClick={() => addToToRead(result)}>
                      {t("books.toRead")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="subtabs-row">
            <div className="movie-tabs">
              <button
                className={view === "read" ? "movie-tab active" : "movie-tab"}
                onClick={() => setView("read")}
              >
                {t("books.read")} ({read.length})
              </button>
              <button
                className={view === "toread" ? "movie-tab active" : "movie-tab"}
                onClick={() => setView("toread")}
              >
                {t("books.toRead")} ({toRead.length})
              </button>
            </div>

            {base.length > 0 && (
              <div className="controls-menu-wrap">
                <button
                  className="controls-menu-trigger"
                  onClick={() => setControlsOpen((o) => !o)}
                  aria-label={t("books.controlsMenu")}
                >
                  ⋮
                  {(filter.trim() !== "" || sort !== "recent") && (
                    <span className="filter-trigger-dot controls-menu-trigger-dot" />
                  )}
                </button>
                {controlsOpen && (
                  <>
                    <div className="controls-menu-overlay" onClick={() => setControlsOpen(false)} />
                    <div className="controls-menu">
                      <input
                        type="text"
                        className="filter-input controls-menu-input"
                        placeholder={t("books.filterTitle")}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      <select
                        className="sort-select controls-menu-select"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="recent">{t("sort.recent")}</option>
                        <option value="title">{t("sort.title")}</option>
                        <option value="note">{t("sort.note")}</option>
                        <option value="year">{t("sort.year")}</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <p className="center">{t("common.loading")}</p>
          ) : shown.length === 0 ? (
            <p className="muted" style={{ textAlign: "center", marginTop: 30 }}>
              {base.length === 0
                ? view === "read"
                  ? t("books.noneRead")
                  : t("books.noneToRead")
                : t("books.noneFilter")}
            </p>
          ) : (
            <div className="grid">
              {shown.map((book) => {
                const cover = coverUrl(book.cover_url || book.cover_i);
                return (
                  <div key={book.id} className="card">
                    <div onClick={() => setOpenBook(book)}>
                      {cover ? (
                        <img src={cover} alt={book.title} />
                      ) : (
                        <div className="no-poster">{t("common.noPoster")}</div>
                      )}
                      <div className="card-title">
                        {book.title}
                        {book.note > 0 && (
                          <span className="ep-rating-badge"> ★ {book.note}</span>
                        )}
                      </div>
                      <div className="card-year">{book.first_publish_year || "—"}</div>
                    </div>
                    <div className="movie-actions">
                      {view === "toread" && (
                        <button className="btn-small" onClick={() => markRead(book)}>
                          {t("books.read")}
                        </button>
                      )}
                      <button className="btn-small" onClick={() => handleRemove(book.id)}>
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {openBook && (
        <BookDetail
          book={openBook}
          onClose={() => setOpenBook(null)}
          onRated={handleRated}
          onOpenBook={(b) => setOpenBook(b)}
        />
      )}
    </div>
  );
}

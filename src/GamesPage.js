import { useState, useEffect } from "react";
import { getAllGames, saveGame, removeGame } from "./gameStore";
import { searchGames, getGame, studioOf } from "./rawg";
import GameDetail from "./GameDetail";
import { GAME_GENRES, gameMatchesGenre } from "./gameGenres";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

function sortGames(list, sort) {
  const arr = [...list];
  switch (sort) {
    case "name":
      arr.sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr"));
      break;
    case "note":
      arr.sort((a, b) => (b.note || 0) - (a.note || 0));
      break;
    case "year":
      arr.sort((a, b) => (b.release_year || 0) - (a.release_year || 0));
      break;
    default: // "recent"
      arr.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
  return arr;
}

export default function GamesPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("done"); // done | todo
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [openGame, setOpenGame] = useState(null);

  useBackClose(!!openGame, () => setOpenGame(null));

  const [sort, setSort] = useState("recent");
  const [filter, setFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [controlsOpen, setControlsOpen] = useState(false);
  useBackClose(controlsOpen, () => setControlsOpen(false));

  const reload = async () => {
    setLoading(true);
    try {
      const all = await getAllGames();
      setGames(all);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const list = await searchGames(query.trim());
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

  // Complète le studio depuis la fiche RAWG (absent des résultats de
  // recherche) au moment de l'ajout, sans bloquer si l'appel échoue.
  const withStudio = async (result) => {
    let studio = null;
    let genres = result.genres || [];
    try {
      const full = await getGame(result.id);
      studio = studioOf(full);
      if (full.genres && full.genres.length > 0) genres = full.genres.map((g) => g.name);
    } catch {}
    return { ...result, studio, genres };
  };

  const addAsDone = async (result) => {
    const g = await withStudio(result);
    await saveGame(g, "done", new Date().toISOString().slice(0, 10));
    clearSearch();
    reload();
  };

  const addToTodo = async (result) => {
    const g = await withStudio(result);
    await saveGame(g, "todo");
    clearSearch();
    reload();
  };

  const markDone = async (game) => {
    await saveGame(game, "done", new Date().toISOString().slice(0, 10));
    reload();
  };

  const handleRemove = async (gameId) => {
    await removeGame(gameId);
    reload();
  };

  const handleRated = (gameId, rating) => {
    setGames((prev) =>
      prev.map((g) =>
        String(g.id) === String(gameId)
          ? {
              ...g,
              note: rating ? rating.note : null,
              comment: rating ? rating.comment : "",
              status: rating ? "done" : g.status,
            }
          : g
      )
    );
    setOpenGame((prev) =>
      prev && String(prev.id) === String(gameId)
        ? { ...prev, note: rating ? rating.note : null, comment: rating ? rating.comment : "" }
        : prev
    );
  };

  const done = games.filter((g) => g.status === "done");
  const todo = games.filter((g) => g.status === "todo");

  const base = view === "done" ? done : todo;
  const f = filter.trim().toLowerCase();
  const filtered = base.filter(
    (g) =>
      (!f || (g.name || "").toLowerCase().includes(f)) &&
      gameMatchesGenre(g.genres, genreFilter)
  );
  const shown = sortGames(filtered, sort);

  return (
    <div>
      <form className="search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder={t("game.searchGame")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="submit">{t("common.search")}</button>
        {results.length > 0 && (
          <button type="button" className="btn-small" onClick={clearSearch}>✕</button>
        )}
      </form>

      {searching && <p className="center">{t("common.loading")}</p>}

      {results.length > 0 ? (
        <>
          <h3 className="section-title">{t("common.results")}</h3>
          <div className="grid">
            {results.map((result) => (
              <div key={result.id} className="card movie-result">
                <div onClick={() => setOpenGame(result)}>
                  {result.cover_url ? (
                    <img src={result.cover_url} alt={result.name} />
                  ) : (
                    <div className="no-poster">{t("common.noPoster")}</div>
                  )}
                  <div className="card-title">{result.name}</div>
                  <div className="card-year">{result.release_year || "—"}</div>
                </div>
                <div className="movie-actions">
                  <button className="btn-small" onClick={() => addAsDone(result)}>
                    {t("game.done")}
                  </button>
                  <button className="btn-small" onClick={() => addToTodo(result)}>
                    {t("game.todo")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="subtabs-row">
            <div className="movie-tabs">
              <button
                className={view === "done" ? "movie-tab active" : "movie-tab"}
                onClick={() => setView("done")}
              >
                {t("game.done")} ({done.length})
              </button>
              <button
                className={view === "todo" ? "movie-tab active" : "movie-tab"}
                onClick={() => setView("todo")}
              >
                {t("game.todo")} ({todo.length})
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
                  {(filter.trim() !== "" || sort !== "recent" || genreFilter !== "") && (
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
                        placeholder={t("game.filterName")}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                      <select
                        className="sort-select controls-menu-select"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="recent">{t("sort.recent")}</option>
                        <option value="name">{t("sort.title")}</option>
                        <option value="note">{t("sort.note")}</option>
                        <option value="year">{t("sort.year")}</option>
                      </select>
                      <select
                        className="sort-select controls-menu-select"
                        value={genreFilter}
                        onChange={(e) => setGenreFilter(e.target.value)}
                      >
                        <option value="">{t("game.allGenres")}</option>
                        {GAME_GENRES.map((g) => (
                          <option key={g.id} value={g.id}>{t(`gameGenre.${g.id}`)}</option>
                        ))}
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
                ? view === "done"
                  ? t("game.noneDone")
                  : t("game.noneTodo")
                : t("game.noneFilter")}
            </p>
          ) : (
            <div className="grid">
              {shown.map((game) => (
                <div key={game.id} className="card">
                  <div onClick={() => setOpenGame(game)}>
                    {game.cover_url ? (
                      <img src={game.cover_url} alt={game.name} />
                    ) : (
                      <div className="no-poster">{t("common.noPoster")}</div>
                    )}
                    <div className="card-title">
                      {game.name}
                      {game.note > 0 && <span className="ep-rating-badge"> ★ {game.note}</span>}
                    </div>
                    <div className="card-year">{game.release_year || "—"}</div>
                  </div>
                  <div className="movie-actions">
                    {view === "todo" && (
                      <button className="btn-small" onClick={() => markDone(game)}>
                        {t("game.done")}
                      </button>
                    )}
                    <button className="btn-small" onClick={() => handleRemove(game.id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="muted small" style={{ textAlign: "center", marginTop: 20, opacity: 0.6 }}>
            {t("game.rawgCredit")}
          </p>
        </>
      )}

      {openGame && (
        <GameDetail
          game={openGame}
          onClose={() => setOpenGame(null)}
          onRated={handleRated}
        />
      )}
    </div>
  );
}

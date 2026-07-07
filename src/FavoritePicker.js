import { useState } from "react";
import { searchShows, searchMovies, posterUrl } from "./tmdb";
import { addFavoriteShow, addFavoriteMovie } from "./store";
import MovieDetail from "./MovieDetail";
import { t } from "./i18n";

export default function FavoritePicker({ type, onBack, onOpenShow }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [added, setAdded] = useState([]);
  const [openMovie, setOpenMovie] = useState(null);

  const isShow = type === "show";

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = isShow
        ? await searchShows(query.trim())
        : await searchMovies(query.trim());
      setResults(data.results || []);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (item) => {
    if (isShow) await addFavoriteShow(item);
    else await addFavoriteMovie(item);
    setAdded((prev) => [...prev, item.id]);
  };

  const openDetail = (item) => {
    if (isShow) {
      if (onOpenShow) onOpenShow(item);
    } else {
      setOpenMovie(item);
    }
  };

  return (
    <div className="detail">
      <button className="btn-small back" onClick={onBack}>{t("common.back")}</button>
      <h2>{isShow ? t("fav.addShow") : t("fav.addMovie")}</h2>

      <form className="search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder={isShow ? t("common.searchShow") : t("movies.searchMovie")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="submit">{t("common.search")}</button>
      </form>

      {searching && <p className="center">{t("common.loading")}</p>}

      <div className="grid">
        {results.map((item) => {
          const title = isShow ? item.name : item.title;
          const isAdded = added.includes(item.id);
          return (
            <div key={item.id} className="card">
              <div onClick={() => openDetail(item)}>
                {posterUrl(item.poster_path) ? (
                  <img src={posterUrl(item.poster_path)} alt={title} />
                ) : (
                  <div className="no-poster">{t("common.noPoster")}</div>
                )}
                <div className="card-title">{title}</div>
              </div>
              <div className="movie-actions">
                <button
                  className="btn-small"
                  onClick={() => handleAdd(item)}
                  disabled={isAdded}
                >
                  {isAdded ? t("fav.added") : t("fav.add")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {openMovie && (
        <MovieDetail
          movie={openMovie}
          onClose={() => setOpenMovie(null)}
        />
      )}
    </div>
  );
}

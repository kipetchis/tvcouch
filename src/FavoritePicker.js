import { useState } from "react";
import { searchShows, searchMovies, posterUrl } from "./tmdb";
import { addFavoriteShow, addFavoriteMovie } from "./store";
import MovieDetail from "./MovieDetail";

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
      <button className="btn-small back" onClick={onBack}>← Retour</button>
      <h2>{isShow ? "Ajouter une série préférée" : "Ajouter un film préféré"}</h2>

      <form className="search" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder={isShow ? "Rechercher une série…" : "Rechercher un film…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" type="submit">Rechercher</button>
      </form>

      {searching && <p className="center">Recherche…</p>}

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
                  <div className="no-poster">Pas d'affiche</div>
                )}
                <div className="card-title">{title}</div>
              </div>
              <div className="movie-actions">
                <button
                  className="btn-small"
                  onClick={() => handleAdd(item)}
                  disabled={isAdded}
                >
                  {isAdded ? "✓ Ajouté" : "❤️ Ajouter"}
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

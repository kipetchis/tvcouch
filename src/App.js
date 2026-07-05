import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { searchShows, posterUrl } from "./tmdb";
import ShowDetail from "./ShowDetail";
import ShowsPage from "./ShowsPage";
import UpcomingPage from "./UpcomingPage";
import ImportPage from "./ImportPage";
import MoviesPage from "./MoviesPage";
import MovieImport from "./MovieImport";
import ProfilePage from "./ProfilePage";
import FavoritePicker from "./FavoritePicker";
import ExplorerPage from "./ExplorerPage";
import "./App.css";

// Logo de l'app (même image que l'icône PWA)
function Logo({ size = 30 }) {
  return (
    <img
      src={process.env.PUBLIC_URL + "/logo192.png"}
      alt="🛋️"
      style={{
        height: size,
        width: size,
        verticalAlign: "middle",
        marginRight: 8,
        borderRadius: 6,
        objectFit: "cover",
      }}
    />
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tab, setTab] = useState("shows");
  const [showsSubTab, setShowsSubTab] = useState("towatch"); // towatch | upcoming
  const [selectedShow, setSelectedShow] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showMovieImport, setShowMovieImport] = useState(false);
  const [favPicker, setFavPicker] = useState(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError("Échec de la connexion : " + e.message);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const data = await searchShows(query.trim());
      setResults(data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
  };

  if (authLoading) return <div className="center">Chargement…</div>;

  if (!user) {
    return (
      <div className="center">
        <h1>
          <Logo size={40} />
          Tv Couch
        </h1>
        <p>Suivez vos séries et films.</p>
        <button className="btn" onClick={handleLogin}>
          Se connecter avec Google
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (favPicker) {
    return (
      <div className="app">
        <FavoritePicker type={favPicker} onBack={() => setFavPicker(null)} />
      </div>
    );
  }

  if (showImport) {
    return (
      <div className="app">
        <button className="btn-small back" onClick={() => setShowImport(false)}>
          ← Retour
        </button>
        <ImportPage onDone={() => setShowImport(false)} />
      </div>
    );
  }

  if (showMovieImport) {
    return (
      <div className="app">
        <button className="btn-small back" onClick={() => setShowMovieImport(false)}>
          ← Retour
        </button>
        <MovieImport onDone={() => { setShowMovieImport(false); setTab("movies"); }} />
      </div>
    );
  }

  if (selectedShow) {
    return (
      <div className="app">
        <ShowDetail show={selectedShow} onBack={() => setSelectedShow(null)} />
      </div>
    );
  }

  return (
    <div className="app with-tabs">
      <header className="header">
        <h1>
          <Logo />
          Tv Couch
        </h1>
        <div className="user">
          <span>{user.displayName}</span>
          <button className="btn-small" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </header>

      {tab === "shows" && (
        <>
          <form className="search" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Rechercher une série…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn" type="submit">Rechercher</button>
            {results.length > 0 && (
              <button type="button" className="btn-small" onClick={clearSearch}>
                ✕
              </button>
            )}
          </form>

          {searching && <p className="center">Recherche…</p>}
          {error && <p className="error">{error}</p>}

          {results.length > 0 ? (
            <>
              <h3 className="section-title">Résultats</h3>
              <div className="grid">
                {results.map((show) => (
                  <div
                    key={show.id}
                    className="card"
                    onClick={() => setSelectedShow(show)}
                  >
                    {posterUrl(show.poster_path) ? (
                      <img src={posterUrl(show.poster_path)} alt={show.name} />
                    ) : (
                      <div className="no-poster">Pas d'affiche</div>
                    )}
                    <div className="card-title">{show.name}</div>
                    <div className="card-year">
                      {show.first_air_date ? show.first_air_date.slice(0, 4) : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="movie-tabs">
                <button
                  className={showsSubTab === "towatch" ? "movie-tab active" : "movie-tab"}
                  onClick={() => setShowsSubTab("towatch")}
                >
                  À voir
                </button>
                <button
                  className={showsSubTab === "upcoming" ? "movie-tab active" : "movie-tab"}
                  onClick={() => setShowsSubTab("upcoming")}
                >
                  À venir
                </button>
              </div>
              {showsSubTab === "towatch" ? (
                <ShowsPage onOpenShow={setSelectedShow} />
              ) : (
                <UpcomingPage onOpenShow={setSelectedShow} />
              )}
            </>
          )}
        </>
      )}

      {tab === "movies" && <MoviesPage />}
      {tab === "explore" && <ExplorerPage onOpenShow={setSelectedShow} />}
      {tab === "profile" && (
        <ProfilePage
          user={user}
          onImportShows={() => setShowImport(true)}
          onImportMovies={() => setShowMovieImport(true)}
          onOpenFavorites={(type) => setFavPicker(type)}
        />
      )}

      <nav className="tabbar">
        <button
          className={tab === "shows" ? "tab active" : "tab"}
          onClick={() => setTab("shows")}
        >
          <span className="tab-icon">📺</span>
          Séries
        </button>
        <button
          className={tab === "movies" ? "tab active" : "tab"}
          onClick={() => setTab("movies")}
        >
          <span className="tab-icon">🎬</span>
          Films
        </button>
        <button
          className={tab === "explore" ? "tab active" : "tab"}
          onClick={() => setTab("explore")}
        >
          <span className="tab-icon">🔍</span>
          Explorer
        </button>
        <button
          className={tab === "profile" ? "tab active" : "tab"}
          onClick={() => setTab("profile")}
        >
          <span className="tab-icon">👤</span>
          Profil
        </button>
      </nav>
    </div>
  );
}

export default App;

import { useState, useEffect } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import {
  auth, googleProvider,
  registerWithEmail, loginWithEmail, resetPassword, authErrorMessage,
} from "./firebase";
import { searchShows, posterUrl } from "./tmdb";
import ShowDetail from "./ShowDetail";
import ShowsPage from "./ShowsPage";
import UpcomingPage from "./UpcomingPage";
import ImportPage from "./ImportPage";
import MoviesPage from "./MoviesPage";
import MovieImport from "./MovieImport";
import ImdbImport from "./ImdbImport";
import ProfilePage from "./ProfilePage";
import FavoritePicker from "./FavoritePicker";
import ExplorerPage from "./ExplorerPage";
import ScrollTopButton from "./ScrollTopButton";
import { useLang, t } from "./i18n";
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

// Écran de connexion : email/mot de passe + Google
function LoginScreen({ onGoogle }) {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setError(t("login.fillFields"));
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") {
        await registerWithEmail(email.trim(), password);
      } else {
        await loginWithEmail(email.trim(), password);
      }
      // La connexion réussie déclenche onAuthStateChanged → l'app s'affiche
    } catch (err) {
      setError(authErrorMessage(err.code));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError(t("login.resetNeedEmail"));
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email.trim());
      setInfo(t("login.resetSent"));
    } catch (err) {
      setError(authErrorMessage(err.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <h1>
        <Logo size={40} />
        Tv Couch
      </h1>
      <p className="muted">{t("login.tagline")}</p>

      <form className="login-form" onSubmit={submit}>
        <input
          type="email"
          className="filter-input login-input"
          placeholder={t("login.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          type="password"
          className="filter-input login-input"
          placeholder={t("login.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
        />
        <button className="btn login-submit" type="submit" disabled={busy}>
          {busy
            ? "…"
            : mode === "register"
            ? t("login.createAccount")
            : t("login.signIn")}
        </button>
      </form>

      {mode === "login" && (
        <button className="link-btn" onClick={handleReset}>
          {t("login.forgot")}
        </button>
      )}

      {error && <p className="error">{error}</p>}
      {info && <p className="login-info">{info}</p>}

      <p className="muted small login-switch">
        {mode === "login" ? t("login.noAccount") : t("login.hasAccount")}{" "}
        <button
          className="link-btn"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "login" ? t("login.createLink") : t("login.signIn")}
        </button>
      </p>

      <div className="login-sep"><span>{t("login.or")}</span></div>

      <button className="btn-small login-google" onClick={onGoogle}>
        {t("login.google")}
      </button>
    </div>
  );
}

function App() {
  useLang(); // re-render toute l'app quand la langue change
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tab, setTab] = useState("shows");
  const [showsSubTab, setShowsSubTab] = useState("towatch"); // towatch | upcoming
  const [selectedShow, setSelectedShow] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showMovieImport, setShowMovieImport] = useState(false);
  const [showImdbImport, setShowImdbImport] = useState(false);
  const [favPicker, setFavPicker] = useState(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) setError(null); // connexion réussie : on efface toute erreur résiduelle
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      // L'utilisateur a simplement fermé/annulé la popup : pas une vraie erreur
      if (
        e.code === "auth/popup-closed-by-user" ||
        e.code === "auth/cancelled-popup-request"
      ) {
        return;
      }
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
    return <LoginScreen onGoogle={handleLogin} />;
  }

  if (favPicker) {
    return (
      <div className="app">
        <FavoritePicker
          type={favPicker}
          onBack={() => setFavPicker(null)}
          onOpenShow={(show) => { setFavPicker(null); setSelectedShow(show); }}
        />
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

  if (showImdbImport) {
    return (
      <div className="app">
        <button className="btn-small back" onClick={() => setShowImdbImport(false)}>
          ← Retour
        </button>
        <ImdbImport onDone={() => { setShowImdbImport(false); setTab("movies"); }} />
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
            {t("common.logout")}
          </button>
        </div>
      </header>

      {tab === "shows" && (
        <>
          <form className="search" onSubmit={handleSearch}>
            <input
              type="text"
              placeholder={t("common.searchShow")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn" type="submit">{t("common.search")}</button>
            {results.length > 0 && (
              <button type="button" className="btn-small" onClick={clearSearch}>
                ✕
              </button>
            )}
          </form>

          {searching && <p className="center">{t("common.loading")}</p>}
          {error && <p className="error">{error}</p>}

          {results.length > 0 ? (
            <>
              <h3 className="section-title">{t("common.results")}</h3>
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
                      <div className="no-poster">{t("common.noPoster")}</div>
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
                  {t("common.toWatch")}
                </button>
                <button
                  className={showsSubTab === "upcoming" ? "movie-tab active" : "movie-tab"}
                  onClick={() => setShowsSubTab("upcoming")}
                >
                  {t("common.upcoming")}
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
          onImportImdb={() => setShowImdbImport(true)}
          onOpenFavorites={(type) => setFavPicker(type)}
          onOpenShow={setSelectedShow}
        />
      )}

      <ScrollTopButton />

      <nav className="tabbar">
        <button
          className={tab === "shows" ? "tab active" : "tab"}
          onClick={() => setTab("shows")}
        >
          <span className="tab-icon">📺</span>
          {t("nav.shows")}
        </button>
        <button
          className={tab === "movies" ? "tab active" : "tab"}
          onClick={() => setTab("movies")}
        >
          <span className="tab-icon">🎬</span>
          {t("nav.movies")}
        </button>
        <button
          className={tab === "explore" ? "tab active" : "tab"}
          onClick={() => setTab("explore")}
        >
          <span className="tab-icon">🔍</span>
          {t("nav.explore")}
        </button>
        <button
          className={tab === "profile" ? "tab active" : "tab"}
          onClick={() => setTab("profile")}
        >
          <span className="tab-icon">👤</span>
          {t("nav.profile")}
        </button>
      </nav>
    </div>
  );
}

export default App;

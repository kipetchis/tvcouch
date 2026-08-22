import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { getEditionByIsbn, getWork, getAuthor } from "./openlibrary";
import { findBookByIsbnGoogle } from "./googlebooks";
import { t } from "./i18n";
import { useBackClose } from "./backNav";

// Les codes-barres de livres sont des EAN-13 "Bookland", toujours préfixés
// par 978 ou 979 — ça permet d'ignorer silencieusement tout autre
// code-barres capturé par erreur (produit alimentaire, etc.)
function looksLikeIsbn(text) {
  return /^97[89]\d{10}$/.test(text || "");
}

export default function BookScanner({ onFound, onClose }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState("scanning"); // scanning | resolving | error
  const [error, setError] = useState(null);
  const [manualIsbn, setManualIsbn] = useState("");

  // Écran plein : s'enregistre lui-même dans la navigation retour/swipe,
  // comme les autres écrans "modaux" de l'app (fiche, popup...).
  useBackClose(true, onClose);

  useEffect(() => {
    // Lecteur multi-format par défaut : c'est celui qui détectait bien les
    // code-barres au départ. (Un essai de restriction EAN-13 uniquement
    // avait au contraire cassé la détection sur certains appareils.)
    const reader = new BrowserMultiFormatReader();
    let stopped = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (result) => {
          if (stopped || !result) return;
          const text = result.getText();
          if (!looksLikeIsbn(text)) return; // pas un ISBN, on continue de scanner
          stopped = true;
          try { reader.reset(); } catch {}
          resolveIsbn(text);
        }
      )
      .catch(() => {
        setStatus("error");
        setError(t("scan.cameraError"));
      });

    return () => {
      stopped = true;
      try { reader.reset(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveIsbn = async (isbn) => {
    setStatus("resolving");

    // 1) Google Books d'abord : meilleure couverture francophone, et le
    // résultat est déjà au bon format (normalize()), rien à reconstruire.
    try {
      const gb = await findBookByIsbnGoogle(isbn);
      if (gb) {
        onFound(gb);
        return;
      }
    } catch {
      // on tente Open Library en secours ci-dessous
    }

    // 2) Secours Open Library (édition -> œuvre -> auteur)
    try {
      const edition = await getEditionByIsbn(isbn);
      const workKey = edition.works && edition.works[0] && edition.works[0].key;
      const workId = workKey ? workKey.replace(/^\/?works\//, "") : null;

      let work = null;
      if (workId) {
        try { work = await getWork(workId); } catch {}
      }

      const authorKeyRaw =
        (edition.authors && edition.authors[0] && edition.authors[0].key) ||
        (work && work.authors && work.authors[0] && work.authors[0].author && work.authors[0].author.key) ||
        null;
      const authorKey = authorKeyRaw ? authorKeyRaw.replace(/^\/?authors\//, "") : null;

      let authorName = null;
      if (authorKey) {
        try {
          const author = await getAuthor(authorKey);
          authorName = author.name || null;
        } catch {}
      }

      const coverId =
        (edition.covers && edition.covers.find((c) => c > 0)) ||
        (work && work.covers && work.covers.find((c) => c > 0)) ||
        null;

      const yearMatch = (edition.publish_date || "").match(/\d{4}/);

      if (!workId && !edition.title) {
        setStatus("error");
        setError(t("scan.notFound"));
        return;
      }

      onFound({
        key: workId || isbn,
        title: (work && work.title) || edition.title,
        author_name: authorName ? [authorName] : [],
        author_key: authorKey ? [authorKey] : [],
        cover_i: coverId,
        first_publish_year: yearMatch ? Number(yearMatch[0]) : null,
      });
    } catch (e) {
      setStatus("error");
      setError(t("scan.notFound"));
    }
  };

  const retry = () => {
    setStatus("scanning");
    setError(null);
  };

  // Saisie manuelle : on retire tirets et espaces (les ISBN sont souvent
  // écrits "978-2-7234-6775-9"), puis on valide et on résout comme un scan.
  const submitManual = () => {
    const cleaned = manualIsbn.replace(/[\s-]/g, "");
    if (!looksLikeIsbn(cleaned)) {
      setError(t("scan.invalidIsbn"));
      setStatus("error");
      return;
    }
    resolveIsbn(cleaned);
  };

  return (
    <div className="ep-detail-overlay scanner-overlay" onClick={onClose}>
      <div className="scanner-box" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onClose}>✕</button>
        <video ref={videoRef} className="scanner-video" muted playsInline />
        {status === "scanning" && (
          <>
            <div className="scanner-frame" />
            <p className="scanner-hint">{t("scan.hint")}</p>
          </>
        )}
        {status === "resolving" && <p className="scanner-hint">{t("scan.resolving")}</p>}
        {status === "error" && (
          <div className="scanner-error">
            <p className="error">{error}</p>
            <button className="btn-small" onClick={retry}>{t("scan.retry")}</button>
          </div>
        )}
      </div>

      {/* Saisie manuelle : filet de sécurité si la caméra ne détecte pas
          le code-barres (mauvaise lumière, code abîmé, appareil capricieux). */}
      <div className="scanner-manual" onClick={(e) => e.stopPropagation()}>
        <div className="scanner-manual-label">{t("scan.manualLabel")}</div>
        <div className="scanner-manual-row">
          <input
            type="text"
            inputMode="numeric"
            className="filter-input"
            placeholder="978…"
            value={manualIsbn}
            onChange={(e) => setManualIsbn(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submitManual(); }}
          />
          <button className="btn" onClick={submitManual} disabled={!manualIsbn.trim()}>
            {t("scan.manualValidate")}
          </button>
        </div>
      </div>
    </div>
  );
}

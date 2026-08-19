import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/library";
import { getEditionByIsbn, getWork, getAuthor } from "./openlibrary";
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

  // Écran plein : s'enregistre lui-même dans la navigation retour/swipe,
  // comme les autres écrans "modaux" de l'app (fiche, popup...).
  useBackClose(true, onClose);

  useEffect(() => {
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

      // Même forme qu'un résultat de recherche Open Library, pour que
      // l'écran appelant puisse le traiter exactement comme s'il venait
      // d'une recherche par titre.
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

  return (
    <div className="ep-detail-overlay" onClick={onClose}>
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
    </div>
  );
}

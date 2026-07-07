import { useState, useEffect } from "react";
import { getShow, getMovie } from "./tmdb";
import { getLang } from "./i18n";

// Cache local des titres traduits, séparé par langue.
const PREFIX = "tvcouch_title_";
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours

function key(type, id) {
  return `${PREFIX}${getLang()}_${type}_${id}`;
}

function readTitle(type, id) {
  try {
    const raw = localStorage.getItem(key(type, id));
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !p.ts || Date.now() - p.ts > TTL) return null;
    return p.title || null;
  } catch {
    return null;
  }
}

function writeTitle(type, id, title) {
  try {
    localStorage.setItem(key(type, id), JSON.stringify({ ts: Date.now(), title }));
  } catch {
    // ignore
  }
}

async function fetchTitle(type, id) {
  if (type === "tv") {
    const d = await getShow(id);
    return d.name || null;
  }
  const d = await getMovie(id);
  return d.title || null;
}

// Affiche le titre d'une série (type="tv") ou d'un film (type="movie")
// traduit dans la langue courante. Repli sur `fallback` (titre stocké)
// le temps que la traduction se charge, puis mise en cache.
export default function TranslatedTitle({ type, id, fallback }) {
  const [title, setTitle] = useState(() => readTitle(type, id) || fallback);

  useEffect(() => {
    let active = true;
    const cached = readTitle(type, id);
    if (cached) {
      setTitle(cached);
      return;
    }
    fetchTitle(type, id)
      .then((tt) => {
        if (active && tt) {
          writeTitle(type, id, tt);
          setTitle(tt);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [type, id]);

  return <>{title}</>;
}

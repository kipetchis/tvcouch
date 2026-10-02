import { useState, useEffect } from "react";

// Gestion du thème de couleurs. Chaque "palette" est un jeu de variables CSS
// (fond, panneaux, accent…) défini dans App.css sous [data-theme="<id>"].
// On applique une palette en posant data-theme sur <html> ; le choix est
// mémorisé et prime sur le système.
const STORAGE_KEY = "tvcouch_theme";

// Palettes disponibles. `bg` et `accent` servent d'aperçu (pastilles) dans le
// sélecteur du profil ; `label` est une clé i18n.
export const PALETTES = [
  { id: "dark",        label: "theme.dark",       bg: "#0d0d0d", accent: "#f5c518" },
  { id: "orange-nuit", label: "theme.orangeNuit", bg: "#140b03", accent: "#4ea8ff" },
  { id: "ocean",       label: "theme.ocean",      bg: "#061018", accent: "#3fd0c9" },
  { id: "foret",       label: "theme.foret",      bg: "#07120a", accent: "#e7b73c" },
  { id: "rose",        label: "theme.rose",       bg: "#16070f", accent: "#ff6fae" },
  { id: "violet",      label: "theme.violet",     bg: "#0a0718", accent: "#22d3ee" },
];

const DEFAULT_ID = "dark";
const VALID_IDS = PALETTES.map((p) => p.id);

const listeners = new Set();

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_IDS.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  try {
    document.documentElement.setAttribute("data-theme", theme);
  } catch {
    // ignore (environnement sans document, ex. SSR)
  }
}

let currentTheme = readStoredTheme() || DEFAULT_ID;
applyTheme(currentTheme);

export function getTheme() {
  return currentTheme;
}

export function setTheme(theme) {
  if (!VALID_IDS.includes(theme)) return;
  currentTheme = theme;
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn());
}

// Hook React : re-render le composant qui l'utilise quand la palette change
// (ex. le menu profil, pour surligner la palette active).
export function useTheme() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return currentTheme;
}

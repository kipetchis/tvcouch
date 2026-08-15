import { useState, useEffect } from "react";

// Gestion du thème clair/sombre. Au tout premier lancement, on suit les
// réglages système (matchMedia). Dès que l'utilisateur choisit lui-même
// via le menu profil, ce choix est mémorisé et prime sur le système.
const STORAGE_KEY = "tvcouch_theme";

const listeners = new Set();

function systemPrefersLight() {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false;
  }
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
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

let currentTheme = readStoredTheme() || (systemPrefersLight() ? "light" : "dark");
applyTheme(currentTheme);

export function getTheme() {
  return currentTheme;
}

export function setTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;
  currentTheme = theme;
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn());
}

// Hook React : re-render le composant qui l'utilise quand le thème change
// (ex. le menu profil, pour surligner le bon bouton Sombre/Clair).
export function useTheme() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return currentTheme;
}

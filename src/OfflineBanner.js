import { useState, useEffect } from "react";
import { t } from "./i18n";

// Petit bandeau discret affiché en haut de l'app quand il n'y a pas de
// réseau. N'empêche rien : les écrans restent utilisables normalement
// (Firestore met les écritures en file d'attente), c'est juste un rappel
// visuel que la synchro reprendra au retour de la connexion.
export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return <div className="offline-banner">{t("offline.banner")}</div>;
}

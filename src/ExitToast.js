import { useState, useEffect, useRef } from "react";
import { onExitPrompt } from "./backNav";
import { t } from "./i18n";

// Petit toast en bas d'écran, affiché brièvement quand l'utilisateur
// appuie sur retour (ou swipe) alors qu'aucun écran secondaire n'est
// ouvert — lui laisse une seconde chance avant de vraiment quitter l'app.
export default function ExitToast() {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    const unsub = onExitPrompt(() => {
      setVisible(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setVisible(false), 2000);
    });
    return () => {
      unsub();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!visible) return null;

  return <div className="exit-toast">{t("app.exitPrompt")}</div>;
}

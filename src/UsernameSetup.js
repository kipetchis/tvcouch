import { useState } from "react";
import { claimUsername, isUsernameAvailable, isValidUsername } from "./social";
import { t } from "./i18n";

export default function UsernameSetup({ onDone, onCancel }) {
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // null | "available" | "taken" | "invalid"

  // Vérifie la disponibilité quand l'utilisateur arrête de taper un instant.
  const onChange = (value) => {
    setName(value);
    setStatus(null);
    if (!value) return;
    if (!isValidUsername(value)) {
      setStatus("invalid");
      return;
    }
    setChecking(true);
    // Petit debounce : on attend 400 ms après la dernière frappe.
    clearTimeout(window.__unameTimer);
    window.__unameTimer = setTimeout(async () => {
      const ok = await isUsernameAvailable(value);
      setChecking(false);
      setStatus(ok ? "available" : "taken");
    }, 400);
  };

  const handleSave = async () => {
    if (status !== "available") return;
    setSaving(true);
    const res = await claimUsername(name);
    setSaving(false);
    if (res.ok) {
      if (onDone) onDone(name.trim().toLowerCase());
    } else if (res.reason === "taken") {
      setStatus("taken");
    } else {
      setStatus("invalid");
    }
  };

  return (
    <div className="ep-detail-overlay" onClick={onCancel}>
      <div className="ep-detail" onClick={(e) => e.stopPropagation()}>
        <button className="btn-small ep-detail-close" onClick={onCancel}>✕</button>

        <div className="ep-detail-body">
          <h2 className="ep-detail-title">{t("social.chooseUsername")}</h2>
          <p className="muted small" style={{ marginBottom: 16 }}>
            {t("social.usernameHint")}
          </p>

          <input
            type="text"
            className="filter-input"
            placeholder={t("social.usernamePlaceholder")}
            value={name}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
            maxLength={20}
            style={{ width: "100%", marginBottom: 8 }}
          />

          <div style={{ minHeight: 22, marginBottom: 12 }}>
            {checking && <span className="muted small">{t("social.checking")}</span>}
            {!checking && status === "available" && (
              <span className="small" style={{ color: "var(--success)" }}>
                ✓ {t("social.available")}
              </span>
            )}
            {!checking && status === "taken" && (
              <span className="small error">✕ {t("social.taken")}</span>
            )}
            {!checking && status === "invalid" && (
              <span className="small error">{t("social.invalidUsername")}</span>
            )}
          </div>

          <button
            className="btn"
            onClick={handleSave}
            disabled={saving || status !== "available"}
            style={{ width: "100%" }}
          >
            {saving ? t("common.loading") : t("social.confirmUsername")}
          </button>
        </div>
      </div>
    </div>
  );
}

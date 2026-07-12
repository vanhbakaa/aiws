import { useEffect, useRef, useState } from "react";
import type { ProviderInfo } from "../../shared/contract";
import { useTr } from "../i18n";

// Dialog to add an AI account: pick a provider + name it. On create the parent makes the account
// slot and opens a login terminal for it. Shown on empty-state boot (0 accounts) and from the
// accounts panel / Ctrl+A. Replaces the old auto "account-N" + "direct" flow.
export function AddAccountDialog({
  providers,
  defaultProvider,
  onCreate,
  onClose,
}: {
  providers: ProviderInfo[];
  defaultProvider?: string;
  onCreate: (providerId: string, label: string) => void;
  onClose: () => void;
}) {
  const t = useTr();
  const aiProviders = providers.filter((p) => p.hasAccounts);
  const [providerId, setProviderId] = useState(defaultProvider ?? aiProviders[0]?.id ?? "claude");
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const l = label.trim();
    if (l) onCreate(providerId, l);
  };

  // Esc closes; keep keys off the underlying xterm.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal add-acct-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{t("addAccountTitle")}</div>
        <div className="add-acct-body">
          <label className="fld">
            <span>{t("provider")}</span>
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              {aiProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}
                  {p.installed ? "" : " · " + t("notInstalledShort")}
                </option>
              ))}
            </select>
          </label>
          <label className="fld">
            <span>{t("accountNameLabel")}</span>
            <input
              ref={inputRef}
              value={label}
              placeholder={t("accountNamePlaceholder")}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </label>
          <div className="add-acct-hint">{t("addAccountHint")}</div>
        </div>
        <div className="add-acct-foot">
          <button className="primary" onClick={submit} disabled={!label.trim()}>
            {t("create")}
          </button>
          <button onClick={onClose}>{t("cancel")}</button>
        </div>
      </div>
    </div>
  );
}

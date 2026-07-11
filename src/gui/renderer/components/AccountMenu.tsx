import { useEffect, useState } from "react";
import type { AccountInfo, TabSnapshot } from "../../shared/contract";
import { useTr } from "../i18n";

// Ctrl+S account switcher (Layer-2 modal). Rows: 0 = "(trực tiếp)", 1..N = accounts. Capture-phase
// keydown so ↑↓/Enter/Esc never reach the underlying xterm.
export function AccountMenu({
  tab,
  onClose,
  onSwitch,
}: {
  tab: TabSnapshot;
  onClose: () => void;
  onSwitch: (toLabel: string | undefined, toDirect: boolean) => void;
}) {
  const t = useTr();
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    window.aiws.listAccounts(tab.providerId).then(setAccounts);
  }, [tab.providerId]);

  const rows = accounts.length + 1;
  const pick = (i: number) => {
    if (i === 0) onSwitch(undefined, true);
    else onSwitch(accounts[i - 1].label, false);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (e.key === "Escape") {
        stop();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "j") {
        stop();
        setSel((s) => (s + 1) % rows);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        stop();
        setSel((s) => (s - 1 + rows) % rows);
      } else if (e.key === "Enter") {
        stop();
        pick(sel);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const direct = !tab.accountLabel;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{t("switchAccountTitle")} · {tab.providerId}</div>
        <div
          className={"acct-item" + (sel === 0 ? " sel" : "")}
          onClick={() => pick(0)}
          onMouseEnter={() => setSel(0)}
        >
          <span className="dot" style={{ background: "var(--amber)" }} /> {t("directParen")}
          {direct ? `  · ${t("inUse")}` : ""}
        </div>
        {accounts.map((a, i) => (
          <div
            key={a.label}
            className={"acct-item" + (sel === i + 1 ? " sel" : "")}
            onClick={() => pick(i + 1)}
            onMouseEnter={() => setSel(i + 1)}
          >
            <span className="dot" style={{ background: "var(--green)" }} /> {a.label}
            {a.label === tab.accountLabel ? `  · ${t("inUse")}` : ""}
          </div>
        ))}
        {accounts.length === 0 && <div className="muted" style={{ padding: "4px 10px" }}>{t("noAccounts")}</div>}
        <div className="modal-hint">{t("menuNav")}</div>
      </div>
    </div>
  );
}

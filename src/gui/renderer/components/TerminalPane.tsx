import { forwardRef } from "react";
import type { TabSnapshot } from "../../shared/contract";
import { useTr } from "../i18n";

// The middle column: chat header for the active tab + the imperative xterm host (registry appends
// per-tab layers here). Welcome overlay when there are no tabs.
export const TerminalPane = forwardRef<
  HTMLDivElement,
  { active?: TabSnapshot; hasTabs: boolean; onOpenFolder: () => void }
>(function TerminalPane({ active, hasTabs, onOpenFolder }, hostRef) {
  const t = useTr();
  return (
    <div className="col mid">
      {active && (
        <div className="chathead">
          <span className="ttl">
            {active.projectName} · {active.providerId} · <span className="q">&quot;{active.title}&quot;</span>
          </span>
          {active.accountLabel && <span className="chip-sm acct">● {active.accountLabel}</span>}
        </div>
      )}
      <div className="term-host" ref={hostRef}>
        {!hasTabs && (
          <div className="welcome">
            <h2>AI Workspace</h2>
            <div className="muted">{t("welcomeSub")}</div>
            <button onClick={onOpenFolder}>📂 {t("openFolderBtn")}</button>
          </div>
        )}
      </div>
    </div>
  );
});

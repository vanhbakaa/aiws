import type { PanelSnapshot, TabSnapshot } from "../../shared/contract";
import { kfmt } from "./util";
import { Meter, UsageBars } from "./usage";
import { useTr } from "../i18n";

// Live right panel, fed by the main-process poller (panel:data). Falls back to the tab snapshot's
// account/model/effort until the first PanelSnapshot for this tab arrives.
export function ContextPanel({
  active,
  panel,
  onOpenAccounts,
  onAddAccount,
}: {
  active?: TabSnapshot;
  panel: PanelSnapshot | null;
  onOpenAccounts?: () => void;
  onAddAccount?: () => void;
}) {
  const t = useTr();
  if (!active) {
    return (
      <div className="col right">
        <div className="collabel">{t("context")}</div>
        <div className="sect">
          <div className="acct-line linkbtn" onClick={onOpenAccounts}>
            <span className="dot" style={{ background: "var(--muted, #888)" }} />
            <span className="who2">{t("accountsTitle")}</span>
          </div>
          <div className="actline">
            <span className="linkbtn" onClick={onAddAccount}>
              <kbd>Ctrl+A</kbd> {t("addAccount")}
            </span>
          </div>
        </div>
      </div>
    );
  }
  if (active.providerId === "shell") {
    return (
      <div className="col right">
        <div className="collabel">{t("context")} · {active.projectName}</div>
        <div className="sect">
          <div className="muted">{t("shellIsolated")}</div>
        </div>
      </div>
    );
  }
  const p = panel && panel.tabId === active.id ? panel : null;
  return (
    <div className="col right">
      <div className="collabel">{t("context")} · {active.projectName}</div>
      <div className="scroll">
        <div className="sect">
          <div className="slabel">{t("aiAccount")}</div>
          <div className="acct-line linkbtn" onClick={onOpenAccounts} title={t("accountsTitle")}>
            <span className="dot" style={{ background: "var(--green)" }} />
            <span className="who2">{p?.account ?? active.accountLabel ?? "—"}</span>
          </div>
          {p?.accountType && <div className="acct-type">{p.accountType}</div>}
          <UsageBars usage={p?.usage ?? null} />
          <div className="actline">
            <span className="linkbtn" onClick={onOpenAccounts}>
              <kbd>Ctrl+S</kbd> {t("accountsTitle")}
            </span>{" "}
            ·{" "}
            <span className="linkbtn" onClick={onAddAccount}>
              <kbd>Ctrl+A</kbd> {t("addAccount")}
            </span>
          </div>
        </div>

        <div className="sect">
          <div className="slabel">
            {t("model")} <span className="cnt">/model · /effort</span>
          </div>
          <div className="modelrow">
            <span className="mdot" />
            <span className="mname">{p?.model ?? active.model ?? "—"}</span>
            <span className="effpill">effort: {p?.effort ?? active.effort ?? "—"}</span>
          </div>
          {p?.context ? (
            <Meter
              pct={p.context.pct}
              cls="fill ctx"
              label={t("ctxUsed")}
              caption={`${p.context.pct}% · ${kfmt(p.context.used)}/${kfmt(p.context.window)}`}
            />
          ) : (
            <div className="muted" style={{ marginTop: 6 }}>
              {t("ctxNone")}
            </div>
          )}
        </div>

        <div className="sect">
          <div className="slabel">
            {t("skills")}{" "}
            <span className="cnt">
              {t("global")} {p?.skills.global ?? 0} · {t("project")} {p?.skills.project ?? 0}
            </span>
          </div>
        </div>
        <div className="sect">
          <div className="slabel">
            {t("mcp")}{" "}
            <span className="cnt">
              {t("global")} {p?.mcp.global ?? 0} · {t("project")} {p?.mcp.project ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

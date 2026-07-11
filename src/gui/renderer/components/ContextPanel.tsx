import type { PanelSnapshot, TabSnapshot, UsageWindowDTO } from "../../shared/contract";
import { kfmt } from "./util";
import { useTr } from "../i18n";

/** Compact "time until reset" (e.g. 45m / 4h / 3d) from an ISO timestamp. */
function untilReset(iso?: string): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!isFinite(ms) || ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
function usageCap(w: UsageWindowDTO): string {
  const r = untilReset(w.resetsAt);
  return `${w.pct}%` + (r ? ` · ↻ ${r}` : "");
}

function Meter({ pct, cls, label, caption }: { pct: number; cls: string; label: string; caption?: string }) {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div className="meter">
      <div className="track">
        <div className={cls} style={{ width: w + "%" }} />
      </div>
      <div className="cap">
        <span>{label}</span>
        <span>{caption ?? pct + "%"}</span>
      </div>
    </div>
  );
}

// Live right panel, fed by the main-process poller (panel:data). Falls back to the tab snapshot's
// account/model/effort until the first PanelSnapshot for this tab arrives.
export function ContextPanel({ active, panel }: { active?: TabSnapshot; panel: PanelSnapshot | null }) {
  const t = useTr();
  if (!active) {
    return (
      <div className="col right">
        <div className="collabel">{t("context")}</div>
        <div className="sect">
          <div className="muted">—</div>
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
          <div className="acct-line">
            <span className="dot" style={{ background: "var(--green)" }} />
            <span className="who2">{p?.account ?? active.accountLabel ?? t("direct")}</span>
          </div>
          {p?.accountType && <div className="acct-type">{p.accountType}</div>}
          {p?.usage?.fiveHour && (
            <Meter
              pct={p.usage.fiveHour.pct}
              cls={p.usage.fiveHour.pct >= 50 ? "fill" : "fill ok"}
              label={t("limit5h")}
              caption={usageCap(p.usage.fiveHour)}
            />
          )}
          {p?.usage?.sevenDay && (
            <Meter
              pct={p.usage.sevenDay.pct}
              cls={p.usage.sevenDay.pct >= 50 ? "fill" : "fill ok"}
              label={t("limit7d")}
              caption={usageCap(p.usage.sevenDay)}
            />
          )}
          {typeof p?.usage?.resetCredits === "number" && (
            <div className="resetline">
              {t("resetCredits")}: <b>{p.usage.resetCredits}</b>
            </div>
          )}
          <div className="actline">
            <kbd>Ctrl+S</kbd> {t("switch")} · <kbd>Ctrl+A</kbd> {t("addAccount")}
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

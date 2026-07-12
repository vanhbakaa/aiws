import type { UsageWindowDTO } from "../../shared/contract";
import { useTr } from "../i18n";

// Shared usage rendering so the right ContextPanel and the accounts panel look identical.
export type UsageDTO = { fiveHour?: UsageWindowDTO; sevenDay?: UsageWindowDTO; resetCredits?: number } | null;

/** Compact "time until reset" (e.g. 45m / 4h / 3d) from an ISO timestamp. */
export function untilReset(iso?: string): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!isFinite(ms) || ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function usageCap(w: UsageWindowDTO): string {
  const r = untilReset(w.resetsAt);
  return `${w.pct}%` + (r ? ` · ↻ ${r}` : "");
}

export function Meter({ pct, cls, label, caption }: { pct: number; cls: string; label: string; caption?: string }) {
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

/** 5h + 7d meters + "resets left" — the exact bars shown in the right panel. */
export function UsageBars({ usage }: { usage: UsageDTO }) {
  const t = useTr();
  if (!usage) return null;
  return (
    <>
      {usage.fiveHour && (
        <Meter
          pct={usage.fiveHour.pct}
          cls={usage.fiveHour.pct >= 50 ? "fill" : "fill ok"}
          label={t("limit5h")}
          caption={usageCap(usage.fiveHour)}
        />
      )}
      {usage.sevenDay && (
        <Meter
          pct={usage.sevenDay.pct}
          cls={usage.sevenDay.pct >= 50 ? "fill" : "fill ok"}
          label={t("limit7d")}
          caption={usageCap(usage.sevenDay)}
        />
      )}
      {typeof usage.resetCredits === "number" && (
        <div className="resetline">
          {t("resetCredits")}: <b>{usage.resetCredits}</b>
        </div>
      )}
    </>
  );
}

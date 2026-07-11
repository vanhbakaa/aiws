import { readAccountFor, readAccountTypeFor, readContextFor, readEffortFor, readModelFor } from "../../core/providerInfo";
import { getClaudeUsage } from "../../core/usage";
import { getCodexLiveUsage, getCodexUsage } from "../../core/providerReaders";
import { effectiveSkills } from "../../core/skills";
import { effectiveMcps } from "../../core/mcp";
import type { SessionManager } from "../../session/sessionManager";
import type { PanelSnapshot } from "../shared/contract";

const NONE: PanelSnapshot = {
  tabId: null,
  kind: "none",
  account: null,
  accountType: null,
  usage: null,
  model: null,
  effort: null,
  context: null,
  skills: { global: 0, project: 0 },
  mcp: { global: 0, project: 0 },
};

/**
 * Polls live context/account/model/effort/usage for the ACTIVE tab every 2s (and immediately on any
 * session change), assembling a serializable PanelSnapshot in main so the renderer never touches
 * fs/network. Mirrors the TUI's App.tsx right-panel poller.
 */
export class PanelHost {
  private timer: NodeJS.Timeout | undefined;
  private token = 0;

  constructor(
    private readonly mgr: SessionManager,
    private readonly send: (snap: PanelSnapshot) => void,
  ) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 2000);
    this.mgr.onChange(() => void this.tick());
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** On-demand snapshot (panel:get). */
  snapshot(): Promise<PanelSnapshot> {
    return this.build();
  }

  private async tick(): Promise<void> {
    const my = ++this.token;
    const snap = await this.build();
    if (my === this.token) this.send(snap); // drop stale results superseded by a newer tick
  }

  private async build(): Promise<PanelSnapshot> {
    const tab = this.mgr.activeTab;
    if (!tab) return NONE;
    if (tab.providerId === "shell") return { ...NONE, tabId: tab.id, kind: "shell" };

    const skills = effectiveSkills(tab.projectId);
    const mcps = effectiveMcps(tab.projectId);
    const ctx = readContextFor(tab.providerId, tab.configDir, tab.projectPath, tab.sessionId, tab.model);
    const account = tab.accountLabel ?? readAccountFor(tab.providerId, tab.configDir);
    const accountType = readAccountTypeFor(tab.providerId, tab.configDir);
    const model = tab.model ?? readModelFor(tab.providerId, tab.configDir, tab.projectPath);
    const effort = tab.effort ?? readEffortFor(tab.providerId, tab.configDir, tab.projectPath, tab.sessionId);
    let usage: PanelSnapshot["usage"] = null;
    if (tab.providerId === "claude") {
      try {
        usage = await getClaudeUsage(tab.configDir);
      } catch {
        usage = null;
      }
    } else if (tab.providerId === "codex") {
      // live endpoint = 5h/weekly + "N resets available"; offline → rollout rate_limits (no credits)
      usage = (await getCodexLiveUsage(tab.configDir)) ?? getCodexUsage(tab.configDir);
    }

    return {
      tabId: tab.id,
      kind: "ai",
      account,
      accountType,
      usage,
      model,
      effort,
      context: ctx ? { pct: ctx.pct, used: ctx.used, window: ctx.window } : null,
      skills: {
        global: skills.filter((s) => s.scope === "global").length,
        project: skills.filter((s) => s.scope === "project").length,
      },
      mcp: {
        global: mcps.filter((m) => m.scope === "global").length,
        project: mcps.filter((m) => m.scope === "project").length,
      },
    };
  }
}

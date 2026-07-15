import type { WebContents } from "electron";
import fs from "node:fs";
import { SessionManager, type Tab } from "../../session/sessionManager";
import { getLocale, t } from "../../core/i18n";
import { listProjects, openProject, removeProject } from "../../core/projects";
import { listResumableSessions } from "../../core/resumable";
import {
  addAccount,
  getAccountById,
  listAccounts,
  removeAccountById,
  renameAccount,
  setDefaultAccountById,
} from "../../core/accounts";
import { getProviders } from "../../core/providers";
import { accountConfigDir, accountDir } from "../../core/paths";
import { readAccountFor, readAccountTypeFor } from "../../core/providerInfo";
import { getClaudeUsage } from "../../core/usage";
import { getCodexLiveUsage, getCodexUsage } from "../../core/providerReaders";
import { resolveCommand } from "../../core/which";
import type { AccountDetail, AccountInfo, CommandResult, OpenTabRequest, ProviderInfo, ProjectTree, ResumeSessionRequest, TabSnapshot, WorkspaceSnapshot } from "../shared/contract";

// How to install each provider's CLI (shown in the dropdown + error toast when it's missing).
const INSTALL_HINTS: Record<string, string> = {
  codex: "npm i -g @openai/codex",
  gemini: "npm i -g @google/gemini-cli",
  opencode: "npm i -g opencode-ai",
  ollama: "https://ollama.com/download",
};

function isInstalled(providerId: string, cmd: string): boolean {
  return providerId === "shell" ? true : resolveCommand(cmd) !== null;
}

const FLUSH_MS = 16; // ~60Hz — coalesce PTY output before crossing IPC
const CAP = 64 * 1024; // flush a tab early if its buffer grows past this (bounded latency under load)

function tabToSnapshot(t: Tab): TabSnapshot {
  return {
    id: t.id,
    projectId: t.projectId,
    projectName: t.projectName,
    projectPath: t.projectPath,
    providerId: t.providerId,
    accountLabel: t.accountLabel,
    title: t.title,
    model: t.model,
    effort: t.effort,
    sessionId: t.sessionId,
    configDir: t.configDir,
    exited: t.session.exited,
    exitCode: t.session.exitCode,
  };
}

/**
 * Owns the single SessionManager for a window and bridges it to the renderer:
 * serializable tab snapshots + coalesced PTY byte streaming. node-pty lives only here (main).
 */
export class SessionBridge {
  readonly mgr: SessionManager;
  private readonly wc: WebContents;
  private readonly onArchiveChange?: () => void; // rebuild the native "Open Recent" menu
  private readonly wired = new WeakSet<object>(); // PtySession objects already wired
  private readonly pending = new Map<string, string>(); // tabId -> buffered output
  private flushTimer: NodeJS.Timeout | undefined;

  constructor(wc: WebContents, onArchiveChange?: () => void) {
    this.wc = wc;
    this.onArchiveChange = onArchiveChange;
    this.mgr = new SessionManager({ mirror: false }); // renderer's xterm is the only screen
    this.mgr.onChange(() => {
      this.wireNewSessions();
      this.send("tabs:changed", this.snapshot());
      this.send("project-tree:changed", this.tree());
    });
  }

  // ---- outbound ----
  private snapshot(): WorkspaceSnapshot {
    return {
      tabs: this.mgr.tabs.map(tabToSnapshot),
      active: this.mgr.active,
      sessionsVersion: this.mgr.sessionsVersion,
      locale: getLocale(),
    };
  }

  private send(channel: string, payload: unknown): void {
    if (!this.wc.isDestroyed()) this.wc.send(channel, payload);
  }

  /** Wire raw-data + exit for any PtySession not yet wired (switchAccount swaps in new ones). */
  private wireNewSessions(): void {
    for (const tab of this.mgr.tabs) {
      const s = tab.session;
      if (this.wired.has(s)) continue;
      this.wired.add(s);
      const id = tab.id;
      s.onData((chunk) => this.enqueue(id, chunk));
      s.onExit((code) => this.send("pty:exit", { tabId: id, code }));
    }
  }

  private enqueue(tabId: string, chunk: string): void {
    const next = (this.pending.get(tabId) ?? "") + chunk;
    this.pending.set(tabId, next);
    if (next.length >= CAP) {
      this.flush();
      return;
    }
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    for (const [tabId, data] of this.pending) {
      if (data) this.send("pty:data", { tabId, chunk: data });
    }
    this.pending.clear();
  }

  /**
   * Left-panel tree: every persisted project + its live tabs (running terminals) + its resumable past
   * conversations (read from transcripts on disk, so they survive an app restart). A session that is
   * already open in a live tab is marked live=true → the renderer hides it (it's shown as a terminal).
   */
  private tree(): ProjectTree {
    return listProjects().map((p) => {
      const live = this.mgr.tabs.filter((t) => t.projectId === p.id);
      const sessions = listResumableSessions(p).map((s) => ({
        ...s,
        live: live.some((t) => t.configDir === accountConfigDir(s.accountId, s.providerId) && t.sessionId === s.sessionId),
      }));
      return {
        id: p.id,
        name: p.name,
        path: p.path,
        running: live.length,
        terminals: live.map((t) => ({
          terminalId: t.id,
          providerId: t.providerId,
          providerName: t.providerId,
          accountLabel: t.accountLabel,
          running: !t.session.exited,
          tabId: t.id,
        })),
        sessions,
      };
    });
  }

  // ---- inbound (command handlers) ----
  getState(): WorkspaceSnapshot {
    return this.snapshot();
  }

  getTree(): ProjectTree {
    return this.tree();
  }

  openTab(req: OpenTabRequest): CommandResult<TabSnapshot> {
    try {
      const tab = this.mgr.open(req.projectName, req.providerId, {
        account: req.account,
        model: req.model,
        effort: req.effort,
        cols: req.cols,
        rows: req.rows,
      });
      if (!tab) {
        const hint = INSTALL_HINTS[req.providerId];
        return { ok: false, error: `Chưa cài "${req.providerId}"${hint ? ` — cài: ${hint}` : " hoặc không có trong PATH"}` };
      }
      if (tab.note) this.send("status", { message: tab.note, kind: "info" });
      return { ok: true, value: tabToSnapshot(tab) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Reopen a specific past conversation (from the tree's resumable list) under its own account. */
  resumeSession(req: ResumeSessionRequest): CommandResult<TabSnapshot> {
    try {
      const tab = this.mgr.resume(
        req.projectName,
        { providerId: req.providerId, accountId: req.accountId, sessionId: req.sessionId },
        { cols: req.cols, rows: req.rows },
      );
      if (!tab) {
        const hint = INSTALL_HINTS[req.providerId];
        return { ok: false, error: `Chưa cài "${req.providerId}"${hint ? ` — cài: ${hint}` : " hoặc không có trong PATH"}` };
      }
      if (tab.note) this.send("status", { message: tab.note, kind: "info" });
      return { ok: true, value: tabToSnapshot(tab) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  closeTab(tabId: string): void {
    this.mgr.close(tabId);
  }

  /** Create an account slot (metadata only, oauth). Caller then opens a login tab via openTab. */
  createAccount(providerId: string, label: string): CommandResult<AccountInfo> {
    try {
      const clean = label.trim();
      if (!clean) return { ok: false, error: t("errAccountNameEmpty") };
      const a = addAccount({ providerId, label: clean, authMethod: "oauth_login" });
      return { ok: true, value: { id: a.id, providerId: a.providerId, label: a.label, authMethod: a.authMethod, isDefault: a.isDefault } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  /** Remove a project from the workspace: close its live terminals, then drop it from the list.
   *  History/logins are KEPT (core archives the project + preserves its profile dir) so reopening
   *  the same folder restores everything. Works even while terminals are open — they just close. */
  removeProject(name: string): { ok: boolean; error?: string } {
    const proj = listProjects().find((p) => p.name === name);
    if (!proj) return { ok: false, error: "not found" };
    for (const t of this.mgr.tabs.filter((t) => t.projectId === proj.id)) this.mgr.close(t.id);
    const ok = removeProject(name); // core: archives to removedProjects, purges orphan skills/mcps
    // mgr.close already refreshed tabs/tree, but the project row lingers until we re-emit the tree.
    this.send("project-tree:changed", this.tree());
    this.onArchiveChange?.(); // project entered the archive → refresh "Open Recent"
    return { ok };
  }

  /** Reopen a folder: restores an archived project (same id → history intact) or adds it fresh. */
  reopenProject(dir: string): CommandResult<{ projectName: string }> {
    try {
      const proj = openProject(dir);
      this.send("project-tree:changed", this.tree());
      this.onArchiveChange?.(); // may have left the archive → refresh "Open Recent"
      return { ok: true, value: { projectName: proj.name } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  setActiveTab(index: number): void {
    this.mgr.setActive(index);
  }

  listAllAccounts(): AccountInfo[] {
    return listAccounts().map((a) => ({
      id: a.id,
      providerId: a.providerId,
      label: a.label,
      authMethod: a.authMethod,
      isDefault: a.isDefault,
    }));
  }

  /** Per-account detail read straight from its GLOBAL config dir — no terminal required. */
  async accountInfo(accountId: string): Promise<AccountDetail> {
    const empty: AccountDetail = { loggedIn: false, accountName: null, accountType: null, model: null, usage: null };
    const acc = getAccountById(accountId);
    if (!acc) return empty;
    const configDir = accountConfigDir(acc.id, acc.providerId);
    if (!fs.existsSync(configDir)) return empty; // chưa login lần nào → dir chưa tồn tại
    const accountName = readAccountFor(acc.providerId, configDir);
    const accountType = readAccountTypeFor(acc.providerId, configDir);
    // model KHÔNG đọc ở đây: nó là thiết lập theo phiên/cwd, không tra được cho panel account toàn cục
    // (readModelFor cần cwd) → luôn null; model hiển thị ở panel PHẢI của tab đang chạy.
    let usage: AccountDetail["usage"] = null;
    try {
      if (acc.providerId === "claude") usage = await getClaudeUsage(configDir);
      else if (acc.providerId === "codex") usage = (await getCodexLiveUsage(configDir)) ?? getCodexUsage(configDir);
    } catch {
      usage = null;
    }
    return { loggedIn: accountName != null || accountType != null, accountName, accountType, model: null, usage };
  }

  /** Surface a failed mutation as a toast (App listens to onStatus) so panel actions never fail silently. */
  private fail(msg: string): { ok: false; error: string } {
    this.send("status", { message: msg, kind: "error" });
    return { ok: false, error: msg };
  }

  /** Remove an account: close its live tabs, forget metadata + delete its GLOBAL login dir. */
  removeAccount(accountId: string): { ok: boolean; error?: string } {
    try {
      const acc = getAccountById(accountId);
      if (!acc) return this.fail(t("errAccountNotFound"));
      const dir = accountConfigDir(acc.id, acc.providerId);
      for (const t of this.mgr.tabs.filter((t) => t.configDir === dir)) this.mgr.close(t.id);
      removeAccountById(accountId);
      try {
        fs.rmSync(accountDir(accountId), { recursive: true, force: true });
      } catch {
        /* login dir may be locked/open — metadata already gone, ignore */
      }
      return { ok: true };
    } catch (e) {
      return this.fail((e as Error).message);
    }
  }

  renameAccount(accountId: string, label: string): { ok: boolean; error?: string } {
    const acc = getAccountById(accountId);
    const oldLabel = acc?.label;
    try {
      renameAccount(accountId, label);
    } catch (e) {
      return this.fail((e as Error).message);
    }
    // Cập nhật nhãn trên tab đang chạy dùng account này → badge "đang dùng" + tên panel phải không lệch.
    if (acc && oldLabel) {
      const clean = label.trim();
      let changed = false;
      for (const tb of this.mgr.tabs) {
        if (tb.providerId === acc.providerId && tb.accountLabel === oldLabel) {
          tb.accountLabel = clean;
          changed = true;
        }
      }
      if (changed) this.send("tabs:changed", this.getState());
    }
    return { ok: true };
  }

  setDefaultAccount(accountId: string): { ok: boolean; error?: string } {
    try {
      setDefaultAccountById(accountId);
      return { ok: true };
    } catch (e) {
      return this.fail((e as Error).message);
    }
  }

  listProviders(): ProviderInfo[] {
    const list: ProviderInfo[] = [
      { id: "shell", installed: true, hasAccounts: false },
    ];
    for (const p of getProviders()) {
      list.push({
        id: p.id,
        installed: isInstalled(p.id, p.launchCmd[0] ?? p.id),
        hasAccounts: p.hasAccounts,
        installHint: INSTALL_HINTS[p.id],
      });
    }
    return list;
  }

  switchAccount(tabId: string, toAccountId: string): { ok: boolean; msg: string } {
    const r = this.mgr.switchAccount(tabId, toAccountId);
    this.send("status", { message: r.msg, kind: r.ok ? "info" : "error" });
    return r;
  }

  write(tabId: string, data: string): void {
    this.mgr.tabs.find((t) => t.id === tabId)?.session.write(data);
  }

  resize(tabId: string, cols: number, rows: number): void {
    if (cols >= 2 && rows >= 2) this.mgr.tabs.find((t) => t.id === tabId)?.session.resize(cols, rows);
  }

  dispose(): void {
    this.flush();
    this.mgr.killAll();
  }
}

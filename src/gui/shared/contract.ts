// Shared IPC contract: DTOs + the typed window.aiws bridge. Imported by main, preload, and
// renderer so the surface is typed end-to-end. Grows per phase; Phase 1 = PTY bridge + tabs.

/** A Tab minus its live PtySession (which can't cross IPC), plus liveness. */
export interface TabSnapshot {
  id: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  providerId: string;
  accountLabel?: string;
  title: string;
  model?: string;
  effort?: string;
  sessionId?: string;
  configDir: string;
  exited: boolean;
  exitCode: number | null;
}

export interface WorkspaceSnapshot {
  tabs: TabSnapshot[];
  active: number;
  sessionsVersion: number;
  locale: string;
}

export interface OpenTabRequest {
  projectName: string;
  providerId: string;
  cols: number;
  rows: number;
  account?: string;
  model?: string;
  effort?: string;
}

/** Left-panel project tree: persisted projects joined with the live tabs (from mgr.tabs). */
export interface ProjectTreeTerminal {
  terminalId: string;
  providerId: string;
  providerName: string;
  accountLabel?: string;
  running: boolean;
  tabId?: string;
}
export interface ProjectTreeNode {
  id: string;
  name: string;
  path: string;
  running: number;
  terminals: ProjectTreeTerminal[];
}
export type ProjectTree = ProjectTreeNode[];

/** What the renderer opens on startup (initial project registered from cwd / --open dir). */
export interface InitInfo {
  projectName: string | null;
  providerId: string;
}

/** Right-panel snapshot, assembled in main (readers + usage) so the renderer touches no fs/network. */
export interface UsageWindowDTO {
  pct: number;
  resetsAt?: string;
}
export interface PanelSnapshot {
  tabId: string | null;
  kind: "ai" | "shell" | "none";
  account: string | null;
  accountType: string | null;
  usage: { fiveHour?: UsageWindowDTO; sevenDay?: UsageWindowDTO; resetCredits?: number } | null;
  model: string | null;
  effort: string | null;
  context: { pct: number; used: number; window: number } | null;
  skills: { global: number; project: number };
  mcp: { global: number; project: number };
}

export interface AccountInfo {
  id: string;
  providerId: string;
  label: string;
  authMethod: string;
  isDefault?: boolean;
}

/** Per-account detail read from its GLOBAL config dir (no terminal needed). */
export interface AccountDetail {
  loggedIn: boolean;
  accountName: string | null;
  accountType: string | null;
  model: string | null;
  usage: { fiveHour?: UsageWindowDTO; sevenDay?: UsageWindowDTO; resetCredits?: number } | null;
}

export interface ProviderInfo {
  id: string;
  installed: boolean;
  hasAccounts: boolean;
  installHint?: string;
}

export type CommandResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/** The object exposed on window.aiws by the preload bridge. */
export interface AiwsApi {
  // queries / commands (request → response)
  getInit(): Promise<InitInfo>;
  getState(): Promise<WorkspaceSnapshot>;
  getTree(): Promise<ProjectTree>;
  getPanel(): Promise<PanelSnapshot>;
  openTab(req: OpenTabRequest): Promise<CommandResult<TabSnapshot>>;
  closeTab(tabId: string): Promise<void>;
  setActiveTab(index: number): Promise<void>;
  listProviders(): Promise<ProviderInfo[]>;
  // account management (global panel)
  listAllAccounts(): Promise<AccountInfo[]>;
  accountInfo(accountId: string): Promise<AccountDetail>;
  createAccount(providerId: string, label: string): Promise<CommandResult<AccountInfo>>;
  removeAccount(accountId: string): Promise<{ ok: boolean; error?: string }>;
  renameAccount(accountId: string, label: string): Promise<{ ok: boolean; error?: string }>;
  setDefaultAccount(accountId: string): Promise<{ ok: boolean; error?: string }>;
  switchAccount(tabId: string, toAccountId: string): Promise<{ ok: boolean; msg: string }>;
  openFolderDialog(): Promise<CommandResult<{ projectName: string }>>;
  removeProject(name: string): Promise<{ ok: boolean; error?: string }>;
  reopenProject(path: string): Promise<CommandResult<{ projectName: string }>>;
  setLocale(locale: string): Promise<void>;

  // high-frequency one-way (renderer → main)
  ptyWrite(tabId: string, data: string): void;
  ptyResize(tabId: string, cols: number, rows: number): void;

  // events (main → renderer); each returns an unsubscribe fn
  onPtyData(cb: (tabId: string, chunk: string) => void): () => void;
  onPtyExit(cb: (tabId: string, code: number) => void): () => void;
  onTabsChanged(cb: (snap: WorkspaceSnapshot) => void): () => void;
  onProjectTree(cb: (tree: ProjectTree) => void): () => void;
  onPanelData(cb: (panel: PanelSnapshot) => void): () => void;
  onMenuCommand(cb: (command: string, args?: Record<string, unknown>) => void): () => void;
  onStatus(cb: (message: string, kind: "info" | "error") => void): () => void;
}

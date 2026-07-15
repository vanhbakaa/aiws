import { prepareResume, prepareRun, prepareShell, prepareSwitch } from "../core/run.js";
import { t } from "../core/i18n.js";
import { materialize } from "../core/materialize.js";
import { removeTerminal } from "../core/projects.js";
import { PtySession } from "./ptySession.js";
import { ptyFileArgs } from "./ptyLaunch.js";

export interface Tab {
  id: string; // = terminal id
  session: PtySession;
  projectId: string;
  projectName: string;
  projectPath: string;
  providerId: string;
  accountLabel?: string;
  title: string; // tên chat (tạm: tên terminal)
  model?: string;
  effort?: string;
  sessionId?: string; // để đọc transcript tính %context
  configDir: string; // CLAUDE_CONFIG_DIR cô lập của tab
  note?: string; // thông báo lúc mở (vd đã nạp hội thoại chéo-provider) → GUI hiện toast
}

export interface OpenOpts {
  account?: string;
  model?: string;
  effort?: string;
  cols: number;
  rows: number;
  /** GUI: materialize skill/MCP chạy off-thread (utilityProcess) trước → bỏ qua ở đây để không block. */
  skipMaterialize?: boolean;
}

/**
 * Quản lý nhiều tab = nhiều PtySession (đa nhiệm). Khung-agnostic; App (ink) chỉ đọc state
 * và gọi các lệnh open/close/switch, rồi re-render.
 */
export class SessionManager {
  tabs: Tab[] = [];
  active = 0;
  sessionsVersion = 0; // tăng mỗi khi TẬP session đổi (mở/đóng/switch) → App đăng ký lại onUpdate
  private changeCbs = new Set<() => void>();
  private readonly sessionOpts: { mirror?: boolean };

  // sessionOpts áp cho MỌI PtySession do manager tạo. GUI truyền { mirror: false } (renderer tự
  // render bằng xterm.js). TUI khởi tạo không tham số → mirror mặc định true.
  constructor(sessionOpts?: { mirror?: boolean }) {
    this.sessionOpts = sessionOpts ?? {};
  }

  onChange(cb: () => void): () => void {
    this.changeCbs.add(cb);
    return () => this.changeCbs.delete(cb);
  }
  private emit(): void {
    this.changeCbs.forEach((cb) => cb());
  }

  get activeTab(): Tab | undefined {
    return this.tabs[this.active];
  }

  /**
   * Mở một tab mới chạy provider trong project. Ném lỗi prepareRun (project/provider sai)
   * để caller báo rõ; trả null nếu provider chưa cài (ptyFileArgs null).
   */
  open(projectName: string, provider = "claude", opts?: Partial<OpenOpts>): Tab | null {
    const spec =
      provider === "shell"
        ? prepareShell(projectName)
        : prepareRun(projectName, provider, { accountLabel: opts?.account });

    // model/effort: aiws chủ động set khi launch (chỉ claude) → biết chắc để hiển thị.
    const args = [...spec.args];
    if (provider === "claude") {
      if (opts?.model) args.push("--model", opts.model);
      if (opts?.effort) args.push("--effort", opts.effort);
    }

    const fa = ptyFileArgs(spec.cmd, args);
    if (!fa) {
      removeTerminal(spec.projectId, spec.terminal.id);
      return null;
    }
    if (!opts?.skipMaterialize) {
      try {
        materialize(spec.projectId, spec.providerId, spec.configDir);
      } catch {
        /* không chặn */
      }
    }
    const cols = opts?.cols ?? 80;
    const rows = opts?.rows ?? 24;
    const session = new PtySession({ file: fa.file, args: fa.args, cwd: spec.cwd, env: spec.env, cols, rows, mirror: this.sessionOpts.mirror });
    const tab: Tab = {
      id: spec.terminal.id,
      session,
      projectId: spec.projectId,
      projectName: spec.projectName,
      projectPath: spec.cwd,
      providerId: spec.providerId,
      accountLabel: spec.accountLabel,
      title: spec.terminal.name,
      model: provider === "claude" ? opts?.model : undefined,
      effort: provider === "claude" ? opts?.effort : undefined,
      sessionId: spec.terminal.sessionId,
      configDir: spec.configDir,
      note: spec.note,
    };
    // khi provider thoát → tự đóng tab
    // Chỉ đóng tab khi CHÍNH session hiện tại thoát. Lúc switch, session cũ bị kill sẽ fire onExit
    // (bất đồng bộ) SAU khi đã gắn session mới → nếu không kiểm tra sẽ đóng nhầm tab vừa switch.
    session.onExit(() => {
      if (tab.session === session) this.close(tab.id);
    });
    this.tabs.push(tab);
    this.active = this.tabs.length - 1;
    this.sessionsVersion++;
    this.emit();
    return tab;
  }

  /**
   * MỞ LẠI (resume) một phiên hội thoại cụ thể đã có trên đĩa (từ danh sách "phiên cũ" của cây
   * project). Nếu phiên đó đang mở sẵn ở một tab → nhảy vào tab đó thay vì mở trùng. Trả null nếu
   * provider chưa cài; ném lỗi nếu project/account sai (caller báo toast).
   */
  resume(
    projectName: string,
    opts: { providerId: string; accountId: string; sessionId: string },
    launchOpts?: Partial<OpenOpts>,
  ): Tab | null {
    const spec = prepareResume(projectName, opts);
    // Phiên này đang mở sẵn (cùng config-dir + cùng phiên) → focus, đừng mở trùng.
    const openIdx = this.tabs.findIndex(
      (t) => t.configDir === spec.configDir && t.sessionId === spec.terminal.sessionId,
    );
    if (openIdx >= 0) {
      this.setActive(openIdx);
      return this.tabs[openIdx];
    }
    const fa = ptyFileArgs(spec.cmd, spec.args);
    if (!fa) return null; // chưa cài CLI — KHÔNG gỡ terminal (bản ghi vô hại, có thể đang tái dùng)
    if (!launchOpts?.skipMaterialize) {
      try {
        materialize(spec.projectId, spec.providerId, spec.configDir);
      } catch {
        /* không chặn */
      }
    }
    const cols = launchOpts?.cols ?? 80;
    const rows = launchOpts?.rows ?? 24;
    const session = new PtySession({ file: fa.file, args: fa.args, cwd: spec.cwd, env: spec.env, cols, rows, mirror: this.sessionOpts.mirror });
    const tab: Tab = {
      id: spec.terminal.id,
      session,
      projectId: spec.projectId,
      projectName: spec.projectName,
      projectPath: spec.cwd,
      providerId: spec.providerId,
      accountLabel: spec.accountLabel,
      title: spec.terminal.name,
      sessionId: spec.terminal.sessionId,
      configDir: spec.configDir,
      note: spec.note,
    };
    session.onExit(() => {
      if (tab.session === session) this.close(tab.id);
    });
    this.tabs.push(tab);
    this.active = this.tabs.length - 1;
    this.sessionsVersion++;
    this.emit();
    return tab;
  }

  /**
   * Đã có tab của (project + provider) này thì nhảy vào; chưa có mới mở. Khớp cả provider để
   * một project mở được nhiều AI khác nhau (claude + codex...) mà không đè lên nhau. Ctrl+T vẫn
   * mở thêm tab trùng khi cần.
   */
  openOrFocus(projectName: string, provider = "claude", opts?: Partial<OpenOpts>): Tab | null {
    // Đang ở sẵn 1 tab khớp (kể cả vừa đổi account) → giữ nguyên, đừng nhảy sang tab account khác.
    const cur = this.activeTab;
    if (cur && cur.projectName === projectName && cur.providerId === provider) return cur;
    const i = this.tabs.findIndex((t) => t.projectName === projectName && t.providerId === provider);
    if (i >= 0) {
      this.setActive(i);
      return this.tabs[i];
    }
    return this.open(projectName, provider, opts);
  }

  close(id: string): void {
    const i = this.tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.tabs[i].session.kill();
    this.tabs.splice(i, 1);
    if (i < this.active) this.active--; // đóng tab bên TRÁI tab active → dồn chỉ số về, giữ đúng tab đang xem
    if (this.active >= this.tabs.length) this.active = Math.max(0, this.tabs.length - 1);
    this.sessionsVersion++;
    this.emit();
  }

  /**
   * Hot-switch account của tab: đổi sang account (theo id — có thể KHÁC LOẠI) rồi thay session
   * (relaunch + mang hội thoại). toAccountId = account cụ thể; toLabel = theo nhãn (cùng provider);
   * bỏ trống = luân phiên kế tiếp cùng provider.
   */
  switchAccount(tabId: string, toAccountId?: string, toLabel?: string): { ok: boolean; msg: string } {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return { ok: false, msg: t("errNoTab") };
    let spec;
    try {
      spec = prepareSwitch(tab.projectName, tab.title, toAccountId ? { toAccountId } : toLabel ? { toLabel } : undefined);
    } catch (e) {
      return { ok: false, msg: (e as Error).message };
    }
    const providerChanged = spec.providerId !== tab.providerId;
    const args = [...spec.args];
    // model/effort là theo provider → chỉ giữ khi KHÔNG đổi loại provider.
    if (!providerChanged && spec.providerId === "claude") {
      if (tab.model) args.push("--model", tab.model);
      if (tab.effort) args.push("--effort", tab.effort);
    }
    const fa = ptyFileArgs(spec.cmd, args);
    if (!fa) return { ok: false, msg: t("errNotInstalled", { cmd: spec.cmd }) };
    const cols = tab.session.cols;
    const rows = tab.session.rows;
    tab.session.kill();
    const session = new PtySession({ file: fa.file, args: fa.args, cwd: spec.cwd, env: spec.env, cols, rows, mirror: this.sessionOpts.mirror });
    // Chỉ đóng tab khi CHÍNH session hiện tại thoát. Lúc switch, session cũ bị kill sẽ fire onExit
    // (bất đồng bộ) SAU khi đã gắn session mới → nếu không kiểm tra sẽ đóng nhầm tab vừa switch.
    session.onExit(() => {
      if (tab.session === session) this.close(tab.id);
    });
    tab.session = session;
    tab.providerId = spec.providerId; // đổi khác loại → cập nhật cả provider của tab
    if (providerChanged) {
      tab.model = undefined; // model/effort cũ thuộc provider cũ → reset, poller sẽ đọc lại của đích
      tab.effort = undefined;
    }
    tab.accountLabel = spec.accountLabel;
    tab.configDir = spec.configDir;
    tab.sessionId = spec.terminal.sessionId;
    this.sessionsVersion++; // session mới → App phải đăng ký lại onUpdate (nếu không sẽ chỉ update mỗi 2s)
    this.emit();
    return { ok: true, msg: spec.note ?? t("switchedTo", { label: spec.accountLabel ?? "" }) };
  }

  setActive(i: number): void {
    if (i >= 0 && i < this.tabs.length) {
      this.active = i;
      this.emit();
    }
  }
  nextTab(): void {
    if (this.tabs.length) this.setActive((this.active + 1) % this.tabs.length);
  }

  resizeAll(cols: number, rows: number): void {
    for (const t of this.tabs) t.session.resize(cols, rows);
  }

  killAll(): void {
    for (const t of this.tabs) t.session.kill();
  }
}

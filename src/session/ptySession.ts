import { createRequire } from "node:module";
// xterm-headless: default import (module.exports) — chạy được CẢ Node (ESM-CJS interop) LẪN
// bun bundle vào binary. (named import { Terminal } fail trên Node vì đây là CJS.)
import xtermHeadless from "@xterm/headless";
const XTerminal: any = (xtermHeadless as any)?.Terminal ?? (xtermHeadless as any)?.default?.Terminal ?? xtermHeadless;

// Native PTY: 2 backend —
//  - Node/npm: @lydell/node-pty (prebuilt), nạp qua require ghép động (không bundle vào binary).
//  - Binary (bun): Bun.Terminal built-in → bun build --compile ra 1 file, không cần native.
const require = createRequire(import.meta.url);

export interface PtySessionOpts {
  file: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  cols: number;
  rows: number;
  /**
   * Giữ "gương" màn hình bằng @xterm/headless (mặc định true — TUI cần để render).
   * GUI truyền false: renderer tự có xterm.js làm màn hình duy nhất → bỏ parse headless + throttle,
   * chỉ stream byte thô qua onData(). KHÔNG đổi hành vi TUI.
   */
  mirror?: boolean;
}

/** Backend PTY tối giản — 2 hiện thực (node-pty / Bun.Terminal) chung interface. */
interface PtyBackend {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

const BunGlobal = (globalThis as any).Bun;

/** Backend Bun: Bun.Terminal (đọc qua callback data, ghi qua write). Dùng trong binary. */
function createBunBackend(
  opts: PtySessionOpts,
  onData: (d: string) => void,
  onExit: (code: number) => void,
): PtyBackend {
  const term = new BunGlobal.Terminal({
    cols: opts.cols,
    rows: opts.rows,
    data: (_t: any, d: Uint8Array | string) => onData(typeof d === "string" ? d : new TextDecoder().decode(d)),
  });
  const proc = BunGlobal.spawn({
    cmd: [opts.file, ...opts.args],
    cwd: opts.cwd,
    env: opts.env,
    terminal: term,
  });
  proc.exited.then((code: number) => onExit(code ?? 0));
  return {
    write: (d) => term.write(d),
    resize: (c, r) => term.resize(c, r),
    kill: () => proc.kill(),
  };
}

/** Backend Node: @lydell/node-pty. Specifier ghép động để bun KHÔNG bundle native vào binary. */
function createNodePtyBackend(
  opts: PtySessionOpts,
  onData: (d: string) => void,
  onExit: (code: number) => void,
): PtyBackend {
  const pty = require(["@lydell", "node-pty"].join("/"));
  const proc = pty.spawn(opts.file, opts.args, {
    name: "xterm-256color",
    cols: opts.cols,
    rows: opts.rows,
    cwd: opts.cwd,
    env: opts.env,
  });
  proc.onData((d: string) => onData(d));
  proc.onExit((e: { exitCode: number }) => onExit(e.exitCode ?? 0));
  return {
    write: (d) => proc.write(d),
    resize: (c, r) => proc.resize(c, r),
    kill: () => proc.kill(),
  };
}

/**
 * Một phiên terminal nhúng: chạy lệnh trong PTY thật, đưa output vào xterm-headless để giữ
 * "lưới màn hình", và phát sự kiện update (đã throttle) cho lớp render.
 */
export class PtySession {
  term: any; // xterm Terminal
  cols: number;
  rows: number;
  exited = false;
  exitCode: number | null = null;
  readonly runtime: "bun" | "node";

  private backend: PtyBackend;
  private updateCbs = new Set<() => void>();
  private dataCbs = new Set<(d: string) => void>();
  private exitCbs = new Set<(code: number) => void>();
  private dirty = false;
  private timer: NodeJS.Timeout | undefined;
  private readonly minInterval: number;
  private readonly mirror: boolean;

  constructor(opts: PtySessionOpts) {
    this.cols = opts.cols;
    this.rows = opts.rows;
    this.mirror = opts.mirror !== false;
    const fps = Number(process.env.AIWS_TUI_FPS);
    this.minInterval = fps > 0 ? Math.max(10, Math.round(1000 / fps)) : 33;
    this.term = new XTerminal({ cols: opts.cols, rows: opts.rows, allowProposedApi: true, scrollback: 2000 });

    const onData = (d: string) => {
      if (this.mirror) {
        this.term.write(d);
        this.markDirty();
      }
      this.dataCbs.forEach((cb) => cb(d));
    };
    const onExit = (code: number) => {
      this.exited = true;
      this.exitCode = code;
      this.exitCbs.forEach((cb) => cb(code));
    };

    this.runtime = BunGlobal?.Terminal ? "bun" : "node";
    this.backend =
      this.runtime === "bun"
        ? createBunBackend(opts, onData, onExit)
        : createNodePtyBackend(opts, onData, onExit);
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.dirty) {
        this.dirty = false;
        this.updateCbs.forEach((cb) => cb());
      }
    }, this.minInterval);
  }

  write(data: string): void {
    if (!this.exited) this.backend.write(data);
  }

  resize(cols: number, rows: number): void {
    if (cols < 2 || rows < 2) return;
    this.cols = cols;
    this.rows = rows;
    try {
      if (this.mirror) this.term.resize(cols, rows);
      if (!this.exited) this.backend.resize(cols, rows);
    } catch {
      /* ignore */
    }
  }

  onUpdate(cb: () => void): () => void {
    this.updateCbs.add(cb);
    return () => this.updateCbs.delete(cb);
  }

  /** Stream byte PTY thô (cho GUI: đẩy sang xterm.js ở renderer). Trả hàm huỷ đăng ký. */
  onData(cb: (d: string) => void): () => void {
    this.dataCbs.add(cb);
    return () => this.dataCbs.delete(cb);
  }

  onExit(cb: (code: number) => void): () => void {
    this.exitCbs.add(cb);
    return () => this.exitCbs.delete(cb);
  }

  kill(): void {
    try {
      this.backend.kill();
    } catch {
      /* ignore */
    }
  }
}

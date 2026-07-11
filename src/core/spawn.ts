import { spawn } from "node:child_process";
import path from "node:path";
import { resolveCommand } from "./which.js";

export interface SpawnOpts {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  /** Gọi khi không tìm thấy lệnh trong PATH (để in thông báo tuỳ ngữ cảnh). */
  onMissing?: () => void;
}

/**
 * Spawn một lệnh kế thừa stdio của terminal hiện tại, cross-platform.
 * Tự resolve PATH/PATHEXT; shim .cmd/.bat trên Windows chạy qua cmd.exe /c.
 * KHÔNG dùng shell:true (tránh deprecation + injection). Trả về exit code.
 */
export function spawnInherit(command: string, args: string[], opts: SpawnOpts = {}): Promise<number> {
  const resolved = resolveCommand(command);
  if (!resolved) {
    opts.onMissing?.();
    return Promise.resolve(127);
  }
  let cmd = resolved;
  let a = args;
  const ext = path.extname(resolved).toLowerCase();
  if (process.platform === "win32" && (ext === ".cmd" || ext === ".bat")) {
    cmd = process.env.ComSpec ?? "cmd.exe";
    a = ["/c", resolved, ...args];
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, a, { stdio: "inherit", env: opts.env, cwd: opts.cwd });
    child.on("error", (err) => {
      console.error(`\n✗ Không chạy được "${command}": ${err.message}`);
      resolve(127);
    });
    // code=null nghĩa là bị signal giết (SIGKILL/SIGTERM...) → trả non-zero, KHÔNG phải 0.
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

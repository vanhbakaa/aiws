import path from "node:path";
import { resolveCommand } from "../core/which.js";

/** Đổi (cmd, args) thành (file, args) hợp lệ cho pty.spawn; shim .cmd/.bat qua cmd.exe. */
export function ptyFileArgs(cmd: string, args: string[]): { file: string; args: string[] } | null {
  const resolved = resolveCommand(cmd);
  if (!resolved) return null;
  const ext = path.extname(resolved).toLowerCase();
  if (process.platform === "win32" && (ext === ".cmd" || ext === ".bat")) {
    return { file: process.env.ComSpec ?? "cmd.exe", args: ["/c", resolved, ...args] };
  }
  return { file: resolved, args };
}

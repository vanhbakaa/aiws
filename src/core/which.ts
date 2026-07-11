import fs from "node:fs";
import path from "node:path";

/**
 * Tìm lệnh trong PATH (kèm PATHEXT trên Windows). Trả về đường dẫn tuyệt đối, hoặc null.
 */
export function resolveCommand(cmd: string): string | null {
  const isWin = process.platform === "win32";
  const exts = isWin ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];
  const hasDir = cmd.includes(path.sep) || path.isAbsolute(cmd);
  const dirs = hasDir ? [path.dirname(path.resolve(cmd))] : (process.env.PATH ?? "").split(path.delimiter);
  const base = hasDir ? path.basename(cmd) : cmd;
  for (const dir of dirs) {
    if (!dir) continue;
    if (path.extname(base) && fs.existsSync(path.join(dir, base))) return path.join(dir, base);
    for (const ext of exts) {
      const p = path.join(dir, base + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

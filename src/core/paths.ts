import os from "node:os";
import path from "node:path";

// Cho phép override thư mục gốc qua AIWS_HOME (tiện cho test & môi trường tuỳ chỉnh).
export function aiwsHome(): string {
  return process.env.AIWS_HOME ?? path.join(os.homedir(), ".aiws");
}

export function configPath(): string {
  return path.join(aiwsHome(), "config.json");
}

/** Layer skill/mcp dùng chung cho mọi project. */
export function globalDir(): string {
  return path.join(aiwsHome(), "global");
}

/** Nơi chứa profile cô lập của từng project. */
export function profilesDir(): string {
  return path.join(aiwsHome(), "profiles");
}

/** Thư mục profile cô lập của một project cụ thể. */
export function projectProfileDir(projectId: string): string {
  return path.join(profilesDir(), projectId);
}

/** Nơi chứa config-dir GLOBAL của từng account (login dùng chung mọi project). */
export function accountsDir(): string {
  return path.join(aiwsHome(), "accounts");
}

/** Thư mục gốc của một account: `~/.aiws/accounts/<accountId>` (xoá = quên login của account). */
export function accountDir(accountId: string): string {
  return path.join(accountsDir(), accountId);
}

/**
 * Config-dir global của một account cho một provider: `~/.aiws/accounts/<accountId>/<providerId>`.
 * Cùng account = cùng dir ở MỌI project → login (oauth) dùng chung. Session vẫn tách theo project
 * nhờ cwd (claude: `projects/<encode(cwd)>`; codex: lọc theo `session_meta.cwd`).
 */
export function accountConfigDir(accountId: string, providerId: string): string {
  return path.join(accountDir(accountId), providerId);
}

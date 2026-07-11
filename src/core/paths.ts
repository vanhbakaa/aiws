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

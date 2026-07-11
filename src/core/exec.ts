import fs from "node:fs";
import { getProjectByName } from "./projects.js";
import { buildProjectEnv } from "./isolation.js";
import { resolveCommand } from "./which.js";
import { spawnInherit } from "./spawn.js";
import type { Project } from "./types.js";

export interface ExecContext {
  env: NodeJS.ProcessEnv;
  cwd: string;
  project: Project;
}

/** Môi trường cô lập của project để chạy lệnh/mở shell. */
export function projectExecContext(projectName: string): ExecContext {
  const project = getProjectByName(projectName);
  if (!project) throw new Error(`Không tìm thấy project "${projectName}"`);
  if (!fs.existsSync(project.path)) throw new Error(`Thư mục project không tồn tại: ${project.path}`);
  return { env: buildProjectEnv(project), cwd: project.path, project };
}

/** Chạy một lệnh bất kỳ trong môi trường cô lập của project. */
export function execInProject(projectName: string, command: string, args: string[]): Promise<number> {
  const ctx = projectExecContext(projectName);
  return spawnInherit(command, args, {
    env: ctx.env,
    cwd: ctx.cwd,
    onMissing: () => console.error(`✗ Không tìm thấy lệnh "${command}" trong PATH.`),
  });
}

/** Shell mặc định của hệ điều hành (ưu tiên shell người dùng đang dùng). */
export function defaultShell(): { cmd: string; args: string[] } {
  if (process.platform === "win32") {
    const pwsh = resolveCommand("pwsh") ?? resolveCommand("powershell");
    if (pwsh) return { cmd: pwsh, args: ["-NoLogo"] };
    return { cmd: process.env.ComSpec ?? "cmd.exe", args: [] };
  }
  return { cmd: process.env.SHELL ?? "/bin/bash", args: [] };
}

/** Mở một shell tương tác trong môi trường cô lập của project. */
export function shellInProject(projectName: string): Promise<number> {
  const ctx = projectExecContext(projectName);
  const { cmd, args } = defaultShell();
  return spawnInherit(cmd, args, { env: ctx.env, cwd: ctx.cwd });
}

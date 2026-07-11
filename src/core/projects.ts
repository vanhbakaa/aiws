import { randomUUID } from "node:crypto";
import path from "node:path";
import { loadWorkspace, saveWorkspace } from "./storage.js";
import type { Project, Terminal } from "./types.js";

/** So sánh 2 đường dẫn; Windows/macOS là filesystem không phân biệt hoa/thường. */
export function samePath(a: string, b: string): boolean {
  const ci = process.platform === "win32" || process.platform === "darwin";
  const norm = (p: string) => (ci ? path.resolve(p).toLowerCase() : path.resolve(p));
  return norm(a) === norm(b);
}

export function listProjects(): Project[] {
  return loadWorkspace().projects;
}

/** Project đã gỡ (còn giữ profile) — để hiện "Recent" và mở lại. Mới gỡ đứng cuối mảng. */
export function listRemovedProjects(): Project[] {
  return loadWorkspace().removedProjects ?? [];
}

export function getProjectByName(name: string): Project | undefined {
  return loadWorkspace().projects.find((p) => p.name === name);
}

/** Thêm một terminal vào project và lưu lại. */
export function addTerminal(projectId: string, terminal: Terminal): void {
  const ws = loadWorkspace();
  const p = ws.projects.find((x) => x.id === projectId);
  if (!p) throw new Error(`Không tìm thấy project id "${projectId}"`);
  p.terminals.push(terminal);
  saveWorkspace(ws);
}

/** Gỡ một terminal (dùng khi launch thất bại → tránh "terminal ma"). */
export function removeTerminal(projectId: string, terminalId: string): void {
  const ws = loadWorkspace();
  const p = ws.projects.find((x) => x.id === projectId);
  if (!p) return;
  const before = p.terminals.length;
  p.terminals = p.terminals.filter((t) => t.id !== terminalId);
  if (p.terminals.length !== before) saveWorkspace(ws);
}

/** Đổi account đang active của một terminal (dùng khi hot-switch). */
export function updateTerminalAccount(projectId: string, terminalId: string, accountId: string | undefined): void {
  const ws = loadWorkspace();
  const p = ws.projects.find((x) => x.id === projectId);
  const t = p?.terminals.find((x) => x.id === terminalId);
  if (!t) throw new Error(`Không tìm thấy terminal id "${terminalId}"`);
  t.aiAccountId = accountId; // undefined = về đăng nhập trực tiếp (không account)
  saveWorkspace(ws);
}

/** Sinh tên không trùng: "name" → "name-2" → "name-3"... */
function uniqueName(existing: Project[], base: string): string {
  const names = new Set(existing.map((p) => p.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function addProject(opts: { name: string; path: string }): Project {
  const ws = loadWorkspace();
  if (ws.projects.some((p) => p.name === opts.name)) {
    throw new Error(`Project "${opts.name}" đã tồn tại`);
  }
  const project: Project = {
    id: randomUUID(),
    name: opts.name,
    path: path.resolve(opts.path),
    terminals: [],
    services: [],
  };
  ws.projects.push(project);
  saveWorkspace(ws);
  return project;
}

export function removeProject(name: string): boolean {
  const ws = loadWorkspace();
  const proj = ws.projects.find((p) => p.name === name);
  if (!proj) return false;
  ws.projects = ws.projects.filter((p) => p.id !== proj.id);
  // Dọn orphan: skill/mcp gắn với project này (nếu không sẽ kẹt lại, không gỡ được).
  ws.skills = ws.skills.filter((s) => s.projectId !== proj.id);
  ws.mcps = ws.mcps.filter((m) => m.projectId !== proj.id);
  // GIỮ lịch sử/đăng nhập: KHÔNG xoá profile dir. Lưu project vào kho "đã gỡ" (dedupe theo path) để
  // mở lại folder cùng path là khôi phục NGUYÊN id → nguyên profile (hội thoại + đăng nhập). Xoá
  // terminals[] (session đã bị kill khi gỡ) để khôi phục không sinh terminal ma trong TUI.
  ws.removedProjects = [
    ...(ws.removedProjects ?? []).filter((p) => !samePath(p.path, proj.path)),
    { ...proj, terminals: [] },
  ];
  saveWorkspace(ws);
  return true;
}

/** Mở một folder thành project. Tên mặc định = tên folder. Idempotent theo path; khôi phục project
 *  đã gỡ (cùng folder) với NGUYÊN id nên lịch sử/đăng nhập trong profile còn nguyên. */
export function openProject(dir: string): Project {
  const absPath = path.resolve(dir);
  const ws = loadWorkspace();
  const existing = ws.projects.find((p) => samePath(p.path, absPath));
  if (existing) return existing;
  const removed = (ws.removedProjects ?? []).find((p) => samePath(p.path, absPath));
  if (removed) {
    ws.removedProjects = (ws.removedProjects ?? []).filter((p) => p.id !== removed.id);
    if (ws.projects.some((p) => p.name === removed.name)) removed.name = uniqueName(ws.projects, removed.name);
    ws.projects.push(removed);
    saveWorkspace(ws);
    return removed;
  }
  return addProject({ name: uniqueName(ws.projects, path.basename(absPath)), path: absPath });
}

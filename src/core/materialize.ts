import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveCommand } from "./which.js";
import { getProvider } from "./providers.js";
import { effectiveSkills } from "./skills.js";
import { effectiveMcps } from "./mcp.js";
import type { McpServer, SkillInstall } from "./types.js";

export interface SkillMaterializeResult {
  linked: string[];
  skipped: string[];
  removed: string[]; // link cũ/thừa đã gỡ
  missing: string[]; // nguồn không tồn tại / link lỗi
}

export interface McpMaterializeResult {
  added: string[];
  present: string[];
  removed: string[]; // MCP đã gỡ khỏi registry → gỡ khỏi config
  failed: string[];
  claudeMissing?: boolean;
  unsupported?: boolean; // provider có MCP nhưng aiws chưa materialize được (vd codex)
}

export interface MaterializeSummary {
  skills?: SkillMaterializeResult;
  mcp?: McpMaterializeResult;
}

// ---- skills (junction) ----

function isLink(p: string): boolean {
  try {
    fs.readlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Gỡ một junction/symlink mà KHÔNG đụng target. Bỏ qua thư mục thật (rmdir non-empty sẽ ném). */
function safeRemoveLink(p: string): boolean {
  try {
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) fs.unlinkSync(p);
    else if (st.isDirectory()) fs.rmdirSync(p); // junction Windows: rmdir gỡ reparse point, không xoá target
    else fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Nếu cùng tên global & project → project thắng (override). */
function preferProject(skills: SkillInstall[]): SkillInstall[] {
  const byName = new Map<string, SkillInstall>();
  for (const s of skills) {
    const cur = byName.get(s.name);
    if (!cur || (cur.scope === "global" && s.scope === "project")) byName.set(s.name, s);
  }
  return [...byName.values()];
}

/** Reconcile $CONFIG_DIR/skills về đúng tập desired: gỡ link thừa/sai, thêm link mới. */
export function materializeSkills(configDir: string, skillsIn: SkillInstall[]): SkillMaterializeResult {
  const res: SkillMaterializeResult = { linked: [], skipped: [], removed: [], missing: [] };
  const skills = preferProject(skillsIn);
  const skillsDir = path.join(configDir, "skills");
  const desired = new Map(skills.map((s) => [s.name, s]));

  // 1) Gỡ các link do aiws quản (chỉ link, không đụng dir thật) mà thừa hoặc trỏ sai nguồn.
  if (fs.existsSync(skillsDir)) {
    for (const name of fs.readdirSync(skillsDir)) {
      const dest = path.join(skillsDir, name);
      if (!isLink(dest)) continue; // dir thật của user → không đụng
      const want = desired.get(name);
      let target: string | null = null;
      try {
        target = fs.readlinkSync(dest);
      } catch {
        target = null;
      }
      const wrong = want && target && path.resolve(target) !== path.resolve(want.source);
      if (!want || wrong) {
        if (safeRemoveLink(dest) && !want) res.removed.push(name);
      }
    }
  }

  // 2) Thêm link còn thiếu.
  if (skills.length > 0) fs.mkdirSync(skillsDir, { recursive: true });
  for (const s of skills) {
    const dest = path.join(skillsDir, s.name);
    if (fs.existsSync(dest)) {
      res.skipped.push(s.name);
      continue;
    }
    if (!fs.existsSync(s.source)) {
      res.missing.push(s.name);
      continue;
    }
    try {
      fs.symlinkSync(s.source, dest, process.platform === "win32" ? "junction" : "dir");
      res.linked.push(s.name);
    } catch {
      res.missing.push(s.name);
    }
  }
  return res;
}

// ---- MCP (qua `claude mcp`) ----

function spawnClaudeSync(args: string[], configDir: string): { ok: boolean; found: boolean } {
  const resolved = resolveCommand("claude");
  if (!resolved) return { ok: false, found: false };
  let cmd = resolved;
  let a = args;
  const ext = path.extname(resolved).toLowerCase();
  if (process.platform === "win32" && (ext === ".cmd" || ext === ".bat")) {
    cmd = process.env.ComSpec ?? "cmd.exe";
    a = ["/c", resolved, ...args];
  }
  const r = spawnSync(cmd, a, { env: { ...process.env, CLAUDE_CONFIG_DIR: configDir }, encoding: "utf8" });
  return { ok: r.status === 0, found: true };
}

function claudeMcpAddArgs(m: McpServer): string[] {
  const transport = m.transport ?? "stdio";
  const args = ["mcp", "add", m.name];
  if (transport !== "stdio") args.push("--transport", transport);
  args.push("--scope", "user");
  for (const [k, v] of Object.entries(m.env ?? {})) args.push("-e", `${k}=${v}`);
  if (transport === "stdio") args.push("--", m.command, ...(m.args ?? []));
  else args.push(m.command);
  return args;
}

// Marker: tên các MCP do aiws cài trong config-dir này → để reconcile (gỡ cái đã bỏ khỏi registry).
function markerPath(configDir: string): string {
  return path.join(configDir, ".aiws-mcp.json");
}
function readManaged(configDir: string): string[] {
  try {
    return JSON.parse(fs.readFileSync(markerPath(configDir), "utf8")) as string[];
  } catch {
    return [];
  }
}
function writeManaged(configDir: string, names: string[]): void {
  try {
    fs.writeFileSync(markerPath(configDir), JSON.stringify(names), "utf8");
  } catch {
    /* ignore */
  }
}

/** Reconcile MCP trong config-dir: gỡ cái aiws từng cài mà nay bỏ khỏi registry, thêm cái mới. */
export function materializeClaudeMcp(configDir: string, mcps: McpServer[]): McpMaterializeResult {
  const res: McpMaterializeResult = { added: [], present: [], removed: [], failed: [] };
  const desired = new Set(mcps.map((m) => m.name));
  const managed = readManaged(configDir);

  // gỡ cái từng do aiws cài nhưng nay không còn desired
  let claudeFound = true;
  for (const name of managed) {
    if (desired.has(name)) continue;
    const r = spawnClaudeSync(["mcp", "remove", name], configDir);
    if (!r.found) {
      claudeFound = false;
      break;
    }
    if (r.ok) res.removed.push(name);
  }
  if (!claudeFound) {
    res.claudeMissing = true;
    return res;
  }

  // thêm cái còn thiếu (idempotent qua `mcp get`)
  for (const m of mcps) {
    const got = spawnClaudeSync(["mcp", "get", m.name], configDir);
    if (!got.found) {
      res.claudeMissing = true;
      return res;
    }
    if (got.ok) {
      res.present.push(m.name);
      continue;
    }
    const added = spawnClaudeSync(claudeMcpAddArgs(m), configDir);
    if (added.ok) res.added.push(m.name);
    else res.failed.push(m.name);
  }

  // ghi lại marker = tập desired (những cái aiws quản)
  writeManaged(configDir, [...desired]);
  return res;
}

export function materialize(projectId: string, providerId: string, configDir: string): MaterializeSummary {
  const provider = getProvider(providerId);
  const summary: MaterializeSummary = {};
  if (provider?.supportsSkills) {
    summary.skills = materializeSkills(configDir, effectiveSkills(projectId));
  }
  if (provider?.supportsMcp) {
    if (providerId === "claude") {
      summary.mcp = materializeClaudeMcp(configDir, effectiveMcps(projectId));
    } else if (effectiveMcps(projectId).length > 0) {
      // provider có MCP nhưng aiws chưa biết cách materialize (vd codex) → báo, đừng im lặng.
      summary.mcp = { added: [], present: [], removed: [], failed: [], unsupported: true };
    }
  }
  return summary;
}

/** Dòng tóm tắt ngắn để in ra CLI (rỗng nếu không có gì đáng nói). */
export function summaryLine(s: MaterializeSummary): string {
  const parts: string[] = [];
  if (s.skills) {
    const ok = s.skills.linked.length + s.skills.skipped.length;
    const bad = s.skills.missing.length;
    const rm = s.skills.removed.length;
    if (ok > 0 || bad > 0 || rm > 0) {
      parts.push(`skills: ${ok}${rm ? ` -${rm}` : ""}${bad ? ` (${bad} lỗi nguồn)` : ""}`);
    }
  }
  if (s.mcp) {
    if (s.mcp.claudeMissing) parts.push("mcp: (bỏ qua — claude không có trong PATH)");
    else if (s.mcp.unsupported) parts.push("mcp: (provider này aiws chưa materialize được)");
    else {
      const ok = s.mcp.added.length + s.mcp.present.length;
      const bits: string[] = [];
      if (ok > 0) bits.push(`${ok}`);
      if (s.mcp.removed.length) bits.push(`-${s.mcp.removed.length}`);
      if (s.mcp.failed.length) bits.push(`${s.mcp.failed.length} lỗi`);
      if (bits.length) parts.push(`mcp: ${bits.join(" ")}`);
    }
  }
  return parts.join(" · ");
}

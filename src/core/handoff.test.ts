import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeHandoff } from "./handoff.js";
import { buildIsolatedEnv } from "./isolation.js";
import { getProvider } from "./providers.js";
import { encodeProjectDir } from "./sessionContext.js";
import { loadWorkspace, saveWorkspace } from "./storage.js";
import type { Project } from "./types.js";

let tmp: string;
let projDir: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-handoff-"));
  process.env.AIWS_HOME = tmp;
  projDir = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-hproj-"));
});
afterEach(() => {
  delete process.env.AIWS_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(projDir, { recursive: true, force: true });
});

function proj(): Project {
  return { id: "p", name: "p", path: projDir, terminals: [], services: [] };
}

function seedClaudeTranscript(configDir: string, cwd: string): void {
  const dir = path.join(configDir, "projects", encodeProjectDir(cwd));
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    JSON.stringify({ type: "user", message: { role: "user", content: "xin chào" } }),
    JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "chào bạn" }] } }),
    JSON.stringify({ isSidechain: true, message: { role: "assistant", content: [{ type: "text", text: "SUBAGENT-BO" }] } }),
    JSON.stringify({ type: "user", message: { role: "user", content: "<command-name>/model</command-name>" } }),
  ];
  fs.writeFileSync(path.join(dir, "s1.jsonl"), lines.join("\n"));
}

describe("conversation handoff (file trung gian)", () => {
  it("xuất hội thoại claude → provider khác; lọc sub-agent + command noise", () => {
    const p = proj();
    const claudeDir = buildIsolatedEnv(p, getProvider("claude")!).configDir;
    seedClaudeTranscript(claudeDir, p.path);

    const h = writeHandoff(p, "codex");
    expect(h).not.toBeNull();
    expect(h!.from).toBe("claude");
    expect(h!.count).toBe(2); // "xin chào" + "chào bạn" (bỏ subagent + /model)

    const md = fs.readFileSync(path.join(p.path, ".aiws-handoff.md"), "utf8");
    expect(md).toContain("xin chào");
    expect(md).toContain("chào bạn");
    expect(md).not.toContain("SUBAGENT-BO");
    expect(md).not.toContain("/model");
  });

  it("CÙNG provider (claude) → không handoff (đã chia sẻ trực tiếp)", () => {
    const p = proj();
    const claudeDir = buildIsolatedEnv(p, getProvider("claude")!).configDir;
    seedClaudeTranscript(claudeDir, p.path);
    expect(writeHandoff(p, "claude")).toBeNull();
  });

  it("carryConversation=false → không handoff", () => {
    const p = proj();
    const claudeDir = buildIsolatedEnv(p, getProvider("claude")!).configDir;
    seedClaudeTranscript(claudeDir, p.path);
    const ws = loadWorkspace();
    ws.carryConversation = false;
    saveWorkspace(ws);
    expect(writeHandoff(p, "codex")).toBeNull();
  });
});

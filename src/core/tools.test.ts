import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCliTools } from "./tools.js";
import { buildProjectEnv } from "./isolation.js";
import { saveWorkspace, defaultWorkspace } from "./storage.js";
import type { Project } from "./types.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-test-"));
  process.env.AIWS_HOME = tmp;
});

afterEach(() => {
  delete process.env.AIWS_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function proj(id: string): Project {
  return { id, name: id, path: "/tmp/" + id, terminals: [], services: [] };
}

describe("cli tools registry", () => {
  it("ship preset gh/git/aws/gcloud/docker/kubectl/npm", () => {
    const ids = getCliTools().map((t) => t.id);
    for (const id of ["gh", "git", "aws", "gcloud", "docker", "kubectl", "npm"]) {
      expect(ids).toContain(id);
    }
  });

  it("config.cliTools thêm/ghi đè theo id", () => {
    const ws = defaultWorkspace();
    ws.cliTools.push({ id: "vercel", isolationEnv: [{ var: "VERCEL_DIR", kind: "dir" }] });
    saveWorkspace(ws);
    expect(getCliTools().map((t) => t.id)).toContain("vercel");
  });
});

describe("buildProjectEnv", () => {
  it("kind=dir → env trỏ vào tools/<id> và tạo dir", () => {
    const { GH_CONFIG_DIR } = buildProjectEnv(proj("p1"));
    expect(GH_CONFIG_DIR).toContain(path.join("profiles", "p1", "tools", "gh"));
    expect(fs.existsSync(GH_CONFIG_DIR!)).toBe(true);
  });

  it("kind=file → env trỏ tới file, parent dir tồn tại", () => {
    const env = buildProjectEnv(proj("p1"));
    expect(env.GIT_CONFIG_GLOBAL).toContain(path.join("tools", "git", ".gitconfig"));
    expect(fs.existsSync(path.dirname(env.GIT_CONFIG_GLOBAL!))).toBe(true);
    // aws có 2 file riêng
    expect(env.AWS_CONFIG_FILE).toContain(path.join("tools", "aws", "config"));
    expect(env.AWS_SHARED_CREDENTIALS_FILE).toContain(path.join("tools", "aws", "credentials"));
  });

  it("2 project → env khác dir (cô lập)", () => {
    const a = buildProjectEnv(proj("a"));
    const b = buildProjectEnv(proj("b"));
    expect(a.GH_CONFIG_DIR).not.toBe(b.GH_CONFIG_DIR);
    expect(a.GIT_CONFIG_GLOBAL).not.toBe(b.GIT_CONFIG_GLOBAL);
  });

  it("giữ nguyên env khác của process", () => {
    process.env.__AIWS_KEEP = "keep";
    expect(buildProjectEnv(proj("p")).__AIWS_KEEP).toBe("keep");
    delete process.env.__AIWS_KEEP;
  });
});

describe("buildIsolatedEnv thừa hưởng CLI tool env", () => {
  it("provider launch cũng có GH_CONFIG_DIR cô lập", async () => {
    const { buildIsolatedEnv } = await import("./isolation.js");
    const { getProvider } = await import("./providers.js");
    const env = buildIsolatedEnv(proj("p"), getProvider("claude")!).env;
    expect(env.GH_CONFIG_DIR).toContain(path.join("tools", "gh"));
    expect(env.CLAUDE_CONFIG_DIR).toContain(path.join("profiles", "p", "claude"));
  });
});

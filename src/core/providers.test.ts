import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getProvider, getProviders } from "./providers.js";
import { saveWorkspace, defaultWorkspace } from "./storage.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-test-"));
  process.env.AIWS_HOME = tmp;
});

afterEach(() => {
  delete process.env.AIWS_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("providers", () => {
  it("ship sẵn 3 preset claude/codex/ollama", () => {
    const ids = getProviders().map((p) => p.id);
    expect(ids).toContain("claude");
    expect(ids).toContain("codex");
    expect(ids).toContain("ollama");
  });

  it("claude hỗ trợ skill/mcp/account; ollama là local không account", () => {
    const claude = getProvider("claude")!;
    expect(claude.supportsSkills).toBe(true);
    expect(claude.hasAccounts).toBe(true);
    const ollama = getProvider("ollama")!;
    expect(ollama.hasAccounts).toBe(false);
    expect(ollama.authMethods).toEqual(["local"]);
  });

  it("config.providers ghi đè preset theo id", () => {
    const ws = defaultWorkspace();
    ws.providers.push({
      id: "claude",
      launchCmd: ["claude", "--custom"],
      isolationEnv: ["CLAUDE_CONFIG_DIR"],
      authMethods: ["api_key"],
      supportsSkills: true,
      supportsMcp: true,
      hasAccounts: true,
    });
    saveWorkspace(ws);
    expect(getProvider("claude")!.launchCmd).toEqual(["claude", "--custom"]);
  });
});

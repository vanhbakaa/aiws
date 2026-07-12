import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIsolatedEnv, providerConfigDir } from "./isolation.js";
import { getProvider } from "./providers.js";
import { addAccount } from "./accounts.js";
import { loadWorkspace, saveWorkspace } from "./storage.js";
import type { Project } from "./types.js";

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-conv-"));
  process.env.AIWS_HOME = tmp;
});
afterEach(() => {
  delete process.env.AIWS_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});
function proj(id: string): Project {
  return { id, name: id, path: "/tmp/" + id, terminals: [], services: [] };
}

describe("shared conversations", () => {
  it("oauth account → config-dir GLOBAL riêng, KHÔNG junction (switch mang chat qua carryTranscript)", () => {
    const claude = getProvider("claude")!;
    const a = addAccount({ providerId: "claude", label: "a", authMethod: "oauth_login" });
    const b = addAccount({ providerId: "claude", label: "b", authMethod: "oauth_login" });
    const p = proj("p");

    const ra = buildIsolatedEnv(p, claude, a);
    const rb = buildIsolatedEnv(p, claude, b);

    // mỗi account 1 dir global riêng (auth + history tách bạch)
    expect(ra.configDir).not.toBe(rb.configDir);
    // KHÔNG junction "projects" → không trói toàn bộ history của account vào một project
    const pj = path.join(ra.configDir, "projects");
    if (fs.existsSync(pj)) expect(fs.lstatSync(pj).isSymbolicLink()).toBe(false);
  });

  it("KHÁC provider (claude vs codex) → KHÔNG chia sẻ", () => {
    const p = proj("p");
    const rc = buildIsolatedEnv(p, getProvider("claude")!);
    const rx = buildIsolatedEnv(p, getProvider("codex")!);
    expect(fs.realpathSync(path.join(rc.configDir, "projects"))).not.toBe(
      fs.realpathSync(path.join(rx.configDir, "sessions")),
    );
  });

  it("GỘP transcript cũ (dir thật project-scoped) vào kho chung, không mất dữ liệu", () => {
    const claude = getProvider("claude")!;
    const p = proj("p");
    // dir project-scoped (env-based/no-account) đã có transcript THẬT trước khi chia sẻ
    const dir = providerConfigDir(p, claude); // profiles/p/claude
    fs.mkdirSync(path.join(dir, "projects"), { recursive: true });
    fs.writeFileSync(path.join(dir, "projects", "old.jsonl"), "old");

    const r = buildIsolatedEnv(p, claude); // no account → junction áp dụng
    expect(fs.lstatSync(path.join(r.configDir, "projects")).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(r.configDir, "projects", "old.jsonl"), "utf8")).toBe("old");
  });

  it("shareConversations=false → giữ thư mục thật, không junction", () => {
    const ws = loadWorkspace();
    ws.shareConversations = false;
    saveWorkspace(ws);
    const r = buildIsolatedEnv(proj("p"), getProvider("claude")!);
    const pj = path.join(r.configDir, "projects");
    // không tạo junction (thư mục hoặc không tồn tại, hoặc là dir thật)
    if (fs.existsSync(pj)) expect(fs.lstatSync(pj).isSymbolicLink()).toBe(false);
  });
});

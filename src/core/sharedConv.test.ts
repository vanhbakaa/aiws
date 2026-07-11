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
  it("CÙNG provider, KHÁC account (oauth) → transcript dùng chung + đọc chéo được", () => {
    const claude = getProvider("claude")!;
    const a = addAccount({ providerId: "claude", label: "a", authMethod: "oauth_login" });
    const b = addAccount({ providerId: "claude", label: "b", authMethod: "oauth_login" });
    const p = proj("p");

    const ra = buildIsolatedEnv(p, claude, a);
    const rb = buildIsolatedEnv(p, claude, b);

    // config-dir (auth) KHÁC nhau
    expect(ra.configDir).not.toBe(rb.configDir);
    // nhưng projects/ trỏ CÙNG kho chung
    expect(fs.realpathSync(path.join(ra.configDir, "projects"))).toBe(
      fs.realpathSync(path.join(rb.configDir, "projects")),
    );
    // ghi qua A → đọc được qua B
    fs.writeFileSync(path.join(ra.configDir, "projects", "s1.jsonl"), "hi");
    expect(fs.existsSync(path.join(rb.configDir, "projects", "s1.jsonl"))).toBe(true);
  });

  it("KHÁC provider (claude vs codex) → KHÔNG chia sẻ", () => {
    const p = proj("p");
    const rc = buildIsolatedEnv(p, getProvider("claude")!);
    const rx = buildIsolatedEnv(p, getProvider("codex")!);
    expect(fs.realpathSync(path.join(rc.configDir, "projects"))).not.toBe(
      fs.realpathSync(path.join(rx.configDir, "sessions")),
    );
  });

  it("GỘP transcript cũ (dir thật) vào kho chung, không mất dữ liệu", () => {
    const claude = getProvider("claude")!;
    const a = addAccount({ providerId: "claude", label: "a", authMethod: "oauth_login" });
    const p = proj("p");
    // giả lập account A đã có transcript THẬT trước khi chia sẻ
    const dirA = providerConfigDir(p, claude, a);
    fs.mkdirSync(path.join(dirA, "projects"), { recursive: true });
    fs.writeFileSync(path.join(dirA, "projects", "old.jsonl"), "old");

    const ra = buildIsolatedEnv(p, claude, a);
    expect(fs.lstatSync(path.join(ra.configDir, "projects")).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(ra.configDir, "projects", "old.jsonl"), "utf8")).toBe("old");
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

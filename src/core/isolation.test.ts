import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIsolatedEnv, providerConfigDir } from "./isolation.js";
import { getProvider } from "./providers.js";
import { addAccount } from "./accounts.js";
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

describe("isolation", () => {
  it("set isolationEnv trỏ vào config dir và tạo dir", () => {
    const claude = getProvider("claude")!;
    const { env, configDir } = buildIsolatedEnv(proj("p1"), claude);
    expect(env.CLAUDE_CONFIG_DIR).toBe(configDir);
    expect(fs.existsSync(configDir)).toBe(true);
    expect(configDir).toContain(path.join("profiles", "p1", "claude"));
  });

  it("2 project khác nhau → config dir khác nhau (cô lập)", () => {
    const claude = getProvider("claude")!;
    const a = buildIsolatedEnv(proj("a"), claude);
    const b = buildIsolatedEnv(proj("b"), claude);
    expect(a.configDir).not.toBe(b.configDir);
  });

  it("giữ nguyên các env khác của process", () => {
    process.env.__AIWS_KEEP = "keep-me";
    const claude = getProvider("claude")!;
    const { env } = buildIsolatedEnv(proj("p"), claude);
    expect(env.__AIWS_KEEP).toBe("keep-me");
    delete process.env.__AIWS_KEEP;
  });

  it("INVARIANT hot-switch: 2 account api_key DÙNG CHUNG config dir (giữ session), khác env", () => {
    const claude = getProvider("claude")!;
    const a1 = addAccount({ providerId: "claude", label: "work", authMethod: "api_key", secret: { apiKey: "KEY_A" } });
    const a2 = addAccount({ providerId: "claude", label: "personal", authMethod: "api_key", secret: { apiKey: "KEY_B" } });

    const r1 = buildIsolatedEnv(proj("p"), claude, a1);
    const r2 = buildIsolatedEnv(proj("p"), claude, a2);

    // config dir GIỐNG nhau → session trong dir đó được giữ khi switch
    expect(r1.configDir).toBe(r2.configDir);
    // nhưng auth (env) khác nhau
    expect(r1.env.ANTHROPIC_API_KEY).toBe("KEY_A");
    expect(r2.env.ANTHROPIC_API_KEY).toBe("KEY_B");
  });

  it("oauth_login → config dir GLOBAL theo account (login dùng chung mọi project)", () => {
    const claude = getProvider("claude")!;
    const a1 = addAccount({ providerId: "claude", label: "acc1", authMethod: "oauth_login" });
    const a2 = addAccount({ providerId: "claude", label: "acc2", authMethod: "oauth_login" });
    const d1 = providerConfigDir(proj("p"), claude, a1);
    const d2 = providerConfigDir(proj("p"), claude, a2);
    expect(d1).not.toBe(d2); // khác account → khác dir
    expect(d1).toContain(path.join("accounts", a1.id, "claude"));
    // CÙNG account, KHÁC project → CÙNG dir → không phải login lại khi đổi project
    expect(providerConfigDir(proj("p1"), claude, a1)).toBe(providerConfigDir(proj("p2"), claude, a1));
  });

  it("di trú login+lịch sử cũ (per-project) sang dir global lần đầu (không mất chat/đăng nhập)", () => {
    const claude = getProvider("claude")!;
    const a = addAccount({ providerId: "claude", label: "a", authMethod: "oauth_login" });
    // giả lập scheme CŨ: profiles/<projId>/claude__<accId>/{.credentials.json, projects/enc/s.jsonl}
    const legacy = path.join(tmp, "profiles", "projX", `claude__${a.id}`);
    fs.mkdirSync(path.join(legacy, "projects", "enc"), { recursive: true });
    fs.writeFileSync(path.join(legacy, ".credentials.json"), "{}");
    fs.writeFileSync(path.join(legacy, "projects", "enc", "s.jsonl"), "x");

    const { configDir } = buildIsolatedEnv(proj("p"), claude, a);
    expect(configDir).toContain(path.join("accounts", a.id, "claude"));
    expect(fs.existsSync(path.join(configDir, ".credentials.json"))).toBe(true); // login được mang sang
    expect(fs.existsSync(path.join(configDir, "projects", "enc", "s.jsonl"))).toBe(true); // lịch sử được mang sang
  });

  it("KHÁC provider trong CÙNG project (claude vs codex) → config dir khác → session KHÔNG chia sẻ", () => {
    const claude = getProvider("claude")!;
    const codex = getProvider("codex")!;
    const p = proj("p");
    // direct (không account) và cả có account đều tách theo provider
    expect(providerConfigDir(p, claude)).not.toBe(providerConfigDir(p, codex));
    const ca = addAccount({ providerId: "claude", label: "c", authMethod: "oauth_login" });
    const xa = addAccount({ providerId: "codex", label: "x", authMethod: "oauth_login" });
    expect(providerConfigDir(p, claude, ca)).not.toBe(providerConfigDir(p, codex, xa));
  });
});

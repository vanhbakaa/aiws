import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addAccount,
  accountEnv,
  getDefaultAccount,
  listAccounts,
  nextAccount,
  removeAccount,
  resolveAccountEnv,
  setDefaultAccount,
} from "./accounts.js";
import { getSecret } from "./secrets.js";
import { getProvider } from "./providers.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-test-"));
  process.env.AIWS_HOME = tmp;
});

afterEach(() => {
  delete process.env.AIWS_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("accounts CRUD", () => {
  it("add + list; account đầu tiên là default", () => {
    addAccount({ providerId: "claude", label: "work", authMethod: "api_key", secret: { apiKey: "A" } });
    const list = listAccounts("claude");
    expect(list).toHaveLength(1);
    expect(list[0].isDefault).toBe(true);
    expect(getDefaultAccount("claude")!.label).toBe("work");
  });

  it("add trùng label cùng provider → lỗi", () => {
    addAccount({ providerId: "claude", label: "work", authMethod: "api_key" });
    expect(() => addAccount({ providerId: "claude", label: "work", authMethod: "api_key" })).toThrow(/đã tồn tại/);
  });

  it("secret lưu tách vào secrets.json", () => {
    const a = addAccount({ providerId: "claude", label: "work", authMethod: "api_key", secret: { apiKey: "SECRET" } });
    expect(getSecret(a.id)!.apiKey).toBe("SECRET");
    // config.json KHÔNG chứa key
    const cfg = fs.readFileSync(path.join(tmp, "config.json"), "utf8");
    expect(cfg).not.toContain("SECRET");
  });

  it("remove xoá account + secret; default chuyển sang account còn lại", () => {
    const a = addAccount({ providerId: "claude", label: "work", authMethod: "api_key", secret: { apiKey: "A" } });
    addAccount({ providerId: "claude", label: "personal", authMethod: "api_key", secret: { apiKey: "B" } });
    expect(removeAccount("claude", "work")).toBe(true);
    expect(getSecret(a.id)).toBeUndefined();
    expect(getDefaultAccount("claude")!.label).toBe("personal");
  });

  it("setDefault đổi account mặc định", () => {
    addAccount({ providerId: "claude", label: "work", authMethod: "api_key" });
    addAccount({ providerId: "claude", label: "personal", authMethod: "api_key" });
    setDefaultAccount("claude", "personal");
    expect(getDefaultAccount("claude")!.label).toBe("personal");
  });
});

describe("nextAccount (round-robin né limit)", () => {
  it("luân phiên vòng tròn", () => {
    const a = addAccount({ providerId: "claude", label: "a", authMethod: "api_key" });
    const b = addAccount({ providerId: "claude", label: "b", authMethod: "api_key" });
    const c = addAccount({ providerId: "claude", label: "c", authMethod: "api_key" });
    expect(nextAccount("claude", a.id)!.label).toBe("b");
    expect(nextAccount("claude", b.id)!.label).toBe("c");
    expect(nextAccount("claude", c.id)!.label).toBe("a"); // vòng lại
  });
});

describe("resolveAccountEnv theo auth method", () => {
  const claude = () => getProvider("claude")!;

  it("api_key → set ANTHROPIC_API_KEY (+ base url nếu có)", () => {
    const a = addAccount({
      providerId: "claude",
      label: "k",
      authMethod: "api_key",
      secret: { apiKey: "KEY", baseUrl: "https://proxy" },
    });
    const env = accountEnv(claude(), a);
    expect(env.ANTHROPIC_API_KEY).toBe("KEY");
    expect(env.ANTHROPIC_BASE_URL).toBe("https://proxy");
  });

  it("cloud → merge env tuỳ chỉnh (Bedrock/Vertex)", () => {
    const a = addAccount({
      providerId: "claude",
      label: "bedrock",
      authMethod: "cloud",
      secret: { env: { CLAUDE_CODE_USE_BEDROCK: "1", AWS_PROFILE: "myprofile" } },
    });
    const env = accountEnv(claude(), a);
    expect(env.CLAUDE_CODE_USE_BEDROCK).toBe("1");
    expect(env.AWS_PROFILE).toBe("myprofile");
  });

  it("oauth_login → không set env (auth nằm trong config-dir riêng)", () => {
    const a = addAccount({ providerId: "claude", label: "sub", authMethod: "oauth_login" });
    expect(resolveAccountEnv(claude(), a, undefined)).toEqual({});
  });

  it("không account → env rỗng", () => {
    expect(resolveAccountEnv(claude(), undefined, undefined)).toEqual({});
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addProject, getProjectByName } from "./projects.js";
import { prepareRun, prepareShell, prepareSwitch, launchInline, type LaunchSpec } from "./run.js";
import { addAccount } from "./accounts.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-test-"));
  process.env.AIWS_HOME = tmp;
});

afterEach(() => {
  delete process.env.AIWS_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("prepareRun", () => {
  it("tạo terminal auto-name, gán session-id và env cô lập", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });

    const spec = prepareRun("shop", "claude");
    expect(spec.cmd).toBe("claude");
    expect(spec.terminal.name).toBe("claude 1");
    expect(spec.env.CLAUDE_CONFIG_DIR).toContain("profiles");
    expect(spec.cwd).toBe(path.resolve(dir));
    expect(spec.mode).toBe("run");
    // provider claude có sessionIdFlag → args chứa --session-id <uuid>
    expect(spec.terminal.sessionId).toBeDefined();
    expect(spec.args).toContain("--session-id");
    expect(spec.args).toContain(spec.terminal.sessionId);

    expect(getProjectByName("shop")!.terminals).toHaveLength(1);
  });

  it("chọn account default khi không chỉ định; --account chọn account cụ thể", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });
    addAccount({ providerId: "claude", label: "work", authMethod: "api_key", secret: { apiKey: "A" } });
    addAccount({ providerId: "claude", label: "personal", authMethod: "api_key", secret: { apiKey: "B" } });

    const def = prepareRun("shop", "claude");
    expect(def.accountLabel).toBe("work"); // account đầu = default
    expect(def.env.ANTHROPIC_API_KEY).toBe("A");

    const chosen = prepareRun("shop", "claude", { accountLabel: "personal" });
    expect(chosen.accountLabel).toBe("personal");
    expect(chosen.env.ANTHROPIC_API_KEY).toBe("B");
  });

  it("auto-name tăng dần theo provider", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });
    prepareRun("shop", "claude");
    const second = prepareRun("shop", "claude");
    expect(second.terminal.name).toBe("claude 2");
  });

  it("báo lỗi khi project/provider không tồn tại", () => {
    expect(() => prepareRun("khong-co", "claude")).toThrow(/project/);
    const dir = path.join(tmp, "s");
    fs.mkdirSync(dir);
    addProject({ name: "s", path: dir });
    expect(() => prepareRun("s", "khong-co")).toThrow(/provider/);
  });
});

describe("prepareShell (tab terminal thuần)", () => {
  it("mở shell HĐH với env cô lập của project, không AI/account/session", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });

    const spec = prepareShell("shop");
    expect(spec.providerId).toBe("shell");
    expect(spec.terminal.name).toBe("shell 1");
    expect(spec.terminal.providerId).toBe("shell");
    expect(spec.terminal.sessionId).toBeUndefined(); // shell không có session
    expect(spec.terminal.aiAccountId).toBeUndefined(); // không account
    expect(spec.accountLabel).toBeUndefined();
    expect(spec.configDir).toBe(""); // không có config-dir provider
    expect(spec.cwd).toBe(path.resolve(dir));
    expect(spec.cmd.length).toBeGreaterThan(0); // shell HĐH đã resolve
    expect(getProjectByName("shop")!.terminals).toHaveLength(1);
  });

  it("auto-name tăng dần; báo lỗi khi project không tồn tại", () => {
    const dir = path.join(tmp, "s");
    fs.mkdirSync(dir);
    addProject({ name: "s", path: dir });
    prepareShell("s");
    expect(prepareShell("s").terminal.name).toBe("shell 2");
    expect(() => prepareShell("khong-co")).toThrow(/project/);
  });
});

describe("prepareSwitch (hot-switch)", () => {
  function setup2Accounts() {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });
    addAccount({ providerId: "claude", label: "work", authMethod: "api_key", secret: { apiKey: "A" } });
    addAccount({ providerId: "claude", label: "personal", authMethod: "api_key", secret: { apiKey: "B" } });
    return dir;
  }

  it("đổi account, GIỮ config dir & session, resume đúng phiên", () => {
    setup2Accounts();
    const run = prepareRun("shop", "claude"); // account work (A), session S
    const sw = prepareSwitch("shop"); // luân phiên → personal (B)

    expect(sw.mode).toBe("switch");
    expect(sw.accountLabel).toBe("personal");
    expect(sw.env.ANTHROPIC_API_KEY).toBe("B");
    // INVARIANT: config dir không đổi → session giữ nguyên
    expect(sw.env.CLAUDE_CONFIG_DIR).toBe(run.env.CLAUDE_CONFIG_DIR);
    // resume ĐÚNG session của terminal đó
    expect(sw.args).toContain("--resume");
    expect(sw.args).toContain(run.terminal.sessionId);
    expect(sw.terminal.sessionId).toBe(run.terminal.sessionId);
  });

  it("--to chọn account cụ thể", () => {
    setup2Accounts();
    prepareRun("shop", "claude");
    const sw = prepareSwitch("shop", undefined, { toLabel: "work" });
    expect(sw.accountLabel).toBe("work");
    expect(sw.env.ANTHROPIC_API_KEY).toBe("A");
  });

  it("oauth: mang transcript sang config-dir account mới rồi resume đúng phiên", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });
    addAccount({ providerId: "claude", label: "a", authMethod: "oauth_login" });
    addAccount({ providerId: "claude", label: "b", authMethod: "oauth_login" });

    const run = prepareRun("shop", "claude", { accountLabel: "a" });
    // giả lập 1 transcript trong config-dir của account a
    const enc = run.cwd.replace(/[^a-zA-Z0-9]/g, "-");
    fs.mkdirSync(path.join(run.configDir, "projects", enc), { recursive: true });
    const sid = "sess-xyz";
    fs.writeFileSync(path.join(run.configDir, "projects", enc, `${sid}.jsonl`), '{"message":{}}\n');

    const sw = prepareSwitch("shop", run.terminal.name, { toLabel: "b" });
    expect(sw.accountLabel).toBe("b");
    expect(sw.configDir).not.toBe(run.configDir); // oauth: mỗi account 1 config-dir riêng
    // transcript được copy sang dir account b + resume đúng id đã mang
    expect(fs.existsSync(path.join(sw.configDir, "projects", enc, `${sid}.jsonl`))).toBe(true);
    expect(sw.args).toContain("--resume");
    expect(sw.args).toContain(sid);
  });

  it("về đăng nhập trực tiếp (toDirect) dùng config-dir chung, không account", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });
    addAccount({ providerId: "claude", label: "a", authMethod: "oauth_login" });
    const run = prepareRun("shop", "claude", { accountLabel: "a" });
    const sw = prepareSwitch("shop", run.terminal.name, { toDirect: true });
    expect(sw.accountLabel).toBeUndefined();
    expect(sw.configDir).not.toBe(run.configDir); // dir chung ≠ dir account a
  });

  it("báo lỗi khi chỉ có 1 account mà không có --to", () => {
    const dir = path.join(tmp, "s");
    fs.mkdirSync(dir);
    addProject({ name: "s", path: dir });
    addAccount({ providerId: "claude", label: "only", authMethod: "api_key", secret: { apiKey: "A" } });
    prepareRun("s", "claude");
    expect(() => prepareSwitch("s")).toThrow(/≥2 account/);
  });
});

describe("launchInline", () => {
  const base: Omit<LaunchSpec, "cmd" | "args"> = {
    env: process.env,
    cwd: process.cwd(),
    terminal: { id: "t", name: "t", providerId: "node" },
    providerId: "node",
    projectId: "pid",
    projectName: "p",
    configDir: process.cwd(),
    mode: "run",
  };

  it("propagate exit code của child", async () => {
    const code = await launchInline({ ...base, cmd: "node", args: ["-e", "process.exit(3)"] });
    expect(code).toBe(3);
  });

  it("trả 127 khi lệnh không tồn tại", async () => {
    const code = await launchInline({ ...base, cmd: "aiws_khong_ton_tai_xyz", args: [] });
    expect(code).toBe(127);
  });
});

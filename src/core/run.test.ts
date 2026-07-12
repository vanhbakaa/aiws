import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addProject, getProjectByName } from "./projects.js";
import { prepareRun, prepareShell, prepareSwitch, launchInline, type LaunchSpec } from "./run.js";
import { addAccount, getAccountsForProvider } from "./accounts.js";

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
    addAccount({ providerId: "claude", label: "work", authMethod: "api_key", secret: { apiKey: "A" } });

    const spec = prepareRun("shop", "claude");
    expect(spec.cmd).toBe("claude");
    expect(spec.terminal.name).toBe("claude 1");
    expect(spec.env.CLAUDE_CONFIG_DIR).toContain("profiles"); // api_key → dir project-scoped
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
    addAccount({ providerId: "claude", label: "work", authMethod: "api_key", secret: { apiKey: "A" } });
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

  it("đổi account theo id (toAccountId)", () => {
    setup2Accounts();
    const personal = getAccountsForProvider("claude").find((a) => a.label === "personal")!;
    prepareRun("shop", "claude"); // account work (mặc định)
    const sw = prepareSwitch("shop", undefined, { toAccountId: personal.id });
    expect(sw.accountLabel).toBe("personal");
    expect(sw.env.ANTHROPIC_API_KEY).toBe("B");
  });

  it("bỏ 'direct': prepareRun ném lỗi khi provider có-account mà chưa thêm account nào", () => {
    const dir = path.join(tmp, "empty");
    fs.mkdirSync(dir);
    addProject({ name: "empty", path: dir });
    expect(() => prepareRun("empty", "claude")).toThrow(/chưa có tài khoản/i);
  });

  it("báo lỗi khi chỉ có 1 account mà không có --to", () => {
    const dir = path.join(tmp, "s");
    fs.mkdirSync(dir);
    addProject({ name: "s", path: dir });
    addAccount({ providerId: "claude", label: "only", authMethod: "api_key", secret: { apiKey: "A" } });
    prepareRun("s", "claude");
    expect(() => prepareSwitch("s")).toThrow(/≥2 account/);
  });

  it("đổi KHÁC LOẠI: có hội thoại nhưng đích không tổng hợp được (codex thiếu template) → fallback soft-handoff", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });
    const cwd = getProjectByName("shop")!.path;
    addAccount({ providerId: "claude", label: "c", authMethod: "oauth_login" });
    const x = addAccount({ providerId: "codex", label: "x", authMethod: "oauth_login" });
    const run = prepareRun("shop", "claude", { accountLabel: "c" });
    // claude terminal ĐÃ có hội thoại
    const enc = cwd.replace(/[^a-zA-Z0-9]/g, "-");
    const cdir = path.join(run.configDir, "projects", enc);
    fs.mkdirSync(cdir, { recursive: true });
    fs.writeFileSync(path.join(cdir, "s1.jsonl"), JSON.stringify({ message: { role: "user", content: "xin chào" } }) + "\n");
    // codex đích chưa có rollout template → synth null → switch VẪN hoàn tất + ghi soft-handoff .md
    const sw = prepareSwitch("shop", run.terminal.name, { toAccountId: x.id });
    expect(sw.providerId).toBe("codex");
    expect(fs.existsSync(path.join(cwd, ".aiws-handoff.md"))).toBe(true);
    // providerId đã được LƯU vào store (fix bug switch lần 2 định tuyến sai)
    expect(getProjectByName("shop")!.terminals.find((tm) => tm.id === run.terminal.id)!.providerId).toBe("codex");
  });

  it("đổi KHÁC LOẠI khi CHƯA có hội thoại → chỉ đổi loại, mở phiên mới sạch (không ném)", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });
    addAccount({ providerId: "claude", label: "c", authMethod: "oauth_login" });
    const x = addAccount({ providerId: "codex", label: "x", authMethod: "oauth_login" });
    const run = prepareRun("shop", "claude", { accountLabel: "c" });
    const sw = prepareSwitch("shop", run.terminal.name, { toAccountId: x.id });
    expect(sw.providerId).toBe("codex");
    expect(sw.accountLabel).toBe("x");
  });

  it("đổi KHÁC LOẠI codex→claude: nạp native hội thoại rồi --continue", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });
    const cwd = getProjectByName("shop")!.path;
    addAccount({ providerId: "codex", label: "x", authMethod: "oauth_login" });
    const cl = addAccount({ providerId: "claude", label: "c", authMethod: "oauth_login" });
    const run = prepareRun("shop", "codex", { accountLabel: "x" });
    // giả lập 1 rollout codex có hội thoại (đúng cwd) trong dir global của account codex
    const sess = path.join(run.configDir, "sessions", "2026", "01", "01");
    fs.mkdirSync(sess, { recursive: true });
    const lines = [
      { type: "session_meta", payload: { cwd, id: "s", session_id: "s" } },
      { type: "turn_context", payload: { turn_id: "t1" } },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "từ codex" }] } },
      { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "trả lời" }] } },
    ];
    fs.writeFileSync(path.join(sess, "rollout-2026-01-01T00-00-00-abc.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");

    const sw = prepareSwitch("shop", run.terminal.name, { toAccountId: cl.id });
    expect(sw.providerId).toBe("claude"); // đổi cả provider
    expect(sw.accountLabel).toBe("c");
    expect(sw.args).toContain("--continue");
    // transcript synth được ghi vào dir global của account claude, đúng cwd
    const enc = cwd.replace(/[^a-zA-Z0-9]/g, "-");
    const files = fs.readdirSync(path.join(sw.configDir, "projects", enc)).filter((f) => f.endsWith(".jsonl"));
    expect(files.length).toBeGreaterThan(0);
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

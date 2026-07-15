import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addProject, getProjectByName } from "./projects.js";
import { addAccount } from "./accounts.js";
import { accountConfigDir } from "./paths.js";
import { encodeProjectDir, firstUserPreview } from "./sessionContext.js";
import { listResumableSessions } from "./resumable.js";
import { prepareResume } from "./run.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-resume-"));
  process.env.AIWS_HOME = tmp;
});

afterEach(() => {
  delete process.env.AIWS_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Ghi một transcript claude vào config-dir GLOBAL của account cho đúng cwd. */
function writeTranscript(
  accountId: string,
  cwd: string,
  sessionId: string,
  firstUser: string | null,
  mtimeMs?: number,
): string {
  const dir = path.join(accountConfigDir(accountId, "claude"), "projects", encodeProjectDir(cwd));
  fs.mkdirSync(dir, { recursive: true });
  const lines = [JSON.stringify({ type: "mode", sessionId })];
  if (firstUser !== null) lines.push(JSON.stringify({ type: "user", message: { role: "user", content: firstUser } }));
  lines.push(JSON.stringify({ type: "assistant", message: { role: "assistant", content: "ok" } }));
  const file = path.join(dir, `${sessionId}.jsonl`);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  if (mtimeMs !== undefined) fs.utimesSync(file, mtimeMs / 1000, mtimeMs / 1000);
  return file;
}

describe("firstUserPreview", () => {
  it("lấy tin nhắn người dùng đầu tiên, bỏ record hệ thống & system-reminder", () => {
    const cwd = path.join(tmp, "proj");
    fs.mkdirSync(cwd);
    const dir = path.join(accountConfigDir("acc1", "claude"), "projects", encodeProjectDir(cwd));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "s1.jsonl");
    fs.writeFileSync(
      file,
      [
        JSON.stringify({ type: "mode" }),
        JSON.stringify({ type: "user", message: { role: "user", content: "<system-reminder>bỏ qua</system-reminder>" } }),
        JSON.stringify({ type: "user", message: { role: "user", content: "Làm chuyện nấm nhầy giúp tôi" } }),
      ].join("\n") + "\n",
    );
    expect(firstUserPreview(file)).toBe("Làm chuyện nấm nhầy giúp tôi");
  });

  it("phiên rỗng (không có tin nhắn người dùng) → chuỗi rỗng", () => {
    const cwd = path.join(tmp, "proj");
    fs.mkdirSync(cwd);
    const file = writeTranscript("acc1", cwd, "empty", null);
    expect(firstUserPreview(file)).toBe("");
  });

  it("cắt bớt tin nhắn dài kèm dấu …", () => {
    const cwd = path.join(tmp, "proj");
    fs.mkdirSync(cwd);
    const long = "a".repeat(200);
    const file = writeTranscript("acc1", cwd, "long", long);
    const p = firstUserPreview(file, 20);
    expect(p.length).toBeLessThanOrEqual(20);
    expect(p.endsWith("…")).toBe(true);
  });
});

describe("listResumableSessions", () => {
  it("gộp phiên trùng id theo mtime mới nhất (giữ account đầy đủ nhất) và sắp mới→cũ", () => {
    const cwd = path.join(tmp, "yt");
    fs.mkdirSync(cwd);
    addProject({ name: "yt", path: cwd });
    const a1 = addAccount({ providerId: "claude", label: "chính", authMethod: "oauth_login" });
    const a2 = addAccount({ providerId: "claude", label: "phụ", authMethod: "oauth_login" });

    // Cùng session "big" ở cả 2 account; bản của a2 mới hơn → phải resume dưới a2.
    writeTranscript(a1.id, cwd, "big", "quy trình nấm nhầy", 1000_000);
    writeTranscript(a2.id, cwd, "big", "quy trình nấm nhầy", 2000_000);
    // Session "small" chỉ ở a1, cũ hơn.
    writeTranscript(a1.id, cwd, "small", "cài karpathy skills", 500_000);
    // Phiên rỗng → không hiện.
    writeTranscript(a1.id, cwd, "blank", null, 3000_000);

    const sessions = listResumableSessions(getProjectByName("yt")!);
    expect(sessions.map((s) => s.sessionId)).toEqual(["big", "small"]); // mới→cũ, blank bị loại
    const big = sessions.find((s) => s.sessionId === "big")!;
    expect(big.accountId).toBe(a2.id); // bản mtime mới nhất thắng
    expect(big.accountLabel).toBe("phụ");
    expect(big.preview).toBe("quy trình nấm nhầy");
  });

  it("chỉ quét account oauth (không gồm api_key/dir per-project)", () => {
    const cwd = path.join(tmp, "yt");
    fs.mkdirSync(cwd);
    addProject({ name: "yt", path: cwd });
    const key = addAccount({ providerId: "claude", label: "key", authMethod: "api_key", secret: { apiKey: "X" } });
    writeTranscript(key.id, cwd, "s1", "xin chào");
    expect(listResumableSessions(getProjectByName("yt")!)).toHaveLength(0);
  });
});

describe("prepareResume", () => {
  it("resume đúng session bằng --resume dưới account đã lưu; tái dùng terminal", () => {
    const cwd = path.join(tmp, "yt");
    fs.mkdirSync(cwd);
    addProject({ name: "yt", path: cwd });
    const acc = addAccount({ providerId: "claude", label: "chính", authMethod: "oauth_login" });
    writeTranscript(acc.id, cwd, "sessABC", "nấm nhầy");

    const spec = prepareResume("yt", { providerId: "claude", accountId: acc.id, sessionId: "sessABC" });
    expect(spec.cmd).toBe("claude");
    expect(spec.args).toContain("--resume");
    expect(spec.args).toContain("sessABC");
    expect(spec.accountLabel).toBe("chính");
    expect(spec.env.CLAUDE_CONFIG_DIR).toBe(accountConfigDir(acc.id, "claude"));

    // resume lại lần nữa cùng (account, session) → KHÔNG sinh thêm terminal ma.
    const before = getProjectByName("yt")!.terminals.length;
    prepareResume("yt", { providerId: "claude", accountId: acc.id, sessionId: "sessABC" });
    expect(getProjectByName("yt")!.terminals.length).toBe(before);
  });

  it("session không còn trên đĩa → fallback phiên mới nhất của account", () => {
    const cwd = path.join(tmp, "yt");
    fs.mkdirSync(cwd);
    addProject({ name: "yt", path: cwd });
    const acc = addAccount({ providerId: "claude", label: "chính", authMethod: "oauth_login" });
    writeTranscript(acc.id, cwd, "newest", "phiên còn lại", 9000_000);

    const spec = prepareResume("yt", { providerId: "claude", accountId: acc.id, sessionId: "goneMissing" });
    expect(spec.args).toContain("--resume");
    expect(spec.args).toContain("newest"); // rơi về transcript mới nhất thật
    expect(spec.args).not.toContain("goneMissing");
  });
});

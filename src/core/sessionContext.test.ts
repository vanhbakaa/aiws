import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { encodeProjectDir, readSessionContext } from "./sessionContext.js";

describe("encodeProjectDir", () => {
  it("khớp convention thật của Claude (ký tự không chữ-số → '-')", () => {
    // Thư mục transcript thật của dự án này: D--du-an-du-an-claude-wordspace
    expect(encodeProjectDir("D:\\du_an\\du_an\\claude_wordspace")).toBe("D--du-an-du-an-claude-wordspace");
  });
});

describe("readSessionContext", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-ctx-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("không có file → null (fallback an toàn)", () => {
    expect(readSessionContext(tmp, "/proj", "sid-1")).toBeNull();
  });

  it("đọc usage của dòng assistant gần nhất → tính %", () => {
    const projPath = "/home/me/app";
    const sid = "sid-abc";
    const dir = path.join(tmp, "projects", encodeProjectDir(projPath));
    fs.mkdirSync(dir, { recursive: true });
    const lines = [
      JSON.stringify({ type: "user", message: { role: "user" } }),
      JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 1000, cache_read_input_tokens: 39000 } } }),
    ].join("\n");
    fs.writeFileSync(path.join(dir, `${sid}.jsonl`), lines + "\n");

    const info = readSessionContext(tmp, projPath, sid); // window mặc định 200k
    expect(info).not.toBeNull();
    expect(info!.used).toBe(40000);
    expect(info!.window).toBe(200000);
    expect(info!.pct).toBe(20);
  });

  it("model 1M → window 1,000,000", () => {
    const projPath = "/p";
    const sid = "s";
    const dir = path.join(tmp, "projects", encodeProjectDir(projPath));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${sid}.jsonl`),
      JSON.stringify({ message: { usage: { input_tokens: 100000 } } }) + "\n",
    );
    const info = readSessionContext(tmp, projPath, sid, "claude-opus-4-8[1m]");
    expect(info!.window).toBe(1_000_000);
    expect(info!.pct).toBe(10);
  });
});

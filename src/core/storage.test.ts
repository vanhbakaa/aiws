import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultWorkspace, ensureWorkspace, loadWorkspace, saveWorkspace } from "./storage.js";
import { configPath } from "./paths.js";
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

describe("storage", () => {
  it("loadWorkspace trả về mặc định khi chưa có file (không tạo file)", () => {
    const ws = loadWorkspace();
    expect(ws).toEqual(defaultWorkspace());
    expect(fs.existsSync(configPath())).toBe(false);
  });

  it("ensureWorkspace tạo config.json mặc định nếu thiếu", () => {
    const ws = ensureWorkspace();
    expect(fs.existsSync(configPath())).toBe(true);
    expect(ws.version).toBe(defaultWorkspace().version);
    expect(ws.projects).toEqual([]);
  });

  it("đọc được config.json có BOM (Notepad trên Windows)", () => {
    const ws = defaultWorkspace();
    saveWorkspace(ws);
    // Ghi lại kèm BOM ở đầu, mô phỏng file do Notepad lưu.
    fs.writeFileSync(configPath(), String.fromCharCode(0xfeff) + JSON.stringify(ws), "utf8");
    expect(() => loadWorkspace()).not.toThrow();
    expect(loadWorkspace().version).toBe(ws.version);
  });

  it("round-trip: save rồi load ra đúng dữ liệu", () => {
    const ws = defaultWorkspace();
    const project: Project = {
      id: "p1",
      name: "my-shop",
      path: "/tmp/my-shop",
      terminals: [
        { id: "t1", name: "phiên đầu", providerId: "claude", aiAccountId: "a1", sessionId: "s1" },
      ],
      services: [{ kind: "github", name: "alice-work", active: true, secretRef: "ref1" }],
    };
    ws.projects.push(project);
    saveWorkspace(ws);

    const loaded = loadWorkspace();
    expect(loaded).toEqual(ws);
    expect(loaded.projects[0].terminals[0].name).toBe("phiên đầu");
  });
});

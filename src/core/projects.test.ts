import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addProject, listProjects, openProject, removeProject } from "./projects.js";
import { addSkill, listSkills } from "./skills.js";
import { addMcp, listMcps } from "./mcp.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-test-"));
  process.env.AIWS_HOME = tmp;
});

afterEach(() => {
  delete process.env.AIWS_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("projects", () => {
  it("add rồi list ra project vừa thêm", () => {
    addProject({ name: "shop", path: "/tmp/shop" });
    const list = listProjects();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("shop");
    expect(path.isAbsolute(list[0].path)).toBe(true);
  });

  it("add trùng tên thì báo lỗi", () => {
    addProject({ name: "shop", path: "/tmp/a" });
    expect(() => addProject({ name: "shop", path: "/tmp/b" })).toThrow(/đã tồn tại/);
  });

  it("remove xoá đúng project", () => {
    addProject({ name: "shop", path: "/tmp/shop" });
    expect(removeProject("shop")).toBe(true);
    expect(listProjects()).toHaveLength(0);
    expect(removeProject("khong-co")).toBe(false);
  });

  it("open lấy tên folder làm tên project", () => {
    const dir = path.join(tmp, "my-blog");
    fs.mkdirSync(dir);
    const p = openProject(dir);
    expect(p.name).toBe("my-blog");
    expect(p.path).toBe(path.resolve(dir));
  });

  it("open cùng folder 2 lần là idempotent (không tạo trùng)", () => {
    const dir = path.join(tmp, "blog");
    fs.mkdirSync(dir);
    const a = openProject(dir);
    const b = openProject(dir);
    expect(a.id).toBe(b.id);
    expect(listProjects()).toHaveLength(1);
  });

  it("open folder trùng tên (khác path) thì tên được đánh số", () => {
    const d1 = path.join(tmp, "x", "app");
    const d2 = path.join(tmp, "y", "app");
    fs.mkdirSync(d1, { recursive: true });
    fs.mkdirSync(d2, { recursive: true });
    const a = openProject(d1);
    const b = openProject(d2);
    expect(a.name).toBe("app");
    expect(b.name).toBe("app-2");
  });

  it("open cùng folder khác hoa/thường là 1 project (Win/macOS)", () => {
    if (process.platform !== "win32" && process.platform !== "darwin") return;
    const dir = path.join(tmp, "App");
    fs.mkdirSync(dir);
    const a = openProject(dir);
    const b = openProject(dir.toLowerCase());
    expect(b.id).toBe(a.id);
    expect(listProjects()).toHaveLength(1);
  });

  it("remove rồi open lại cùng folder → khôi phục NGUYÊN id (giữ profile/lịch sử)", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    const a = openProject(dir);
    expect(removeProject("shop")).toBe(true);
    expect(listProjects()).toHaveLength(0);
    const b = openProject(dir); // mở lại cùng folder
    expect(b.id).toBe(a.id); // cùng id → cùng projectProfileDir → hội thoại + đăng nhập còn nguyên
    expect(listProjects()).toHaveLength(1);
  });

  it("removeProject dọn skill/mcp orphan của project", () => {
    const dir = path.join(tmp, "shop");
    fs.mkdirSync(dir);
    addProject({ name: "shop", path: dir });
    addSkill({ name: "s1", source: tmp, scope: "project", projectName: "shop" });
    addMcp({ name: "m1", command: "node", scope: "project", projectName: "shop" });
    expect(listSkills()).toHaveLength(1);
    expect(listMcps()).toHaveLength(1);

    removeProject("shop");
    expect(listSkills()).toHaveLength(0);
    expect(listMcps()).toHaveLength(0);
  });
});

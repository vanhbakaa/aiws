import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addSkill, effectiveSkills, listSkills, removeSkill } from "./skills.js";
import { addProject, getProjectByName } from "./projects.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-test-"));
  process.env.AIWS_HOME = tmp;
});

afterEach(() => {
  delete process.env.AIWS_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("skills registry", () => {
  it("global hiệu lực mọi project; project chỉ project đó", () => {
    addProject({ name: "A", path: path.join(tmp, "A") });
    addProject({ name: "B", path: path.join(tmp, "B") });
    const idA = getProjectByName("A")!.id;
    const idB = getProjectByName("B")!.id;

    addSkill({ name: "fmt", source: tmp, scope: "global" });
    addSkill({ name: "deploy", source: tmp, scope: "project", projectName: "A" });

    const effA = effectiveSkills(idA).map((s) => s.name);
    const effB = effectiveSkills(idB).map((s) => s.name);
    expect(effA.sort()).toEqual(["deploy", "fmt"]);
    expect(effB).toEqual(["fmt"]); // B không thấy skill project của A
  });

  it("scope project mà thiếu --project → lỗi", () => {
    expect(() => addSkill({ name: "x", source: tmp, scope: "project" })).toThrow(/--project/);
  });

  it("trùng name cùng scope → lỗi; remove gỡ đúng", () => {
    addSkill({ name: "fmt", source: tmp, scope: "global" });
    expect(() => addSkill({ name: "fmt", source: tmp, scope: "global" })).toThrow(/đã cài/);
    expect(removeSkill("fmt", "global")).toBe(true);
    expect(listSkills()).toHaveLength(0);
  });
});

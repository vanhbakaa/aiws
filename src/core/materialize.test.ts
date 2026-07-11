import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { materializeSkills, summaryLine } from "./materialize.js";
import type { SkillInstall } from "./types.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-test-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function makeSkill(name: string): SkillInstall {
  const src = path.join(tmp, "src-" + name);
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, "SKILL.md"), `# ${name}\n`);
  return { name, scope: "global", source: src };
}

describe("materializeSkills (junction)", () => {
  it("junction skill vào configDir/skills và đọc được nội dung qua đó", () => {
    const configDir = path.join(tmp, "cfg");
    const s = makeSkill("fmt");
    const res = materializeSkills(configDir, [s]);
    expect(res.linked).toEqual(["fmt"]);

    const linkedFile = path.join(configDir, "skills", "fmt", "SKILL.md");
    expect(fs.existsSync(linkedFile)).toBe(true);
    expect(fs.readFileSync(linkedFile, "utf8")).toContain("# fmt");
  });

  it("idempotent: lần 2 là skipped", () => {
    const configDir = path.join(tmp, "cfg");
    const s = makeSkill("fmt");
    materializeSkills(configDir, [s]);
    const res2 = materializeSkills(configDir, [s]);
    expect(res2.skipped).toEqual(["fmt"]);
    expect(res2.linked).toEqual([]);
  });

  it("nguồn không tồn tại → missing (không crash)", () => {
    const configDir = path.join(tmp, "cfg");
    const bad: SkillInstall = { name: "ghost", scope: "global", source: path.join(tmp, "khong-co") };
    const res = materializeSkills(configDir, [bad]);
    expect(res.missing).toEqual(["ghost"]);
  });

  it("skill project override global cùng tên (project thắng)", () => {
    const configDir = path.join(tmp, "cfg");
    const g = makeSkill("review"); // scope global
    const pSrc = path.join(tmp, "src-review-proj");
    fs.mkdirSync(pSrc, { recursive: true });
    fs.writeFileSync(path.join(pSrc, "SKILL.md"), "# project review");
    const p: SkillInstall = { name: "review", scope: "project", projectId: "x", source: pSrc };

    const res = materializeSkills(configDir, [g, p]);
    expect(res.linked).toEqual(["review"]); // chỉ 1 link
    const linked = fs.readFileSync(path.join(configDir, "skills", "review", "SKILL.md"), "utf8");
    expect(linked).toContain("project review"); // trỏ vào nguồn project
  });

  it("reconcile: skill bỏ khỏi tập desired thì gỡ link", () => {
    const configDir = path.join(tmp, "cfg");
    const s = makeSkill("fmt");
    materializeSkills(configDir, [s]);
    expect(fs.existsSync(path.join(configDir, "skills", "fmt"))).toBe(true);

    const res = materializeSkills(configDir, []); // không còn skill nào
    expect(res.removed).toEqual(["fmt"]);
    expect(fs.existsSync(path.join(configDir, "skills", "fmt"))).toBe(false);
    // nguồn gốc KHÔNG bị xoá
    expect(fs.existsSync(path.join(s.source, "SKILL.md"))).toBe(true);
  });

  it("summaryLine báo cả khi TẤT CẢ đều lỗi", () => {
    const line = summaryLine({ skills: { linked: [], skipped: [], removed: [], missing: ["deploy"] } });
    expect(line).toContain("1 lỗi nguồn");
  });
});

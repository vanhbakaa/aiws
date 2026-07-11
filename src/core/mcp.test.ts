import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addMcp, effectiveMcps, listMcps, removeMcp } from "./mcp.js";
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

describe("mcp registry", () => {
  it("global + project hiệu lực đúng theo project", () => {
    addProject({ name: "A", path: path.join(tmp, "A") });
    addProject({ name: "B", path: path.join(tmp, "B") });
    const idA = getProjectByName("A")!.id;
    const idB = getProjectByName("B")!.id;

    addMcp({ name: "ctx7", command: "npx", args: ["ctx7"], scope: "global" });
    addMcp({ name: "db", command: "node", args: ["db.js"], scope: "project", projectName: "A" });

    expect(effectiveMcps(idA).map((m) => m.name).sort()).toEqual(["ctx7", "db"]);
    expect(effectiveMcps(idB).map((m) => m.name)).toEqual(["ctx7"]);
  });

  it("lưu transport + env; trùng → lỗi; remove gỡ đúng", () => {
    const m = addMcp({
      name: "http1",
      command: "https://x/mcp",
      transport: "http",
      env: { TOKEN: "abc" },
      scope: "global",
    });
    expect(m.transport).toBe("http");
    expect(m.env).toEqual({ TOKEN: "abc" });
    expect(() => addMcp({ name: "http1", command: "https://x/mcp", scope: "global" })).toThrow(/đã cài/);
    expect(removeMcp("http1", "global")).toBe(true);
    expect(listMcps()).toHaveLength(0);
  });
});

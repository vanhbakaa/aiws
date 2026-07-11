import { expect, test } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { PanelHost } from "./panelHost";
import { SessionManager } from "../../session/sessionManager";
import { openProject } from "../../core/projects";
import type { PanelSnapshot } from "../shared/contract";

test("PanelHost builds a shell snapshot for a shell tab and 'none' when empty", async () => {
  process.env.AIWS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-panel-home-"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-panel-proj-"));
  const proj = openProject(dir);

  const mgr = new SessionManager({ mirror: false });
  const sent: PanelSnapshot[] = [];
  const host = new PanelHost(mgr, (s) => sent.push(s));

  expect((await host.snapshot()).kind).toBe("none");

  const tab = mgr.open(proj.name, "shell", { cols: 80, rows: 24 });
  expect(tab).not.toBeNull();

  const snap = await host.snapshot();
  expect(snap.kind).toBe("shell");
  expect(snap.tabId).toBe(tab!.id);
  expect(snap.usage).toBeNull();

  mgr.killAll();
}, 15000);

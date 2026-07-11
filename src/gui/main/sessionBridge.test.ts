import { expect, test } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { SessionBridge } from "./sessionBridge";
import { openProject } from "../../core/projects";

// Stub the Electron WebContents surface the bridge touches.
function makeWc() {
  const events: { channel: string; payload: any }[] = [];
  return {
    wc: { send: (channel: string, payload: any) => events.push({ channel, payload }), isDestroyed: () => false },
    events,
  };
}

// End-to-end main-side pipeline WITHOUT Electron: SessionManager(mirror:false) → PtySession.onData
// → bridge coalescing → wc.send('pty:data'), plus serializable snapshots. Spawns a real OS shell.
test("SessionBridge streams PTY output and builds a session-free snapshot", async () => {
  process.env.AIWS_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-gui-home-"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-gui-proj-"));
  const proj = openProject(dir);

  const { wc, events } = makeWc();
  const bridge = new SessionBridge(wc as never);
  const res = bridge.openTab({ projectName: proj.name, providerId: "shell", cols: 80, rows: 24 });
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  const tabId = res.value.id;

  // snapshot must be serializable (no live PtySession leaking through)
  const state = bridge.getState();
  expect(state.tabs).toHaveLength(1);
  expect(state.tabs[0].id).toBe(tabId);
  expect((state.tabs[0] as unknown as Record<string, unknown>).session).toBeUndefined();
  expect(events.some((e) => e.channel === "tabs:changed")).toBe(true);

  // drive the shell; the coalesced pty:data stream should carry the echoed marker
  const collected = await new Promise<string>((resolve) => {
    const read = () =>
      events
        .filter((e) => e.channel === "pty:data")
        .map((e) => e.payload.chunk)
        .join("");
    const timer = setInterval(() => {
      if (/AIWS_BRIDGE_OK/.test(read())) {
        clearInterval(timer);
        resolve(read());
      }
    }, 50);
    setTimeout(() => bridge.write(tabId, "echo AIWS_BRIDGE_OK\r"), 500);
    setTimeout(() => {
      clearInterval(timer);
      resolve(read());
    }, 12000);
  });

  bridge.dispose();
  expect(collected).toMatch(/AIWS_BRIDGE_OK/);
}, 20000);

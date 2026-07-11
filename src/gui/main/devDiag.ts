import fs from "node:fs";
import type { BrowserWindow } from "electron";

// Opt-in dev diagnostics (inert unless AIWS_GUI_DIAG / AIWS_GUI_SHOT / AIWS_GUI_DRIVE is set).
// - AIWS_GUI_DIAG=<file>: forward renderer console + load lifecycle to a file (stdout is buffered
//   when the app is launched non-interactively).
// - AIWS_GUI_SHOT=<png>: capture the window after load.
// - AIWS_GUI_DRIVE="ctrl+t,alt+1,ctrl+b": inject a scripted key sequence (exercises the Layer-1
//   shortcut path) then capture. Used to verify the UI headlessly.
export function attachDevDiagnostics(win: BrowserWindow): void {
  const diagPath = process.env.AIWS_GUI_DIAG;
  const shot = process.env.AIWS_GUI_SHOT;
  const drive = process.env.AIWS_GUI_DRIVE;
  if (!diagPath && !shot && !drive) return;

  const log = (m: string) => {
    if (!diagPath) return;
    try {
      fs.appendFileSync(diagPath, m + "\n");
    } catch {
      /* ignore */
    }
  };
  const wc = win.webContents;
  wc.on("console-message", (_e, _lvl, message) => log("[renderer] " + message));
  wc.on("did-fail-load", (_e, code, desc) => log(`did-fail-load ${code} ${desc}`));
  wc.on("preload-error", (_e, p, err) => log(`preload-error ${p} ${err.message}`));
  wc.on("render-process-gone", (_e, d) => log("render-gone " + JSON.stringify(d)));

  const capture = () => {
    if (!shot) return;
    wc.capturePage()
      .then((img) => fs.writeFileSync(shot, img.toPNG()))
      .then(() => log("shot-saved"))
      .catch((e) => log("shot-fail " + e));
  };

  wc.on("did-finish-load", () => {
    log("did-finish-load");
    if (drive) {
      const steps = drive.split("|").map((cmd) => () => {
        log("drive " + cmd);
        if (cmd.startsWith("js:")) {
          void wc.executeJavaScript(cmd.slice(3)).catch((e) => log("js-fail " + e));
        } else {
          injectChord(wc, cmd);
        }
      });
      steps.push(() => capture());
      let i = 0;
      const tick = () => {
        if (i < steps.length) {
          steps[i++]();
          setTimeout(tick, 1400);
        }
      };
      setTimeout(tick, 2500); // let the initial tab open + settle first
    } else if (shot) {
      setTimeout(capture, 2800);
    }
  });
}

// "ctrl+t" / "alt+1" / "ctrl+b" → a keyDown+keyUp injected via sendInputEvent.
function injectChord(wc: Electron.WebContents, cmd: string): void {
  const parts = cmd.toLowerCase().split("+");
  const k = parts.pop() ?? "";
  const modifiers = parts.map((p) => (p === "ctrl" ? "control" : p));
  const keyCode = k.length === 1 ? k.toUpperCase() : k;
  const down = { type: "keyDown", keyCode, modifiers } as Parameters<typeof wc.sendInputEvent>[0];
  wc.sendInputEvent(down);
  wc.sendInputEvent({ ...down, type: "keyUp" } as Parameters<typeof wc.sendInputEvent>[0]);
}

import type { BrowserWindow } from "electron";

// Layer 1 of the keyboard model: the aiws-global chords, intercepted in main via before-input-event
// (works regardless of focus). Matched combos are preventDefault()'d so they never reach xterm, then
// either handled in main (quit) or forwarded to the renderer as a menu:command. Everything else
// falls through to the focused terminal. Uses input.code (layout-independent).
const CTRL_MAP: Record<string, string> = {
  KeyT: "new-tab",
  KeyW: "close-tab",
  KeyB: "toggle-context",
  KeyL: "toggle-lang",
  KeyN: "new-project",
  KeyO: "open-folder",
  KeyS: "accounts",
  KeyA: "add-account",
  KeyP: "focus-projects",
};

export function registerShortcuts(win: BrowserWindow, onQuit: () => void): void {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const ctrlOnly = input.control && !input.alt && !input.meta;
    const altOnly = input.alt && !input.control && !input.meta;

    if (ctrlOnly && input.code === "KeyQ") {
      event.preventDefault();
      onQuit();
      return;
    }
    if (ctrlOnly && CTRL_MAP[input.code]) {
      event.preventDefault();
      win.webContents.send("menu:command", { command: CTRL_MAP[input.code] });
      return;
    }
    const m = altOnly ? /^Digit([1-9])$/.exec(input.code) : null;
    if (m) {
      event.preventDefault();
      win.webContents.send("menu:command", { command: "switch-tab", args: { index: Number(m[1]) - 1 } });
    }
  });
}

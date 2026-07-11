import { type BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { listRemovedProjects } from "../../core/projects";

// In-window menu bar (IDE-like on Windows). Accelerators are shown for discoverability but
// registerAccelerator:false — the before-input-event layer stays the single dispatcher, so the
// chords never double-fire. Menu clicks route to the same menu:command commands as the chords.
// Rebuild (call again) whenever the removed-projects archive changes so "Open Recent" stays fresh.
export function buildMenu(getWin: () => BrowserWindow | null): void {
  const send = (command: string, args?: Record<string, unknown>) =>
    getWin()?.webContents.send("menu:command", { command, args });
  const item = (label: string, accelerator: string, command: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => send(command),
  });

  // Recently closed projects (newest first) — reopening restores the same id → history intact.
  const recent = listRemovedProjects().slice().reverse();
  const openRecent: MenuItemConstructorOptions[] = recent.length
    ? recent.map((p) => ({ label: `${p.name}   ${p.path}`, click: () => send("reopen-project", { path: p.path }) }))
    : [{ label: "No recently closed projects", enabled: false }];

  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        item("Open Folder…", "CmdOrCtrl+O", "open-folder"),
        item("New Project…", "CmdOrCtrl+N", "new-project"),
        { label: "Open Recent", submenu: openRecent },
        { type: "separator" },
        item("New Tab", "CmdOrCtrl+T", "new-tab"),
        item("Close Tab", "CmdOrCtrl+W", "close-tab"),
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        item("Toggle Context Panel", "CmdOrCtrl+B", "toggle-context"),
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Account",
      submenu: [item("Switch…", "CmdOrCtrl+S", "account-menu")],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

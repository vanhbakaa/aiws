import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openProject } from "../../core/projects";
import type { InitInfo, PanelSnapshot } from "../shared/contract";
import { SessionBridge } from "./sessionBridge";
import { PanelHost } from "./panelHost";
import { registerIpc } from "./ipc";
import { registerShortcuts } from "./shortcuts";
import { buildMenu } from "./menu";
import { attachDevDiagnostics } from "./devDiag";
import { initAutoUpdate } from "./updater";

const dirname = path.dirname(fileURLToPath(import.meta.url));
let bridge: SessionBridge | undefined;
let panelHost: PanelHost | undefined;
let mainWin: BrowserWindow | undefined;

const menuGetWin = (): BrowserWindow | null => BrowserWindow.getFocusedWindow() ?? mainWin ?? null;

// `aiws gui [dir]` passes the folder as `--open <dir>`; AIWS_GUI_CWD is a fallback.
function parseOpenArg(argv: string[]): string | null {
  const i = argv.indexOf("--open");
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith("--open="));
  return eq ? eq.slice("--open=".length) : null;
}

// Register the folder to open on startup and pick the initial provider. Default 'shell' so dev
// launches don't auto-start a billed AI session. A double-clicked packaged exe (no explicit folder,
// not dev) opens to the welcome screen instead of whatever random cwd it inherited.
function computeInit(): InitInfo {
  const providerId = process.env.AIWS_GUI_PROVIDER ?? "shell";
  const explicit = parseOpenArg(process.argv) ?? process.env.AIWS_GUI_CWD;
  const dir = explicit ?? (process.env.ELECTRON_RENDERER_URL ? process.cwd() : null);
  if (!dir) return { projectName: null, providerId };
  try {
    return { projectName: openProject(dir).name, providerId };
  } catch {
    return { projectName: null, providerId };
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    backgroundColor: "#1a1b26",
    webPreferences: {
      preload: path.join(dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWin = win;

  // Strict CSP in production (packaged file:// load). Dev serves from localhost with HMR, which
  // needs a looser policy, so we only clamp when there's no dev renderer URL.
  if (!process.env.ELECTRON_RENDERER_URL) {
    win.webContents.session.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';",
          ],
        },
      });
    });
  }
  // Lock down navigation / new windows regardless of environment.
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  bridge = new SessionBridge(win.webContents, () => buildMenu(menuGetWin));
  panelHost = new PanelHost(bridge.mgr, (snap: PanelSnapshot) => {
    if (!win.webContents.isDestroyed()) win.webContents.send("panel:data", snap);
  });
  panelHost.start();
  registerIpc(bridge, panelHost, computeInit());
  registerShortcuts(win, () => win.close());
  attachDevDiagnostics(win);

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(dirname, "../renderer/index.html"));
  }
}

// Single-instance: a second `aiws gui <dir>` focuses the existing window and opens that folder there.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    if (!mainWin) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
    const dir = parseOpenArg(argv);
    if (dir) {
      try {
        const projectName = openProject(dir).name;
        mainWin.webContents.send("menu:command", { command: "open-project", args: { projectName } });
      } catch {
        /* ignore */
      }
    }
  });

  app.whenReady().then(() => {
    buildMenu(menuGetWin);
    createWindow();
    initAutoUpdate(menuGetWin); // tự kiểm tra + tải bản cập nhật (chỉ khi đã đóng gói)
  });
}

app.on("window-all-closed", () => {
  panelHost?.stop();
  bridge?.dispose();
  app.quit();
});

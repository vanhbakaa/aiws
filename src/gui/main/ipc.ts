import { BrowserWindow, dialog, ipcMain } from "electron";
import type { InitInfo, OpenTabRequest } from "../shared/contract";
import type { SessionBridge } from "./sessionBridge";
import type { PanelHost } from "./panelHost";
import { openFolderDialog } from "./dialogs";
import { getLocale, setLocale, type Locale } from "../../core/i18n";

// Register the IPC surface for a single window's bridge. Renderer→main commands use invoke/handle;
// the two high-frequency paths (pty:write / pty:resize) are one-way send/on.
export function registerIpc(bridge: SessionBridge, panelHost: PanelHost, init: InitInfo): void {
  ipcMain.handle("workspace:getInit", () => init);
  ipcMain.handle("workspace:getState", () => bridge.getState());
  ipcMain.handle("workspace:getTree", () => bridge.getTree());
  ipcMain.handle("panel:get", () => panelHost.snapshot());
  ipcMain.handle("tab:open", (_e, req: OpenTabRequest) => bridge.openTab(req));
  ipcMain.handle("tab:close", (_e, tabId: string) => bridge.closeTab(tabId));
  ipcMain.handle("tab:setActive", (_e, index: number) => bridge.setActiveTab(index));
  ipcMain.handle("accounts:list", (_e, providerId: string) => bridge.listAccounts(providerId));
  ipcMain.handle("providers:list", () => bridge.listProviders());
  ipcMain.handle("account:switch", (_e, p: { tabId: string; toLabel?: string; toDirect?: boolean }) =>
    bridge.switchAccount(p.tabId, p.toLabel, p.toDirect),
  );
  ipcMain.handle("locale:set", (_e, locale: string) => setLocale(locale as Locale));
  ipcMain.handle("project:openFolderDialog", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return { ok: false, error: "no window" };
    const r = await openFolderDialog(win);
    return r ? { ok: true, value: r } : { ok: false, error: "cancelled" };
  });
  // Closes the project's running terminals + removes it from the list. History/logins are KEPT
  // (reopen the folder to restore); the code folder is untouched. Confirm before closing terminals.
  ipcMain.handle("project:remove", async (e, name: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) {
      const vi = getLocale() === "vi";
      const { response } = await dialog.showMessageBox(win, {
        type: "question",
        buttons: vi ? ["Gỡ", "Huỷ"] : ["Remove", "Cancel"],
        defaultId: 1,
        cancelId: 1,
        message: vi ? `Gỡ project "${name}" khỏi workspace?` : `Remove project "${name}" from workspace?`,
        detail: vi
          ? "Terminal đang chạy của project sẽ đóng. Lịch sử & đăng nhập được GIỮ LẠI — mở lại folder là khôi phục nguyên vẹn. KHÔNG xoá thư mục mã nguồn."
          : "Its running terminals will close. History & logins are KEPT — reopen the folder to restore. Does NOT delete the code folder.",
      });
      if (response !== 0) return { ok: false, error: "cancelled" };
    }
    return bridge.removeProject(name);
  });
  ipcMain.handle("project:reopen", (_e, dir: string) => bridge.reopenProject(dir));

  ipcMain.on("pty:write", (_e, p: { tabId: string; data: string }) => bridge.write(p.tabId, p.data));
  ipcMain.on("pty:resize", (_e, p: { tabId: string; cols: number; rows: number }) =>
    bridge.resize(p.tabId, p.cols, p.rows),
  );
}

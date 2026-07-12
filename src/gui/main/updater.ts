import { app, dialog, type BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import { getLocale } from "../../core/i18n";

// electron-updater là CommonJS → lấy autoUpdater qua default import (interop ESM).
const { autoUpdater } = electronUpdater;

const SIX_HOURS = 6 * 60 * 60 * 1000;

/**
 * Tự động cập nhật từ GitHub Releases (nguồn = publish config trong electron-builder.yml → app-update.yml).
 * Chỉ chạy khi ĐÃ đóng gói (app.isPackaged); dev bỏ qua. Tải nền; tải xong hỏi khởi động lại để cài.
 * Mọi lỗi (offline, chưa có release, bản portable không tự thay được…) → im lặng, không làm phiền user.
 */
export function initAutoUpdate(getWin: () => BrowserWindow | null): void {
  if (!app.isPackaged) return; // dev / chạy từ source → không kiểm tra cập nhật

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", (info) => {
    const vi = getLocale() === "vi";
    const box = {
      type: "info" as const,
      buttons: vi ? ["Khởi động lại", "Để sau"] : ["Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: vi ? "Đã có bản cập nhật" : "Update ready",
      message: vi ? `Đã tải phiên bản ${info.version}.` : `Version ${info.version} downloaded.`,
      detail: vi ? "Khởi động lại để cài bản mới?" : "Restart to install the new version?",
    };
    const win = getWin();
    const prompt = win ? dialog.showMessageBox(win, box) : dialog.showMessageBox(box);
    prompt
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      })
      .catch(() => {
        /* ignore */
      });
  });

  // offline / chưa có release / lỗi metadata → nuốt, đừng crash hay hiện lỗi.
  autoUpdater.on("error", () => {
    /* ignore */
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check(); // ngay khi mở
  setInterval(check, SIX_HOURS); // và định kỳ khi app mở lâu
}

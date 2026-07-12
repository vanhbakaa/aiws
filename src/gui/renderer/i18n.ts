import { createContext, useContext } from "react";

// Renderer-side i18n for GUI chrome strings (the core's t() is main-side/fs-bound). The lang chip /
// Ctrl+L flips the locale; strings re-render via LocaleContext. Locale is persisted through the
// core (config.json) so the TUI and GUI agree.
export type Locale = "vi" | "en";

type Entry = { vi: string; en: string };
const S: Record<string, Entry> = {
  // key bar
  send: { vi: "gửi", en: "send" },
  newline: { vi: "dòng mới", en: "newline" },
  project: { vi: "project", en: "project" },
  openFolder: { vi: "mở folder", en: "open folder" },
  newTab: { vi: "tab mới", en: "new tab" },
  closeTab: { vi: "đóng tab", en: "close tab" },
  switchTab: { vi: "chuyển tab", en: "switch tab" },
  account: { vi: "account", en: "account" },
  panel: { vi: "panel", en: "panel" },
  quit: { vi: "thoát", en: "quit" },
  // tab bar
  tabWord: { vi: "tab", en: "tab" },
  providerForNewTab: { vi: "Provider cho tab mới", en: "Provider for new tabs" },
  // projects
  projects: { vi: "Projects", en: "Projects" },
  noProjects: { vi: "chưa có project", en: "no projects" },
  projectsHint: { vi: "project mới", en: "new project" },
  removeProject: { vi: "gỡ khỏi workspace", en: "remove from workspace" },
  // welcome
  welcomeSub: { vi: "Mở một thư mục để bắt đầu như một project", en: "Open a folder to start it as a project" },
  openFolderBtn: { vi: "Open Folder", en: "Open Folder" },
  // context panel
  context: { vi: "Context", en: "Context" },
  aiAccount: { vi: "AI account", en: "AI account" },
  model: { vi: "Model", en: "Model" },
  skills: { vi: "Skills", en: "Skills" },
  mcp: { vi: "MCP", en: "MCP" },
  ctxUsed: { vi: "context đã dùng", en: "context used" },
  ctxNone: { vi: "context: —", en: "context: —" },
  switch: { vi: "switch", en: "switch" },
  addAccount: { vi: "thêm account", en: "add account" },
  direct: { vi: "trực tiếp", en: "direct" },
  shellIsolated: { vi: "🔒 terminal cô lập · không có AI", en: "🔒 isolated terminal · no AI" },
  limit5h: { vi: "limit 5h", en: "limit 5h" },
  limit7d: { vi: "limit 7 ngày", en: "limit 7d" },
  resetCredits: { vi: "lượt reset limit còn", en: "limit resets left" },
  global: { vi: "global", en: "global" },
  // accounts panel
  accountsTitle: { vi: "Tài khoản AI", en: "AI accounts" },
  inUse: { vi: "đang dùng", en: "in use" },
  defaultBadge: { vi: "mặc định", en: "default" },
  noAccountsYet: { vi: "Chưa có tài khoản — bấm + để thêm.", en: "No accounts — click + to add." },
  notLoggedIn: { vi: "chưa đăng nhập", en: "not logged in" },
  useHere: { vi: "dùng ở đây", en: "use here" },
  makeDefault: { vi: "đặt mặc định", en: "set default" },
  rename: { vi: "đổi tên", en: "rename" },
  remove: { vi: "xóa", en: "remove" },
  confirmRemove: { vi: "xóa hẳn?", en: "delete?" },
  // add-account dialog
  addAccountTitle: { vi: "Thêm tài khoản AI", en: "Add AI account" },
  provider: { vi: "Loại (provider)", en: "Provider" },
  accountNameLabel: { vi: "Tên tài khoản", en: "Account name" },
  accountNamePlaceholder: { vi: "vd: chính, phụ, work…", en: "e.g. main, personal, work…" },
  addAccountHint: {
    vi: "Tạo xong mở terminal để đăng nhập.",
    en: "A login terminal opens after you create it.",
  },
  create: { vi: "Tạo", en: "Create" },
  cancel: { vi: "Huỷ", en: "Cancel" },
  // providers / toasts
  notInstalledShort: { vi: "chưa cài", en: "not installed" },
  notInstalled: { vi: 'Chưa cài "{p}" — cài: {hint}', en: 'Not installed: "{p}" — install: {hint}' },
  notInstalledNoHint: { vi: 'Chưa cài "{p}"', en: 'Not installed: "{p}"' },
  close: { vi: "đóng", en: "close" },
};

export function tr(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const e = S[key];
  let s = e ? e[locale] : key;
  if (params) for (const k of Object.keys(params)) s = s.replace("{" + k + "}", String(params[k]));
  return s;
}

export const LocaleContext = createContext<Locale>("vi");

export function useTr(): (key: string, params?: Record<string, string | number>) => string {
  const locale = useContext(LocaleContext);
  return (key, params) => tr(locale, key, params);
}

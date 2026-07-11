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
  // account menu
  switchAccountTitle: { vi: "Chuyển account", en: "Switch account" },
  directParen: { vi: "(trực tiếp)", en: "(direct)" },
  inUse: { vi: "đang dùng", en: "in use" },
  noAccounts: { vi: "chưa có account — dùng (trực tiếp)", en: "no accounts — use (direct)" },
  menuNav: { vi: "↑↓ chọn · ⏎ chuyển · Esc đóng", en: "↑↓ move · ⏎ switch · Esc close" },
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

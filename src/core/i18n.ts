import { loadWorkspace, saveWorkspace } from "./storage.js";

export type Locale = "vi" | "en";
export const LOCALES: Locale[] = ["vi", "en"];

// Bảng chuỗi giao diện. Mỗi key = { vi, en }. Placeholder dạng {name} thay bằng t(key, {name}).
const DICT: Record<string, { vi: string; en: string }> = {
  // panels
  projects: { vi: "PROJECTS", en: "PROJECTS" },
  projNav: { vi: " ↑↓ ⏎ mở · Esc", en: " ↑↓ ⏎ open · Esc" },
  context: { vi: "CONTEXT", en: "CONTEXT" },
  account: { vi: "ACCOUNT", en: "ACCOUNT" },
  model: { vi: "MODEL", en: "MODEL" },
  effort: { vi: "effort", en: "effort" },
  ctxNone: { vi: "— (chưa có)", en: "— (none yet)" },
  skills: { vi: "SKILLS", en: "SKILLS" },
  mcp: { vi: "MCP", en: "MCP" },
  scopeCounts: { vi: "{g} chung · {p} riêng", en: "{g} global · {p} project" },
  default: { vi: "mặc định", en: "default" },
  fiveHour: { vi: "5h", en: "5h" },
  week: { vi: "tuần", en: "week" },
  shell: { vi: "SHELL", en: "SHELL" },
  shellIsolated: { vi: "terminal cô lập", en: "isolated terminal" },
  shellNoAi: { vi: "không chạy AI", en: "no AI" },
  resumeTitle: { vi: "Mở lại phiên này", en: "Resume this session" },
  pastSessions: { vi: "phiên cũ", en: "past sessions" },

  // empty pane
  noTabs: { vi: " Chưa có tab nào.", en: " No tabs yet." },
  newProjectFromFolder: { vi: "tạo project từ folder", en: "new project from folder" },
  pickExistingProject: { vi: "chọn project có sẵn", en: "pick existing project" },

  // new-tab picker
  newTabWith: { vi: "  ▾ Mở tab mới bằng", en: "  ▾ New tab with" },
  shellDesc: { vi: "chạy lệnh, không AI", en: "run commands, no AI" },
  notInstalled: { vi: "chưa cài", en: "not installed" },
  selected: { vi: "← đang chọn", en: "← selected" },
  pickerHint: { vi: "  ↑↓ Enter · số 1–{n} · click · Esc đóng", en: "  ↑↓ Enter · num 1–{n} · click · Esc close" },

  // account menu
  accountMenuTitle: { vi: "  ▾ Account · {provider}", en: "  ▾ Account · {provider}" },
  direct: { vi: "(trực tiếp)", en: "(direct)" },
  inUse: { vi: "← đang dùng", en: "← in use" },
  loginNewAccount: { vi: "Đăng nhập account mới", en: "Log in new account" },
  accountMenuHint: { vi: "  ↑↓ Enter · số · Esc đóng", en: "  ↑↓ Enter · num · Esc close" },

  // project prompt
  newProjectTitle: { vi: "  ＋ Tạo project mới", en: "  ＋ New project" },
  projectHint: {
    vi: "  Enter = mở · Esc = huỷ · đường dẫn tương đối tính từ nơi chạy aiws",
    en: "  Enter = open · Esc = cancel · path is relative to where aiws runs",
  },
  // account prompt
  newAccountTitle: { vi: "  ＋ Đăng nhập account mới", en: "  ＋ Log in new account" },
  accountHint: {
    vi: "  Enter = đăng nhập · Esc = huỷ · đặt tên để nhận ra tài khoản (vd: personal, work)",
    en: "  Enter = log in · Esc = cancel · name it to recognize the account (e.g. personal, work)",
  },

  // keybar
  kbProject: { vi: "project", en: "project" },
  kbPick: { vi: "chọn", en: "pick" },
  kbTab: { vi: "tab", en: "tab" },
  kbClose: { vi: "đóng", en: "close" },
  kbSwitch: { vi: "chuyển", en: "switch" },
  kbAccount: { vi: "account", en: "account" },
  kbHideRight: { vi: "ẩn phải", en: "hide right" },
  kbQuit: { vi: "thoát", en: "quit" },
  kbLang: { vi: "ngôn ngữ", en: "language" },
  kbCopy: { vi: "chuột", en: "mouse" },
  mouseOn: {
    vi: "Chuột: bật — click tab/menu được (Ctrl+G tắt để copy lại)",
    en: "Mouse: on — click tabs/menus (Ctrl+G off to copy again)",
  },
  mouseOff: {
    vi: "Chuột: tắt — bôi đen & copy được (Ctrl+G bật để click)",
    en: "Mouse: off — select & copy work (Ctrl+G on to click)",
  },

  // statuses
  stNotInstalled: { vi: 'Chưa cài "{p}" — cài rồi thử lại', en: '"{p}" not installed — install then retry' },
  stFolderNotFound: { vi: "Không thấy thư mục: {abs}", en: "Folder not found: {abs}" },
  stNoAccounts: { vi: 'Provider "{p}" không dùng account', en: 'Provider "{p}" has no accounts' },
  stTabFailed: { vi: 'Không mở được tab cho "{v}"', en: 'Couldn\'t open tab for "{v}"' },
  stNewAccountTab: {
    vi: 'Tab mới cho account "{v}" — đăng nhập Claude ngay trong đó',
    en: 'New tab for account "{v}" — log in Claude there',
  },
  stLang: { vi: "Ngôn ngữ: Tiếng Việt", en: "Language: English" },

  // core (run.ts) switch notes
  noteCarried: { vi: 'Đã mang hội thoại đang làm sang "{label}".', en: 'Carried the current chat over to "{label}".' },
  noteNewSession: { vi: 'Mở phiên mới với "{label}".', en: 'Opened a new session with "{label}".' },
  noteCarriedNative: {
    vi: 'Đã nạp {count} tin nhắn từ {from} sang "{label}" (session native).',
    en: 'Loaded {count} messages from {from} into "{label}" (native session).',
  },
  switchedTo: { vi: "→ {label}", en: "→ {label}" },
  labelDirect: { vi: "trực tiếp", en: "direct" },
  crossTypeOnly: {
    vi: "Chỉ chuyển được giữa tài khoản cùng loại (claude→claude, codex→codex).",
    en: "You can only switch between accounts of the same type (claude→claude, codex→codex).",
  },
  noteHandoff: {
    vi: 'Đã lưu {count} tin nhắn từ {from} vào {file} — nhờ AI đọc để tiếp.',
    en: 'Saved {count} messages from {from} to {file} — ask the AI to read it.',
  },
  switchedFresh: { vi: 'Đã chuyển sang "{label}" (phiên mới).', en: 'Switched to "{label}" (new session).' },
  // account errors (surfaced as GUI toasts → phải song ngữ)
  errAccountNameEmpty: { vi: "Tên tài khoản không được để trống.", en: "Account name cannot be empty." },
  errAccountExists: {
    vi: 'Tài khoản "{label}" đã tồn tại cho provider "{provider}".',
    en: 'Account "{label}" already exists for provider "{provider}".',
  },
  errNoAccountYet: {
    vi: 'Provider "{provider}" chưa có tài khoản. Thêm tài khoản trước khi mở terminal.',
    en: 'Provider "{provider}" has no account yet. Add one before opening a terminal.',
  },
  errNoTab: { vi: "Không có tab.", en: "No tab." },
  errNotInstalled: { vi: 'Chưa cài "{cmd}".', en: 'Not installed: "{cmd}".' },
  errAccountNotFound: { vi: "Không tìm thấy tài khoản.", en: "Account not found." },
};

let current: Locale | null = null;

function load(): Locale {
  try {
    const l = loadWorkspace().locale;
    return l === "en" ? "en" : "vi";
  } catch {
    return "vi";
  }
}

export function getLocale(): Locale {
  if (current === null) current = load();
  return current;
}

export function setLocale(l: Locale): void {
  current = l;
  try {
    const ws = loadWorkspace();
    ws.locale = l;
    saveWorkspace(ws);
  } catch {
    /* không chặn UI nếu ghi config lỗi */
  }
}

/** Chuỗi giao diện theo ngôn ngữ hiện tại; thay {name} bằng params.name. */
export function t(key: keyof typeof DICT, params?: Record<string, string | number>): string {
  let s = DICT[key]?.[getLocale()] ?? String(key);
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

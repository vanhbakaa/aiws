import fs from "node:fs";
import path from "node:path";
import { projectProfileDir } from "./paths.js";
import { loadWorkspace } from "./storage.js";
import type { Project, Provider } from "./types.js";

// Thư mục con chứa hội thoại/session của từng provider (đường dẫn tương đối TRONG config-dir).
// Được junction về kho chung `profiles/<proj>/conv/<provider>/` → MỌI account cùng provider dùng
// chung transcript (đang chạy + cũ). Auth vẫn nằm ở phần còn lại của config-dir → login riêng.
// Khác provider có kho khác nhau (claude=projects, codex=sessions…) → KHÔNG chia sẻ chéo.
const CONV_SUBDIRS: Record<string, string[]> = {
  claude: ["projects"],
  codex: ["sessions"],
  gemini: [".gemini/tmp", ".gemini/chats"],
};

/** Copy đệ quy, KHÔNG ghi đè file đã có (an toàn khi gộp dữ liệu cũ vào kho chung). */
function mergeCopy(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  let names: string[];
  try {
    names = fs.readdirSync(src);
  } catch {
    return;
  }
  for (const name of names) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    let st: fs.Stats;
    try {
      st = fs.lstatSync(s);
    } catch {
      continue;
    }
    if (st.isDirectory()) mergeCopy(s, d);
    else if (!fs.existsSync(d)) {
      try {
        fs.copyFileSync(s, d);
      } catch {
        /* bỏ file lỗi */
      }
    }
  }
}

function isLink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Biến `configDir/<subdir>` thành junction trỏ `sharedStore/<subdir>`.
 * An toàn dữ liệu: nếu đang là thư mục THẬT (transcript cũ) → gộp-không-phá vào kho chung, dời bản
 * gốc sang `.aiws-bak`, rồi tạo junction; chỉ xoá `.bak` sau khi junction thành công. Thư mục đang
 * bị mở (session sống) → rename ném → BỎ QUA (giữ nguyên, lần launch sau thử lại).
 */
function linkOne(configDir: string, sharedStore: string, subdir: string): void {
  const target = path.join(sharedStore, subdir);
  const link = path.join(configDir, subdir);
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(path.dirname(link), { recursive: true });

  if (isLink(link)) return; // đã junction

  let realDir = false;
  try {
    realDir = fs.lstatSync(link).isDirectory();
  } catch {
    realDir = false;
  }

  const bak = link + ".aiws-bak";
  if (realDir) {
    mergeCopy(link, target); // gộp không phá vào kho chung TRƯỚC
    try {
      fs.rmSync(bak, { recursive: true, force: true });
      fs.renameSync(link, bak); // dời bản gốc (ném nếu đang mở → bỏ qua an toàn)
    } catch {
      return;
    }
  }
  try {
    fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    if (realDir) fs.rmSync(bak, { recursive: true, force: true }); // dữ liệu đã ở kho chung
  } catch {
    // junction lỗi → khôi phục bản gốc để KHÔNG mất dữ liệu
    try {
      if (fs.existsSync(bak) && !fs.existsSync(link)) fs.renameSync(bak, link);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Chia sẻ transcript của (project, provider) qua kho chung cho MỌI account cùng provider.
 * Tắt bằng `config.shareConversations = false` (mặc định BẬT). Provider không có transcript đã biết
 * (shell/ollama/opencode) → bỏ qua.
 */
export function linkSharedConversations(project: Project, provider: Provider, configDir: string): void {
  if (loadWorkspace().shareConversations === false) return;
  const subdirs = CONV_SUBDIRS[provider.id];
  if (!subdirs) return;
  const sharedStore = path.join(projectProfileDir(project.id), "conv", provider.id);
  for (const sub of subdirs) linkOne(configDir, sharedStore, sub);
}

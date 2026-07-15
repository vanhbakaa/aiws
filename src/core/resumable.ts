import fs from "node:fs";
import path from "node:path";
import { getAccountsForProvider } from "./accounts.js";
import { accountConfigDir } from "./paths.js";
import { encodeProjectDir, firstUserPreview } from "./sessionContext.js";
import type { Project } from "./types.js";

/** Một phiên hội thoại CÓ THỂ MỞ LẠI của project (đọc từ transcript trên đĩa, không phải từ tab đang chạy). */
export interface ResumableSession {
  sessionId: string; // = tên file transcript (id Claude thật) → dùng cho --resume
  providerId: string; // hiện chỉ "claude"
  accountId: string; // account (config-dir) chứa bản mới nhất → resume dưới account này
  accountLabel: string;
  preview: string; // tin nhắn người dùng đầu tiên (để nhận diện phiên)
  mtimeMs: number; // sửa lần cuối → sắp xếp mới nhất lên đầu
}

/**
 * Liệt kê các phiên hội thoại còn resume được của một project, quét transcript trên đĩa thay vì dựa
 * vào tab đang chạy (vốn mất sạch sau khi mở lại app). Với mỗi account claude (oauth, config-dir
 * global), đọc `<configDir>/projects/<encode(cwd)>/*.jsonl`. Cùng một phiên có thể được COPY sang
 * nhiều account (carryTranscript khi hot-switch) → gộp theo sessionId, GIỮ bản mtime mới nhất (đầy
 * đủ nhất) và nhớ account của bản đó để resume đúng chỗ. Bỏ phiên rỗng (không có tin nhắn người dùng).
 *
 * Phạm vi: chỉ claude oauth (dùng config-dir global theo account) — bao trọn luồng hot-switch account.
 * Provider env-based/không-account (dir per-project) chưa gom ở đây.
 */
export function listResumableSessions(project: Project): ResumableSession[] {
  const enc = encodeProjectDir(project.path);
  // sessionId -> bản mới nhất tìm thấy (kèm account sở hữu).
  const best = new Map<string, { accountId: string; accountLabel: string; file: string; mtimeMs: number }>();

  for (const acc of getAccountsForProvider("claude")) {
    if (acc.authMethod !== "oauth_login") continue; // chỉ account dùng config-dir global
    const dir = path.join(accountConfigDir(acc.id, "claude"), "projects", enc);
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue; // account này chưa có phiên nào trong project → bỏ qua
    }
    for (const f of files) {
      const full = path.join(dir, f);
      let mtimeMs: number;
      try {
        mtimeMs = fs.statSync(full).mtimeMs;
      } catch {
        continue;
      }
      const sessionId = f.slice(0, -".jsonl".length);
      const prev = best.get(sessionId);
      if (!prev || mtimeMs > prev.mtimeMs) {
        best.set(sessionId, { accountId: acc.id, accountLabel: acc.label, file: full, mtimeMs });
      }
    }
  }

  const out: ResumableSession[] = [];
  for (const [sessionId, v] of best) {
    const preview = firstUserPreview(v.file);
    if (!preview) continue; // phiên rỗng (chỉ có record hệ thống, chưa chat) → không hiện
    out.push({ sessionId, providerId: "claude", accountId: v.accountId, accountLabel: v.accountLabel, preview, mtimeMs: v.mtimeMs });
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs); // mới nhất lên đầu
  return out;
}

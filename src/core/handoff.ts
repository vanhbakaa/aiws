import fs from "node:fs";
import path from "node:path";
import { latestTranscriptFile } from "./sessionContext.js";
import { providerConfigDir } from "./isolation.js";
import { getProvider } from "./providers.js";
import { loadWorkspace } from "./storage.js";
import type { Project } from "./types.js";

// "File trung gian" chuyển ngữ cảnh giữa các provider KHÁC loại: các AI CLI không đọc được transcript
// của nhau, nên aiws trích hội thoại của provider cũ ra 1 file markdown trung tính (`.aiws-handoff.md`
// trong project) để AI mới ĐỌC được (mọi agent đều có tool đọc file) và tiếp nối.

export interface Msg {
  role: "user" | "assistant";
  text: string;
}

function textBlocks(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => (b as { type?: string })?.type === "text" && typeof (b as { text?: string }).text === "string")
      .map((b) => (b as { text: string }).text)
      .join("\n");
  }
  return "";
}

// Bỏ tin nhắn "rác" của slash-command / caveat (không phải hội thoại thật).
function isCommandNoise(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith("<command-") ||
    t.startsWith("<local-command-") ||
    t.includes("<command-name>") ||
    t.includes("<local-command-stdout>") ||
    t.includes("<local-command-caveat>")
  );
}

/** Trích hội thoại từ transcript claude (.jsonl mới nhất). Bỏ sub-agent (isSidechain). */
export function extractClaudeMessages(configDir: string, cwd: string): Msg[] {
  const file = latestTranscriptFile(configDir, cwd);
  if (!file) return [];
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const msgs: Msg[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o: { isSidechain?: boolean; message?: { role?: string; content?: unknown } };
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.isSidechain) continue;
    const m = o.message;
    if (!m) continue;
    if (m.role === "user" || m.role === "assistant") {
      const text = textBlocks(m.content).trim();
      if (text && !isCommandNoise(text)) msgs.push({ role: m.role, text });
    }
  }
  return msgs;
}

/** Hội thoại mới nhất trong project (v1: từ claude — có parser tin cậy). */
function latestConversation(project: Project): { providerId: string; msgs: Msg[] } | null {
  const claude = getProvider("claude");
  if (claude) {
    const dir = providerConfigDir(project, claude); // transcript nằm ở kho chung qua junction
    const msgs = extractClaudeMessages(dir, project.path);
    if (msgs.length) return { providerId: "claude", msgs };
  }
  return null;
}

function render(conv: { providerId: string; msgs: Msg[] }): string {
  let out =
    `# Hội thoại trước (nguồn: ${conv.providerId}) — ${conv.msgs.length} tin nhắn\n\n` +
    `> File trung gian do aiws xuất để chuyển ngữ cảnh sang provider khác. Đọc để tiếp tục cuộc trò chuyện.\n\n---\n\n`;
  for (const m of conv.msgs) {
    out += `### ${m.role === "user" ? "🧑 Người dùng" : "🤖 " + conv.providerId}\n\n${m.text}\n\n`;
  }
  return out;
}

/**
 * Nếu (a) bật carryConversation, (b) project đang có hội thoại từ provider KHÁC provider sắp mở →
 * xuất ra `<project>/.aiws-handoff.md` và trả thông tin để báo user. Cùng provider thì bỏ (đã chia
 * sẻ trực tiếp). Trả null nếu không có gì để chuyển.
 */
export function writeHandoff(project: Project, forProviderId: string): { file: string; from: string; count: number } | null {
  if (loadWorkspace().carryConversation === false) return null;
  if (forProviderId === "shell") return null;
  const conv = latestConversation(project);
  if (!conv || conv.providerId === forProviderId) return null;
  const file = path.join(project.path, ".aiws-handoff.md");
  try {
    fs.writeFileSync(file, render(conv), "utf8");
  } catch {
    return null;
  }
  return { file: ".aiws-handoff.md", from: conv.providerId, count: conv.msgs.length };
}

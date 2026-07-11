import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { providerConfigDir } from "./isolation.js";
import { getProvider } from "./providers.js";
import { latestTranscriptFile, encodeProjectDir } from "./sessionContext.js";
import { extractClaudeMessages, type Msg } from "./handoff.js";
import type { Project } from "./types.js";

// "Nạp session native" chéo provider: các CLI không đọc transcript của nhau, nhưng aiws có thể
// TỔNG HỢP một transcript native cho provider ĐÍCH từ hội thoại chuẩn hóa (Msg[]) để nó `--resume`
// như phiên thật. Đã verify: codex (`codex exec resume` nhớ đúng nội dung chèn). claude best-effort.

const ISO = () => new Date().toISOString();

// ---------- codex ----------
function latestCodexRollout(configDir: string): string | null {
  const base = path.join(configDir, "sessions");
  let best: string | null = null;
  let bestM = 0;
  const walk = (dir: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (e.name.startsWith("rollout-") && e.name.endsWith(".jsonl")) {
        const m = fs.statSync(f).mtimeMs;
        if (m > bestM) {
          bestM = m;
          best = f;
        }
      }
    }
  };
  walk(base);
  return best;
}

/** Đọc DÒNG ĐẦU (session_meta) mà không nạp cả file — rollout thật có thể vài MB. */
function firstLine(file: string, maxBytes = 131072): string | null {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "r");
    const buf = Buffer.allocUnsafe(maxBytes);
    const n = fs.readSync(fd, buf, 0, maxBytes, 0);
    const s = buf.toString("utf8", 0, n);
    const nl = s.indexOf("\n");
    return nl >= 0 ? s.slice(0, nl) : n < maxBytes ? s : null; // null nếu dòng đầu > maxBytes
  } catch {
    return null;
  } finally {
    if (fd !== undefined)
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
  }
}

/** Dọn các "seed" synth cũ mà codex CHƯA dùng (line count == marker `aiws_synth`) → chặn tích luỹ
 *  vô hạn. GIỮ: file mới (keepFile), mọi phiên codex thật (không marker), seed đã bị codex append
 *  (line count đổi = có hội thoại thật). Best-effort — file đang mở/khoá thì rmSync bỏ qua. */
function pruneUntouchedSynthSeeds(configDir: string, keepFile: string): void {
  const walk = (dir: string) => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(f);
        continue;
      }
      if (f === keepFile || !e.name.startsWith("rollout-") || !e.name.endsWith(".jsonl")) continue;
      const head = firstLine(f); // CHỈ dòng đầu → phiên thật (không marker) bị loại mà không nạp cả file
      if (!head) continue;
      let marker: unknown;
      try {
        marker = (JSON.parse(head) as { payload?: { aiws_synth?: unknown } }).payload?.aiws_synth;
      } catch {
        continue;
      }
      if (typeof marker !== "number") continue; // phiên codex thật → giữ
      try {
        // chỉ seed synth (nhỏ) mới đọc full để đếm dòng
        if (fs.readFileSync(f, "utf8").split("\n").filter(Boolean).length === marker) fs.rmSync(f, { force: true });
      } catch {
        /* ignore */
      }
    }
  };
  walk(path.join(configDir, "sessions"));
}

/** Trích hội thoại người-dùng/agent từ rollout codex (bỏ developer + <environment_context>). */
export function extractCodexMessages(configDir: string, _cwd: string): Msg[] {
  const file = latestCodexRollout(configDir);
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
    let o: { type?: string; payload?: { type?: string; role?: string; content?: { type?: string; text?: string }[] } };
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.type !== "response_item" || o.payload?.type !== "message") continue;
    const p = o.payload;
    if (p.role === "user") {
      const text = (p.content ?? []).filter((c) => c.type === "input_text" && c.text).map((c) => c.text).join("\n").trim();
      if (text && !text.startsWith("<environment_context>")) msgs.push({ role: "user", text });
    } else if (p.role === "assistant") {
      const text = (p.content ?? []).filter((c) => c.type === "output_text" && c.text).map((c) => c.text).join("\n").trim();
      if (text) msgs.push({ role: "assistant", text });
    }
  }
  return msgs;
}

/** Tổng hợp 1 rollout codex: CLONE scaffolding của phiên codex mới nhất + CHÈN hội thoại. Cần ≥1
 *  phiên codex thật trong project (để clone). Trả session_id mới, hoặc null nếu chưa có phiên nào. */
export function synthesizeCodexSession(project: Project, msgs: Msg[]): string | null {
  const codex = getProvider("codex");
  if (!codex || msgs.length === 0) return null;
  const configDir = providerConfigDir(project, codex);
  const template = latestCodexRollout(configDir);
  if (!template) return null;

  let tlines: Record<string, unknown>[];
  try {
    tlines = fs.readFileSync(template, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return null;
  }
  const newId = randomUUID();
  const turnCtx = tlines.find((l) => l.type === "turn_context") as { payload?: { turn_id?: string } } | undefined;
  const turnId = turnCtx?.payload?.turn_id ?? randomUUID();

  const userItems = (text: string): Record<string, unknown>[] => [
    { timestamp: ISO(), type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text }], internal_chat_message_metadata_passthrough: { turn_id: turnId } } },
    { timestamp: ISO(), type: "event_msg", payload: { type: "user_message", message: text, images: [], local_images: [], text_elements: [] } },
  ];
  const asstItems = (text: string): Record<string, unknown>[] => [
    { timestamp: ISO(), type: "event_msg", payload: { type: "agent_message", message: text, phase: "final_answer", memory_citation: null } },
    { timestamp: ISO(), type: "response_item", payload: { type: "message", id: "msg_" + randomUUID().replace(/-/g, ""), role: "assistant", content: [{ type: "output_text", text }], phase: "final_answer", internal_chat_message_metadata_passthrough: { turn_id: turnId } } },
  ];
  const injected = msgs.flatMap((m) => (m.role === "user" ? userItems(m.text) : asstItems(m.text)));

  const out: unknown[] = [];
  let done = false;
  for (const o of tlines) {
    const oo = o as { type?: string; payload?: { type?: string; role?: string; content?: { text?: string }[] } };
    if (oo.type === "session_meta") {
      (oo.payload as Record<string, unknown>).session_id = newId;
      (oo.payload as Record<string, unknown>).id = newId;
      out.push(oo);
      continue;
    }
    const p = oo.payload ?? {};
    // token_count của template = usage/context của phiên CŨ → bỏ, nếu không panel hiện context% sai
    // của session cũ cho tới khi codex chạy lượt thật (đọc rollout mới nhất = seed này).
    if (oo.type === "event_msg" && p.type === "token_count") continue;
    const isConvUser = oo.type === "response_item" && p.type === "message" && p.role === "user" && !(p.content?.[0]?.text ?? "").startsWith("<environment_context>");
    const isConvAsst = oo.type === "response_item" && p.type === "message" && p.role === "assistant";
    const isConvUserEvt = oo.type === "event_msg" && p.type === "user_message";
    const isConvAsstEvt = oo.type === "event_msg" && p.type === "agent_message";
    if (isConvUser && !done) {
      out.push(...injected);
      done = true;
      continue;
    }
    if (isConvUser || isConvAsst || isConvUserEvt || isConvAsstEvt) continue;
    // chèn sau turn_context nếu template không có lượt hội thoại nào
    out.push(oo);
    if (!done && oo.type === "turn_context") {
      out.push(...injected);
      done = true;
    }
  }
  if (!done) out.push(...injected);

  // marker = số dòng file: cho phép prune "seed chưa dùng" sau này (codex append → line count đổi).
  const meta = (out as { type?: string; payload?: Record<string, unknown> }[]).find((o) => o.type === "session_meta");
  if (meta?.payload) meta.payload.aiws_synth = out.length;

  const stamp = ISO().replace(/\.\d+Z$/, "").replace(/:/g, "-");
  const file = path.join(path.dirname(template), `rollout-${stamp}-${newId}.jsonl`);
  try {
    fs.writeFileSync(file, out.map((o) => JSON.stringify(o)).join("\n") + "\n");
  } catch {
    return null;
  }
  pruneUntouchedSynthSeeds(configDir, file); // dọn seed cũ codex chưa dùng → bounded
  return newId;
}

// ---------- claude ----------
/** Tổng hợp transcript claude .jsonl từ Msg[] → trả session_id. (Best-effort; verify khi có auth.) */
export function synthesizeClaudeSession(project: Project, msgs: Msg[]): string | null {
  const claude = getProvider("claude");
  if (!claude || msgs.length === 0) return null;
  const configDir = providerConfigDir(project, claude);
  const cwd = project.path;
  const sid = randomUUID();
  const dir = path.join(configDir, "projects", encodeProjectDir(cwd));
  const lines: unknown[] = [];
  let parent: string | null = null;
  for (const m of msgs) {
    const uuid = randomUUID();
    const base = { parentUuid: parent, isSidechain: false, type: m.role, uuid, timestamp: ISO(), cwd, sessionId: sid, version: "2.1.204", gitBranch: "main" };
    if (m.role === "user") {
      lines.push({ ...base, message: { role: "user", content: m.text }, userType: "external", origin: { kind: "human" }, promptSource: "typed", entrypoint: "cli", permissionMode: "default" });
    } else {
      lines.push({ ...base, message: { model: "claude-opus-4-8", id: "msg_" + randomUUID().replace(/-/g, ""), type: "message", role: "assistant", content: [{ type: "text", text: m.text }], stop_reason: "end_turn" } });
    }
    parent = uuid;
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${sid}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  } catch {
    return null;
  }
  return sid;
}

// ---------- orchestration ----------
type Extractor = (configDir: string, cwd: string) => Msg[];
const EXTRACTORS: Record<string, Extractor> = { claude: extractClaudeMessages, codex: extractCodexMessages };
// Chỉ bật NATIVE cho provider đã VERIFY resume được transcript tổng hợp. codex: ĐÃ verify (BANANA42
// + GUI). claude-as-target: synth đã có (synthesizeClaudeSession) nhưng CHƯA verify (kẹt auth) →
// tạm để fallback soft-handoff cho an toàn; thêm vào đây khi test được claude --resume.
const SYNTHS: Record<string, (project: Project, msgs: Msg[]) => string | null> = {
  codex: synthesizeCodexSession,
};
// Cách RESUME một session theo id của từng provider.
const RESUME_ARGS: Record<string, (id: string) => string[]> = {
  claude: (id) => ["--resume", id],
  codex: (id) => ["resume", id],
};

/** Hội thoại mới nhất trong project TỪ provider KHÁC target (kèm mtime để chọn cái mới nhất). */
function latestForeign(project: Project, targetProviderId: string): { from: string; msgs: Msg[]; mtime: number } | null {
  let best: { from: string; msgs: Msg[]; mtime: number } | null = null;
  for (const [pid, extract] of Object.entries(EXTRACTORS)) {
    if (pid === targetProviderId) continue;
    const provider = getProvider(pid);
    if (!provider) continue;
    const configDir = providerConfigDir(project, provider);
    const file = pid === "codex" ? latestCodexRollout(configDir) : latestTranscriptFile(configDir, project.path);
    if (!file) continue;
    const mtime = fs.statSync(file).mtimeMs;
    if (best && mtime <= best.mtime) continue;
    const msgs = extract(configDir, project.path);
    if (msgs.length) best = { from: pid, msgs, mtime };
  }
  return best;
}

/**
 * Chuẩn bị "nạp native" cho provider đích: tìm hội thoại mới nhất từ provider khác → tổng hợp
 * session native cho đích → trả args để `--resume` nó. Null nếu không có gì hoặc chưa tổng hợp được
 * (→ caller dùng soft-handoff).
 */
export function prepareNativeCarry(
  project: Project,
  targetProviderId: string,
): { resumeArgs: string[]; sessionId: string; from: string; count: number } | null {
  const synth = SYNTHS[targetProviderId];
  const resume = RESUME_ARGS[targetProviderId];
  if (!synth || !resume) return null;
  const foreign = latestForeign(project, targetProviderId);
  if (!foreign) return null;
  const sid = synth(project, foreign.msgs);
  if (!sid) return null;
  return { resumeArgs: resume(sid), sessionId: sid, from: foreign.from, count: foreign.msgs.length };
}

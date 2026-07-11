import fs from "node:fs";
import path from "node:path";

/** Mã hoá cwd thành tên thư mục transcript của Claude (ký tự không phải chữ-số → '-'). */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

export interface ContextInfo {
  used: number;
  window: number;
  pct: number;
  model?: string; // model thật đọc từ transcript (nếu có)
}

const planCache = new Map<string, { at: number; plan: string | null }>();

/** Đọc gói (organizationType) từ .claude.json — cache 60s vì file lớn & plan hiếm đổi. */
function readPlan(configDir: string): string | null {
  const c = planCache.get(configDir);
  if (c && Date.now() - c.at < 60_000) return c.plan;
  let plan: string | null = null;
  try {
    let raw = fs.readFileSync(path.join(configDir, ".claude.json"), "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    plan = (JSON.parse(raw) as any)?.oauthAccount?.organizationType ?? null;
  } catch {
    plan = null;
  }
  planCache.set(configDir, { at: Date.now(), plan });
  return plan;
}

/** Loại tài khoản Claude từ gói (organizationType): "claude_max" → "Claude Max". Null nếu chưa rõ. */
export function readClaudeAccountType(configDir: string): string | null {
  const org = readPlan(configDir); // cached 60s
  if (!org) return null;
  const plan = org.replace(/^claude[_-]?/i, "").trim();
  return "Claude" + (plan ? " " + plan.charAt(0).toUpperCase() + plan.slice(1) : "");
}

/**
 * Cửa sổ context. Transcript ghi model "claude-opus-4-8" KHÔNG cho biết là bản 1M; 1M là đặc
 * quyền theo GÓI (Max). Suy ra: env AIWS_CTX_WINDOW → model có "[1m]" → Opus 4.x trên gói Max
 * = 1M → mặc định 200k.
 */
function contextWindow(configDir: string, model?: string): number {
  const env = Number(process.env.AIWS_CTX_WINDOW);
  if (env > 0) return env;
  if (model && /\[1m\]/i.test(model)) return 1_000_000;
  if (/max/i.test(readPlan(configDir) ?? "")) return 1_000_000; // gói Max mở 1M context cho model flagship
  return 200_000;
}

/**
 * File transcript MỚI NHẤT của project (theo mtime). Robust hơn dựa vào session-id vì Claude
 * có thể dùng session-id khác cái aiws đặt qua --session-id.
 */
export function latestTranscriptFile(configDir: string, projectPath: string): string | null {
  const dir = path.join(configDir, "projects", encodeProjectDir(projectPath));
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return null;
  }
  let latest: string | null = null;
  let latestMtime = -1;
  for (const f of files) {
    try {
      const m = fs.statSync(path.join(dir, f)).mtimeMs;
      if (m > latestMtime) {
        latestMtime = m;
        latest = path.join(dir, f);
      }
    } catch {
      /* ignore */
    }
  }
  return latest;
}

/** Đọc tối đa `maxBytes` cuối của file (tránh đọc cả file transcript lớn). */
function readTail(file: string, maxBytes: number): string | null {
  try {
    const size = fs.statSync(file).size;
    const len = Math.min(size, maxBytes);
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      return buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/**
 * Ước lượng %context đã dùng từ transcript session của Claude.
 * Best-effort: format .jsonl chưa được tài liệu hoá — không đọc được thì trả null (panel hiện "—").
 * Đường dẫn: <configDir>/projects/<encode(projectPath)>/<sessionId>.jsonl
 */
export function readSessionContext(
  configDir: string,
  projectPath: string,
  _sessionId: string | undefined, // Claude dùng id khác aiws đặt → đọc file mới nhất thay vì theo id
  model?: string,
): ContextInfo | null {
  const file = latestTranscriptFile(configDir, projectPath);
  if (!file) return null;
  const raw = readTail(file, 256 * 1024);
  if (!raw) return null;

  const lines = raw.split("\n");
  let used = 0;
  let foundModel: string | undefined;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || line[0] !== "{") continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue; // dòng đầu có thể bị cắt (đọc tail) → bỏ qua
    }
    const u = obj?.message?.usage;
    if (u) {
      used = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      foundModel = obj?.message?.model;
      break;
    }
  }
  if (used <= 0) return null;
  const window = contextWindow(configDir, foundModel ?? model);
  return { used, window, pct: Math.min(100, Math.round((used / window) * 100)), model: foundModel };
}

/**
 * Đọc model của Claude từ transcript GẦN NHẤT trong thư mục project (để hiện ngay từ đầu,
 * kể cả khi session mới chưa chat — lấy từ session cũ). Trả null nếu chưa có transcript nào.
 */
export function readClaudeModel(configDir: string, projectPath: string): string | null {
  const dir = path.join(configDir, "projects", encodeProjectDir(projectPath));
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return null;
  }
  if (!files.length) return null;
  // Duyệt các transcript theo mtime giảm dần; lấy model ở file gần nhất CÓ message.model
  // (file mới nhất có thể chưa có câu trả lời assistant nào → chưa có model).
  const sorted = files
    .map((f) => {
      try {
        return { f, m: fs.statSync(path.join(dir, f)).mtimeMs };
      } catch {
        return { f, m: 0 };
      }
    })
    .sort((a, b) => b.m - a.m);
  for (const { f } of sorted) {
    const raw = readTail(path.join(dir, f), 256 * 1024);
    if (!raw) continue;
    const lines = raw.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line || line[0] !== "{") continue;
      try {
        const o: any = JSON.parse(line);
        if (o?.message?.model) return o.message.model;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/**
 * Đọc effort đang dùng của phiên Claude: quét transcript tìm lần cuối `/effort` set
 * ("Set effort level to <X>"). Đọc cả file vì lệnh /effort thường ở đầu phiên.
 */
export function readClaudeEffort(configDir: string, projectPath: string, _sessionId: string | undefined): string | null {
  const file = latestTranscriptFile(configDir, projectPath);
  if (!file) return null;
  let raw: string;
  try {
    const size = fs.statSync(file).size;
    // file lớn (>4MB) thì chỉ đọc 2MB đầu (nơi /effort hay nằm) để đỡ nặng.
    if (size > 4 * 1024 * 1024) {
      const fd = fs.openSync(file, "r");
      try {
        const buf = Buffer.alloc(2 * 1024 * 1024);
        const n = fs.readSync(fd, buf, 0, buf.length, 0);
        raw = buf.subarray(0, n).toString("utf8");
      } finally {
        fs.closeSync(fd);
      }
    } else {
      raw = fs.readFileSync(file, "utf8");
    }
  } catch {
    return null;
  }
  const matches = [...raw.matchAll(/Set effort level to (\w+)/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

/** Đọc account đang đăng nhập từ .claude.json trong config-dir cô lập (best-effort). */
export function readClaudeAccount(configDir: string): string | null {
  try {
    let raw = fs.readFileSync(path.join(configDir, ".claude.json"), "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const j: any = JSON.parse(raw);
    const acc = j.oauthAccount ?? j.account ?? {};
    return acc.displayName ?? acc.emailAddress ?? acc.email ?? j.emailAddress ?? j.email ?? null;
  } catch {
    return null;
  }
}

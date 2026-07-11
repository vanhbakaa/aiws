import fs from "node:fs";
import path from "node:path";
import type { ContextInfo } from "./sessionContext.js";
import type { UsageInfo } from "./usage.js";

function readJson(file: string): any | null {
  try {
    let raw = fs.readFileSync(file, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Codex: $CODEX_HOME/auth.json → decode JWT id_token. Ưu tiên TÊN hiển thị (đừng lộ email). */
export function readCodexAccount(configDir: string): string | null {
  const j = readJson(path.join(configDir, "auth.json"));
  if (!j) return null;
  const jwt: string | undefined = j.tokens?.id_token;
  if (jwt) {
    try {
      const payload = jwt.split(".")[1];
      const o = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
      const email: string | undefined = o.email ?? o["https://api.openai.com/auth"]?.email;
      // Tên trước; nếu không có tên thì che email thành phần local (tránh lộ địa chỉ đầy đủ).
      return o.name ?? (email ? email.split("@")[0] : null);
    } catch {
      /* ignore JWT lỗi */
    }
  }
  if (j.OPENAI_API_KEY) return "API key";
  return null;
}

/** Codex: loại tài khoản — "ChatGPT Plus/Pro..." (subscription) hoặc "API key". */
export function readCodexAccountType(configDir: string): string | null {
  const j = readJson(path.join(configDir, "auth.json"));
  if (!j) return null;
  const jwt: string | undefined = j.tokens?.id_token;
  if (jwt) {
    try {
      const p = JSON.parse(Buffer.from(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
      const plan: string | undefined = p["https://api.openai.com/auth"]?.chatgpt_plan_type;
      if (plan) return "ChatGPT " + plan.charAt(0).toUpperCase() + plan.slice(1); // "ChatGPT Plus"
    } catch {
      /* ignore */
    }
  }
  if (j.auth_mode === "chatgpt") return "ChatGPT";
  if (j.OPENAI_API_KEY || j.auth_mode === "apikey") return "API key";
  return null;
}

/** Gemini: cô lập bằng HOME → $configDir/.gemini/google_accounts.json → active (email). */
export function readGeminiAccount(configDir: string): string | null {
  const j = readJson(path.join(configDir, ".gemini", "google_accounts.json"));
  return j?.active ?? null;
}

// ---- Codex live info: the rollout (rollout-*.jsonl) is the source of truth, not config.toml.
// turn_context → model/effort; the last token_count event → context window + 5h/weekly rate limits.

function latestCodexRollout(configDir: string): string | null {
  const base = path.join(configDir, "sessions"); // junction → shared conv store
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
        let m: number;
        try {
          m = fs.statSync(f).mtimeMs; // file có thể bị prune/xoá giữa chừng → bỏ qua, đừng ném
        } catch {
          continue;
        }
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

// The panel calls 3 readers per 2s poll. TTL guard (< poll interval) collapses those into ONE
// directory walk + stat; the walk is skipped entirely on cache hit. Parse is reused unless the
// newest rollout's file/mtime changed. Keyed by configDir so multiple codex tabs don't thrash.
const CODEX_LIVE_TTL_MS = 1500;
const codexCache = new Map<string, { at: number; file: string | null; mtime: number; turn: any; tok: any }>();
function codexLive(configDir: string): { turn: any; tok: any } {
  const now = Date.now();
  const c = codexCache.get(configDir);
  if (c && now - c.at < CODEX_LIVE_TTL_MS) return { turn: c.turn, tok: c.tok }; // within a poll → no walk
  const file = latestCodexRollout(configDir);
  if (!file) {
    codexCache.set(configDir, { at: now, file: null, mtime: 0, turn: null, tok: null });
    return { turn: null, tok: null };
  }
  let mtime: number;
  try {
    mtime = fs.statSync(file).mtimeMs; // xoá giữa chừng → giữ giá trị cache cũ thay vì ném ra poll
  } catch {
    return c ? { turn: c.turn, tok: c.tok } : { turn: null, tok: null };
  }
  if (c && c.file === file && c.mtime === mtime) {
    c.at = now; // unchanged rollout → reuse the parse, just refresh TTL
    return { turn: c.turn, tok: c.tok };
  }
  let turn: any = null;
  let tok: any = null;
  try {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    for (let i = lines.length - 1; i >= 0 && (!turn || !tok); i--) {
      if (!lines[i].trim()) continue;
      let o: any;
      try {
        o = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (!tok && (o.type === "token_count" || o.payload?.type === "token_count")) tok = o.payload ?? o;
      if (!turn && o.type === "turn_context") turn = o.payload ?? o;
    }
  } catch {
    /* ignore */
  }
  codexCache.set(configDir, { at: now, file, mtime, turn, tok });
  return { turn, tok };
}

/** Codex: model từ rollout (turn_context.model — model THẬT đang chạy); fallback config.toml. */
export function readCodexModel(configDir: string): string | null {
  const { turn } = codexLive(configDir);
  if (turn?.model) return turn.model;
  try {
    const toml = fs.readFileSync(path.join(configDir, "config.toml"), "utf8");
    const m = toml.match(/^\s*model\s*=\s*["']([^"']+)["']/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Tra entry model trong $CODEX_HOME/models_cache.json theo slug (có context_window + default effort).
 *  File ~240KB & gần như không đổi → cache parse 60s (đừng đọc lại mỗi lần poll 2s). */
const modelsCacheCache = new Map<string, { at: number; data: any }>();
function codexModelInfo(configDir: string, slug: string | null | undefined): any | null {
  if (!slug) return null;
  let entry = modelsCacheCache.get(configDir);
  if (!entry || Date.now() - entry.at > 60_000) {
    let data: any = null;
    try {
      data = JSON.parse(fs.readFileSync(path.join(configDir, "models_cache.json"), "utf8"));
    } catch {
      data = null;
    }
    entry = { at: Date.now(), data };
    modelsCacheCache.set(configDir, entry);
  }
  if (!entry.data) return null;
  const find = (o: any): any => {
    if (o && typeof o === "object") {
      if (o.slug === slug) return o;
      for (const k in o) {
        const r = find(o[k]);
        if (r) return r;
      }
    }
    return null;
  };
  return find(entry.data);
}

/** Codex: reasoning effort — override trong rollout/config; nếu không có → mức MẶC ĐỊNH của model
 *  (default_reasoning_level trong models_cache.json, vd "medium"). Null khi chưa có phiên codex nào. */
export function readCodexEffort(configDir: string): string | null {
  const { turn } = codexLive(configDir);
  const e = turn?.collaboration_mode?.settings?.reasoning_effort ?? turn?.reasoning_effort;
  if (e) return String(e);
  try {
    const toml = fs.readFileSync(path.join(configDir, "config.toml"), "utf8");
    const m = toml.match(/^\s*model_reasoning_effort\s*=\s*["']([^"']+)["']/m);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  if (!turn) return null; // chưa có phiên codex → không biết
  const def = codexModelInfo(configDir, turn.model)?.default_reasoning_level;
  return def ? `${def} (default)` : "default";
}

/** Codex: context đã dùng = token_count cuối. Dùng `last_token_usage` (context HIỆN TẠI của lượt
 *  gần nhất), KHÔNG dùng `total_token_usage` (cộng dồn cả phiên → vượt window, ghim 100% sai). */
export function readCodexContext(configDir: string): ContextInfo | null {
  const { tok } = codexLive(configDir);
  const info = tok?.info;
  const window = info?.model_context_window;
  if (!window) return null;
  const used = info.last_token_usage?.total_tokens ?? info.total_token_usage?.total_tokens ?? 0;
  return { used, window, pct: Math.min(100, Math.round((used / window) * 100)) };
}

/** Codex OFFLINE: limit 5h (primary, 300') + tuần (secondary, 10080') từ rate_limits token_count. */
export function getCodexUsage(configDir: string): UsageInfo | null {
  const { tok } = codexLive(configDir);
  const rl = tok?.rate_limits;
  if (!rl) return null;
  const win = (w: any) =>
    w && typeof w.used_percent === "number"
      ? { pct: Math.round(w.used_percent), resetsAt: w.resets_at ? new Date(w.resets_at * 1000).toISOString() : undefined }
      : undefined;
  const fiveHour = win(rl.primary);
  const sevenDay = win(rl.secondary);
  if (!fiveHour && !sevenDay) return null;
  return { fiveHour, sevenDay };
}

// Codex LIVE usage: gọi endpoint ChatGPT mà codex /usage dùng → có "N lần reset limit" (thứ KHÔNG
// lưu trong rollout). ⚠️ API nội bộ (undocumented) → best-effort, hỏng thì trả null (fallback rollout).
export type CodexUsage = UsageInfo & { resetCredits?: number };
const WHAM_USAGE = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_USAGE_CACHE_MS = 180_000; // như claude: cache để không spam endpoint mỗi lần poll
const codexUsageCache = new Map<string, { at: number; data: CodexUsage | null; inflight?: Promise<CodexUsage | null> }>();

function codexAuth(configDir: string): { token: string; accountId: string } | null {
  const j = readJson(path.join(configDir, "auth.json"));
  const token: string | undefined = j?.tokens?.access_token;
  if (!token) return null;
  let accountId: string | undefined = j?.tokens?.account_id;
  if (!accountId && j?.tokens?.id_token) {
    try {
      const p = JSON.parse(Buffer.from(j.tokens.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
      accountId = p["https://api.openai.com/auth"]?.chatgpt_account_id;
    } catch {
      /* ignore */
    }
  }
  return { token, accountId: accountId ?? "" };
}

async function fetchCodexUsage(configDir: string): Promise<CodexUsage | null> {
  const auth = codexAuth(configDir);
  if (!auth) return null;
  try {
    const res = await fetch(WHAM_USAGE, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "chatgpt-account-id": auth.accountId,
        "User-Agent": "codex_cli_rs/0.144.1",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000), // endpoint treo → hủy, khỏi kẹt inflight promise
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const rl = j.rate_limit;
    const win = (w: any) =>
      w && typeof w.used_percent === "number"
        ? { pct: Math.round(w.used_percent), resetsAt: w.reset_at ? new Date(w.reset_at * 1000).toISOString() : undefined }
        : undefined;
    const fiveHour = win(rl?.primary_window);
    const sevenDay = win(rl?.secondary_window);
    const resetCredits: number | undefined = j.rate_limit_reset_credits?.available_count;
    if (!fiveHour && !sevenDay && resetCredits === undefined) return null;
    return { fiveHour, sevenDay, resetCredits };
  } catch {
    return null;
  }
}

/** Codex usage sống (cache 180s) — 5h/tuần + số lần reset limit còn lại. KHÔNG chặn: luôn trả ngay
 *  giá trị đang có; hết hạn thì refresh NỀN (để poll 2s không kẹt tối đa 8s chờ fetch). */
export function getCodexLiveUsage(configDir: string): Promise<CodexUsage | null> {
  const now = Date.now();
  const c = codexUsageCache.get(configDir);
  if ((!c || now - c.at >= CODEX_USAGE_CACHE_MS) && !c?.inflight) {
    const p = fetchCodexUsage(configDir).then((data) => {
      codexUsageCache.set(configDir, { at: Date.now(), data });
      return data;
    });
    p.catch(() => codexUsageCache.set(configDir, { at: c?.at ?? 0, data: c?.data ?? null }));
    codexUsageCache.set(configDir, { at: c?.at ?? 0, data: c?.data ?? null, inflight: p });
  }
  return Promise.resolve(codexUsageCache.get(configDir)?.data ?? null);
}

/** Gemini: model từ $configDir/.gemini/settings.json → model.name. */
export function readGeminiModel(configDir: string): string | null {
  const j = readJson(path.join(configDir, ".gemini", "settings.json"));
  return j?.model?.name ?? (typeof j?.model === "string" ? j.model : null);
}

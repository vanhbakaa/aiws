import fs from "node:fs";
import path from "node:path";

// Usage/limit account từ endpoint (chưa tài liệu hoá) mà Claude Code /usage dùng.
// aiws đọc token trong config-dir CÔ LẬP của account đó → hiện usage cho từng account.
// ⚠️ API nội bộ: có thể đổi/khoá → best-effort, hỏng thì trả null (panel ẩn thanh usage).

export interface UsageWindow {
  pct: number; // 0..100
  resetsAt?: string; // ISO
}
export interface UsageInfo {
  fiveHour?: UsageWindow;
  sevenDay?: UsageWindow;
}

const CACHE_MS = 180_000; // endpoint 429 rất gắt nếu poll nhanh → cache 180s
const UA = "claude-code/2.1.205"; // BẮT BUỘC bắt đầu bằng claude-code/ nếu không sẽ 429

type Entry = { at: number; data: UsageInfo | null; inflight?: Promise<UsageInfo | null> };
const cache = new Map<string, Entry>();

function readOauth(configDir: string): { token: string; scopes: string } | null {
  try {
    let raw = fs.readFileSync(path.join(configDir, ".credentials.json"), "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const o = (JSON.parse(raw) as any).claudeAiOauth;
    if (!o?.accessToken) return null;
    const scopes = Array.isArray(o.scopes) ? o.scopes.join(" ") : String(o.scopes ?? "");
    return { token: o.accessToken, scopes };
  } catch {
    return null;
  }
}

async function fetchUsage(configDir: string): Promise<UsageInfo | null> {
  const cred = readOauth(configDir);
  if (!cred) return null;
  if (cred.scopes && !cred.scopes.includes("user:profile")) return null; // token thiếu scope → endpoint từ chối
  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${cred.token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": UA,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as any;
    const win = (w: any): UsageWindow | undefined =>
      w && typeof w.utilization === "number" ? { pct: Math.round(w.utilization), resetsAt: w.resets_at } : undefined;
    return { fiveHour: win(j.five_hour), sevenDay: win(j.seven_day) };
  } catch {
    return null;
  }
}

/** Usage account (cache 180s + dedup inflight). An toàn gọi thường xuyên — chỉ hit mạng mỗi 180s. */
export function getClaudeUsage(configDir: string): Promise<UsageInfo | null> {
  const now = Date.now();
  const c = cache.get(configDir);
  if (c) {
    if (now - c.at < CACHE_MS) return Promise.resolve(c.data);
    if (c.inflight) return c.inflight;
  }
  const p = fetchUsage(configDir).then((data) => {
    cache.set(configDir, { at: Date.now(), data });
    return data;
  });
  cache.set(configDir, { at: c?.at ?? 0, data: c?.data ?? null, inflight: p });
  return p;
}

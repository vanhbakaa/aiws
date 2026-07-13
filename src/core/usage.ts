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

const CACHE_MS = 180_000; // endpoint 429 rất gắt nếu poll nhanh → cache kết quả TỐT 180s
const FAIL_MS = 20_000; // kết quả LỖI (429/blip) chỉ giữ 20s rồi thử lại → 1 lần miss không giấu usage 3 phút
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
    let fiveHour = win(j.five_hour);
    let sevenDay = win(j.seven_day);
    // Shape mới của endpoint có mảng `limits` (kind: session = 5h, weekly_all = 7 ngày). Fallback sang
    // nó nếu five_hour/seven_day biến mất → usage vẫn chạy khi Anthropic bỏ field cũ.
    if (!fiveHour || !sevenDay) {
      for (const l of Array.isArray(j.limits) ? j.limits : []) {
        const w: UsageWindow | undefined =
          l && typeof l.percent === "number" ? { pct: Math.round(l.percent), resetsAt: l.resets_at ?? undefined } : undefined;
        if (!w) continue;
        if (!fiveHour && l.kind === "session") fiveHour = w;
        if (!sevenDay && l.kind === "weekly_all") sevenDay = w;
      }
    }
    return { fiveHour, sevenDay };
  } catch {
    return null;
  }
}

/** Usage account (cache 180s + dedup inflight). An toàn gọi thường xuyên — chỉ hit mạng mỗi 180s. */
export function getClaudeUsage(configDir: string): Promise<UsageInfo | null> {
  const now = Date.now();
  const c = cache.get(configDir);
  if (c) {
    const ttl = c.data ? CACHE_MS : FAIL_MS; // giữ kết quả tốt lâu, nhưng thử lại sau lỗi rất nhanh
    if (now - c.at < ttl) return Promise.resolve(c.data);
    if (c.inflight) return c.inflight;
  }
  const p = fetchUsage(configDir).then((data) => {
    cache.set(configDir, { at: Date.now(), data });
    return data;
  });
  cache.set(configDir, { at: c?.at ?? 0, data: c?.data ?? null, inflight: p });
  return p;
}

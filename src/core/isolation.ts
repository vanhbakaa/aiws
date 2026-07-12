import fs from "node:fs";
import path from "node:path";
import { accountConfigDir, profilesDir, projectProfileDir } from "./paths.js";
import { resolveAccountEnv } from "./accounts.js";
import { getSecret } from "./secrets.js";
import { getCliTools } from "./tools.js";
import { linkSharedConversations } from "./sharedConv.js";
import type { AiAccount, Project, Provider } from "./types.js";

/**
 * Môi trường cô lập chung của project: trỏ config-dir của MỌI CLI tool đã biết
 * (gh/git/aws/gcloud/docker/kubectl/npm/…) vào `profiles/<proj>/tools/<tool>` riêng.
 * → chạy bất kỳ lệnh nào trong project này đều không đụng project khác.
 */
export function buildProjectEnv(project: Project): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const toolsBase = path.join(projectProfileDir(project.id), "tools");
  for (const tool of getCliTools()) {
    const toolDir = path.join(toolsBase, tool.id);
    for (const spec of tool.isolationEnv) {
      if (spec.kind === "dir") {
        fs.mkdirSync(toolDir, { recursive: true });
        env[spec.var] = toolDir;
      } else {
        const file = path.join(toolDir, spec.subpath ?? spec.var);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        env[spec.var] = file;
      }
    }
  }
  return env;
}

export interface IsolatedLaunch {
  /** Env đầy đủ để spawn provider (process.env + cô lập + env của account). */
  env: NodeJS.ProcessEnv;
  /** Config-dir cô lập mà provider sẽ dùng (nơi chứa session/history). */
  configDir: string;
}

/** Account oauth dùng config-dir GLOBAL (login dùng chung mọi project). */
function isGlobalAccountDir(account?: AiAccount): boolean {
  return !!account && account.authMethod === "oauth_login";
}

/** Copy đệ quy, KHÔNG ghi đè file đã có. statSync theo junction (dir projects/ cũ có thể là junction). */
function mergeCopyInto(src: string, dst: string): void {
  let names: string[];
  try {
    names = fs.readdirSync(src);
  } catch {
    return;
  }
  fs.mkdirSync(dst, { recursive: true });
  for (const name of names) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(s);
    } catch {
      continue;
    }
    if (st.isDirectory()) mergeCopyInto(s, d);
    else if (!fs.existsSync(d)) {
      try {
        fs.copyFileSync(s, d);
      } catch {
        /* bỏ file lỗi */
      }
    }
  }
}

/**
 * Di trú MỘT LẦN login+lịch sử từ scheme cũ (per-project `profiles/<proj>/<provider>__<accId>`) sang
 * dir GLOBAL mới (`~/.aiws/accounts/<accId>/<provider>`). Non-destructive: chỉ COPY, giữ nguyên dir
 * cũ. Chạy khi dir global CHƯA tồn tại → sau lần đầu là no-op. Gộp mọi project cũ (login trùng nhau
 * nên bỏ-nếu-đã-có; transcript claude theo cwd nên không đụng nhau).
 */
function migrateLegacyAccountDir(account: AiAccount, provider: Provider, newDir: string): void {
  if (fs.existsSync(newDir)) return; // đã có/đã di trú
  const legacyName = `${provider.id}__${account.id}`;
  let projs: fs.Dirent[];
  try {
    projs = fs.readdirSync(profilesDir(), { withFileTypes: true });
  } catch {
    return; // chưa có profiles cũ (cài mới) → không cần di trú
  }
  const sources = projs
    .filter((e) => e.isDirectory())
    .map((e) => path.join(profilesDir(), e.name, legacyName))
    .filter((p) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    });
  if (!sources.length) return;
  for (const src of sources) mergeCopyInto(src, newDir);
}

/**
 * Config-dir của (project, provider[, account]).
 * - oauth_login → dir GLOBAL theo account (auth = login nằm trong dir) →
 *   `~/.aiws/accounts/<accountId>/<provider>`. Cùng account = cùng dir ở mọi project → không
 *   phải login lại khi đổi project. Session vẫn tách theo cwd (claude tự tách; codex lọc cwd).
 * - env-based auth (api_key/cloud/local/custom) hoặc không account → DÙNG CHUNG
 *   `profiles/<proj>/<provider>` (auth nằm ở env/secret, không có vấn đề login lại).
 */
export function providerConfigDir(
  project: Project,
  provider: Provider,
  account?: AiAccount,
): string {
  if (isGlobalAccountDir(account)) {
    return accountConfigDir(account!.id, provider.id);
  }
  return path.join(projectProfileDir(project.id), provider.id);
}

/**
 * Dựng môi trường cô lập cho một (project, provider[, account]).
 * Trỏ mọi isolationEnv của provider vào config-dir, rồi merge env của account.
 */
export function buildIsolatedEnv(
  project: Project,
  provider: Provider,
  account?: AiAccount,
): IsolatedLaunch {
  const configDir = providerConfigDir(project, provider, account);
  // Di trú login+lịch sử cũ (per-project) sang dir global lần đầu → không phải login lại, không mất chat.
  if (isGlobalAccountDir(account)) migrateLegacyAccountDir(account!, provider, configDir);
  fs.mkdirSync(configDir, { recursive: true });

  // Bắt đầu từ môi trường cô lập chung (mọi CLI tool) rồi thêm config-dir của provider.
  const env = buildProjectEnv(project);
  for (const key of provider.isolationEnv) env[key] = configDir;

  const secret = account ? getSecret(account.id) : undefined;
  Object.assign(env, resolveAccountEnv(provider, account, secret));

  // Chia sẻ transcript giữa các account cùng provider CHỈ với dir per-project (env-based/no-account).
  // Dir per-account global (oauth) đã dùng chung mọi project → junction sẽ trói TOÀN BỘ history của
  // account vào một project → SAI. Bỏ qua; switch account nối tiếp qua carryTranscript (run.ts).
  if (!isGlobalAccountDir(account)) {
    linkSharedConversations(project, provider, configDir);
  }

  return { env, configDir };
}

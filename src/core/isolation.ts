import fs from "node:fs";
import path from "node:path";
import { projectProfileDir } from "./paths.js";
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

/**
 * Config-dir của (project, provider[, account]).
 * - env-based auth (api_key/cloud/local/custom) hoặc không account → DÙNG CHUNG
 *   `profiles/<proj>/<provider>` → session được giữ khi đổi account (hot-switch).
 * - oauth_login → dir riêng theo account (auth nằm trong dir) →
 *   `profiles/<proj>/<provider>__<accountId>`.
 */
export function providerConfigDir(
  project: Project,
  provider: Provider,
  account?: AiAccount,
): string {
  const base = projectProfileDir(project.id);
  if (account && account.authMethod === "oauth_login") {
    return path.join(base, `${provider.id}__${account.id}`);
  }
  return path.join(base, provider.id);
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
  fs.mkdirSync(configDir, { recursive: true });

  // Bắt đầu từ môi trường cô lập chung (mọi CLI tool) rồi thêm config-dir của provider.
  const env = buildProjectEnv(project);
  for (const key of provider.isolationEnv) env[key] = configDir;

  const secret = account ? getSecret(account.id) : undefined;
  Object.assign(env, resolveAccountEnv(provider, account, secret));

  // Chia sẻ transcript giữa các account cùng provider (junction về kho chung/project/provider).
  linkSharedConversations(project, provider, configDir);

  return { env, configDir };
}

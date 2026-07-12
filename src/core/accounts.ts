import { randomUUID } from "node:crypto";
import { loadWorkspace, saveWorkspace } from "./storage.js";
import { deleteSecret, getSecret, setSecret, type AccountSecret } from "./secrets.js";
import { t } from "./i18n.js";
import type { AiAccount, AuthMethod, Provider } from "./types.js";

export interface AddAccountInput {
  providerId: string;
  label: string;
  authMethod: AuthMethod;
  secret?: AccountSecret; // apiKey/baseUrl/env — tuỳ method
  makeDefault?: boolean;
}

export function listAccounts(providerId?: string): AiAccount[] {
  const all = loadWorkspace().aiAccounts;
  return providerId ? all.filter((a) => a.providerId === providerId) : all;
}

export function getAccountsForProvider(providerId: string): AiAccount[] {
  return listAccounts(providerId);
}

export function getAccountById(id: string): AiAccount | undefined {
  return loadWorkspace().aiAccounts.find((a) => a.id === id);
}

export function addAccount(input: AddAccountInput): AiAccount {
  const ws = loadWorkspace();
  if (ws.aiAccounts.some((a) => a.providerId === input.providerId && a.label === input.label)) {
    throw new Error(t("errAccountExists", { label: input.label, provider: input.providerId }));
  }
  const id = randomUUID();
  const account: AiAccount = {
    id,
    providerId: input.providerId,
    label: input.label,
    authMethod: input.authMethod,
    authRef: id,
  };
  // account đầu tiên của provider → mặc định luôn (trừ khi có yêu cầu khác)
  const isFirst = !ws.aiAccounts.some((a) => a.providerId === input.providerId);
  if (input.makeDefault || isFirst) {
    for (const a of ws.aiAccounts) if (a.providerId === input.providerId) a.isDefault = false;
    account.isDefault = true;
  }
  ws.aiAccounts.push(account);
  saveWorkspace(ws);
  if (input.secret) setSecret(id, input.secret);
  return account;
}

export function removeAccount(providerId: string, label: string): boolean {
  const ws = loadWorkspace();
  const acct = ws.aiAccounts.find((a) => a.providerId === providerId && a.label === label);
  if (!acct) return false;
  ws.aiAccounts = ws.aiAccounts.filter((a) => a.id !== acct.id);
  // nếu xoá account default, đặt account còn lại (nếu có) làm default
  if (acct.isDefault) {
    const next = ws.aiAccounts.find((a) => a.providerId === providerId);
    if (next) next.isDefault = true;
  }
  saveWorkspace(ws);
  deleteSecret(acct.id);
  return true;
}

/** Đổi tên (label) account theo id. Không cho trùng label trong cùng provider. */
export function renameAccount(id: string, label: string): void {
  const ws = loadWorkspace();
  const acc = ws.aiAccounts.find((a) => a.id === id);
  if (!acc) throw new Error(t("errAccountNotFound"));
  const clean = label.trim();
  if (!clean) throw new Error(t("errAccountNameEmpty"));
  if (ws.aiAccounts.some((a) => a.id !== id && a.providerId === acc.providerId && a.label === clean)) {
    throw new Error(t("errAccountExists", { label: clean, provider: acc.providerId }));
  }
  acc.label = clean;
  saveWorkspace(ws);
}

/** Xoá account theo id (kèm cập nhật default). Trả false nếu không tồn tại. */
export function removeAccountById(id: string): boolean {
  const acc = getAccountById(id);
  if (!acc) return false;
  return removeAccount(acc.providerId, acc.label);
}

/** Đặt account (theo id) làm mặc định cho provider của nó. */
export function setDefaultAccountById(id: string): void {
  const acc = getAccountById(id);
  if (!acc) throw new Error(`Không tìm thấy account id "${id}"`);
  setDefaultAccount(acc.providerId, acc.label);
}

export function setDefaultAccount(providerId: string, label: string): void {
  const ws = loadWorkspace();
  const acct = ws.aiAccounts.find((a) => a.providerId === providerId && a.label === label);
  if (!acct) throw new Error(`Không có account "${label}" cho provider "${providerId}"`);
  for (const a of ws.aiAccounts) if (a.providerId === providerId) a.isDefault = a.id === acct.id;
  saveWorkspace(ws);
}

export function getDefaultAccount(providerId: string): AiAccount | undefined {
  const accts = getAccountsForProvider(providerId);
  return accts.find((a) => a.isDefault) ?? accts[0];
}

/** Account kế tiếp (luân phiên) để hot-switch né limit. */
export function nextAccount(providerId: string, currentId?: string): AiAccount | undefined {
  const accts = getAccountsForProvider(providerId);
  if (accts.length === 0) return undefined;
  const i = accts.findIndex((a) => a.id === currentId);
  if (i < 0) return accts[0];
  return accts[(i + 1) % accts.length];
}

/**
 * Map một account → tập env inject khi launch (dựa theo auth method + provider).
 * Đây là mấu chốt: env-based (api_key/cloud/custom/local) → auth nằm ở env, KHÔNG nằm
 * trong config-dir → cho phép dùng chung config-dir (giữ session) khi switch.
 */
export function resolveAccountEnv(
  provider: Provider,
  account: AiAccount | undefined,
  secret: AccountSecret | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (!account) return env;
  switch (account.authMethod) {
    case "api_key":
    case "custom_base_url":
      if (provider.apiKeyEnv && secret?.apiKey) env[provider.apiKeyEnv] = secret.apiKey;
      if (provider.baseUrlEnv && secret?.baseUrl) env[provider.baseUrlEnv] = secret.baseUrl;
      Object.assign(env, secret?.env ?? {});
      break;
    case "cloud":
    case "local":
      Object.assign(env, secret?.env ?? {});
      break;
    case "oauth_login":
      // Không set env — auth nằm trong config-dir riêng của account (xem isolation).
      break;
  }
  return env;
}

/** Helper cho CLI/test: nạp secret rồi resolve env. */
export function accountEnv(provider: Provider, account?: AiAccount): Record<string, string> {
  const secret = account ? getSecret(account.id) : undefined;
  return resolveAccountEnv(provider, account, secret);
}

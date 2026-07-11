import {
  readClaudeAccount,
  readClaudeAccountType,
  readClaudeEffort,
  readClaudeModel,
  readSessionContext,
  type ContextInfo,
} from "./sessionContext.js";
import {
  readCodexAccount,
  readCodexAccountType,
  readCodexContext,
  readCodexEffort,
  readCodexModel,
  readGeminiAccount,
  readGeminiModel,
} from "./providerReaders.js";

/**
 * Adapter đọc thông tin "sống" (account, model, context) theo từng provider. Provider CHƯA
 * có reader → trả null → panel hiện "—" (không bao giờ vỡ). Thêm provider = thêm 1 entry.
 */
export interface ProviderReader {
  account?(configDir: string): string | null;
  accountType?(configDir: string): string | null;
  model?(configDir: string, cwd: string): string | null;
  effort?(configDir: string, cwd: string, sessionId: string | undefined): string | null;
  context?(configDir: string, cwd: string, sessionId: string | undefined, model?: string): ContextInfo | null;
}

const READERS: Record<string, ProviderReader> = {
  claude: {
    account: readClaudeAccount,
    accountType: readClaudeAccountType,
    model: readClaudeModel,
    effort: readClaudeEffort,
    context: readSessionContext,
  },
  codex: {
    account: readCodexAccount,
    accountType: readCodexAccountType,
    model: readCodexModel,
    effort: (configDir) => readCodexEffort(configDir),
    context: (configDir) => readCodexContext(configDir),
  },
  gemini: { account: readGeminiAccount, model: readGeminiModel }, // context: tmp/<hash>/logs.json — nối khi có data thật
  // opencode/aider/ollama: account/context thêm khi cần (ollama không có; aider BYO key).
};

export function readModelFor(providerId: string, configDir: string, cwd: string): string | null {
  return READERS[providerId]?.model?.(configDir, cwd) ?? null;
}

export function readEffortFor(
  providerId: string,
  configDir: string,
  cwd: string,
  sessionId: string | undefined,
): string | null {
  return READERS[providerId]?.effort?.(configDir, cwd, sessionId) ?? null;
}

export function readAccountFor(providerId: string, configDir: string): string | null {
  return READERS[providerId]?.account?.(configDir) ?? null;
}

export function readAccountTypeFor(providerId: string, configDir: string): string | null {
  return READERS[providerId]?.accountType?.(configDir) ?? null;
}

export function readContextFor(
  providerId: string,
  configDir: string,
  cwd: string,
  sessionId: string | undefined,
  model?: string,
): ContextInfo | null {
  return READERS[providerId]?.context?.(configDir, cwd, sessionId, model) ?? null;
}

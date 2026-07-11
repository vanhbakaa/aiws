import { loadWorkspace } from "./storage.js";
import type { Provider } from "./types.js";

// Preset built-in. Người dùng có thể thêm/ghi đè bằng cách khai báo trong config.json
// (mục "providers") — cùng id thì config thắng. Đây là phần "config-driven".
//
// LƯU Ý: tên env cô lập là giá trị đã-biết của từng tool, verify khi chạy thật:
//  - claude: CLAUDE_CONFIG_DIR (đã cài trên máy này → kiểm ở Task 6)
//  - codex : CODEX_HOME
//  - ollama: OLLAMA_HOME (Ollama chạy local, chủ yếu cô lập thư mục dữ liệu)
export const PRESET_PROVIDERS: Provider[] = [
  {
    id: "claude",
    launchCmd: ["claude"],
    sessionIdFlag: "--session-id", // verify từ `claude --help`
    resumeFlag: "--resume",
    isolationEnv: ["CLAUDE_CONFIG_DIR"],
    authMethods: ["oauth_login", "api_key", "cloud", "custom_base_url"],
    apiKeyEnv: "ANTHROPIC_API_KEY",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    supportsSkills: true,
    supportsMcp: true,
    hasAccounts: true,
  },
  {
    id: "codex",
    launchCmd: ["codex"],
    // ✅ CODEX_HOME cô lập config+auth+sessions. Codex KHÔNG cho set session-id lúc launch
    // (chỉ `codex resume`), nên aiws không track được id → switch relaunch phiên mới.
    isolationEnv: ["CODEX_HOME"],
    authMethods: ["oauth_login", "api_key", "custom_base_url"],
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "OPENAI_BASE_URL",
    supportsSkills: false,
    supportsMcp: true,
    hasAccounts: true,
  },
  {
    id: "gemini",
    launchCmd: ["gemini"],
    // ⚠️ Gemini không có env config-dir (hardcode ~/.gemini) → override HOME để cô lập.
    isolationEnv: ["HOME", "USERPROFILE"],
    authMethods: ["oauth_login", "api_key"],
    apiKeyEnv: "GEMINI_API_KEY",
    supportsSkills: false,
    supportsMcp: true,
    hasAccounts: true,
  },
  {
    id: "opencode",
    launchCmd: ["opencode"],
    // ✅ config qua OPENCODE_CONFIG_DIR, nhưng auth/session ở data-dir theo XDG_DATA_HOME.
    isolationEnv: ["OPENCODE_CONFIG_DIR", "XDG_DATA_HOME"],
    authMethods: ["oauth_login", "api_key"],
    apiKeyEnv: "ANTHROPIC_API_KEY", // opencode dùng key theo provider; mặc định anthropic
    supportsSkills: false,
    supportsMcp: true,
    hasAccounts: true,
  },
  {
    id: "ollama",
    launchCmd: ["ollama"],
    // ⚠️ Không có env cô lập cả thư mục (chỉ OLLAMA_MODELS = models). Local + không account
    // → không cô lập để tránh tải lại model GB. Muốn cô lập hẳn: thêm HOME qua config.cliTools.
    isolationEnv: [],
    authMethods: ["local"],
    supportsSkills: false,
    supportsMcp: false,
    hasAccounts: false,
  },
];

/** Danh sách provider = preset built-in, ghi đè bởi config.providers (theo id). */
export function getProviders(): Provider[] {
  const fromConfig = loadWorkspace().providers;
  const byId = new Map<string, Provider>();
  for (const p of PRESET_PROVIDERS) byId.set(p.id, p);
  for (const p of fromConfig) byId.set(p.id, p); // config thắng
  return [...byId.values()];
}

export function getProvider(id: string): Provider | undefined {
  return getProviders().find((p) => p.id === id);
}

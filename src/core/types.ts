// Data model cho workspace. Xem tasks/plan.md phần "Data Model".

/** Cách một AI account liên kết tới dịch vụ — đầy đủ các kiểu người dùng hay dùng. */
export type AuthMethod =
  | "oauth_login"     // đăng nhập subscription (Claude / Codex)
  | "api_key"         // API key (Anthropic / OpenAI ...)
  | "cloud"           // gateway đám mây (Bedrock / Vertex / Azure)
  | "local"           // model chạy local (Ollama)
  | "custom_base_url"; // proxy / gateway tuỳ chỉnh (OpenRouter / LiteLLM)

/** Mô tả một provider AI (config-driven — thêm provider = thêm entry). */
export interface Provider {
  id: string;                 // "claude" | "codex" | "ollama" | ...
  launchCmd: string[];        // lệnh chạy, vd ["claude"]
  sessionIdFlag?: string;     // flag bắt đầu phiên với id cho trước, vd "--session-id"
  resumeFlag?: string;        // flag resume phiên theo id, vd "--resume"
  continueFlag?: string;      // flag tiếp tục hội thoại GẦN NHẤT (không id, không picker), vd "--continue"
  isolationEnv: string[];     // các env var cần cô lập, vd ["CLAUDE_CONFIG_DIR"]
  authMethods: AuthMethod[];  // các cách liên kết provider này hỗ trợ
  apiKeyEnv?: string;         // env chứa API key, vd "ANTHROPIC_API_KEY"
  baseUrlEnv?: string;        // env chứa base URL (proxy/gateway), vd "ANTHROPIC_BASE_URL"
  supportsSkills: boolean;
  supportsMcp: boolean;
  hasAccounts: boolean;       // false cho local (Ollama) — không có account/limit
}

/** Một tài khoản AI trong pool (để hot-switch né limit). */
export interface AiAccount {
  id: string;
  providerId: string;
  label: string;              // nhãn user tự đặt, vd "work", "personal"
  authMethod: AuthMethod;
  authRef: string;            // khoá tra secret trong ~/.aiws/secrets.json (= id)
  isDefault?: boolean;        // account mặc định khi chạy provider này
}

/** Credential dịch vụ (GitHub, Supabase...) — luôn theo project. */
export interface Service {
  kind: string;               // "github" | "supabase" | ...
  name: string;
  active: boolean;
  secretRef: string;
}

/** Một terminal trong project — chạy một provider, có tên tự đặt. */
export interface Terminal {
  id: string;
  name: string;               // tự đặt kiểu tiêu đề chat AI
  providerId: string;
  aiAccountId?: string;       // account đang active (để hot-switch)
  sessionId?: string;         // phiên của provider (để resume)
}

/** Một project — đơn vị cô lập. */
export interface Project {
  id: string;
  name: string;
  path: string;
  terminals: Terminal[];
  services: Service[];
}

/** Một biến env trỏ tới nơi tool lưu config (thư mục hoặc file). */
export interface EnvVarSpec {
  var: string;              // tên env var, vd "GH_CONFIG_DIR"
  kind: "dir" | "file";     // trỏ tới thư mục hay file cụ thể
  subpath?: string;         // với kind=file: tên file trong tool dir, vd "config"
}

/** Một công cụ CLI được cô lập theo project qua env redirection (config-driven). */
export interface CliTool {
  id: string;               // "gh" | "git" | "aws" | ...
  isolationEnv: EnvVarSpec[];
  description?: string;
}

/** Phạm vi cài đặt skill/MCP: toàn cục (mọi project) hoặc riêng một project. */
export type ItemScope = "global" | "project";

/** Một skill được cài (đăng ký nguồn + phạm vi). */
export interface SkillInstall {
  name: string;
  scope: ItemScope;
  projectId?: string;   // bắt buộc khi scope = "project"
  source: string;       // đường dẫn tuyệt đối tới thư mục skill
}

/** Một MCP server được cài (đăng ký + phạm vi). */
export interface McpServer {
  name: string;
  scope: ItemScope;
  projectId?: string;   // bắt buộc khi scope = "project"
  transport?: "stdio" | "sse" | "http";
  command: string;      // command (stdio) hoặc URL (http/sse)
  args?: string[];
  env?: Record<string, string>;
}

/** Toàn bộ workspace, lưu ở ~/.aiws/config.json. */
export interface Workspace {
  version: number;
  providers: Provider[];
  aiAccounts: AiAccount[];
  projects: Project[];
  skills: SkillInstall[];
  mcps: McpServer[];
  cliTools: CliTool[]; // ghi đè/thêm tool CLI được cô lập (merge với preset)
  locale?: "vi" | "en"; // ngôn ngữ giao diện (mặc định "vi")
  // Chia sẻ hội thoại giữa CÁC ACCOUNT CÙNG provider trong 1 project (junction thư mục transcript
  // về kho chung/project/provider). Mặc định BẬT (undefined = true). Khác provider vẫn không chia sẻ.
  shareConversations?: boolean;
  // Khi mở AI KHÁC loại trong 1 project đang có hội thoại: xuất hội thoại cũ ra file trung gian
  // `.aiws-handoff.md` (neutral markdown) để AI mới đọc & tiếp nối. Mặc định BẬT.
  carryConversation?: boolean;
  // Project đã gỡ khỏi workspace nhưng GIỮ profile cô lập (hội thoại + đăng nhập). Mở lại folder
  // cùng path → khôi phục NGUYÊN id → nguyên profile dir. Gỡ project KHÔNG bao giờ xoá lịch sử.
  removedProjects?: Project[];
}

/** Version của schema config — tăng khi đổi cấu trúc để migrate về sau. */
export const CONFIG_VERSION = 1;

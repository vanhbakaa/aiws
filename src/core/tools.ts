import { loadWorkspace } from "./storage.js";
import type { CliTool } from "./types.js";

// Preset các CLI tool phổ biến + env config-dir đã-được-tài-liệu-hoá.
// User thêm tool khác bằng cách khai trong config.json (mục "cliTools") — cùng id thì
// config thắng. Đây là phần config-driven, phủ MỌI nền tảng dòng lệnh.
export const PRESET_TOOLS: CliTool[] = [
  { id: "gh", isolationEnv: [{ var: "GH_CONFIG_DIR", kind: "dir" }], description: "GitHub CLI" },
  { id: "git", isolationEnv: [{ var: "GIT_CONFIG_GLOBAL", kind: "file", subpath: ".gitconfig" }], description: "Git (global config)" },
  {
    id: "aws",
    isolationEnv: [
      { var: "AWS_CONFIG_FILE", kind: "file", subpath: "config" },
      { var: "AWS_SHARED_CREDENTIALS_FILE", kind: "file", subpath: "credentials" },
    ],
    description: "AWS CLI",
  },
  { id: "gcloud", isolationEnv: [{ var: "CLOUDSDK_CONFIG", kind: "dir" }], description: "Google Cloud CLI" },
  { id: "docker", isolationEnv: [{ var: "DOCKER_CONFIG", kind: "dir" }], description: "Docker CLI" },
  { id: "kubectl", isolationEnv: [{ var: "KUBECONFIG", kind: "file", subpath: "config" }], description: "Kubernetes CLI" },
  { id: "npm", isolationEnv: [{ var: "NPM_CONFIG_USERCONFIG", kind: "file", subpath: ".npmrc" }], description: "npm" },
];

/** Danh sách CLI tool = preset built-in, ghi đè/thêm bởi config.cliTools (theo id). */
export function getCliTools(): CliTool[] {
  const fromConfig = loadWorkspace().cliTools;
  const byId = new Map<string, CliTool>();
  for (const t of PRESET_TOOLS) byId.set(t.id, t);
  for (const t of fromConfig) byId.set(t.id, t); // config thắng
  return [...byId.values()];
}

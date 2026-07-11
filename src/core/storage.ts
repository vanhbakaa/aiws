import fs from "node:fs";
import { aiwsHome, configPath } from "./paths.js";
import { CONFIG_VERSION, type Workspace } from "./types.js";

export function defaultWorkspace(): Workspace {
  return {
    version: CONFIG_VERSION,
    providers: [],
    aiAccounts: [],
    projects: [],
    skills: [],
    mcps: [],
    cliTools: [],
  };
}

/** Backfill các mảng thiếu (config từ phiên bản trước không có skills/mcps...). */
function normalize(ws: Workspace): Workspace {
  ws.providers ??= [];
  ws.aiAccounts ??= [];
  ws.projects ??= [];
  ws.skills ??= [];
  ws.mcps ??= [];
  ws.cliTools ??= [];
  return ws;
}

/** Đọc workspace từ config.json; trả về mặc định nếu chưa tồn tại (không tạo file). */
export function loadWorkspace(): Workspace {
  const p = configPath();
  if (!fs.existsSync(p)) return defaultWorkspace();
  // Bỏ BOM (config user tự sửa bằng Notepad trên Windows có thể dính BOM).
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  try {
    return normalize(JSON.parse(raw) as Workspace);
  } catch (e) {
    throw new Error(`Config hỏng (không phải JSON hợp lệ): ${p}\n  ${(e as Error).message}\n  → Sửa lại file, hoặc xoá để aiws tạo mới.`);
  }
}

/** Ghi workspace xuống config.json (tạo ~/.aiws nếu chưa có). */
export function saveWorkspace(ws: Workspace): void {
  fs.mkdirSync(aiwsHome(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(ws, null, 2) + "\n", "utf8");
}

/** Đảm bảo config tồn tại: tạo file mặc định nếu thiếu, rồi trả về workspace. */
export function ensureWorkspace(): Workspace {
  if (!fs.existsSync(configPath())) {
    const ws = defaultWorkspace();
    saveWorkspace(ws);
    return ws;
  }
  return loadWorkspace();
}

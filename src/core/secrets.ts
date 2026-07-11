import fs from "node:fs";
import path from "node:path";
import { aiwsHome } from "./paths.js";

// Secret của account lưu riêng ~/.aiws/secrets.json (tách khỏi config.json để dễ siết
// quyền file ở Phase 7 và không lộ khi user sửa config). Máy cá nhân, không mã hoá —
// đúng threat model đã chốt: chỉ cần cô lập, không cần confidentiality.
export interface AccountSecret {
  apiKey?: string;
  baseUrl?: string;
  env?: Record<string, string>; // env tuỳ chỉnh cho cloud/local/custom
}

type SecretStore = Record<string, AccountSecret>;

function secretsPath(): string {
  return path.join(aiwsHome(), "secrets.json");
}

function loadStore(): SecretStore {
  const p = secretsPath();
  if (!fs.existsSync(p)) return {};
  let raw = fs.readFileSync(p, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  try {
    return JSON.parse(raw) as SecretStore;
  } catch (e) {
    throw new Error(`secrets.json hỏng (không phải JSON hợp lệ): ${p}\n  ${(e as Error).message}`);
  }
}

function saveStore(store: SecretStore): void {
  fs.mkdirSync(aiwsHome(), { recursive: true });
  fs.writeFileSync(secretsPath(), JSON.stringify(store, null, 2) + "\n", "utf8");
}

export function getSecret(id: string): AccountSecret | undefined {
  return loadStore()[id];
}

export function setSecret(id: string, secret: AccountSecret): void {
  const store = loadStore();
  store[id] = secret;
  saveStore(store);
}

export function deleteSecret(id: string): void {
  const store = loadStore();
  if (id in store) {
    delete store[id];
    saveStore(store);
  }
}

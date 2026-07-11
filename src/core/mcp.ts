import { loadWorkspace, saveWorkspace } from "./storage.js";
import { getProjectByName } from "./projects.js";
import type { ItemScope, McpServer } from "./types.js";

export interface AddMcpInput {
  name: string;
  command: string; // command (stdio) hoặc URL (http/sse)
  args?: string[];
  env?: Record<string, string>;
  transport?: "stdio" | "sse" | "http";
  scope: ItemScope;
  projectName?: string;
}

function resolveProjectId(scope: ItemScope, projectName?: string): string | undefined {
  if (scope !== "project") return undefined;
  if (!projectName) throw new Error(`Scope "project" cần --project <name>`);
  const p = getProjectByName(projectName);
  if (!p) throw new Error(`Không tìm thấy project "${projectName}"`);
  return p.id;
}

export function addMcp(input: AddMcpInput): McpServer {
  const ws = loadWorkspace();
  const projectId = resolveProjectId(input.scope, input.projectName);
  if (ws.mcps.some((m) => m.name === input.name && m.scope === input.scope && m.projectId === projectId)) {
    throw new Error(`MCP "${input.name}" đã cài ở scope này`);
  }
  const server: McpServer = {
    name: input.name,
    scope: input.scope,
    projectId,
    transport: input.transport,
    command: input.command,
    args: input.args?.length ? input.args : undefined,
    env: input.env && Object.keys(input.env).length ? input.env : undefined,
  };
  ws.mcps.push(server);
  saveWorkspace(ws);
  return server;
}

export function listMcps(projectName?: string): McpServer[] {
  const ws = loadWorkspace();
  if (!projectName) return ws.mcps;
  const id = getProjectByName(projectName)?.id;
  return ws.mcps.filter((m) => m.scope === "global" || m.projectId === id);
}

export function removeMcp(name: string, scope: ItemScope, projectName?: string): boolean {
  const ws = loadWorkspace();
  const projectId = resolveProjectId(scope, projectName);
  const before = ws.mcps.length;
  ws.mcps = ws.mcps.filter((m) => !(m.name === name && m.scope === scope && m.projectId === projectId));
  const removed = ws.mcps.length < before;
  if (removed) saveWorkspace(ws);
  return removed;
}

/** Tập MCP hiệu lực khi launch một project = global + MCP của project đó. */
export function effectiveMcps(projectId: string): McpServer[] {
  return loadWorkspace().mcps.filter((m) => m.scope === "global" || m.projectId === projectId);
}

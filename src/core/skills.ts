import path from "node:path";
import { loadWorkspace, saveWorkspace } from "./storage.js";
import { getProjectByName } from "./projects.js";
import type { ItemScope, SkillInstall } from "./types.js";

export interface AddSkillInput {
  name: string;
  source: string;
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

export function addSkill(input: AddSkillInput): SkillInstall {
  const ws = loadWorkspace();
  const projectId = resolveProjectId(input.scope, input.projectName);
  if (ws.skills.some((s) => s.name === input.name && s.scope === input.scope && s.projectId === projectId)) {
    throw new Error(`Skill "${input.name}" đã cài ở scope này`);
  }
  const skill: SkillInstall = {
    name: input.name,
    scope: input.scope,
    projectId,
    source: path.resolve(input.source),
  };
  ws.skills.push(skill);
  saveWorkspace(ws);
  return skill;
}

/** Liệt kê: nếu có projectName → skill hiệu lực cho project (global + của project đó). */
export function listSkills(projectName?: string): SkillInstall[] {
  const ws = loadWorkspace();
  if (!projectName) return ws.skills;
  const id = getProjectByName(projectName)?.id;
  return ws.skills.filter((s) => s.scope === "global" || s.projectId === id);
}

export function removeSkill(name: string, scope: ItemScope, projectName?: string): boolean {
  const ws = loadWorkspace();
  const projectId = resolveProjectId(scope, projectName);
  const before = ws.skills.length;
  ws.skills = ws.skills.filter((s) => !(s.name === name && s.scope === scope && s.projectId === projectId));
  const removed = ws.skills.length < before;
  if (removed) saveWorkspace(ws);
  return removed;
}

/** Tập skill hiệu lực khi launch một project = global + skill của project đó. */
export function effectiveSkills(projectId: string): SkillInstall[] {
  return loadWorkspace().skills.filter((s) => s.scope === "global" || s.projectId === projectId);
}

import { type BrowserWindow, dialog } from "electron";
import { openProject } from "../../core/projects";

// Native "Open Folder as project" — the IDE affordance. Reuses core openProject (idempotent by path).
export async function openFolderDialog(win: BrowserWindow): Promise<{ projectName: string } | null> {
  const res = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  if (res.canceled || res.filePaths.length === 0) return null;
  try {
    return { projectName: openProject(res.filePaths[0]).name };
  } catch {
    return null;
  }
}

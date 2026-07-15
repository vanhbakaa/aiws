import { clipboard, contextBridge, ipcRenderer, webUtils } from "electron";
import type { AiwsApi, PanelSnapshot, ProjectTree, WorkspaceSnapshot } from "../shared/contract";

// Thin typed bridge. The renderer only ever sees window.aiws — never Node, never raw ipcRenderer.
// Channel names are fixed here (whitelist); nothing dynamic comes from the renderer.
const api: AiwsApi = {
  getInit: () => ipcRenderer.invoke("workspace:getInit"),
  getState: () => ipcRenderer.invoke("workspace:getState"),
  getTree: () => ipcRenderer.invoke("workspace:getTree"),
  getPanel: () => ipcRenderer.invoke("panel:get"),
  openTab: (req) => ipcRenderer.invoke("tab:open", req),
  closeTab: (tabId) => ipcRenderer.invoke("tab:close", tabId),
  setActiveTab: (index) => ipcRenderer.invoke("tab:setActive", index),
  listProviders: () => ipcRenderer.invoke("providers:list"),
  listAllAccounts: () => ipcRenderer.invoke("accounts:listAll"),
  accountInfo: (accountId) => ipcRenderer.invoke("accounts:info", accountId),
  createAccount: (providerId, label) => ipcRenderer.invoke("accounts:create", { providerId, label }),
  removeAccount: (accountId) => ipcRenderer.invoke("accounts:remove", accountId),
  renameAccount: (accountId, label) => ipcRenderer.invoke("accounts:rename", { accountId, label }),
  setDefaultAccount: (accountId) => ipcRenderer.invoke("accounts:setDefault", accountId),
  switchAccount: (tabId, toAccountId) => ipcRenderer.invoke("account:switch", { tabId, toAccountId }),
  openFolderDialog: () => ipcRenderer.invoke("project:openFolderDialog"),
  removeProject: (name) => ipcRenderer.invoke("project:remove", name),
  reopenProject: (path) => ipcRenderer.invoke("project:reopen", path),
  setLocale: (locale) => ipcRenderer.invoke("locale:set", locale),

  ptyWrite: (tabId, data) => ipcRenderer.send("pty:write", { tabId, data }),
  ptyResize: (tabId, cols, rows) => ipcRenderer.send("pty:resize", { tabId, cols, rows }),

  clipboardRead: () => clipboard.readText(),
  clipboardWrite: (text) => clipboard.writeText(text),
  // Empty for anything that isn't a real file on disk (e.g. dragged out of a web page).
  filePathFor: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },

  onPtyData: (cb) => {
    const h = (_e: unknown, p: { tabId: string; chunk: string }) => cb(p.tabId, p.chunk);
    ipcRenderer.on("pty:data", h);
    return () => ipcRenderer.removeListener("pty:data", h);
  },
  onPtyExit: (cb) => {
    const h = (_e: unknown, p: { tabId: string; code: number }) => cb(p.tabId, p.code);
    ipcRenderer.on("pty:exit", h);
    return () => ipcRenderer.removeListener("pty:exit", h);
  },
  onTabsChanged: (cb) => {
    const h = (_e: unknown, snap: WorkspaceSnapshot) => cb(snap);
    ipcRenderer.on("tabs:changed", h);
    return () => ipcRenderer.removeListener("tabs:changed", h);
  },
  onProjectTree: (cb) => {
    const h = (_e: unknown, tree: ProjectTree) => cb(tree);
    ipcRenderer.on("project-tree:changed", h);
    return () => ipcRenderer.removeListener("project-tree:changed", h);
  },
  onPanelData: (cb) => {
    const h = (_e: unknown, panel: PanelSnapshot) => cb(panel);
    ipcRenderer.on("panel:data", h);
    return () => ipcRenderer.removeListener("panel:data", h);
  },
  onMenuCommand: (cb) => {
    const h = (_e: unknown, p: { command: string; args?: Record<string, unknown> }) => cb(p.command, p.args);
    ipcRenderer.on("menu:command", h);
    return () => ipcRenderer.removeListener("menu:command", h);
  },
  onStatus: (cb) => {
    const h = (_e: unknown, p: { message: string; kind: "info" | "error" }) => cb(p.message, p.kind);
    ipcRenderer.on("status", h);
    return () => ipcRenderer.removeListener("status", h);
  },
};

contextBridge.exposeInMainWorld("aiws", api);

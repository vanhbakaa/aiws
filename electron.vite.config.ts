import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Resolve paths relative to this config file (robust under ESM — no __dirname).
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// src/core & src/session use NodeNext ".js" import specifiers but are ".ts" on disk. When electron-vite
// bundles the main process from source, map "./foo.js" → "./foo.ts" so those imports resolve.
function resolveJsToTs() {
  return {
    name: "aiws-resolve-js-to-ts",
    enforce: "pre" as const,
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.endsWith(".js")) return null;
      if (!source.startsWith("./") && !source.startsWith("../")) return null;
      const tsPath = path.resolve(path.dirname(importer), source.slice(0, -3) + ".ts");
      return fs.existsSync(tsPath) ? tsPath : null;
    },
  };
}

// electron-vite builds three targets → out/{main,preload,renderer}. Main/preload run in Node
// (Electron main); the renderer is a normal Vite web build. node-pty + @xterm/headless are
// NEVER bundled — they live only in the main process, loaded from node_modules at runtime.
export default defineConfig({
  main: {
    plugins: [resolveJsToTs(), externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: r("src/gui/main/index.ts"),
        external: ["@lydell/node-pty", "@xterm/headless"],
      },
    },
  },
  preload: {
    plugins: [resolveJsToTs(), externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: r("src/gui/preload/index.ts") },
    },
  },
  renderer: {
    root: r("src/gui/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: { input: r("src/gui/renderer/index.html") },
    },
  },
});

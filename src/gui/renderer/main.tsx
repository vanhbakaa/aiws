import { createRoot } from "react-dom/client";
import type { AiwsApi } from "../shared/contract";
import { App } from "./App";
import "./styles.css";
import "@xterm/xterm/css/xterm.css";

declare global {
  interface Window {
    aiws: AiwsApi;
  }
}

// No StrictMode: its dev double-mount would double-subscribe the PTY streams and double-open the
// bootstrap tab. The renderer owns real side effects (terminals, IPC), so we mount once.
createRoot(document.getElementById("root")!).render(<App />);

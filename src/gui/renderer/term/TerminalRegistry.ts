import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { AiwsApi } from "../../shared/contract";

// Tokyo Night terminal palettes (dark default + light day) for the embedded xterm.
const DARK = {
  background: "#1a1b26",
  foreground: "#c0caf5",
  cursor: "#c0caf5",
  cursorAccent: "#1a1b26",
  selectionBackground: "rgba(122,162,247,0.30)",
  black: "#15161e", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68",
  blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#a9b1d6",
  brightBlack: "#414868", brightRed: "#f7768e", brightGreen: "#9ece6a", brightYellow: "#e0af68",
  brightBlue: "#7aa2f7", brightMagenta: "#bb9af7", brightCyan: "#7dcfff", brightWhite: "#c0caf5",
};
const LIGHT = {
  background: "#e6e7ee",
  foreground: "#343b58",
  cursor: "#343b58",
  cursorAccent: "#e6e7ee",
  selectionBackground: "rgba(61,89,161,0.22)",
  black: "#0f0f14", red: "#c64343", green: "#4f6f2f", yellow: "#8a6420",
  blue: "#3d59a1", magenta: "#6f42c1", cyan: "#007197", white: "#6a7196",
  brightBlack: "#9aa0c2", brightRed: "#c64343", brightGreen: "#4f6f2f", brightYellow: "#8a6420",
  brightBlue: "#3d59a1", brightMagenta: "#6f42c1", brightCyan: "#007197", brightWhite: "#343b58",
};
const currentTheme = () =>
  window.matchMedia("(prefers-color-scheme: light)").matches ? LIGHT : DARK;

interface Entry {
  term: Terminal;
  fit: FitAddon;
  layer: HTMLDivElement;
}

// A bare Windows path breaks into several tokens the moment it contains a space.
const quotePath = (p: string) => (/\s/.test(p) ? `"${p}"` : p);

/**
 * One xterm per tab, all kept mounted (background tabs keep streaming); only the active layer is
 * shown. Lives outside React and is driven imperatively. A pending-data buffer covers the small
 * race where the first pty:data can arrive before the opened tab is adopted.
 */
export class TerminalRegistry {
  private host: HTMLElement | null = null;
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, string[]>();
  // Prepared-but-not-yet-adopted terminals, keyed by an id — a single slot loses (leaks + mis-binds)
  // one terminal when two tab opens overlap (both call prepare() before either adopt() resolves).
  private readonly prepared = new Map<number, Entry>();
  private prepCounter = 0;
  private activeId: string | null = null;

  constructor(private readonly api: AiwsApi) {
    window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => this.applyTheme());
  }

  private applyTheme(): void {
    const t = currentTheme();
    for (const e of this.entries.values()) e.term.options.theme = t;
    for (const e of this.prepared.values()) e.term.options.theme = t;
  }

  attachHost(el: HTMLElement): void {
    this.host = el;
    for (const e of this.entries.values()) el.appendChild(e.layer);
    for (const e of this.prepared.values()) el.appendChild(e.layer);
  }

  private makeEntry(): Entry {
    const layer = document.createElement("div");
    layer.className = "term-layer hidden";
    this.host?.appendChild(layer);
    const term = new Terminal({
      fontFamily: 'ui-monospace, "Cascadia Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme: currentTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(layer);
    // Clipboard: xterm wires none. Ctrl+C stays as interrupt; Ctrl+Shift+C copies the selection,
    // Ctrl+Shift+V pastes. Right click copies when there is a selection, otherwise pastes.
    // Every path below must end in EXACTLY one term.paste(), which is why each one both
    // preventDefaults (Ctrl+Shift+V is also Chromium's own "paste as plain text", and that native
    // paste event would reach xterm's built-in paste listener for a second insert) and, for the
    // mouse, stops the event before xterm's rightClickHandler runs — see wireMouse.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !(e.ctrlKey || e.metaKey) || !e.shiftKey) return true;
      const k = e.key.toLowerCase();
      if (k === "c" && term.hasSelection()) {
        e.preventDefault();
        this.copySelection(term);
        return false;
      }
      if (k === "v") {
        e.preventDefault();
        this.pasteClipboard(term);
        return false;
      }
      return true;
    });
    this.wireMouse(term, layer);
    try {
      fit.fit();
    } catch {
      /* host not laid out yet */
    }
    return { term, fit, layer };
  }

  /** False when nothing is selected, so callers can fall through to paste. */
  private copySelection(term: Terminal): boolean {
    if (!term.hasSelection()) return false;
    const sel = term.getSelection();
    if (!sel) return false;
    this.api.clipboardWrite(sel);
    return true;
  }

  private pasteClipboard(term: Terminal): void {
    const text = this.api.clipboardRead();
    if (text) term.paste(text);
  }

  /** Right click (copy the selection, else paste) and file drop, both in the capture phase.
   *
   *  Capture matters: xterm's own contextmenu handler parks its hidden helper textarea under the
   *  cursor at 20x20 / z-index 1000 and only puts it back on the next render. It exists to make the
   *  browser's native context menu work, which we don't use — and while it sits there it swallows
   *  the drag that starts the next selection, so copying appeared to need several attempts.
   *  Stopping the event here means it never runs. */
  private wireMouse(term: Terminal, layer: HTMLDivElement): void {
    layer.addEventListener(
      "contextmenu",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.copySelection(term)) term.clearSelection();
        else this.pasteClipboard(term);
      },
      true,
    );
    // Funnel any native paste event (OS-level, or a future menu item) through the same single
    // paste instead of letting xterm's two paste listeners handle it as well.
    layer.addEventListener(
      "paste",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const text = e.clipboardData?.getData("text/plain");
        if (text) term.paste(text);
      },
      true,
    );

    // Drag & drop: hand the CLI the dropped file's path — that is how you point Claude/Codex at an
    // image. Without a drop listener the window swallows it (main preventDefaults will-navigate),
    // which is why dropping an image did nothing at all.
    layer.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      layer.classList.add("drop-on");
    });
    layer.addEventListener("dragleave", () => layer.classList.remove("drop-on"));
    layer.addEventListener("drop", (e) => {
      e.preventDefault();
      layer.classList.remove("drop-on");
      const files = [...(e.dataTransfer?.files ?? [])].map((f) => this.api.filePathFor(f)).filter(Boolean);
      const text = files.length
        ? files.map(quotePath).join(" ") + " " // trailing space: keep typing after the path
        : (e.dataTransfer?.getData("text/plain") ?? "");
      if (text) term.paste(text);
      term.focus();
    });
  }

  /** Create + measure a terminal before aiws.openTab (dims must be known at spawn time). Returns a
   *  prepId so overlapping opens each adopt/discard their OWN prepared terminal. */
  prepare(): { cols: number; rows: number; prepId: number } {
    const e = this.makeEntry();
    const prepId = ++this.prepCounter;
    this.prepared.set(prepId, e);
    return { cols: e.term.cols, rows: e.term.rows, prepId };
  }

  discardPrepared(prepId: number): void {
    const e = this.prepared.get(prepId);
    if (!e) return;
    e.term.dispose();
    e.layer.remove();
    this.prepared.delete(prepId);
  }

  /** Bind the prepared terminal to the opened tabId, wire input, and flush any early output. */
  adopt(tabId: string, prepId: number): void {
    const e = this.prepared.get(prepId) ?? this.makeEntry();
    this.prepared.delete(prepId);
    this.entries.set(tabId, e);
    e.term.onData((d) => this.api.ptyWrite(tabId, d));
    const early = this.pending.get(tabId);
    if (early) {
      for (const c of early) e.term.write(c);
      this.pending.delete(tabId);
    }
    // Race guard: setActive may have fired (from tabs:changed) BEFORE this adopt ran, so its loop
    // missed this entry and left the layer hidden → black terminal. Re-apply the active state now.
    if (this.activeId !== null) this.setActive(this.activeId);
  }

  write(tabId: string, chunk: string): void {
    const e = this.entries.get(tabId);
    if (e) {
      e.term.write(chunk);
    } else {
      const arr = this.pending.get(tabId) ?? [];
      arr.push(chunk);
      this.pending.set(tabId, arr);
    }
  }

  exit(tabId: string): void {
    this.entries.get(tabId)?.term.write("\r\n\x1b[2m[đã kết thúc]\x1b[0m\r\n");
  }

  setActive(tabId: string | null): void {
    this.activeId = tabId;
    for (const [id, e] of this.entries) {
      const on = id === tabId;
      // toggle, not className=: a rewrite here would drop the transient drop-on highlight
      e.layer.classList.toggle("shown", on);
      e.layer.classList.toggle("hidden", !on);
      if (on) this.reveal(id, e);
    }
  }

  /** Fit + force a repaint next frame (xterm opened on a hidden layer won't repaint on show alone). */
  private reveal(id: string, e: Entry): void {
    requestAnimationFrame(() => {
      if (!this.entries.has(id)) return; // tab closed before the frame ran
      try {
        e.fit.fit();
      } catch {
        return;
      }
      if (e.term.rows > 0) e.term.refresh(0, e.term.rows - 1);
      e.term.focus();
      this.api.ptyResize(id, e.term.cols, e.term.rows);
    });
  }

  /** Drop entries for tabs no longer in the snapshot. */
  sync(tabIds: string[]): void {
    for (const id of [...this.entries.keys()]) {
      if (!tabIds.includes(id)) {
        const e = this.entries.get(id)!;
        e.term.dispose();
        e.layer.remove();
        this.entries.delete(id);
      }
    }
  }

  private fitRaf = 0;
  /** Coalesced to one fit+resize per frame — splitter drag fires this per mousemove (≤1000Hz). */
  fitActive(): void {
    if (this.fitRaf) return;
    this.fitRaf = requestAnimationFrame(() => {
      this.fitRaf = 0;
      if (!this.activeId) return;
      const e = this.entries.get(this.activeId);
      if (!e) return;
      try {
        e.fit.fit();
      } catch {
        return;
      }
      this.api.ptyResize(this.activeId, e.term.cols, e.term.rows);
    });
  }
}

// App identity for aiws. Single place the CLI/TUI read the name and version from.

/** Human-readable product name (banner, TUI title, help header). */
export const APP_DISPLAY_NAME = "AI Workspace";

/** One-line description shown in `--help`. */
export const APP_TAGLINE = "Terminal workspace đa tài khoản, cô lập theo từng project";

/** Command typed in the terminal. Must match the "bin" key in package.json. */
export const APP_COMMAND = "aiws";

/** Version — keep in sync with package.json. */
export const APP_VERSION = "0.1.3";

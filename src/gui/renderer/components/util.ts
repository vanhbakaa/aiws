// Provider → dot color (matches the artifact: shell=amber, codex=green, else teal).
export function dotColor(providerId: string): string {
  if (providerId === "shell") return "var(--amber)";
  if (providerId === "codex") return "var(--green)";
  return "var(--teal)";
}

export const PROVIDERS = ["shell", "claude", "codex", "gemini", "opencode", "ollama"];

export function cycleProvider(cur: string): string {
  const i = PROVIDERS.indexOf(cur);
  return PROVIDERS[(i + 1) % PROVIDERS.length];
}

// 116000 → "116k", 950 → "950".
export function kfmt(n: number): string {
  return n >= 1000 ? Math.round(n / 1000) + "k" : String(n);
}

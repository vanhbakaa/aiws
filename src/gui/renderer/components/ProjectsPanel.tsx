import { useState } from "react";
import type { ProjectTree } from "../../shared/contract";
import { dotColor } from "./util";
import { useTr } from "../i18n";

export function ProjectsPanel({
  tree,
  activeProjectId,
  onOpenProject,
  onFocusTab,
  onRemoveProject,
  onCloseTab,
  onResumeSession,
}: {
  tree: ProjectTree;
  activeProjectId?: string;
  onOpenProject: (name: string) => void;
  onFocusTab: (tabId: string) => void;
  onRemoveProject: (name: string) => void;
  onCloseTab: (tabId: string) => void;
  onResumeSession: (projectName: string, s: ProjectTree[number]["sessions"][number]) => void;
}) {
  const t = useTr();
  // Projects are expanded by default; clicking a row collapses/expands it (like a file tree).
  // Opening a NEW terminal is the explicit ＋ button, not a click on the row.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="col left">
      <div className="collabel">{t("projects")}</div>
      <div className="scroll">
        <div className="proj">
          {tree.length === 0 && (
            <div className="muted" style={{ padding: "4px 8px" }}>
              {t("noProjects")}
            </div>
          )}
          {tree.map((p) => {
            // Past conversations that aren't already open as a live tab → offer to resume them.
            const resumable = p.sessions.filter((s) => !s.live);
            const hasKids = p.terminals.length > 0 || resumable.length > 0;
            const expanded = hasKids && !collapsed.has(p.id);
            return (
              <div key={p.id}>
                <div
                  className={"prow" + (p.id === activeProjectId ? " active" : "")}
                  onClick={() => toggle(p.id)}
                  title={p.path}
                >
                  <span className="tw">{hasKids ? (expanded ? "▾" : "▸") : "·"}</span>
                  <span className="pn">{p.name}</span>
                  <span className="badge">
                    {p.running > 0 ? (
                      <>
                        <span className="dot" style={{ background: "var(--green)" }} />
                        {p.running}
                      </>
                    ) : (
                      0
                    )}
                  </span>
                  <span
                    className="pnew"
                    title={t("newTab")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenProject(p.name);
                    }}
                  >
                    ＋
                  </span>
                  <span
                    className="premove"
                    title={t("removeProject")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveProject(p.name);
                    }}
                  >
                    ×
                  </span>
                </div>
                {expanded && (
                  <div className="kids">
                    {p.terminals.map((tm) => (
                      <div
                        key={tm.terminalId}
                        className={"kid" + (tm.running ? " on" : "")}
                        onClick={() => tm.tabId && onFocusTab(tm.tabId)}
                      >
                        <span className="dot" style={{ background: dotColor(tm.providerId) }} />
                        <span className="prov">{tm.providerName}</span>
                        {tm.accountLabel ? " · " + tm.accountLabel : ""}
                        {tm.tabId && (
                          <span
                            className="kidx"
                            title={t("closeTab")}
                            onClick={(e) => {
                              e.stopPropagation();
                              onCloseTab(tm.tabId!);
                            }}
                          >
                            ×
                          </span>
                        )}
                      </div>
                    ))}
                    {/* Past conversations on disk (survive app restart) — click to reopen the exact session. */}
                    {resumable.map((s) => (
                      <div
                        key={s.sessionId}
                        className="kid resume"
                        title={t("resumeTitle") + (s.preview ? " — " + s.preview : "")}
                        onClick={() => onResumeSession(p.name, s)}
                      >
                        <span className="dot" style={{ background: dotColor(s.providerId), opacity: 0.5 }} />
                        <span className="rprev">{s.preview || s.sessionId.slice(0, 8)}</span>
                        {s.accountLabel ? <span className="racct"> · {s.accountLabel}</span> : null}
                        <span className="kidx resumeic" title={t("resumeTitle")}>
                          ↻
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="hint">
        <b>Ctrl+N</b> {t("projectsHint")} · <b>Ctrl+O</b> {t("openFolder")}
      </div>
    </div>
  );
}

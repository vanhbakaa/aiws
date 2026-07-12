import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelSnapshot, ProjectTree, ProviderInfo, TabSnapshot, WorkspaceSnapshot } from "../shared/contract";
import { TerminalRegistry } from "./term/TerminalRegistry";
import { TabBar } from "./components/TabBar";
import { ProjectsPanel } from "./components/ProjectsPanel";
import { TerminalPane } from "./components/TerminalPane";
import { ContextPanel } from "./components/ContextPanel";
import { KeyBar } from "./components/KeyBar";
import { AccountsPanel } from "./components/AccountsPanel";
import { AddAccountDialog } from "./components/AddAccountDialog";
import { LocaleContext, tr, type Locale } from "./i18n";

const aiws = window.aiws;
const EMPTY: WorkspaceSnapshot = { tabs: [], active: 0, sessionsVersion: 0, locale: "vi" };
const clampW = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function App() {
  const [snap, setSnap] = useState<WorkspaceSnapshot>(EMPTY);
  const [tree, setTree] = useState<ProjectTree>([]);
  const [panel, setPanel] = useState<PanelSnapshot | null>(null);
  const [provider, setProvider] = useState("shell");
  const [locale, setLoc] = useState<Locale>("vi");
  const [showCtx, setShowCtx] = useState(true);
  const [modal, setModal] = useState<"accounts" | "add-account" | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [addProvider, setAddProvider] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null);
  const [leftW, setLeftW] = useState(() => clampW(Number(localStorage.getItem("aiws.leftW")) || 202, 160, 420));
  const [rightW, setRightW] = useState(() => clampW(Number(localStorage.getItem("aiws.rightW")) || 258, 190, 520));

  const toggleLang = useCallback(() => {
    setLoc((l) => {
      const next: Locale = l === "vi" ? "en" : "vi";
      void aiws.setLocale(next);
      return next;
    });
  }, []);

  const registryRef = useRef<TerminalRegistry | null>(null);
  if (!registryRef.current) registryRef.current = new TerminalRegistry(aiws);
  const reg = registryRef.current;
  const hostRef = useRef<HTMLDivElement>(null);
  const booted = useRef(false);
  const initProjRef = useRef<string | null>(null);
  const providersRef = useRef<ProviderInfo[]>(providers);
  providersRef.current = providers;
  const pendingProjRef = useRef<string | null>(null); // project chờ mở terminal sau khi thêm+login tk

  // side-panel widths (persisted) + splitter drag state
  const leftWRef = useRef(leftW);
  leftWRef.current = leftW;
  const rightWRef = useRef(rightW);
  rightWRef.current = rightW;
  const dragRef = useRef<{ side: "left" | "right"; startX: number; startW: number } | null>(null);
  const startDrag = (side: "left" | "right") => (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { side, startX: e.clientX, startW: side === "left" ? leftWRef.current : rightWRef.current };
    document.body.classList.add("col-resizing");
  };

  const active: TabSnapshot | undefined = snap.tabs[snap.active];

  // Mirrors so the once-subscribed menu:command handler always sees current state.
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const providerRef = useRef(provider);
  providerRef.current = provider;
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const openProjectTab = useCallback(
    async (projectName: string, providerId: string, account?: string) => {
      // Provider cần account mà CHƯA có tài khoản nào (và không chỉ định sẵn) → mở hộp thoại thêm +
      // đăng nhập luôn, thay vì mở terminal rồi báo lỗi "chưa có tài khoản".
      if (!account) {
        const prov = providersRef.current.find((p) => p.id === providerId);
        if (prov?.hasAccounts) {
          const accts = await aiws.listAllAccounts();
          if (!accts.some((a) => a.providerId === providerId)) {
            pendingProjRef.current = projectName;
            setAddProvider(providerId);
            setModal("add-account");
            return;
          }
        }
      }
      const { cols, rows, prepId } = reg.prepare();
      const res = await aiws.openTab({ projectName, providerId, cols, rows, account });
      if (!res.ok) {
        reg.discardPrepared(prepId);
        // Localize the common "not installed" case in the renderer (bridge errors are Vietnamese).
        const info = (await aiws.listProviders()).find((x) => x.id === providerId);
        const loc = localeRef.current;
        const msg =
          info && !info.installed
            ? info.installHint
              ? tr(loc, "notInstalled", { p: providerId, hint: info.installHint })
              : tr(loc, "notInstalledNoHint", { p: providerId })
            : res.error;
        setToast({ msg, kind: "error" });
        window.setTimeout(() => setToast(null), 6000);
        return;
      }
      reg.adopt(res.value.id, prepId);
    },
    [reg],
  );

  const openFolder = useCallback(async () => {
    const r = await aiws.openFolderDialog();
    if (r.ok) await openProjectTab(r.value.projectName, providerRef.current);
  }, [openProjectTab]);

  // Open the "add account" dialog. Default provider = active AI tab's provider, else the tab-bar pick.
  const openAddAccount = useCallback((providerId?: string) => {
    const act = snapRef.current.tabs[snapRef.current.active];
    const def = providerId ?? (act && act.providerId !== "shell" ? act.providerId : providerRef.current);
    pendingProjRef.current = null; // thêm tk thủ công → login vào project hiện tại, không dùng pending cũ
    setAddProvider(def && def !== "shell" ? def : undefined);
    setModal("add-account");
  }, []);

  // Create an account slot, then open a login terminal for it in some project (active → tree → init).
  const createAndLogin = useCallback(
    async (providerId: string, label: string) => {
      setModal(null);
      const res = await aiws.createAccount(providerId, label);
      if (!res.ok) {
        setToast({ msg: res.error, kind: "error" });
        window.setTimeout(() => setToast(null), 5000);
        return;
      }
      const projName =
        pendingProjRef.current ??
        snapRef.current.tabs[snapRef.current.active]?.projectName ??
        treeRef.current[0]?.name ??
        initProjRef.current;
      pendingProjRef.current = null;
      if (projName) await openProjectTab(projName, providerId, res.value.label);
    },
    [openProjectTab],
  );

  // wiring: events + initial hydrate + bootstrap the initial project's tab
  useEffect(() => {
    if (hostRef.current) reg.attachHost(hostRef.current);
    const offData = aiws.onPtyData((tabId, chunk) => reg.write(tabId, chunk));
    const offExit = aiws.onPtyExit((tabId) => reg.exit(tabId));
    const offTabs = aiws.onTabsChanged(setSnap);
    const offTree = aiws.onProjectTree(setTree);
    const offPanel = aiws.onPanelData(setPanel);
    const offMenu = aiws.onMenuCommand((command, args) => {
      const s = snapRef.current;
      const act = s.tabs[s.active];
      switch (command) {
        case "new-tab": {
          const name = act?.projectName ?? treeRef.current[0]?.name;
          if (name) openProjectTab(name, providerRef.current);
          break;
        }
        case "close-tab":
          if (act) aiws.closeTab(act.id);
          break;
        case "toggle-context":
          setShowCtx((v) => !v);
          break;
        case "switch-tab": {
          const i = Number(args?.index);
          if (Number.isInteger(i) && i >= 0 && i < s.tabs.length) aiws.setActiveTab(i);
          break;
        }
        case "accounts":
          setModal("accounts"); // global panel — works even with no project open
          break;
        case "add-account":
          openAddAccount();
          break;
        case "open-folder":
        case "new-project":
          void openFolder();
          break;
        case "open-project": {
          const name = typeof args?.projectName === "string" ? args.projectName : undefined;
          if (name) void openProjectTab(name, providerRef.current);
          break;
        }
        case "reopen-project": {
          // File ▸ Open Recent → restore the archived project (same id → history intact) + open a tab
          const p = typeof args?.path === "string" ? args.path : undefined;
          if (p)
            void aiws.reopenProject(p).then((r) => {
              if (r.ok) void openProjectTab(r.value.projectName, providerRef.current);
            });
          break;
        }
        case "toggle-lang":
          toggleLang();
          break;
        // focus-projects → later phase
      }
    });
    const offStatus = aiws.onStatus((message, kind) => {
      setToast({ msg: message, kind });
      window.setTimeout(() => setToast(null), 4000);
    });

    (async () => {
      const [s, t, pnl, init, provs] = await Promise.all([
        aiws.getState(),
        aiws.getTree(),
        aiws.getPanel(),
        aiws.getInit(),
        aiws.listProviders(),
      ]);
      setSnap(s);
      setTree(t);
      setPanel(pnl);
      setLoc(s.locale as Locale);
      setProvider(init.providerId);
      setProviders(provs);
      providersRef.current = provs; // để openProjectTab thấy ngay ở boot (state chưa kịp re-render)
      initProjRef.current = init.projectName;
      if (s.tabs.length === 0 && init.projectName && !booted.current) {
        booted.current = true;
        // openProjectTab tự lo: provider chưa có tài khoản → mở hộp thoại thêm+login; đã có → mở tab.
        await openProjectTab(init.projectName, init.providerId);
      }
    })();

    const onResize = () => reg.fitActive();
    window.addEventListener("resize", onResize);
    return () => {
      offData();
      offExit();
      offTabs();
      offTree();
      offPanel();
      offMenu();
      offStatus();
      window.removeEventListener("resize", onResize);
    };
  }, [reg, openProjectTab, openFolder, toggleLang, openAddAccount]);

  // vertical splitter drag: window-level listeners so tracking survives over the terminal canvas
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const delta = e.clientX - d.startX;
      if (d.side === "left") setLeftW(clampW(d.startW + delta, 160, 420));
      else setRightW(clampW(d.startW - delta, 190, 520));
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.classList.remove("col-resizing");
      localStorage.setItem("aiws.leftW", String(leftWRef.current));
      localStorage.setItem("aiws.rightW", String(rightWRef.current));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  // reconcile the registry with the snapshot: drop closed tabs, show the active one
  useEffect(() => {
    reg.sync(snap.tabs.map((t) => t.id));
    reg.setActive(snap.tabs[snap.active]?.id ?? null);
  }, [reg, snap]);

  // refit the active terminal when the layout shifts (panel toggle or splitter drag)
  useEffect(() => {
    reg.fitActive();
  }, [reg, showCtx, leftW, rightW]);

  return (
    <LocaleContext.Provider value={locale}>
      <div className="app">
        <TabBar
          tabs={snap.tabs}
          active={snap.active}
          provider={provider}
          locale={locale}
          onSelect={(i) => aiws.setActiveTab(i)}
          onClose={(id) => aiws.closeTab(id)}
          onNew={() => {
            const name = active?.projectName ?? tree[0]?.name;
            if (name) openProjectTab(name, provider);
          }}
          onSetProvider={(id) => setProvider(id)}
          onToggleLang={toggleLang}
        />
      <div
        className={"body3" + (showCtx ? "" : " no-right")}
        style={{ gridTemplateColumns: showCtx ? `${leftW}px 6px minmax(0,1fr) 6px ${rightW}px` : `${leftW}px 6px minmax(0,1fr)` }}
      >
        <ProjectsPanel
          tree={tree}
          activeProjectId={active?.projectId}
          onOpenProject={(name) => openProjectTab(name, provider)}
          onFocusTab={(tabId) => {
            const i = snap.tabs.findIndex((t) => t.id === tabId);
            if (i >= 0) aiws.setActiveTab(i);
          }}
          onRemoveProject={(name) => void aiws.removeProject(name)}
          onCloseTab={(tabId) => void aiws.closeTab(tabId)}
        />
        <div className="gutter" onMouseDown={startDrag("left")} />
        <TerminalPane ref={hostRef} active={active} hasTabs={snap.tabs.length > 0} onOpenFolder={() => void openFolder()} />
        {showCtx && <div className="gutter" onMouseDown={startDrag("right")} />}
        {showCtx && (
          <ContextPanel
            active={active}
            panel={panel}
            onOpenAccounts={() => setModal("accounts")}
            onAddAccount={() => openAddAccount()}
          />
        )}
      </div>
      <KeyBar />
      {modal === "accounts" && (
        <AccountsPanel activeTab={active} onAdd={(pid) => openAddAccount(pid)} onClose={() => setModal(null)} />
      )}
      {modal === "add-account" && (
        <AddAccountDialog
          providers={providers}
          defaultProvider={addProvider}
          onCreate={(pid, label) => void createAndLogin(pid, label)}
          onClose={() => {
            pendingProjRef.current = null; // huỷ hộp thoại → bỏ project đang chờ login
            setModal(null);
          }}
        />
      )}
      {toast && (
        <div className={"toast " + toast.kind}>
          <span className="toast-msg">{toast.msg}</span>
          <span className="toast-x" title={tr(locale, "close")} onClick={() => setToast(null)}>
            ×
          </span>
        </div>
      )}
      </div>
    </LocaleContext.Provider>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountDetail, AccountInfo, ProviderInfo, TabSnapshot } from "../../shared/contract";
import { UsageBars } from "./usage";
import { useTr } from "../i18n";

const aiws = window.aiws;

// Global account manager (opens any time, even with no project). Cards in a grid (2-3/row) showing
// type + usage bars + reset like the right panel. Account detail (type/usage) is fetched ONCE per
// account and reused; mutations that don't change usage (rename/set-default) never refetch — the
// core usage readers are also 180s-cached per configDir, so we never spam the usage endpoints.
export function AccountsPanel({
  activeTab,
  onAdd,
  onClose,
}: {
  activeTab?: TabSnapshot;
  onAdd: (providerId: string) => void;
  onClose: () => void;
}) {
  const t = useTr();
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [detail, setDetail] = useState<Record<string, AccountDetail>>({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [addProvider, setAddProvider] = useState<string>("");

  const detailRef = useRef(detail);
  detailRef.current = detail;
  const inflight = useRef<Set<string>>(new Set());
  const mounted = useRef(true);

  // Fetch detail only for accounts we haven't loaded yet (dedupe in-flight) → no repeated API calls.
  const fetchInfos = useCallback((accs: AccountInfo[]) => {
    for (const a of accs) {
      if (a.id in detailRef.current || inflight.current.has(a.id)) continue;
      inflight.current.add(a.id);
      void aiws
        .accountInfo(a.id)
        .then((d) => {
          if (mounted.current) setDetail((m) => ({ ...m, [a.id]: d }));
        })
        .finally(() => inflight.current.delete(a.id));
    }
  }, []);

  // Reload account metadata only (cheap, no usage endpoints); prune detail cache of removed accounts.
  const reloadList = useCallback(async (): Promise<AccountInfo[]> => {
    const accs = await aiws.listAllAccounts();
    if (!mounted.current) return accs;
    setAccounts(accs);
    const ids = new Set(accs.map((a) => a.id));
    setDetail((m) => {
      const stale = Object.keys(m).filter((k) => !ids.has(k));
      if (!stale.length) return m;
      const next = { ...m };
      for (const k of stale) delete next[k];
      return next;
    });
    return accs;
  }, []);

  useEffect(() => {
    mounted.current = true;
    // providers (does PATH lookups) don't change during a panel session → fetch ONCE here, not per mutation.
    void aiws.listProviders().then((p) => mounted.current && setProviders(p));
    void reloadList().then(fetchInfos);
    return () => void (mounted.current = false);
  }, [reloadList, fetchInfos]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const aiProviders = providers.filter((p) => p.hasAccounts);
  const addSel = addProvider || aiProviders[0]?.id || "";

  // Metadata-only mutations (rename/set-default/remove): reload the list, but keep the detail cache
  // (fetchInfos re-fetches ONLY genuinely-new accounts → usage endpoints are not re-hit).
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    const accs = await reloadList();
    fetchInfos(accs);
    setConfirmRemove(null);
    setEditing(null);
    setBusy(false);
  };
  const doRemove = (id: string) => void run(() => aiws.removeAccount(id));
  const doDefault = (id: string) => void run(() => aiws.setDefaultAccount(id));
  const commitRename = (id: string) => {
    const v = editVal.trim();
    if (!v) return setEditing(null);
    void run(() => aiws.renameAccount(id, v));
  };
  // "use here" chỉ áp dụng cho tab AI đang chạy (shell không dùng account → switch sẽ lỗi).
  const canUse = !!activeTab && activeTab.providerId !== "shell";
  const doUse = async (a: AccountInfo) => {
    if (!canUse || !activeTab) return;
    await aiws.switchAccount(activeTab.id, a.id);
    onClose();
  };

  // Xếp PHẲNG: 1 lưới cho MỌI account (gom cùng provider cạnh nhau, mặc-định-trước) → luôn 3/dòng,
  // KHÔNG bị header provider cắt dòng. Provider hiện ngay trên từng thẻ.
  const sorted = [...accounts].sort(
    (a, b) =>
      a.providerId.localeCompare(b.providerId) ||
      (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) ||
      a.label.localeCompare(b.label),
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal accounts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{t("accountsTitle")}</div>
        <div className="accounts-body">
          {accounts.length === 0 && <div className="muted accounts-empty">{t("noAccountsYet")}</div>}
          {accounts.length > 0 && (
            <div className="accounts-grid">
              {sorted.map((a) => {
                const d = detail[a.id];
                const cur = !!activeTab && activeTab.providerId === a.providerId && activeTab.accountLabel === a.label;
                return (
                  <div key={a.id} className={"acct-card" + (cur ? " cur" : "")}>
                    <div className="acct-card-prov">{a.providerId}</div>
                    <div className="acct-card-top">
                      <span className="dot" style={{ background: d?.loggedIn ? "var(--green)" : "var(--amber)" }} />
                      {editing === a.id ? (
                        <input
                          className="acct-rename"
                          autoFocus
                          value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(a.id);
                            else if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <span className="acct-card-name">{a.label}</span>
                      )}
                      {a.isDefault && <span className="badge">{t("defaultBadge")}</span>}
                      {cur && <span className="badge cur">{t("inUse")}</span>}
                    </div>
                    <div className="acct-card-type">
                      {!d ? "…" : d.loggedIn ? d.accountType ?? d.accountName ?? "" : t("notLoggedIn")}
                    </div>
                    {d?.loggedIn && <UsageBars usage={d.usage} />}
                    <div className="acct-card-actions">
                      {canUse && (
                        <button className="mini" disabled={busy || cur} onClick={() => void doUse(a)}>
                          {t("useHere")}
                        </button>
                      )}
                      {!a.isDefault && (
                        <button className="mini" disabled={busy} onClick={() => doDefault(a.id)}>
                          {t("makeDefault")}
                        </button>
                      )}
                      <button
                        className="mini"
                        disabled={busy}
                        onClick={() => {
                          setEditing(a.id);
                          setEditVal(a.label);
                        }}
                      >
                        {t("rename")}
                      </button>
                      {confirmRemove === a.id ? (
                        <>
                          <button className="mini danger" disabled={busy} onClick={() => doRemove(a.id)}>
                            {t("confirmRemove")}
                          </button>
                          <button className="mini" disabled={busy} onClick={() => setConfirmRemove(null)}>
                            {t("cancel")}
                          </button>
                        </>
                      ) : (
                        <button className="mini danger" disabled={busy} onClick={() => setConfirmRemove(a.id)}>
                          {t("remove")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="accounts-foot">
          <select value={addSel} onChange={(e) => setAddProvider(e.target.value)}>
            {aiProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
              </option>
            ))}
          </select>
          <button className="primary" disabled={!addSel} onClick={() => addSel && onAdd(addSel)}>
            + {t("addAccount")}
          </button>
          <button onClick={onClose}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}

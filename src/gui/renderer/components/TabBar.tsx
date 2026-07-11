import type { TabSnapshot } from "../../shared/contract";
import { dotColor } from "./util";
import { ProviderDropdown } from "./ProviderDropdown";
import { useTr } from "../i18n";

export function TabBar({
  tabs,
  active,
  provider,
  locale,
  onSelect,
  onClose,
  onNew,
  onSetProvider,
  onToggleLang,
}: {
  tabs: TabSnapshot[];
  active: number;
  provider: string;
  locale: string;
  onSelect: (i: number) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onSetProvider: (id: string) => void;
  onToggleLang: () => void;
}) {
  const t = useTr();
  return (
    <div className="tabbar">
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          className={"tab-item" + (i === active ? " active" : "")}
          onClick={() => onSelect(i)}
          title={`${tab.projectName} · ${tab.providerId}`}
        >
          <span className="pd" style={{ background: dotColor(tab.providerId) }} />
          <span className="nm">{tab.title}</span>
          <span
            className="x"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
          >
            ×
          </span>
        </div>
      ))}
      <div className="tab-new" onClick={onNew}>
        ＋ {t("newTab")}
      </div>
      <span className="tspacer" />
      <span className="tcount">
        {tabs.length} {t("tabWord")} · Alt+1–9
      </span>
      <ProviderDropdown provider={provider} title={t("providerForNewTab")} onSelect={onSetProvider} />
      <span className="chip" onClick={onToggleLang}>
        {locale.toUpperCase()}
      </span>
    </div>
  );
}

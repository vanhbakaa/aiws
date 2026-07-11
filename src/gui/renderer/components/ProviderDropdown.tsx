import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProviderInfo } from "../../shared/contract";
import { dotColor } from "./util";
import { useTr } from "../i18n";

// Provider chooser for new tabs — a dropdown (click to open, pick one). Fetches live installed
// status each time it opens so uninstalled CLIs are shown dimmed with a "chưa cài" note. Rendered
// via a portal to document.body with fixed positioning so it escapes the tab bar's overflow clip.
export function ProviderDropdown({
  provider,
  title,
  onSelect,
}: {
  provider: string;
  title: string;
  onSelect: (id: string) => void;
}) {
  const t = useTr();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const chipRef = useRef<HTMLSpanElement>(null);
  const ddRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (!open && chipRef.current) {
      const r = chipRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: Math.max(6, window.innerWidth - r.right) });
      window.aiws.listProviders().then(setProviders);
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (chipRef.current?.contains(t) || ddRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <>
      <span className="chip" ref={chipRef} title={title} onClick={toggle}>
        {provider} ▾
      </span>
      {open &&
        createPortal(
          <div className="dropdown" ref={ddRef} style={{ position: "fixed", top: pos.top, right: pos.right }}>
            {providers.map((p) => (
              <div
                key={p.id}
                className={"dropdown-item" + (p.id === provider ? " sel" : "") + (p.installed ? "" : " off")}
                title={p.installed ? "" : p.installHint ? `${t("notInstalledShort")} — ${p.installHint}` : t("notInstalledShort")}
                onClick={() => {
                  onSelect(p.id);
                  setOpen(false);
                }}
              >
                <span className="dot" style={{ background: dotColor(p.id) }} /> {p.id}
                {!p.installed && <span className="dd-hint">{t("notInstalledShort")}</span>}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

import { useTr } from "../i18n";

export function KeyBar() {
  const t = useTr();
  return (
    <div className="keybar">
      <span>
        <b>⏎</b> {t("send")}
      </span>
      <span>
        <b>⇧⏎</b> {t("newline")}
      </span>
      <span>
        <b>Ctrl+N</b> {t("project")}
      </span>
      <span>
        <b>Ctrl+O</b> {t("openFolder")}
      </span>
      <span>
        <b>Ctrl+T</b> {t("newTab")}
      </span>
      <span>
        <b>Ctrl+W</b> {t("closeTab")}
      </span>
      <span>
        <b>Alt+1–9</b> {t("switchTab")}
      </span>
      <span>
        <b>Ctrl+S</b> {t("account")}
      </span>
      <span>
        <b>Ctrl+B</b> {t("panel")}
      </span>
      <span>
        <b>Ctrl+Q</b> {t("quit")}
      </span>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { useStore } from "../state/store";
import { resolveDirection } from "../lib/bidi";

export default function StatusBar() {
  const { t } = useTranslation();
  const tab = useStore((s) => s.activeTab());
  const zoom = useStore((s) => s.settings.zoom);
  if (!tab) return null;

  const modeLabel = t(`status.${tab.mode}`);
  const dirResolved = resolveDirection(tab.direction, tab.content);
  const dirLabel = tab.direction === "auto" ? `${t("status.auto")} · ${t(`status.${dirResolved}`)}` : t(`status.${tab.direction}`);

  return (
    <div className="nv-statusbar">
      <div className="nv-status-left">
        <span>
          {t("status.ln")} {tab.cursor.line}, {t("status.col")} {tab.cursor.col}
        </span>
        <span className="nv-status-sep" />
        <span>{t("status.words", { count: tab.counts.words })}</span>
        <span>{t("status.chars", { count: tab.counts.chars })}</span>
      </div>
      <div className="nv-status-right">
        {zoom !== 100 && <span>{zoom}%</span>}
        <span>{dirLabel}</span>
        <span className="nv-status-sep" />
        <span>{modeLabel}</span>
        <span className="nv-status-sep" />
        <span>{tab.encoding}</span>
      </div>
    </div>
  );
}

import { useTranslation } from "react-i18next";
import { FilePlus2, FolderOpen } from "lucide-react";
import { useStore } from "../state/store";
import { cmd } from "../commands";
import RichEditor from "./editors/RichEditor";
import MarkdownEditor from "./editors/MarkdownEditor";
import PlainEditor from "./editors/PlainEditor";

export default function EditorHost() {
  const { t } = useTranslation();
  const tab = useStore((s) => s.activeTab());

  if (!tab) {
    return (
      <div className="nv-empty">
        <div className="nv-empty-mark">Noteview</div>
        <p className="nv-empty-sub">{t("settings.aboutText")}</p>
        <div className="nv-empty-actions">
          <button className="nv-btn primary" onClick={() => cmd.newTab()}>
            <FilePlus2 size={16} /> {t("menu.newTab")}
          </button>
          <button className="nv-btn" onClick={() => cmd.open()}>
            <FolderOpen size={16} /> {t("menu.open")}
          </button>
        </div>
      </div>
    );
  }

  const key = `${tab.id}:${tab.mode}`;
  if (tab.mode === "rich") return <RichEditor key={key} tab={tab} />;
  if (tab.mode === "markdown") return <MarkdownEditor key={key} tab={tab} />;
  return <PlainEditor key={key} tab={tab} />;
}

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { useStore } from "../state/store";
import { cmd, requestCloseTab } from "../commands";

export default function TabBar() {
  const { t } = useTranslation();
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeTabId);
  const setActive = useStore((s) => s.setActive);
  const reorder = useStore((s) => s.reorder);
  const dragFrom = useRef<number | null>(null);

  return (
    <div className="nv-tabbar">
      <div className="nv-tabs">
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            className={`nv-tab ${tab.id === activeId ? "active" : ""}`}
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom.current !== null && dragFrom.current !== i) reorder(dragFrom.current, i);
              dragFrom.current = null;
            }}
            onMouseDown={(e) => {
              if (e.button === 0) setActive(tab.id);
              if (e.button === 1) {
                e.preventDefault();
                void requestCloseTab(tab.id);
              }
            }}
            title={tab.path ?? tab.name}
          >
            <span className="nv-tab-name">{tab.name}</span>
            <button
              className="nv-tab-close"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void requestCloseTab(tab.id);
              }}
              aria-label={t("common.close")}
            >
              {tab.dirty ? <span className="nv-dirty-dot" /> : <X size={13} />}
            </button>
          </div>
        ))}
      </div>
      <button className="nv-tab-new" onClick={() => cmd.newTab()} title={t("menu.newTab")} aria-label={t("menu.newTab")}>
        <Plus size={16} />
      </button>
    </div>
  );
}

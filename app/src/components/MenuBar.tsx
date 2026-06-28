import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Settings as SettingsIcon, Sun, Moon } from "lucide-react";
import { useStore } from "../state/store";
import { useUI } from "../state/ui";
import { useEditorCaps } from "../state/editorBridge";
import { cmd } from "../commands";

type Item =
  | { kind: "item"; label: string; accel?: string; onClick: () => void; disabled?: boolean; checked?: boolean }
  | { kind: "sep" }
  | { kind: "sub"; label: string; items: Item[]; disabled?: boolean };

export default function MenuBar() {
  const { t } = useTranslation();
  const recent = useStore((s) => s.recent);
  const settings = useStore((s) => s.settings);
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeTabId);
  const updateSettings = useStore((s) => s.updateSettings);
  const caps = useEditorCaps();
  const openSettings = useUI((s) => s.openSettings);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const hasActive = !!activeId;
  const hasDirty = tabs.some((t) => t.dirty);
  const isRich = caps.mode === "rich";

  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [openMenu]);

  const recentItems: Item[] = recent.length
    ? [
        ...recent.map((r) => ({ kind: "item" as const, label: r.name, onClick: () => cmd.openRecent(r.path) })),
        { kind: "sep" as const },
        { kind: "item" as const, label: t("menu.clearRecent"), onClick: () => useStore.getState().clearRecent() },
      ]
    : [{ kind: "item", label: t("menu.noRecent"), onClick: () => {}, disabled: true }];

  const menus: { id: string; label: string; items: Item[] }[] = [
    {
      id: "file",
      label: t("menu.file"),
      items: [
        { kind: "item", label: t("menu.newTab"), accel: "Ctrl+N", onClick: cmd.newTab },
        { kind: "item", label: t("menu.newWindow"), accel: "Ctrl+Shift+N", onClick: cmd.newWindow },
        { kind: "item", label: t("menu.newMarkdown"), accel: "Ctrl+Shift+M", onClick: cmd.newMarkdownTab },
        { kind: "sep" },
        { kind: "item", label: t("menu.open"), accel: "Ctrl+O", onClick: cmd.open },
        { kind: "sub", label: t("menu.recent"), items: recentItems },
        { kind: "sep" },
        { kind: "item", label: t("menu.save"), accel: "Ctrl+S", onClick: cmd.save, disabled: !hasActive },
        { kind: "item", label: t("menu.saveAs"), accel: "Ctrl+Shift+S", onClick: () => cmd.saveAs(), disabled: !hasActive },
        { kind: "item", label: t("menu.saveAll"), accel: "Ctrl+Alt+S", onClick: cmd.saveAll, disabled: !hasDirty },
        { kind: "sep" },
        { kind: "item", label: t("menu.pageSetup"), onClick: cmd.pageSetup, disabled: !hasActive },
        { kind: "item", label: t("menu.print"), accel: "Ctrl+P", onClick: cmd.print, disabled: !hasActive },
        { kind: "item", label: t("menu.exportPdf"), onClick: cmd.exportPdf, disabled: !hasActive },
        { kind: "item", label: t("menu.exportDocx"), onClick: cmd.exportDocx, disabled: !hasActive },
        { kind: "sep" },
        { kind: "item", label: t("menu.closeTab"), accel: "Ctrl+W", onClick: cmd.closeTab, disabled: !hasActive },
        { kind: "item", label: t("menu.closeWindow"), accel: "Ctrl+Shift+W", onClick: cmd.closeWindow },
        { kind: "item", label: t("menu.exit"), onClick: cmd.exit },
      ],
    },
    {
      id: "edit",
      label: t("menu.edit"),
      items: [
        { kind: "item", label: t("menu.undo"), accel: "Ctrl+Z", onClick: cmd.undo, disabled: !caps.canUndo },
        { kind: "item", label: t("menu.redo"), accel: "Ctrl+Y", onClick: cmd.redo, disabled: !caps.canRedo },
        { kind: "sep" },
        { kind: "item", label: t("menu.cut"), accel: "Ctrl+X", onClick: cmd.cut, disabled: !caps.hasSelection },
        { kind: "item", label: t("menu.copy"), accel: "Ctrl+C", onClick: cmd.copy, disabled: !caps.hasSelection },
        { kind: "item", label: t("menu.paste"), accel: "Ctrl+V", onClick: cmd.paste, disabled: !hasActive },
        { kind: "item", label: t("menu.delete"), accel: "Del", onClick: cmd.del, disabled: !caps.hasSelection },
        { kind: "item", label: t("menu.clearFormatting"), onClick: cmd.clearFormatting, disabled: !isRich },
        { kind: "sep" },
        { kind: "item", label: t("menu.searchWeb"), onClick: cmd.searchWeb, disabled: !caps.hasSelection },
        { kind: "sep" },
        { kind: "item", label: t("menu.find"), accel: "Ctrl+F", onClick: cmd.find, disabled: !hasActive },
        { kind: "item", label: t("menu.findNext"), accel: "F3", onClick: cmd.findNext, disabled: !hasActive },
        { kind: "item", label: t("menu.findPrev"), accel: "Shift+F3", onClick: cmd.findPrev, disabled: !hasActive },
        { kind: "item", label: t("menu.replace"), accel: "Ctrl+H", onClick: cmd.replace, disabled: !hasActive },
        { kind: "item", label: t("menu.goto"), accel: "Ctrl+G", onClick: cmd.goto, disabled: !hasActive },
        { kind: "sep" },
        { kind: "item", label: t("menu.selectAll"), accel: "Ctrl+A", onClick: cmd.selectAll, disabled: !hasActive },
      ],
    },
    {
      id: "view",
      label: t("menu.view"),
      items: [
        {
          kind: "sub",
          label: t("menu.zoom"),
          items: [
            { kind: "item", label: t("menu.zoomIn"), accel: "Ctrl+=", onClick: cmd.zoomIn },
            { kind: "item", label: t("menu.zoomOut"), accel: "Ctrl+-", onClick: cmd.zoomOut },
            { kind: "item", label: t("menu.zoomReset"), accel: "Ctrl+0", onClick: cmd.zoomReset },
          ],
        },
        { kind: "sep" },
        { kind: "item", label: t("menu.statusBar"), onClick: cmd.toggleStatusBar, checked: settings.showStatusBar },
        { kind: "item", label: t("menu.wordWrap"), onClick: cmd.toggleWordWrap, checked: settings.wordWrap },
        { kind: "sep" },
        { kind: "item", label: t("menu.settings"), onClick: openSettings },
      ],
    },
  ];

  const run = (fn: () => void) => {
    setOpenMenu(null);
    fn();
  };

  return (
    <div className="nv-menubar" ref={barRef}>
      <div className="nv-brand">Noteview</div>
      <nav className="nv-menus">
        {menus.map((m) => (
          <div key={m.id} className="nv-menu-wrap">
            <button
              className={`nv-menu-trigger ${openMenu === m.id ? "active" : ""}`}
              onMouseDown={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === m.id ? null : m.id);
              }}
              onMouseEnter={() => openMenu && setOpenMenu(m.id)}
            >
              {m.label}
            </button>
            {openMenu === m.id && <Dropdown items={m.items} onRun={run} />}
          </div>
        ))}
      </nav>
      <div className="nv-menubar-right">
        <button
          className="nv-icon-btn"
          title={settings.theme === "dark" ? t("settings.light") : t("settings.dark")}
          onClick={() => updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
        >
          {settings.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="nv-icon-btn" title={t("menu.settings")} onClick={openSettings}>
          <SettingsIcon size={16} />
        </button>
      </div>
    </div>
  );
}

function Dropdown({ items, onRun }: { items: Item[]; onRun: (fn: () => void) => void }) {
  return (
    <div className="nv-dropdown" onMouseDown={(e) => e.stopPropagation()}>
      {items.map((it, i) => {
        if (it.kind === "sep") return <div key={i} className="nv-menu-sep" />;
        if (it.kind === "sub") return <SubMenu key={i} item={it} onRun={onRun} />;
        return (
          <button
            key={i}
            className="nv-menu-item"
            disabled={it.disabled}
            onClick={() => onRun(it.onClick)}
          >
            <span className="nv-check">{it.checked ? "✓" : ""}</span>
            <span className="nv-menu-label">{it.label}</span>
            {it.accel && <span className="nv-accel">{it.accel}</span>}
          </button>
        );
      })}
    </div>
  );
}

function SubMenu({ item, onRun }: { item: Extract<Item, { kind: "sub" }>; onRun: (fn: () => void) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="nv-submenu-wrap" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="nv-menu-item" disabled={item.disabled}>
        <span className="nv-check" />
        <span className="nv-menu-label">{item.label}</span>
        <ChevronRight size={14} className="nv-accel" />
      </button>
      {open && (
        <div className="nv-dropdown nv-submenu">
          {item.items.map((it, i) => {
            if (it.kind === "sep") return <div key={i} className="nv-menu-sep" />;
            if (it.kind === "sub") return <SubMenu key={i} item={it} onRun={onRun} />;
            return (
              <button key={i} className="nv-menu-item" disabled={it.disabled} onClick={() => onRun(it.onClick)}>
                <span className="nv-check">{it.checked ? "✓" : ""}</span>
                <span className="nv-menu-label">{it.label}</span>
                {it.accel && <span className="nv-accel">{it.accel}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

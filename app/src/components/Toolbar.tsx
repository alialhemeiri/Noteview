import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, ListChecks, Quote, Code2,
  Table as TableIcon, Sigma, Link2, ChevronDown,
  Baseline, Highlighter, Columns2, Eye, PanelLeft,
} from "lucide-react";
import type { Editor } from "@tiptap/core";
import { useStore } from "../state/store";
import { useRichEditor } from "../state/richEditor";
import type { EditorMode, MarkdownView, Tab } from "../types";

const FONTS = [
  "Inter", "Lora", "JetBrains Mono", "Georgia", "Arial",
  "Times New Roman", "Calibri", "Noto Naskh Arabic", "Amiri",
];
const SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40];

/** Close a popover on outside click or Escape. Replaces onMouseLeave, which
 *  closed menus the instant the cursor crossed the gap to the popup. */
function useClickOutside(open: boolean, setOpen: (v: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);
  return ref;
}

function Btn({ active, disabled, title, onClick, children }: {
  active?: boolean; disabled?: boolean; title: string; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      className={`nv-tb-btn ${active ? "active" : ""}`}
      disabled={disabled}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="nv-tb-sep" />;
}

/** Generic segmented control used for mode-switch / direction / md-view. */
function Segmented<T extends string>({ value, options, onChange }: {
  value: T; options: { v: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="nv-segmented">
      {options.map((o) => (
        <button
          key={o.v}
          className={value === o.v ? "active" : ""}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(o.v)}
          title={o.label}
        >
          {o.icon ?? o.label}
        </button>
      ))}
    </div>
  );
}

export default function Toolbar({ tab }: { tab: Tab }) {
  const { t } = useTranslation();
  const setMode = useStore((s) => s.setMode);
  const setMdView = useStore((s) => s.setMdView);

  const modeOptions: { v: EditorMode; label: string }[] = [
    { v: "rich", label: t("toolbar.modeRich") },
    { v: "markdown", label: t("toolbar.modeMarkdown") },
    { v: "plain", label: t("toolbar.modePlain") },
  ];
  const viewOptions: { v: MarkdownView; label: string; icon: ReactNode }[] = [
    { v: "source", label: t("toolbar.viewSource"), icon: <PanelLeft size={15} /> },
    { v: "split", label: t("toolbar.viewSplit"), icon: <Columns2 size={15} /> },
    { v: "preview", label: t("toolbar.viewPreview"), icon: <Eye size={15} /> },
  ];

  return (
    <div className="nv-toolbar">
      {tab.mode === "rich" && <RichControls />}
      {tab.mode === "markdown" && (
        <>
          <Segmented value={tab.mdView} options={viewOptions} onChange={(v) => setMdView(tab.id, v)} />
          <Sep />
        </>
      )}

      <div className="nv-toolbar-end">
        <Segmented value={tab.mode} options={modeOptions} onChange={(v) => setMode(tab.id, v)} />
      </div>
    </div>
  );
}

function RichControls() {
  const { t } = useTranslation();
  const editor = useRichEditor((s) => s.editor) as Editor | null;
  const [, force] = useReducer((x) => x + 1, 0);

  useEffect(() => {
    if (!editor) return;
    const fn = () => force();
    editor.on("transaction", fn);
    return () => {
      editor.off("transaction", fn);
    };
  }, [editor]);

  if (!editor) return null;
  const ed = editor;
  const chain = () => ed.chain().focus();
  const headingValue = ed.isActive("heading", { level: 1 })
    ? "1" : ed.isActive("heading", { level: 2 })
    ? "2" : ed.isActive("heading", { level: 3 })
    ? "3" : ed.isActive("heading", { level: 4 })
    ? "4" : "p";
  const curFont = (ed.getAttributes("textStyle").fontFamily as string) ?? "";
  const curSize = ((ed.getAttributes("textStyle").fontSize as string) ?? "").replace("px", "");

  return (
    <>
      <select
        className="nv-tb-select"
        value={headingValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") chain().setParagraph().run();
          else chain().toggleHeading({ level: Number(v) as 1 | 2 | 3 | 4 }).run();
        }}
        title={t("toolbar.style")}
      >
        <option value="p">{t("toolbar.paragraph")}</option>
        <option value="1">{t("toolbar.heading", { level: 1 })}</option>
        <option value="2">{t("toolbar.heading", { level: 2 })}</option>
        <option value="3">{t("toolbar.heading", { level: 3 })}</option>
        <option value="4">{t("toolbar.heading", { level: 4 })}</option>
      </select>

      <select
        className="nv-tb-select nv-tb-font"
        value={curFont}
        onChange={(e) => (e.target.value ? chain().setFontFamily(e.target.value).run() : chain().unsetFontFamily().run())}
        title={t("toolbar.font")}
      >
        <option value="">{t("toolbar.font")}</option>
        {FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>

      <select
        className="nv-tb-select nv-tb-size"
        value={curSize}
        onChange={(e) => (e.target.value ? chain().setFontSize(`${e.target.value}px`).run() : chain().unsetFontSize().run())}
        title={t("toolbar.size")}
      >
        <option value="">{t("toolbar.size")}</option>
        {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <Sep />
      <Btn active={ed.isActive("bold")} title={t("toolbar.bold")} onClick={() => chain().toggleBold().run()}><Bold size={16} /></Btn>
      <Btn active={ed.isActive("italic")} title={t("toolbar.italic")} onClick={() => chain().toggleItalic().run()}><Italic size={16} /></Btn>
      <Btn active={ed.isActive("underline")} title={t("toolbar.underline")} onClick={() => chain().toggleUnderline().run()}><Underline size={16} /></Btn>
      <Btn active={ed.isActive("strike")} title={t("toolbar.strike")} onClick={() => chain().toggleStrike().run()}><Strikethrough size={16} /></Btn>

      <ColorControl
        title={t("toolbar.textColor")}
        icon={<Baseline size={16} />}
        onPick={(c) => chain().setColor(c).run()}
        onClear={() => chain().unsetColor().run()}
        clearLabel={t("toolbar.noColor")}
      />
      <ColorControl
        title={t("toolbar.highlight")}
        icon={<Highlighter size={16} />}
        onPick={(c) => chain().setHighlight({ color: c }).run()}
        onClear={() => chain().unsetHighlight().run()}
        clearLabel={t("toolbar.noColor")}
      />

      <Sep />
      <Btn active={ed.isActive({ textAlign: "left" })} title={t("toolbar.alignLeft")} onClick={() => chain().setTextAlign("left").run()}><AlignLeft size={16} /></Btn>
      <Btn active={ed.isActive({ textAlign: "center" })} title={t("toolbar.alignCenter")} onClick={() => chain().setTextAlign("center").run()}><AlignCenter size={16} /></Btn>
      <Btn active={ed.isActive({ textAlign: "right" })} title={t("toolbar.alignRight")} onClick={() => chain().setTextAlign("right").run()}><AlignRight size={16} /></Btn>
      <Btn active={ed.isActive({ textAlign: "justify" })} title={t("toolbar.alignJustify")} onClick={() => chain().setTextAlign("justify").run()}><AlignJustify size={16} /></Btn>

      <Sep />
      <Btn active={ed.isActive("bulletList")} title={t("toolbar.bulletList")} onClick={() => chain().toggleBulletList().run()}><List size={16} /></Btn>
      <Btn active={ed.isActive("orderedList")} title={t("toolbar.orderedList")} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={16} /></Btn>
      <Btn active={ed.isActive("taskList")} title={t("toolbar.taskList")} onClick={() => chain().toggleTaskList().run()}><ListChecks size={16} /></Btn>
      <Btn active={ed.isActive("blockquote")} title={t("toolbar.blockquote")} onClick={() => chain().toggleBlockquote().run()}><Quote size={16} /></Btn>
      <Btn active={ed.isActive("codeBlock")} title={t("toolbar.codeBlock")} onClick={() => chain().toggleCodeBlock().run()}><Code2 size={16} /></Btn>

      <Sep />
      <TableMenu editor={ed} />
      <MathMenu editor={ed} />
      <Btn
        active={ed.isActive("link")}
        title={t("toolbar.link")}
        onClick={() => {
          const prev = (ed.getAttributes("link").href as string) ?? "";
          const url = window.prompt(t("toolbar.link"), prev);
          if (url === null) return;
          if (url === "") chain().unsetLink().run();
          else chain().setLink({ href: url }).run();
        }}
      ><Link2 size={16} /></Btn>
    </>
  );
}

function ColorControl({ title, icon, onPick, onClear, clearLabel }: {
  title: string; icon: ReactNode; onPick: (c: string) => void; onClear: () => void; clearLabel: string;
}) {
  const [open, setOpen] = useState(false);
  // Remembered colour: the icon re-applies it on click; the caret opens the picker.
  const [last, setLast] = useState<string | null>(null);
  const ref = useClickOutside(open, setOpen);
  const swatches = ["#1b1d23", "#dc2626", "#d97706", "#16a34a", "#2563eb", "#7c3aed", "#db2777", "#0891b2", "#ffffff"];
  const apply = (c: string) => { setLast(c); onPick(c); };
  return (
    <div className="nv-color-wrap" ref={ref}>
      <button
        className="nv-tb-btn nv-color-main"
        title={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (last ? onPick(last) : setOpen(true))}
      >
        <span className="nv-color-icon" style={{ ["--cc" as string]: last ?? "var(--text)" }}>{icon}</span>
      </button>
      <button
        className="nv-tb-btn nv-color-caret"
        title={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="nv-color-pop" onMouseDown={(e) => e.preventDefault()}>
          <div className="nv-swatches">
            {swatches.map((c) => (
              <button key={c} className="nv-swatch" style={{ background: c }} onClick={() => { apply(c); setOpen(false); }} />
            ))}
          </div>
          <div className="nv-color-row">
            <input type="color" value={last ?? "#000000"} onChange={(e) => apply(e.target.value)} />
            <button className="nv-text-btn" onClick={() => { onClear(); setOpen(false); }}>{clearLabel}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TableMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, setOpen);
  const chain = () => editor.chain().focus();
  const inTable = editor.isActive("table");
  const item = (label: string, fn: () => void) => (
    <button className="nv-menu-item" onClick={() => { fn(); setOpen(false); }}>
      <span className="nv-check" /><span className="nv-menu-label">{label}</span>
    </button>
  );
  return (
    <div className="nv-tb-menu-wrap" ref={ref}>
      <Btn active={inTable} title={t("toolbar.table")} onClick={() => setOpen((o) => !o)}><TableIcon size={16} /></Btn>
      {open && (
        <div className="nv-dropdown" onMouseDown={(e) => e.preventDefault()}>
          {item(t("toolbar.insertTable"), () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
          <div className="nv-menu-sep" />
          {item(t("toolbar.addRowBefore"), () => chain().addRowBefore().run())}
          {item(t("toolbar.addRowAfter"), () => chain().addRowAfter().run())}
          {item(t("toolbar.addColBefore"), () => chain().addColumnBefore().run())}
          {item(t("toolbar.addColAfter"), () => chain().addColumnAfter().run())}
          <div className="nv-menu-sep" />
          {item(t("toolbar.deleteRow"), () => chain().deleteRow().run())}
          {item(t("toolbar.deleteCol"), () => chain().deleteColumn().run())}
          {item(t("toolbar.mergeCells"), () => chain().mergeCells().run())}
          {item(t("toolbar.splitCell"), () => chain().splitCell().run())}
          <div className="nv-menu-sep" />
          {item(t("toolbar.deleteTable"), () => chain().deleteTable().run())}
        </div>
      )}
    </div>
  );
}

function MathMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, setOpen);
  return (
    <div className="nv-tb-menu-wrap" ref={ref}>
      <Btn title={t("toolbar.math")} onClick={() => setOpen((o) => !o)}><Sigma size={16} /></Btn>
      {open && (
        <div className="nv-dropdown" onMouseDown={(e) => e.preventDefault()}>
          <button className="nv-menu-item" onClick={() => { editor.chain().focus().insertInlineMath("x^2").run(); setOpen(false); }}>
            <span className="nv-check" /><span className="nv-menu-label">{t("toolbar.inlineMath")}</span>
          </button>
          <button className="nv-menu-item" onClick={() => { editor.chain().focus().insertBlockMath("\\int_a^b f(x)\\,dx").run(); setOpen(false); }}>
            <span className="nv-check" /><span className="nv-menu-label">{t("toolbar.blockMath")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { StarterKit } from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-text-style/color";
import { FontFamily } from "@tiptap/extension-text-style/font-family";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table/kit";
import { TaskList } from "@tiptap/extension-list/task-list";
import { TaskItem } from "@tiptap/extension-list/task-item";
import { Placeholder, CharacterCount } from "@tiptap/extensions";

import { InlineMath, BlockMath } from "./extensions/math";
import type { Tab } from "../../types";
import { useStore } from "../../state/store";
import { setBridge, useEditorCaps, type EditorHandle } from "../../state/editorBridge";
import { useRichEditor } from "../../state/richEditor";
import { createTextSearch, type SearchAdapter } from "../../lib/search";
import { resolveDirection } from "../../lib/bidi";
import { isAllowedExternalUrl, openExternal } from "../../lib/tauri";
import i18n from "../../i18n";

interface Seg {
  ts: number;
  te: number;
  from: number;
}

// Build a plain-text projection of the doc plus a map back to ProseMirror
// positions, so the shared text-search engine can drive the rich editor.
function buildIndex(doc: PMNode): { text: string; segs: Seg[] } {
  let text = "";
  const segs: Seg[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const ts = text.length;
      text += node.text;
      segs.push({ ts, te: text.length, from: pos });
    }
    return true;
  });
  return { text, segs };
}

function mapToDoc(segs: Seg[], offset: number): number {
  for (const s of segs) {
    if (offset >= s.ts && offset <= s.te) return s.from + (offset - s.ts);
  }
  if (segs.length) {
    const last = segs[segs.length - 1];
    if (offset > last.te) return last.from + (last.te - last.ts);
  }
  return 1;
}

export default function RichEditor({ tab }: { tab: Tab }) {
  const updateContent = useStore((s) => s.updateContent);
  const setCursor = useStore((s) => s.setCursor);
  const setCounts = useStore((s) => s.setCounts);
  const settings = useStore((s) => s.settings);
  const setRichEditor = useRichEditor((s) => s.setEditor);
  const caps = useEditorCaps((s) => s.set);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          link: { openOnClick: false, autolink: true },
        }),
        TextStyle,
        Color,
        FontFamily,
        FontSize,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TableKit.configure({ table: { resizable: true } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: i18n.t("editor.placeholder") }),
        CharacterCount,
        InlineMath,
        BlockMath,
      ],
      content: tab.content,
      onUpdate: ({ editor: e }) => {
        updateContent(tab.id, e.getHTML());
        const cc = e.storage.characterCount as { words: () => number; characters: () => number };
        setCounts(tab.id, cc.words(), cc.characters());
        caps({ canUndo: e.can().undo(), canRedo: e.can().redo() });
      },
      onSelectionUpdate: ({ editor: e }) => {
        const { from, empty } = e.state.selection;
        const before = e.state.doc.textBetween(0, from, "\n", " ");
        setCursor(tab.id, (before.match(/\n/g)?.length ?? 0) + 1, before.length - before.lastIndexOf("\n"));
        caps({ hasSelection: !empty, canUndo: e.can().undo(), canRedo: e.can().redo() });
      },
    },
    [tab.id],
  );

  // Wire the editor into the toolbar store + the menu command bridge.
  useEffect(() => {
    if (!editor) return;
    setRichEditor(editor);
    const ed = editor as Editor;

    const adapter: SearchAdapter = {
      getText: () => buildIndex(ed.state.doc).text,
      selectionStart: () => {
        const { segs } = buildIndex(ed.state.doc);
        const from = ed.state.selection.from;
        for (const s of segs) {
          const len = s.te - s.ts;
          if (from >= s.from && from <= s.from + len) return s.ts + (from - s.from);
        }
        return 0;
      },
      select: (start, end) => {
        const { segs } = buildIndex(ed.state.doc);
        // Don't .focus() — keep focus in the Find box while searching/cycling.
        ed.chain().setTextSelection({ from: mapToDoc(segs, start), to: mapToDoc(segs, end) }).scrollIntoView().run();
      },
      replace: (start, end, withText) => {
        const { segs } = buildIndex(ed.state.doc);
        ed.chain().insertContentAt({ from: mapToDoc(segs, start), to: mapToDoc(segs, end) }, withText).run();
      },
    };
    const search = createTextSearch(adapter);

    const handle: EditorHandle = {
      mode: "rich",
      focus: () => ed.commands.focus(),
      undo: () => ed.commands.undo(),
      redo: () => ed.commands.redo(),
      cut: () => {
        ed.commands.focus();
        document.execCommand("cut");
      },
      copy: () => {
        ed.commands.focus();
        document.execCommand("copy");
      },
      paste: async () => {
        try {
          const t = await navigator.clipboard.readText();
          ed.commands.insertContent(t);
        } catch {
          /* denied */
        }
      },
      del: () => ed.commands.deleteSelection(),
      selectAll: () => ed.commands.selectAll(),
      getSelectionText: () => {
        const { from, to } = ed.state.selection;
        return ed.state.doc.textBetween(from, to, " ");
      },
      clearFormatting: () => ed.chain().focus().unsetAllMarks().clearNodes().run(),
      find: (s) => search.find(s),
      findNext: (s) => search.next(s),
      findPrev: (s) => search.prev(s),
      replaceCurrent: (s) => search.replaceCurrent(s),
      replaceAll: (s) => search.replaceAll(s),
      closeFind: () => ed.commands.focus(),
      gotoLine: (line) => {
        let pos = 1;
        let i = 0;
        ed.state.doc.forEach((node) => {
          i += 1;
          if (i === line) return;
          if (i < line) pos += node.nodeSize;
        });
        ed.chain().focus().setTextSelection(Math.min(pos, ed.state.doc.content.size)).scrollIntoView().run();
      },
      getExportHtml: () => ed.getHTML(),
    };
    setBridge(handle);
    caps({ mode: "rich", canUndo: ed.can().undo(), canRedo: ed.can().redo(), hasSelection: !ed.state.selection.empty });

    const cc = ed.storage.characterCount as { words: () => number; characters: () => number };
    setCounts(tab.id, cc.words(), cc.characters());

    return () => {
      setBridge(null);
      setRichEditor(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, tab.id]);

  // Direction + spellcheck applied imperatively to the contenteditable root.
  const dir = resolveDirection(tab.direction, tab.content);
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute("dir", tab.direction === "auto" ? "auto" : dir);
    dom.classList.toggle("doc-auto-dir", tab.direction === "auto");
    dom.spellcheck = settings.spellCheck;
    dom.setAttribute("lang", settings.spellLang);
    dom.setAttribute("autocorrect", settings.autocorrect ? "on" : "off");
  }, [editor, dir, tab.direction, settings.spellCheck, settings.spellLang, settings.autocorrect]);

  // Ctrl/Cmd-click a link → open externally.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href]");
      if (a && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const href = a.getAttribute("href");
        if (href && isAllowedExternalUrl(href)) void openExternal(href);
      }
    };
    dom.addEventListener("click", onClick);
    return () => dom.removeEventListener("click", onClick);
  }, [editor]);

  return (
    <div
      className="nv-rich-scroll"
      style={{ ["--zoom" as string]: settings.zoom / 100 }}
    >
      <div className="nv-rich-page">
        <EditorContent editor={editor} className="nv-rich" />
      </div>
    </div>
  );
}

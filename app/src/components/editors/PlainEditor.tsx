import { useEffect, useRef } from "react";
import type { Tab } from "../../types";
import { useStore } from "../../state/store";
import { setBridge, useEditorCaps, type EditorHandle } from "../../state/editorBridge";
import { createTextSearch, type SearchAdapter } from "../../lib/search";
import { resolveDirection } from "../../lib/bidi";
import { textToHtml } from "../../lib/convert";

function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

function lineColAt(text: string, offset: number): { line: number; col: number } {
  const before = text.slice(0, offset);
  const line = (before.match(/\n/g)?.length ?? 0) + 1;
  const col = offset - before.lastIndexOf("\n");
  return { line, col };
}

export default function PlainEditor({ tab }: { tab: Tab }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const updateContent = useStore((s) => s.updateContent);
  const setCursor = useStore((s) => s.setCursor);
  const setCounts = useStore((s) => s.setCounts);
  const settings = useStore((s) => s.settings);
  const caps = useEditorCaps((s) => s.set);

  const dir = resolveDirection(tab.direction, tab.content);

  // Report counts + cursor whenever selection/content changes.
  const report = () => {
    const el = ref.current;
    if (!el) return;
    setCounts(tab.id, countWords(el.value), el.value.length);
    const { line, col } = lineColAt(el.value, el.selectionStart);
    setCursor(tab.id, line, col);
    caps({ hasSelection: el.selectionStart !== el.selectionEnd });
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const adapter: SearchAdapter = {
      getText: () => el.value,
      selectionStart: () => el.selectionStart,
      select: (start, end) => {
        // Don't el.focus() — keep focus in the Find box while searching/cycling.
        el.setSelectionRange(start, end);
        report();
      },
      replace: (start, end, withText) => {
        el.setRangeText(withText, start, end, "select");
        updateContent(tab.id, el.value);
      },
    };
    const search = createTextSearch(adapter);

    const handle: EditorHandle = {
      mode: "plain",
      focus: () => el.focus(),
      undo: () => {
        el.focus();
        document.execCommand("undo");
      },
      redo: () => {
        el.focus();
        document.execCommand("redo");
      },
      cut: () => {
        el.focus();
        document.execCommand("cut");
      },
      copy: () => {
        el.focus();
        document.execCommand("copy");
      },
      paste: async () => {
        try {
          const t = await navigator.clipboard.readText();
          el.setRangeText(t, el.selectionStart, el.selectionEnd, "end");
          updateContent(tab.id, el.value);
        } catch {
          /* clipboard denied */
        }
      },
      del: () => {
        el.setRangeText("", el.selectionStart, el.selectionEnd, "start");
        updateContent(tab.id, el.value);
      },
      selectAll: () => {
        el.focus();
        el.select();
      },
      getSelectionText: () => el.value.slice(el.selectionStart, el.selectionEnd),
      clearFormatting: () => {},
      find: (s) => search.find(s),
      findNext: (s) => search.next(s),
      findPrev: (s) => search.prev(s),
      replaceCurrent: (s) => {
        search.replaceCurrent(s);
        updateContent(tab.id, el.value);
      },
      replaceAll: (s) => {
        const n = search.replaceAll(s);
        updateContent(tab.id, el.value);
        return n;
      },
      closeFind: () => el.focus(),
      gotoLine: (line) => {
        const lines = el.value.split("\n");
        let offset = 0;
        for (let i = 0; i < Math.min(line - 1, lines.length); i += 1) offset += lines[i].length + 1;
        el.focus();
        el.setSelectionRange(offset, offset);
        report();
      },
      getExportHtml: () => textToHtml(el.value),
    };

    setBridge(handle);
    caps({ mode: "plain", canUndo: true, canRedo: true, hasSelection: false });
    report();
    return () => setBridge(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  return (
    <textarea
      ref={ref}
      className="nv-plain allow-select"
      defaultValue={tab.content}
      dir={tab.direction === "auto" ? "auto" : dir}
      spellCheck={settings.spellCheck}
      lang={settings.spellLang}
      autoCorrect={settings.autocorrect ? "on" : "off"}
      wrap={settings.wordWrap ? "soft" : "off"}
      onInput={(e) => {
        updateContent(tab.id, e.currentTarget.value);
        report();
      }}
      onKeyUp={report}
      onClick={report}
      style={{
        fontSize: `calc(${settings.defaultFontSize}px * var(--zoom, 1))`,
        whiteSpace: settings.wordWrap ? "pre-wrap" : "pre",
        fontFamily: "var(--font-mono)",
      }}
    />
  );
}

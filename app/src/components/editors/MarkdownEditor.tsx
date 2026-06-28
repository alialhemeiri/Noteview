import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

import type { Tab } from "../../types";
import { useStore } from "../../state/store";
import { setBridge, useEditorCaps, type EditorHandle } from "../../state/editorBridge";
import { createTextSearch, type SearchAdapter } from "../../lib/search";
import { resolveDirection } from "../../lib/bidi";
import { isAllowedExternalUrl, openExternal } from "../../lib/tauri";

const cmTheme = EditorView.theme({
  "&": { color: "var(--text)", backgroundColor: "transparent", height: "100%" },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    padding: "16px 20px",
    caretColor: "var(--accent)",
  },
  ".cm-scroller": { overflow: "auto", lineHeight: "1.7" },
  ".cm-gutters": { backgroundColor: "transparent", color: "var(--text-muted)", border: "none" },
  ".cm-activeLine": { backgroundColor: "var(--hover)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--hover)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "var(--selection)" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
});

const mdHighlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--accent-text)", fontWeight: "700" },
  { tag: t.strong, fontWeight: "700", color: "var(--text)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "var(--accent-text)", textDecoration: "underline" },
  { tag: t.url, color: "var(--text-muted)" },
  { tag: t.quote, color: "var(--text-2)", fontStyle: "italic" },
  { tag: t.monospace, color: "var(--success)" },
  { tag: t.list, color: "var(--accent-text)" },
  { tag: [t.meta, t.comment], color: "var(--text-muted)" },
  { tag: t.strikethrough, textDecoration: "line-through" },
]);

// Shared renderer for the live preview AND export/print, so KaTeX math, GFM
// tables and code highlighting are identical and never depend on which pane
// happens to be mounted.
function renderMd(src: string): ReactElement {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={{
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (href && isAllowedExternalUrl(href)) void openExternal(href);
            }}
          >
            {children}
          </a>
        ),
      }}
    >
      {src}
    </ReactMarkdown>
  );
}

export default function MarkdownEditor({ tab }: { tab: Tab }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [text, setText] = useState(tab.content);

  const updateContent = useStore((s) => s.updateContent);
  const setCursor = useStore((s) => s.setCursor);
  const setCounts = useStore((s) => s.setCounts);
  const settings = useStore((s) => s.settings);
  const caps = useEditorCaps((s) => s.set);

  const wrapComp = useRef(new Compartment());
  const dirComp = useRef(new Compartment());

  const dir = resolveDirection(tab.direction, text);

  // Build the CodeMirror view once per tab.
  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: tab.content,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(mdHighlight),
        cmTheme,
        wrapComp.current.of(settings.wordWrap ? EditorView.lineWrapping : []),
        dirComp.current.of(
          EditorView.contentAttributes.of({
            dir: tab.direction === "auto" ? "auto" : dir,
            spellcheck: String(settings.spellCheck),
            lang: settings.spellLang,
          }),
        ),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const doc = u.state.doc.toString();
            setText(doc);
            updateContent(tab.id, doc);
            const words = doc.trim().match(/\S+/g)?.length ?? 0;
            setCounts(tab.id, words, doc.length);
          }
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            setCursor(tab.id, line.number, head - line.from + 1);
            caps({ hasSelection: !u.state.selection.main.empty });
          }
        }),
        EditorView.domEventHandlers({
          scroll: () => {
            syncPreviewFromSource();
            return false;
          },
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;

    const adapter: SearchAdapter = {
      getText: () => view.state.doc.toString(),
      selectionStart: () => view.state.selection.main.head,
      select: (start, end) => {
        // Don't steal focus from the Find box — drawSelection() renders the match
        // without focus, and closeFind() returns focus to the editor afterwards.
        view.dispatch({ selection: { anchor: start, head: end }, scrollIntoView: true });
      },
      replace: (start, end, withText) =>
        view.dispatch({ changes: { from: start, to: end, insert: withText } }),
    };
    const search = createTextSearch(adapter);

    const handle: EditorHandle = {
      mode: "markdown",
      focus: () => view.focus(),
      undo: () => undo(view),
      redo: () => redo(view),
      cut: () => {
        const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
        void navigator.clipboard.writeText(sel);
        view.dispatch(view.state.replaceSelection(""));
      },
      copy: () => {
        const sel = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
        void navigator.clipboard.writeText(sel);
      },
      paste: async () => {
        try {
          const clip = await navigator.clipboard.readText();
          view.dispatch(view.state.replaceSelection(clip));
        } catch {
          /* denied */
        }
      },
      del: () => view.dispatch(view.state.replaceSelection("")),
      selectAll: () => view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }),
      getSelectionText: () =>
        view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to),
      clearFormatting: () => {},
      find: (s) => search.find(s),
      findNext: (s) => search.next(s),
      findPrev: (s) => search.prev(s),
      replaceCurrent: (s) => search.replaceCurrent(s),
      replaceAll: (s) => search.replaceAll(s),
      closeFind: () => view.focus(),
      gotoLine: (n) => {
        const line = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)));
        view.focus();
        view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
      },
      getExportHtml: () => renderToStaticMarkup(renderMd(view.state.doc.toString())),
    };
    setBridge(handle);
    caps({ mode: "markdown", canUndo: true, canRedo: true, hasSelection: false });
    const words0 = tab.content.trim().match(/\S+/g)?.length ?? 0;
    setCounts(tab.id, words0, tab.content.length);

    return () => {
      view.destroy();
      viewRef.current = null;
      setBridge(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  // React to word-wrap + direction setting changes via compartments.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapComp.current.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
    });
  }, [settings.wordWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: dirComp.current.reconfigure(
        EditorView.contentAttributes.of({
          dir: tab.direction === "auto" ? "auto" : dir,
          spellcheck: String(settings.spellCheck),
          lang: settings.spellLang,
        }),
      ),
    });
  }, [dir, tab.direction, settings.spellCheck, settings.spellLang]);

  // When the source pane re-appears (was display:none), CodeMirror needs to
  // re-measure or it renders blank/misaligned until the next interaction.
  useEffect(() => {
    if (tab.mdView !== "preview") viewRef.current?.requestMeasure();
  }, [tab.mdView]);

  function syncPreviewFromSource() {
    const view = viewRef.current;
    const prev = previewRef.current;
    if (!view || !prev || syncing.current) return;
    syncing.current = true;
    const sc = view.scrollDOM;
    const ratio = sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight);
    prev.scrollTop = ratio * (prev.scrollHeight - prev.clientHeight);
    requestAnimationFrame(() => (syncing.current = false));
  }

  const preview = useMemo(() => renderMd(text), [text]);

  const showSource = tab.mdView !== "preview";
  const showPreview = tab.mdView !== "source";

  return (
    <div className="nv-md" data-view={tab.mdView} dir={dir} style={{ ["--zoom" as string]: settings.zoom / 100 }}>
      {/* Host stays mounted (hidden when not shown) so the CodeMirror view is never
          detached — re-rendering it conditionally orphaned the editor (the source
          pane went blank after toggling Preview/Source/Split). */}
      <div ref={host} className="nv-md-source allow-select" dir="ltr" style={{ display: showSource ? undefined : "none" }} />
      {showSource && showPreview && <div className="nv-md-divider" />}
      {showPreview && (
        <div
          ref={previewRef}
          className="nv-md-preview"
          dir={tab.direction === "auto" ? "auto" : dir}
        >
          {preview}
        </div>
      )}
    </div>
  );
}

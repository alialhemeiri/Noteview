import { useStore } from "./state/store";
import { useUI } from "./state/ui";
import { bridge } from "./state/editorBridge";
import {
  openNewWindow,
  showOpenDialog,
  showSaveDialog,
  quitApp,
  openExternal,
  currentWindow,
} from "./lib/tauri";
import { printDocument, exportDocxFile } from "./lib/export";
import { resolveDirection } from "./lib/bidi";
import i18n from "./i18n";
import type { EditorMode, SaveFormat } from "./types";

const store = () => useStore.getState();
const ui = () => useUI.getState();
const active = () => store().activeTab();

function activeExportHtml(): { html: string; dir: string } | null {
  const t = active();
  if (!t) return null;
  const html = bridge.current?.getExportHtml() || store().exportString(t.id, "html");
  return { html, dir: resolveDirection(t.direction, t.content) };
}

/** Close a tab, prompting to save when it has unsaved changes. */
export async function requestCloseTab(id: string): Promise<boolean> {
  const tab = store().tabs.find((t) => t.id === id);
  if (!tab) return true;
  if (tab.dirty) {
    const choice = await ui().askUnsaved(tab.name);
    if (choice === "cancel") return false;
    if (choice === "save") {
      const saved = await store().saveTab(id);
      if (!saved) return false;
    }
  }
  store().closeTab(id);
  return true;
}

async function closeAllDirty(): Promise<boolean> {
  for (const tab of [...store().tabs]) {
    if (!tab.dirty) continue;
    const choice = await ui().askUnsaved(tab.name);
    if (choice === "cancel") return false;
    if (choice === "save") {
      const saved = await store().saveTab(tab.id);
      if (!saved) return false;
    }
  }
  return true;
}

export const cmd = {
  // ---- File ---------------------------------------------------------------
  newTab: () => store().newTab(),
  newWindow: () => void openNewWindow(),
  newMarkdownTab: () => store().newMarkdownTab(),
  open: async () => {
    const paths = await showOpenDialog();
    if (paths.length) await store().openPaths(paths);
  },
  openRecent: (path: string) => void store().openPaths([path]),
  save: () => {
    const t = active();
    if (t) void store().saveTab(t.id);
  },
  saveAs: (ext?: SaveFormat) => {
    const t = active();
    if (t) void store().saveTabAs(t.id, ext);
  },
  saveAll: () => void store().saveAll(),
  pageSetup: () => ui().openSettings(),
  print: async () => {
    const ex = activeExportHtml();
    if (ex) await printDocument(ex.html, store().pageSetup, ex.dir);
  },
  exportPdf: async () => {
    // Highest-fidelity, fully-offline PDF: the WebView print dialog offers
    // "Save as PDF" / "Microsoft Print to PDF", preserving fonts + vector math.
    const ex = activeExportHtml();
    if (!ex) return;
    ui().showToast(i18n.t("menu.exportPdf"));
    await printDocument(ex.html, store().pageSetup, ex.dir);
  },
  exportDocx: async () => {
    const t = active();
    if (!t) return;
    const base = t.name.replace(/\.[^.]+$/, "");
    const path = await showSaveDialog(`${base}.docx`, ["docx"]);
    if (!path) return;
    ui().showToast(i18n.t("export.exporting"));
    try {
      const ex = activeExportHtml();
      if (ex) await exportDocxFile(path, ex.html, t.name, ex.dir);
      ui().showToast(i18n.t("export.docxReady"));
    } catch (err) {
      console.error("docx export failed", err);
      ui().showToast(i18n.t("export.failed"));
    }
  },
  closeTab: () => {
    const t = active();
    if (t) void requestCloseTab(t.id);
  },
  closeWindow: async () => {
    if (await closeAllDirty()) await currentWindow().close();
  },
  exit: async () => {
    if (await closeAllDirty()) await quitApp();
  },

  // ---- Edit ---------------------------------------------------------------
  undo: () => bridge.current?.undo(),
  redo: () => bridge.current?.redo(),
  cut: () => bridge.current?.cut(),
  copy: () => bridge.current?.copy(),
  paste: () => bridge.current?.paste(),
  del: () => bridge.current?.del(),
  selectAll: () => bridge.current?.selectAll(),
  clearFormatting: () => bridge.current?.clearFormatting(),
  searchWeb: () => {
    const sel = bridge.current?.getSelectionText()?.trim();
    if (sel) void openExternal(`https://www.google.com/search?q=${encodeURIComponent(sel)}`);
  },
  find: () => ui().openFind(false),
  findNext: () => bridge.current?.findNext(ui().findState),
  findPrev: () => bridge.current?.findPrev(ui().findState),
  replace: () => ui().openFind(true),
  goto: () => ui().openGoto(),

  // ---- View ---------------------------------------------------------------
  zoomIn: () => {
    const z = Math.min(250, store().settings.zoom + 10);
    store().updateSettings({ zoom: z });
  },
  zoomOut: () => {
    const z = Math.max(50, store().settings.zoom - 10);
    store().updateSettings({ zoom: z });
  },
  zoomReset: () => store().updateSettings({ zoom: 100 }),
  toggleStatusBar: () => store().updateSettings({ showStatusBar: !store().settings.showStatusBar }),
  toggleWordWrap: () => store().updateSettings({ wordWrap: !store().settings.wordWrap }),

  // ---- misc ---------------------------------------------------------------
  openSettings: () => ui().openSettings(),
  setMode: (mode: EditorMode) => {
    const t = active();
    if (t) store().setMode(t.id, mode);
  },
};

export type CommandName = keyof typeof cmd;

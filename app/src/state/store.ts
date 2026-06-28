import { create } from "zustand";
import {
  DEFAULT_PAGE_SETUP,
  DEFAULT_SETTINGS,
  type EditorMode,
  type MarkdownView,
  type PageSetup,
  type RecentFile,
  type Settings,
  type Tab,
} from "../types";
import {
  basename,
  defaultModeForKind,
  kindForPath,
  kindForExt,
} from "../lib/files";
import {
  htmlToMd,
  htmlToText,
  mdToHtml,
  sanitizeHtml,
  textToHtml,
  unwrapHtmlDocument,
  wrapHtmlDocument,
} from "../lib/convert";
import { detectDirection } from "../lib/bidi";
import {
  readAppFile,
  readFile,
  showSaveDialog,
  writeAppFile,
  writeFile,
} from "../lib/tauri";

const uid = () => crypto.randomUUID();

interface SessionShape {
  tabs: Pick<
    Tab,
    | "id"
    | "path"
    | "name"
    | "kind"
    | "mode"
    | "content"
    | "direction"
    | "mdView"
    | "dirty"
    | "encoding"
    | "hadBom"
  >[];
  activeTabId: string | null;
}

/** True when a tab holds real content (used to keep an untitled tab dirty on
 *  restore — it has no on-disk source, so its content only lives in session). */
function tabHasContent(mode: EditorMode, content: string): boolean {
  if (mode === "rich") return content.replace(/<p>\s*<\/p>/gi, "").trim() !== "";
  return content.trim() !== "";
}

/** Parse an app-config JSON blob, falling back to defaults if it is missing or
 *  corrupt so one bad file can never block startup (F-05). */
function parseConfig<T>(raw: string | null, name: string, map: (parsed: unknown) => T, fallback: T): T {
  if (!raw) return fallback;
  try {
    return map(JSON.parse(raw));
  } catch (err) {
    console.error(`Malformed ${name}; falling back to defaults.`, err);
    return fallback;
  }
}

interface AppState {
  tabs: Tab[];
  activeTabId: string | null;
  settings: Settings;
  recent: RecentFile[];
  pageSetup: PageSetup;
  loaded: boolean;
  sessionPersist: boolean;

  // ---- lifecycle ----------------------------------------------------------
  init: (persistSession?: boolean) => Promise<void>;
  restoreSession: () => Promise<void>;

  // ---- tab management -----------------------------------------------------
  newTab: (mode?: EditorMode) => string;
  newMarkdownTab: () => string;
  openPaths: (paths: string[]) => Promise<void>;
  setActive: (id: string) => void;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  reorder: (from: number, to: number) => void;

  // ---- document mutation --------------------------------------------------
  updateContent: (id: string, content: string) => void;
  setCursor: (id: string, line: number, col: number) => void;
  setCounts: (id: string, words: number, chars: number) => void;
  setMode: (id: string, mode: EditorMode) => void;
  setMdView: (id: string, view: MarkdownView) => void;

  // ---- persistence --------------------------------------------------------
  saveTab: (id: string) => Promise<boolean>;
  saveTabAs: (id: string, ext?: string) => Promise<boolean>;
  saveAll: () => Promise<void>;

  // ---- settings / recent --------------------------------------------------
  updateSettings: (patch: Partial<Settings>) => void;
  setPageSetup: (patch: Partial<PageSetup>) => void;
  addRecent: (path: string) => void;
  removeRecent: (path: string) => void;
  clearRecent: () => void;

  // ---- derived helpers ----------------------------------------------------
  activeTab: () => Tab | undefined;
  exportString: (id: string, ext: string) => string;
}

function nextUntitled(tabs: Tab[]): string {
  const used = new Set(
    tabs
      .filter((t) => t.path === null)
      .map((t) => /^Untitled(?: (\d+))?$/.exec(t.name)?.[1] ?? "1"),
  );
  let n = 1;
  while (used.has(String(n))) n += 1;
  return n === 1 ? "Untitled" : `Untitled ${n}`;
}

function blankTab(mode: EditorMode, name: string): Tab {
  return {
    id: uid(),
    path: null,
    name,
    kind: mode === "markdown" ? "markdown" : "text",
    mode,
    content: mode === "rich" ? "<p></p>" : "",
    dirty: false,
    encoding: "UTF-8",
    hadBom: false,
    direction: "auto",
    mdView: "split",
    cursor: { line: 1, col: 1 },
    counts: { words: 0, chars: 0 },
  };
}

// --- debounced session persistence -----------------------------------------
let sessionTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSessionSave(get: () => AppState) {
  if (!get().sessionPersist) return; // only the main window owns the session file
  if (sessionTimer) clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    const { tabs, activeTabId } = get();
    const session: SessionShape = {
      activeTabId,
      tabs: tabs.map((t) => ({
        id: t.id,
        path: t.path,
        name: t.name,
        kind: t.kind,
        mode: t.mode,
        content: t.content,
        direction: t.direction,
        mdView: t.mdView,
        dirty: t.dirty,
        encoding: t.encoding,
        hadBom: t.hadBom,
      })),
    };
    void writeAppFile("session.json", JSON.stringify(session));
  }, 700);
}

export const useStore = create<AppState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  settings: DEFAULT_SETTINGS,
  recent: [],
  pageSetup: DEFAULT_PAGE_SETUP,
  loaded: false,
  sessionPersist: true,

  init: async (persistSession = true) => {
    const [settingsRaw, recentRaw, pageRaw] = await Promise.all([
      readAppFile("settings.json"),
      readAppFile("recent.json"),
      readAppFile("page.json"),
    ]);
    const settings: Settings = parseConfig(
      settingsRaw,
      "settings.json",
      (p) => ({ ...DEFAULT_SETTINGS, ...(p as Partial<Settings>) }),
      DEFAULT_SETTINGS,
    );
    const recent: RecentFile[] = parseConfig(
      recentRaw,
      "recent.json",
      (p) => p as RecentFile[],
      [],
    );
    const pageSetup: PageSetup = parseConfig(
      pageRaw,
      "page.json",
      (p) => ({ ...DEFAULT_PAGE_SETUP, ...(p as Partial<PageSetup>) }),
      DEFAULT_PAGE_SETUP,
    );
    set({ settings, recent, pageSetup, sessionPersist: persistSession, loaded: true });
  },

  restoreSession: async () => {
    const raw = await readAppFile("session.json");
    if (!raw) return;
    try {
      const session = JSON.parse(raw) as SessionShape;
      if (!session.tabs?.length) return;
      const tabs: Tab[] = session.tabs.map((s) => ({
        // Reuse the persisted id (older sessions lack one) so the saved active
        // tab can be matched back below, and so dirty restored tabs keep a
        // stable identity for close prompts.
        id: s.id ?? uid(),
        path: s.path,
        name: s.name,
        kind: s.kind,
        mode: s.mode,
        content: s.content,
        // Restore the dirty flag so unsaved edits still prompt on close. An
        // untitled tab (no path) with content has no on-disk source, so it must
        // come back dirty even if the flag was somehow not captured. (F-01)
        dirty: (s.dirty ?? false) || (s.path === null && tabHasContent(s.mode, s.content)),
        encoding: s.encoding ?? "UTF-8",
        hadBom: s.hadBom ?? false,
        direction: "auto", // always per-paragraph auto now
        mdView: s.mdView,
        cursor: { line: 1, col: 1 },
        counts: { words: 0, chars: 0 },
      }));
      // Reactivate the persisted active tab; fall back to the last tab only when
      // it no longer matches (e.g. an older session without ids). (F-04)
      const restoredActive = session.activeTabId
        ? tabs.find((t) => t.id === session.activeTabId)?.id
        : undefined;
      set({ tabs, activeTabId: restoredActive ?? tabs[tabs.length - 1].id });
    } catch {
      /* corrupt session — ignore */
    }
  },

  newTab: (mode) => {
    const m = mode ?? get().settings.defaultMode;
    const tab = blankTab(m, nextUntitled(get().tabs));
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    scheduleSessionSave(get);
    return tab.id;
  },

  newMarkdownTab: () => {
    const tab = blankTab("markdown", nextUntitled(get().tabs));
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    scheduleSessionSave(get);
    return tab.id;
  },

  openPaths: async (paths) => {
    for (const path of paths) {
      if (!path) continue;
      const existing = get().tabs.find((t) => t.path === path);
      if (existing) {
        set({ activeTabId: existing.id });
        continue;
      }
      try {
        const payload = await readFile(path);
        const kind = kindForPath(path);
        const mode = defaultModeForKind(kind, get().settings);
        let content = payload.content;
        // Direction is always per-paragraph auto (unicode-bidi: plaintext) — each
        // paragraph self-detects LTR/RTL — so there's no saved dir to honour.
        const direction: Tab["direction"] = "auto";
        if (kind === "html") {
          content = sanitizeHtml(unwrapHtmlDocument(payload.content));
        } else if (mode === "rich") {
          content = textToHtml(payload.content);
        }
        const tab: Tab = {
          id: uid(),
          path,
          name: basename(path),
          kind,
          mode,
          content,
          dirty: false,
          encoding: payload.encoding,
          hadBom: payload.had_bom,
          direction,
          mdView: "split",
          cursor: { line: 1, col: 1 },
          counts: { words: 0, chars: 0 },
        };
        set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
        get().addRecent(path);
      } catch (err) {
        console.error("Failed to open", path, err);
      }
    }
    scheduleSessionSave(get);
  },

  setActive: (id) => {
    set({ activeTabId: id });
    scheduleSessionSave(get);
  },

  closeTab: (id) => {
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id);
      if (idx < 0) return s;
      const tabs = s.tabs.filter((t) => t.id !== id);
      let activeTabId = s.activeTabId;
      if (s.activeTabId === id) {
        activeTabId = tabs.length ? tabs[Math.min(idx, tabs.length - 1)].id : null;
      }
      return { tabs, activeTabId };
    });
    scheduleSessionSave(get);
  },

  closeOthers: (id) => {
    set((s) => ({ tabs: s.tabs.filter((t) => t.id === id), activeTabId: id }));
    scheduleSessionSave(get);
  },

  reorder: (from, to) => {
    set((s) => {
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { tabs };
    });
    scheduleSessionSave(get);
  },

  updateContent: (id, content) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content, dirty: true } : t,
      ),
    }));
    scheduleSessionSave(get);
  },

  setCursor: (id, line, col) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, cursor: { line, col } } : t)),
    })),

  setCounts: (id, words, chars) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, counts: { words, chars } } : t)),
    })),

  setMode: (id, mode) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id || t.mode === mode) return t;
        // convert content between native representations
        let content = t.content;
        const from = t.mode;
        if (from === "markdown" && mode === "rich") content = mdToHtml(t.content);
        else if (from === "rich" && mode === "markdown") content = htmlToMd(t.content);
        else if (from === "plain" && mode === "rich") content = textToHtml(t.content);
        else if (from === "rich" && mode === "plain") content = htmlToText(t.content);
        else if (from === "markdown" && mode === "plain") content = t.content;
        else if (from === "plain" && mode === "markdown") content = t.content;
        return { ...t, mode, content, dirty: true };
      }),
    }));
    scheduleSessionSave(get);
  },

  setMdView: (id, view) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, mdView: view } : t)),
    }));
    scheduleSessionSave(get);
  },

  exportString: (id, ext) => {
    const t = get().tabs.find((x) => x.id === id);
    if (!t) return "";
    const kind = kindForExt(ext);
    if (kind === "markdown") {
      if (t.mode === "rich") return htmlToMd(t.content);
      if (t.mode === "plain") return t.content;
      return t.content; // markdown
    }
    if (kind === "html") {
      const dir = t.direction === "auto" ? detectDirection(t.content) : t.direction;
      let body = t.content;
      if (t.mode === "markdown") body = mdToHtml(t.content);
      else if (t.mode === "plain") body = textToHtml(t.content);
      return wrapHtmlDocument(body, t.name, dir);
    }
    // text
    if (t.mode === "rich") return htmlToText(t.content);
    return t.content;
  },

  saveTab: async (id) => {
    const t = get().tabs.find((x) => x.id === id);
    if (!t) return false;
    if (!t.path) return get().saveTabAs(id);
    const ext = t.name.includes(".") ? t.name.split(".").pop()! : "txt";
    const data = get().exportString(id, ext);
    try {
      await writeFile(t.path, data, t.hadBom);
      set((s) => ({ tabs: s.tabs.map((x) => (x.id === id ? { ...x, dirty: false } : x)) }));
      get().addRecent(t.path);
      return true;
    } catch (err) {
      console.error("Save failed", err);
      return false;
    }
  },

  saveTabAs: async (id, ext) => {
    const t = get().tabs.find((x) => x.id === id);
    if (!t) return false;
    // When the caller doesn't force a specific extension, honour the user's
    // configured default save format (F-06), falling back to the per-kind
    // default only if the setting is somehow missing.
    const perKind = t.kind === "markdown" ? "md" : t.kind === "html" ? "html" : "txt";
    const targetExt = ext ?? get().settings.defaultSaveFormat ?? perKind;
    const base = t.name.replace(/\.[^.]+$/, "");
    const path = await showSaveDialog(`${base}.${targetExt}`, [targetExt]);
    if (!path) return false;
    const data = get().exportString(id, targetExt);
    try {
      await writeFile(path, data, t.hadBom);
      const kind = kindForPath(path);
      set((s) => ({
        tabs: s.tabs.map((x) =>
          x.id === id ? { ...x, path, name: basename(path), kind, dirty: false } : x,
        ),
      }));
      get().addRecent(path);
      scheduleSessionSave(get);
      return true;
    } catch (err) {
      console.error("Save As failed", err);
      return false;
    }
  },

  saveAll: async () => {
    for (const t of get().tabs) {
      if (t.dirty) await get().saveTab(t.id);
    }
  },

  updateSettings: (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    void writeAppFile("settings.json", JSON.stringify(get().settings));
  },

  setPageSetup: (patch) => {
    set((s) => ({ pageSetup: { ...s.pageSetup, ...patch } }));
    void writeAppFile("page.json", JSON.stringify(get().pageSetup));
  },

  addRecent: (path) => {
    set((s) => {
      const filtered = s.recent.filter((r) => r.path !== path);
      const recent = [{ path, name: basename(path), at: Date.now() }, ...filtered].slice(0, 12);
      return { recent };
    });
    void writeAppFile("recent.json", JSON.stringify(get().recent));
  },

  removeRecent: (path) => {
    set((s) => ({ recent: s.recent.filter((r) => r.path !== path) }));
    void writeAppFile("recent.json", JSON.stringify(get().recent));
  },

  clearRecent: () => {
    set({ recent: [] });
    void writeAppFile("recent.json", JSON.stringify([]));
  },

  activeTab: () => {
    const { tabs, activeTabId } = get();
    return tabs.find((t) => t.id === activeTabId);
  },
}));

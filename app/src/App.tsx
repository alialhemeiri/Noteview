import { useEffect, useReducer } from "react";
import { useStore } from "./state/store";
import i18n, { isRTLLanguage } from "./i18n";
import { takeStartupFiles, onOpenFiles, setWindowTitle, currentWindow } from "./lib/tauri";
import { cmd } from "./commands";
import type { ThemeChoice } from "./types";

import MenuBar from "./components/MenuBar";
import TabBar from "./components/TabBar";
import Toolbar from "./components/Toolbar";
import EditorHost from "./components/EditorHost";
import StatusBar from "./components/StatusBar";
import FindReplace from "./components/FindReplace";
import GoTo from "./components/GoTo";
import Settings from "./components/Settings";
import ConfirmModal from "./components/ConfirmModal";
import Toast from "./components/Toast";

function applyTheme(theme: ThemeChoice) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const theme = useStore((s) => s.settings.theme);
  const language = useStore((s) => s.settings.language);
  const showStatusBar = useStore((s) => s.settings.showStatusBar);
  const tab = useStore((s) => s.activeTab());
  const [, forceI18n] = useReducer((x: number) => x + 1, 0);

  // Re-render the whole tree when the i18n language changes, so labels switch
  // reliably even when the language is restored from settings on first paint.
  useEffect(() => {
    const onLang = () => forceI18n();
    i18n.on("languageChanged", onLang);
    return () => {
      i18n.off("languageChanged", onLang);
    };
  }, []);

  // ---- one-time bootstrap -------------------------------------------------
  useEffect(() => {
    void (async () => {
      const store = useStore.getState();
      const isMain = currentWindow().label === "main";
      await store.init(isMain);
      // Language is applied reactively by the language effect below (it reads the
      // freshly-loaded `language` from the store). Doing it here off the captured
      // pre-init snapshot would re-apply the stale default and override it.
      // Only the main window restores the previous session; extra windows start fresh.
      if (isMain) await store.restoreSession();
      const startup = await takeStartupFiles();
      if (startup.length) await store.openPaths(startup);
      if (!useStore.getState().tabs.length) store.newTab();
    })();
  }, []);

  // ---- single-instance: a second launch routes files into this window -----
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onOpenFiles((paths) => {
      if (paths.length) void useStore.getState().openPaths(paths);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  // ---- theme (re-applies on system change while in "system") --------------
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  // ---- app language + chrome direction ------------------------------------
  useEffect(() => {
    void i18n.changeLanguage(language);
    document.documentElement.lang = language;
    document.documentElement.dir = isRTLLanguage(language) ? "rtl" : "ltr";
  }, [language]);

  // ---- window title reflects the active document --------------------------
  useEffect(() => {
    const title = tab ? `${tab.dirty ? "• " : ""}${tab.name} — Noteview` : "Noteview";
    void setWindowTitle(title);
  }, [tab?.name, tab?.dirty, tab]);

  // ---- global keyboard accelerators ---------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();

      if (k === "f3") {
        e.preventDefault();
        e.shiftKey ? cmd.findPrev() : cmd.findNext();
        return;
      }
      if (!ctrl) return;

      if (e.shiftKey && !e.altKey) {
        const map: Record<string, () => void> = {
          n: cmd.newWindow,
          m: cmd.newMarkdownTab,
          s: () => cmd.saveAs(),
          w: () => void cmd.closeWindow(),
        };
        if (map[k]) {
          e.preventDefault();
          map[k]();
        }
        return;
      }
      if (e.altKey) {
        if (k === "s") {
          e.preventDefault();
          cmd.saveAll();
        }
        return;
      }
      // plain Ctrl/Cmd combos
      const map: Record<string, () => void> = {
        n: cmd.newTab,
        o: () => void cmd.open(),
        s: cmd.save,
        p: () => void cmd.print(),
        w: cmd.closeTab,
        f: cmd.find,
        h: cmd.replace,
        g: cmd.goto,
        "=": cmd.zoomIn,
        "+": cmd.zoomIn,
        "-": cmd.zoomOut,
        "0": cmd.zoomReset,
      };
      if (map[k]) {
        e.preventDefault();
        map[k]();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!loaded) {
    return (
      <div className="nv-splash">
        <div className="nv-splash-mark">Noteview</div>
      </div>
    );
  }

  return (
    <div className="nv-app">
      <MenuBar />
      <TabBar />
      {tab && <Toolbar tab={tab} />}
      <div className="nv-editor-area">
        <FindReplace />
        <EditorHost />
      </div>
      {showStatusBar && <StatusBar />}
      <Settings />
      <GoTo />
      <ConfirmModal />
      <Toast />
    </div>
  );
}

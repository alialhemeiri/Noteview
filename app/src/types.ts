// ============================================================================
// Core domain types. No `any` allowed in this module.
// ============================================================================

export type EditorMode = "rich" | "markdown" | "plain";
export type Direction = "ltr" | "rtl" | "auto";
export type MarkdownView = "source" | "preview" | "split";
export type ThemeChoice = "light" | "dark" | "system";
export type SaveFormat = "md" | "html" | "txt";
export type Language = "en" | "ar";

/** A file type Noteview understands, derived from a path's extension. */
export type FileKind = "markdown" | "html" | "text";

export interface CursorInfo {
  line: number;
  col: number;
}

export interface DocCounts {
  words: number;
  chars: number;
}

/** One open document = one tab. The `content` string is the *native*
 *  representation for the tab's current mode:
 *   - rich     → serialized HTML (TipTap)
 *   - markdown → Markdown source
 *   - plain    → raw text                                                    */
export interface Tab {
  id: string;
  path: string | null;
  name: string;
  kind: FileKind;
  mode: EditorMode;
  content: string;
  dirty: boolean;
  encoding: string;
  hadBom: boolean;
  direction: Direction;
  mdView: MarkdownView;
  cursor: CursorInfo;
  counts: DocCounts;
}

export interface RecentFile {
  path: string;
  name: string;
  at: number;
}

export interface Settings {
  theme: ThemeChoice;
  language: Language;
  defaultMode: EditorMode; // mode used for File ▸ New tab
  defaultFont: string;
  defaultFontSize: number;
  wordWrap: boolean;
  defaultSaveFormat: SaveFormat;
  spellCheck: boolean;
  spellLang: string;
  autocorrect: boolean;
  showStatusBar: boolean;
  zoom: number; // percentage, 100 = default
}

/** Page-setup options that feed Print + PDF export. */
export interface PageSetup {
  paper: "A4" | "Letter" | "Legal" | "A5";
  orientation: "portrait" | "landscape";
  marginMm: number;
}

/** Shape returned by the Rust `read_file` command. */
export interface FilePayload {
  path: string;
  content: string;
  encoding: string;
  had_bom: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  language: "en",
  defaultMode: "rich",
  defaultFont: "Inter",
  defaultFontSize: 16,
  wordWrap: true,
  defaultSaveFormat: "md",
  spellCheck: true,
  spellLang: "en-US",
  autocorrect: false,
  showStatusBar: true,
  zoom: 100,
};

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paper: "A4",
  orientation: "portrait",
  marginMm: 18,
};

import { create } from "zustand";
import type { EditorMode } from "../types";

export interface FindState {
  query: string;
  replacement: string;
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export const EMPTY_FIND: FindState = {
  query: "",
  replacement: "",
  matchCase: false,
  wholeWord: false,
  regex: false,
};

/** Imperative command surface the active editor exposes to the menu bar. */
export interface EditorHandle {
  mode: EditorMode;
  focus: () => void;
  undo: () => void;
  redo: () => void;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  del: () => void;
  selectAll: () => void;
  getSelectionText: () => string;
  clearFormatting: () => void;
  find: (state: FindState) => number;
  findNext: (state: FindState) => void;
  findPrev: (state: FindState) => void;
  replaceCurrent: (state: FindState) => void;
  replaceAll: (state: FindState) => number;
  closeFind: () => void;
  gotoLine: (line: number) => void;
  /** Serialized HTML of the document, used for PDF / docx export & print. */
  getExportHtml: () => string;
}

/** Module singleton holding the *current* active editor's imperative handle. */
export const bridge: { current: EditorHandle | null } = { current: null };

export function setBridge(handle: EditorHandle | null) {
  bridge.current = handle;
}

// Reactive capabilities that drive menu/toolbar enable-disable state.
interface EditorCaps {
  mode: EditorMode | null;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  set: (patch: Partial<Omit<EditorCaps, "set">>) => void;
}

export const useEditorCaps = create<EditorCaps>((set) => ({
  mode: null,
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  set: (patch) => set(patch),
}));

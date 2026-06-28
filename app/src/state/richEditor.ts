import { create } from "zustand";
import type { Editor } from "@tiptap/react";

// Holds the *active* tab's TipTap instance so the toolbar (a sibling of the
// editor in the tree) can drive formatting commands and reflect active marks.
interface RichEditorStore {
  editor: Editor | null;
  setEditor: (editor: Editor | null) => void;
}

export const useRichEditor = create<RichEditorStore>((set) => ({
  editor: null,
  setEditor: (editor) => set({ editor }),
}));

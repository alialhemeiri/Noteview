import { create } from "zustand";
import { EMPTY_FIND, type FindState } from "./editorBridge";

export type ConfirmChoice = "save" | "dont" | "cancel";

interface ConfirmRequest {
  name: string;
  resolve: (choice: ConfirmChoice) => void;
}

interface UIState {
  settingsOpen: boolean;
  findOpen: boolean;
  findReplaceMode: boolean;
  gotoOpen: boolean;
  confirm: ConfirmRequest | null;
  toast: string | null;
  findState: FindState;

  setFindState: (patch: Partial<FindState>) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openFind: (replace: boolean) => void;
  closeFind: () => void;
  openGoto: () => void;
  closeGoto: () => void;
  askUnsaved: (name: string) => Promise<ConfirmChoice>;
  resolveConfirm: (choice: ConfirmChoice) => void;
  showToast: (msg: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useUI = create<UIState>((set, get) => ({
  settingsOpen: false,
  findOpen: false,
  findReplaceMode: false,
  gotoOpen: false,
  confirm: null,
  toast: null,
  findState: EMPTY_FIND,

  setFindState: (patch) => set((s) => ({ findState: { ...s.findState, ...patch } })),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openFind: (replace) => set({ findOpen: true, findReplaceMode: replace }),
  closeFind: () => set({ findOpen: false }),
  openGoto: () => set({ gotoOpen: true }),
  closeGoto: () => set({ gotoOpen: false }),

  askUnsaved: (name) =>
    new Promise<ConfirmChoice>((resolve) => {
      set({ confirm: { name, resolve } });
    }),
  resolveConfirm: (choice) => {
    const c = get().confirm;
    if (c) c.resolve(choice);
    set({ confirm: null });
  },

  showToast: (msg) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
  },
}));

// Thin, typed wrappers around the Rust commands + Tauri plugins. Every call the
// frontend makes into the backend goes through here so the surface stays small.

import { invoke } from "@tauri-apps/api/core";
import { open as openDialogRaw, save as saveDialogRaw } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { FilePayload } from "../types";
import { OPEN_FILTERS } from "./files";

export async function readFile(path: string): Promise<FilePayload> {
  return invoke<FilePayload>("read_file", { path });
}

export async function writeFile(path: string, content: string, bom: boolean): Promise<void> {
  await invoke("write_file", { path, content, bom });
}

export async function writeBytes(path: string, base64Data: string): Promise<void> {
  await invoke("write_bytes", { path, base64Data });
}

export async function readAppFile(name: string): Promise<string | null> {
  return invoke<string | null>("read_app_file", { name });
}

export async function writeAppFile(name: string, content: string): Promise<void> {
  await invoke("write_app_file", { name, content });
}

export async function takeStartupFiles(): Promise<string[]> {
  return invoke<string[]>("take_startup_files");
}

export async function openNewWindow(): Promise<void> {
  await invoke("open_new_window");
}

const ALLOWED_EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** UI-layer mirror of the Rust `open_external` allowlist (F-03): only http(s)
 *  and mailto links are safe to hand to the OS opener. Rejects javascript:,
 *  file:, relative, and any other scheme. */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    return ALLOWED_EXTERNAL_SCHEMES.has(new URL(url).protocol.toLowerCase());
  } catch {
    return false;
  }
}

export async function openExternal(url: string): Promise<void> {
  await invoke("open_external", { url });
}

export async function quitApp(): Promise<void> {
  await invoke("quit_app");
}

/** Native open dialog. Returns selected absolute paths (possibly several). */
export async function showOpenDialog(): Promise<string[]> {
  const result = await openDialogRaw({ multiple: true, filters: OPEN_FILTERS });
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

/** Native save dialog. `extensions` restricts the type; returns chosen path. */
export async function showSaveDialog(
  defaultName: string,
  extensions: string[],
): Promise<string | null> {
  return saveDialogRaw({
    defaultPath: defaultName,
    filters: [{ name: extensions[0].toUpperCase(), extensions }],
  });
}

/** Subscribe to file-open requests routed from a second launch (single-instance). */
export function onOpenFiles(cb: (paths: string[]) => void): Promise<UnlistenFn> {
  return listen<string[]>("open-files", (event) => cb(event.payload ?? []));
}

export async function setWindowTitle(title: string): Promise<void> {
  try {
    await getCurrentWindow().setTitle(title);
  } catch {
    /* non-main windows or race during teardown — ignore */
  }
}

export function currentWindow() {
  return getCurrentWindow();
}

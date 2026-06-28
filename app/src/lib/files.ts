import type { EditorMode, FileKind, Settings } from "../types";

/** Extract the file name (with extension) from a Windows or POSIX path. */
export function basename(path: string): string {
  const norm = path.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm;
}

export function extOf(path: string): string {
  const name = basename(path);
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function kindForExt(ext: string): FileKind {
  if (ext === "md" || ext === "markdown" || ext === "mdown" || ext === "mkd") return "markdown";
  if (ext === "html" || ext === "htm") return "html";
  return "text";
}

export function kindForPath(path: string): FileKind {
  return kindForExt(extOf(path));
}

/** The editor mode a freshly-opened file of this kind should use. */
export function defaultModeForKind(kind: FileKind, settings: Settings): EditorMode {
  switch (kind) {
    case "markdown":
      return "markdown";
    case "html":
      return "rich";
    case "text":
      return settings.defaultMode; // "plain" | "rich"
  }
}

/** Filters for the native open/save dialogs. */
export const OPEN_FILTERS = [
  { name: "All supported", extensions: ["md", "markdown", "txt", "html", "htm"] },
  { name: "Markdown", extensions: ["md", "markdown", "mdown", "mkd"] },
  { name: "Text", extensions: ["txt"] },
  { name: "HTML", extensions: ["html", "htm"] },
  { name: "All files", extensions: ["*"] },
];

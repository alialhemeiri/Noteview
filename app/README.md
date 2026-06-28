# Noteview

A lightweight, modern, **Markdown‑first replacement for Windows Notepad**. Noteview
makes `.md`, `.txt` and `.html` files genuinely readable and editable — with
Word‑like rich‑text formatting, live Markdown preview, rendered LaTeX math,
GFM tables, code highlighting, custom fonts/colours, and first‑class Arabic /
RTL support. It runs fully offline.

Built with **Tauri 2 (Rust + system WebView2)** and **React + TypeScript + Vite**,
so the installed footprint is a few megabytes — not the hundreds an Electron app
would cost.

---

## Features

- **Notepad parity, modernised** — multi‑tab + multi‑window (single process),
  New / Open / Save / Save As / Save All, recent files, Find & Replace
  (case / whole‑word / regex), Find next/previous, Go to line, word wrap,
  text zoom, Print & Page setup, a toggleable status bar, UTF‑8 with a
  BOM‑safe reader, and unsaved‑changes prompts.
- **Rich‑text mode (WYSIWYG)** — font family/size, bold/italic/underline/
  strikethrough, text + highlight colour, alignment, bullet/numbered/task
  lists, headings, blockquotes, code blocks, tables (insert / add‑remove
  rows & columns / merge / split), clear formatting, and editable inline +
  block **LaTeX** (double‑click a formula to edit its source).
- **Markdown mode** — CodeMirror 6 source with syntax highlighting beside a
  live preview (GFM tables, `$…$`/`$$…$$` math, fenced code highlighting,
  task lists, links, images), with **source / preview / split** toggles and
  scroll‑sync.
- **One LaTeX engine (KaTeX)** shared by rich mode and the Markdown preview,
  so math looks identical in both. Invalid LaTeX shows an inline error rather
  than crashing the editor.
- **Arabic / RTL, first‑class** — automatic per‑paragraph text direction (each
  paragraph self‑detects LTR/RTL from its content), correct bidi handling of
  mixed Arabic + English + numbers + LaTeX, and identical behaviour across rich
  mode, Markdown source and preview.
- **Full localisation** — every UI string is translated (English + Arabic
  included). Switching the app language to Arabic flips the **entire UI to
  RTL** live, independent of the open document's direction. More languages
  drop in as JSON files under `src/i18n/`.
- **Designed light & dark themes**, a custom app icon, and persistent
  settings + window/tab session.
- **Export** — `.docx` (best‑effort) and `.pdf` (via the high‑fidelity
  WebView print path, which preserves fonts and vector math).

---

## Run from source

```bash
npm install
npm run tauri dev
```

`npm run tauri dev` starts Vite and launches the desktop app.

### Prerequisites

- **Node.js** 18+ and npm
- **Rust** (stable) via [rustup]
- **Microsoft Visual C++ Build Tools** (the "Desktop development with C++"
  workload) — the MSVC toolchain Rust links against on Windows
- **WebView2 runtime** — present on Windows 11; the installer also bundles the
  bootstrapper for clean machines

[rustup]: https://rustup.rs

---

## Build the installer

```bash
npm run tauri build
```

This produces, under `src-tauri/target/release/bundle/`:

- `msi/Noteview_0.1.0_x64_en-US.msi` — WiX MSI installer
- `nsis/Noteview_0.1.0_x64-setup.exe` — NSIS installer

Both register Noteview as a handler for `.md`, `.markdown`, `.txt`, `.html`
and `.htm`, and bundle the WebView2 bootstrapper so the app runs on a clean
machine.

---

## Make Noteview the default for Markdown files

After installing:

1. Right‑click any `.md` file in Explorer → **Open with → Choose another app**.
2. Pick **Noteview** and tick **Always use this app to open .md files**.

(Or **Settings → Apps → Default apps → Choose defaults by file type**.)

Double‑clicking a `.md` file then opens it in Noteview. Because Noteview runs
as a **single instance**, opening a second file while it's already running adds
the file as a **new tab** in the existing window and focuses it — it does not
spawn a second process.

---

## File formats

| Extension | Opens as | Notes |
| --- | --- | --- |
| `.md`, `.markdown` | Markdown mode | Markdown is the source of truth |
| `.txt` | Plain (or rich, per Settings) | |
| `.html`, `.htm` | Rich mode | **Lossless native rich format** |

**The rich‑document format is `.html`.** TipTap serialises cleanly to and from
HTML, so saving a rich document as `.html` preserves custom fonts, colours,
highlights, tables, alignment and LaTeX, and reopening restores them exactly.
You can also save any document as `.md` or `.txt`, and export to `.docx` / `.pdf`.

All reads and writes are UTF‑8.

---

## Known limitations

- **`.docx` export is best‑effort.** Headings, bold/italic, lists, tables,
  links and images convert well; LaTeX is exported as its source text (Word
  has no KaTeX). For pixel‑perfect math output, use **PDF** (Print → *Save as
  PDF* / *Microsoft Print to PDF*), which preserves vector math and fonts.
- **PDF export uses the system print dialog** rather than writing a file
  silently — this gives the highest fidelity and stays fully offline.
- **Markdown → rich conversion** maps `$…$` math to literal text (you can
  re‑insert it as a math node); rich math and Markdown‑preview math are fully
  rendered.
- The colour palette is intentionally a neutral, brand‑agnostic editor theme
  and is easy to re‑theme via the CSS tokens in `src/styles/tokens.css`.
- The installer bundles the lightweight **WebView2 bootstrapper** (keeping the
  installer ~8 MB). On a machine that doesn't already have the WebView2 runtime,
  first install fetches it from Microsoft, so first‑time install needs an
  internet connection. WebView2 ships with Windows 11 and current Windows 10,
  so this only affects older/air‑gapped machines. To make installation fully
  offline too, set `bundle.windows.webviewInstallMode` to `offlineInstaller`
  in `src-tauri/tauri.conf.json` (adds ~130 MB). The app itself runs fully
  offline once installed.

---

## Architecture

- **Rust backend** (`src-tauri/`) — window/lifecycle, native dialogs, narrow
  file‑I/O commands (BOM‑safe read, UTF‑8 + binary write), recent/session/
  settings persistence, single‑instance + CLI file‑path handling, and
  multi‑window creation, all behind least‑privilege Tauri v2 capabilities.
- **Frontend** (`src/`) — a Zustand store owns tabs/settings/recent; an editor
  host swaps between rich (TipTap), Markdown (CodeMirror + react‑markdown) and
  plain editors; a themed custom menu bar, toolbar, find/replace, settings and
  status bar sit around it; i18next drives localisation.

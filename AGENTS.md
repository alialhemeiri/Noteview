# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

(Ali's user-level AGENTS.md — profile and global rules — still applies and is not repeated here.)

## What this is

**Noteview** — a native Windows Notepad replacement: Tauri 2 (Rust backend + system
WebView2) + React/TypeScript/Vite. It edits/renders Markdown, LaTeX (KaTeX), tables,
and rich text, with first-class Arabic/RTL and English↔Arabic UI localisation. Runs
fully offline.

## Repository, license & committing (READ BEFORE ANY `git`/`gh`)

This is a **public** GitHub repo — `alialhemeiri/Noteview`, licensed **GPL-3.0** (© 2026 Ali Al
Hemeiri; see `LICENSE`). Use the `gh` CLI for all GitHub ops on Ali's personal account
**`alialhemeiri`** — make it the active account before pushing (the other authed account is
`aperion-ae`; the account was renamed from `wuhever`, so `gh`/keyring may still label it
`wuhever` locally until a `gh auth refresh` — the token still works, matched by user id 64372242).
The repo's local git identity is **Ali Al Hemeiri** with a GitHub **no-reply** email — never
commit under the personal Gmail. Commits are authored **solely by Ali Al Hemeiri** — do **not**
add `Co-Authored-By` trailers or otherwise credit Claude / Codex as an author or contributor.

**Commit only verified work.** Run the gate first: `npx tsc --noEmit` (in `app/`) **and**
`cargo check` (in `app/src-tauri/`) must pass. Prefer the release script (`scripts/release.ps1`),
which re-runs the gate, bumps the SemVer version in lockstep across `app/package.json`,
`app/src-tauri/Cargo.toml`, and `app/src-tauri/tauri.conf.json`, commits, tags `vX.Y.Z`, and
pushes. CI (`.github/workflows/ci.yml`) re-checks every push.

**NEVER commit (already in `.gitignore` — do not un-ignore):**
- Tool/agent files: `.agents/`, `.claude/`, `.codex/`, `skills-lock.json`
- Internal docs: `handoffs/`, `audits/` (work logs + audit reports — kept local only)
- Build output & deps: `node_modules/`, `app/dist/`, `app/src-tauri/target/`,
  `app/src-tauri/gen/schemas/`, and the generated `Noteview.exe` / `Noteview-Setup.exe` / `*.msi`
- Secrets of any kind: `.env*`, `*.pem` / `*.key`, tokens/API keys, MCP server configs

**Never bake into committed files:** secrets or tokens; the personal email
(`an.alhemeiri@gmail.com`); hardcoded home paths (`C:\Users\analh\…`) — scripts must use
relative / `env`-derived paths. If a new file might hold a secret, gitignore it *before* committing.

**Respect GPL-3.0:** keep `LICENSE` and the copyright/attribution to **Ali Al Hemeiri** intact —
that is the credit the license enforces. GPL-3.0 is copyleft: don't relicense, and don't add
runtime dependencies whose licenses are GPL-incompatible (e.g. proprietary) to the shipped app.

## Commands

The npm project lives in **`app/`** — run everything from there.

```bash
cd app
npm install
npm run tauri dev      # Vite + Rust, launches the desktop window (needs %USERPROFILE%\.cargo\bin on PATH)
npm run build          # the verification gate: `tsc && vite build` (strict TS, noUnusedLocals/Parameters)
npx tsc --noEmit       # type-check only (fast; run this after edits — must be clean, no `any` in core)
npm run tauri build    # release MSI + NSIS → app/src-tauri/target/release/bundle/
```

There is **no test runner and no linter** configured — don't invent `npm test`/`npm run
lint`. Correctness is gated by `tsc` plus manual runtime checks. To inspect the running
app, launch with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223`
and drive it over CDP (Node has global `WebSocket`/`fetch`; the page URL is
`tauri.localhost` in release, `localhost:1420` in dev). After a release build, refresh
the root launcher: `Copy-Item app\src-tauri\target\release\noteview.exe Noteview.exe -Force`.

## Architecture (the big picture)

The frontend is a single window; the Rust side is a thin, least-privilege service.

**Rust ⇄ frontend boundary** (`app/src-tauri/src/lib.rs`, wrapped by `app/src/lib/tauri.ts`):
all file I/O goes through a *small set of narrow commands* (`read_file`/`write_file`
BOM-safe, `write_bytes` for binary docx, app-config read/write, `take_startup_files`,
`open_new_window`, `open_external`, `quit_app`) rather than the broad fs plugin — this is
deliberately *more* least-privilege for an editor that opens arbitrary user files.
File-open from Explorer works via `tauri-plugin-single-instance`: the first launch reads
`std::env::args`; a second launch routes its path through the single-instance callback,
which focuses one real window (preferring `main`, falling back to any open window if `main`
was closed) and `emit_to`s `open-files` to just that one, so the file opens as a single new
tab rather than being duplicated across windows. `open_new_window` is an *async* command —
building a window from a sync command deadlocks WebView2 on Windows. Capabilities in
`src-tauri/capabilities/default.json` grant *only* what the webview actually calls.

**State is split across four stores by update frequency / serialisability** — understand
why before adding to them:
- `src/state/store.ts` (Zustand) — the serialisable core: tabs, settings, recent, pageSetup,
  plus all file open/save orchestration and debounced persistence to the app-config dir.
- `src/state/editorBridge.ts` — a module singleton `bridge.current: EditorHandle` (the
  active editor's imperative commands: undo/clipboard/find/goto/getExportHtml) + a tiny
  `useEditorCaps` store for menu enable/disable. Kept out of `store.ts` so per-keystroke
  capability changes don't re-render everything.
- `src/state/richEditor.ts` — holds the active TipTap `Editor` instance so the sibling
  `Toolbar` can issue formatting commands.
- `src/state/ui.ts` — overlay flags (settings/find/goto), the persistent find state, and a
  promise-based unsaved-changes confirm (`askUnsaved`).

**The editor host pattern** (`src/components/EditorHost.tsx`): only the *active* tab's
editor is mounted, keyed by `` `${tab.id}:${tab.mode}` `` so switching tab OR mode remounts
fresh. Three editors — `RichEditor` (TipTap), `MarkdownEditor` (CodeMirror 6 + react-markdown
preview), `PlainEditor` (textarea) — each register an `EditorHandle` (for the menu) and a
`SearchAdapter` (for the shared find/replace engine in `src/lib/search.ts`, which maps text
offsets to each editor's native model, incl. a ProseMirror position map in RichEditor).

**One content model, converted at the edges** (`src/lib/convert.ts`): each `tab.content` is
the *native* representation for its current mode — HTML (rich), Markdown source (markdown),
or plain text. Switching mode converts via marked / turndown (+gfm) / DOMPurify. Saving and
exporting map the current content to the target format via `store.exportString(id, ext)`
(independent of mode). `.html` is the lossless rich format.

**Shared rendering** keeps math/typography identical everywhere: KaTeX is the single math
engine (custom editable node in `editors/extensions/math.ts` for rich mode; rehype-katex in
the markdown preview). The `.nv-prose` CSS class is shared by rich editor, markdown preview,
and print/export. Markdown is rendered by one `renderMd()` helper used by both the live
preview and (via `renderToStaticMarkup`) export/print, so math survives source-only view.

**Two independent direction axes** (don't conflate them): the **app UI direction** comes
from the i18n language (`App.tsx` sets `documentElement.dir` from `settings.language`); the
**document text direction** is always per-paragraph auto (`unicode-bidi: plaintext`, so each
paragraph self-detects LTR/RTL from its first strong char). The manual ltr/rtl/auto control
was removed by user request — `tab.direction` is retained in the model but is always `"auto"`
(forced on new/opened/restored tabs), so don't reintroduce a direction picker or `setDirection`.
`src/lib/bidi.ts` strips HTML tags before first-strong detection (rich content is HTML).

**Offline guarantee:** all fonts (`@fontsource`) and KaTeX assets are bundled; a strict
production CSP (with a permissive `devCsp` for Vite HMR) is set in `tauri.conf.json`. Never
fetch fonts/CSS/JS at runtime — the only allowed runtime URLs are user content (markdown
image links, web-search-for-selection).

## Directory layout & where files go

```
Documents\Noteview\          ← workspace root (sessions open here; this file auto-loads)
├── app\                     ← THE APPLICATION — all source/deps/build
│   ├── src\                 ← frontend: components\ (editors\extensions\), state\, lib\, i18n\, styles\
│   ├── src-tauri\           ← Rust backend, tauri.conf.json, capabilities\, icons\
│   └── package.json, README.md, ...
├── handoffs\                ← one dated markdown handoff per work session
├── Noteview.exe             ← generated portable launcher (copy of release build)
├── Noteview-Setup.exe       ← generated NSIS installer (copy)
└── .Codex\  skills-lock.json  ← Codex's own files — do not move/edit
```

- **All app code → `app/`** and its existing subtree (components → `app/src/components/`,
  editors → `…/editors/`, stores → `app/src/state/`, helpers/Tauri wrappers →
  `app/src/lib/`, styles → `app/src/styles/`, UI strings → `app/src/i18n/`, Rust →
  `app/src-tauri/`). Never put source at the workspace root.
- **Session handoffs → `handoffs/`** as `YYYY-MM-DD-<topic>.md`. Write one at the end of a
  substantial session.
- **Temp / scratch files → the session scratchpad**, never the project.
- **Keep the workspace root clean** — only the items shown above belong there.

**When to create a folder:** a new multi-file feature area → a folder under the matching
`app/src/` subdir (a single file does not need its own folder); a new session → a dated
file in `handoffs/` (not a folder). Do not add top-level folders at the workspace root or
reorganise `app/` without reason.

## Conventions / gotchas

- **TipTap is v3** → NAMED imports (`import { StarterKit } …`) and subpath exports
  (e.g. `@tiptap/extension-text-style/font-size`). v3 core already ships a `textDirection`
  extension — do not add a custom one (name clash). `FontSize` is official in v3.
- **i18n:** every user-facing string goes through `t('…')`; add each key to BOTH
  `app/src/i18n/en.json` and `ar.json`. No hardcoded UI text.
- **The colour palette is intentionally neutral, NOT the Aperion brand** — confirm with Ali
  before applying branding; re-theme via `app/src/styles/tokens.css`.
- The root `Noteview.exe`/`Noteview-Setup.exe` are build outputs — regenerate, don't edit.
- (`package.json` `name` is still the scaffold's `nv-scaffold`; the product name comes from
  `tauri.conf.json` — cosmetic only.)

## Pointers

- Latest state, decisions, and verification notes: newest file in `handoffs/`.
- How to run / build / set as default / known limitations: `app/README.md`.
- Cross-session memory: this project's memory dir (`dev-toolchain`, `noteview-project`).

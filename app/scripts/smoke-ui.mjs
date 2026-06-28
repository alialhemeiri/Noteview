// @ts-check
/*
 * CDP smoke test for the UI-fix round (find focus, markdown view toggle, direction).
 * Run after `npm run tauri build`:   node scripts/smoke-ui.mjs   (Node 22+)
 *
 * Safety: refuses to run if Noteview is already open; backs up & restores the real
 * app-config files (settings/session/recent/page).
 *
 * Not auto-tested (depend on real mouse movement / native UI — verify manually):
 *   - Colour/highlight/math/table menus staying open while you pick.
 *   - Colour split-button applying the chosen colour on icon click.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Repo root, derived from this script's location (app/scripts/ -> ../../).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BIN = `${ROOT}/app/src-tauri/target/release/noteview.exe`;
const CONFIG_DIR = join(process.env.APPDATA || "", "ae.aperion.noteview");
const PORT = 9223;
const WEBVIEW_ARGS = `--remote-debugging-port=${PORT} --remote-allow-origins=*`;
const CONFIG_FILES = ["session.json", "settings.json", "page.json", "recent.json"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures += 1;
}
const isRunning = () =>
  /noteview\.exe/i.test(spawnSync("tasklist", ["/FI", "IMAGENAME eq noteview.exe", "/NH"], { encoding: "utf8" }).stdout || "");
const killApp = () => spawnSync("taskkill", ["/F", "/IM", "noteview.exe"], { encoding: "utf8" });
const launch = () =>
  spawn(BIN, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: WEBVIEW_ARGS }, stdio: "ignore" });

async function getTargets() {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    return list.filter((t) => t.type === "page" && /tauri\.localhost/.test(t.url || "") && t.webSocketDebuggerUrl);
  } catch {
    return [];
  }
}
async function waitForApp(timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await getTargets();
    if (t.length) return t[0];
    await sleep(300);
  }
  return null;
}
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener("open", () => res(undefined));
    ws.addEventListener("error", rej);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "eval threw");
    return r.result?.value;
  };
  const waitFor = async (expr, timeoutMs = 12000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if ((await evaluate(expr)) === true) return true;
      await sleep(150);
    }
    return false;
  };
  return { ready, send, evaluate, waitFor, close: () => ws.close() };
}
async function key(c, k, ctrl = false) {
  const code = "Key" + k.toUpperCase();
  const vk = k.toUpperCase().charCodeAt(0);
  const base = { key: k, code, windowsVirtualKeyCode: vk, modifiers: ctrl ? 2 : 0 };
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

const MARK = "ZX_MARKER_9";
const CONTENT = `alpha beta alpha gamma alpha\n\n${MARK} hello world`;

async function main() {
  if (!existsSync(BIN)) { console.error("Binary not found — run npm run tauri build"); process.exit(2); }
  if (isRunning()) { console.error("Noteview is already running — close it first."); process.exit(2); }
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });

  const backup = {};
  for (const f of CONFIG_FILES) {
    const p = join(CONFIG_DIR, f);
    if (existsSync(p)) backup[f] = readFileSync(p);
  }

  try {
    writeFileSync(join(CONFIG_DIR, "settings.json"), JSON.stringify({ language: "en" }));
    writeFileSync(join(CONFIG_DIR, "session.json"), JSON.stringify({
      activeTabId: "md1",
      tabs: [{ id: "md1", path: null, name: "test.md", kind: "markdown", mode: "markdown",
        content: CONTENT, direction: "auto", mdView: "split", dirty: false, encoding: "UTF-8", hadBom: false }],
    }));

    launch();
    const t = await waitForApp();
    if (!t) { check("app rendered", false); return; }
    const c = connect(t.webSocketDebuggerUrl);
    await c.ready;
    await c.waitFor("!!document.querySelector('.nv-app') && !!document.querySelector('.cm-content')");

    // --- Direction: manual control gone, preview is per-paragraph auto ---
    console.log("\n# Direction (per-paragraph auto, no manual control)");
    check("Manual direction control removed",
      (await c.evaluate("document.querySelectorAll('.nv-tb-group-label').length")) === 0);
    check("Preview uses dir=auto",
      (await c.evaluate("document.querySelector('.nv-md-preview')?.getAttribute('dir')")) === "auto");

    // --- Markdown view toggle: source survives Preview -> Source -> Split ---
    console.log("\n# Markdown view toggle (source must not go blank)");
    const clickTitle = (title) =>
      c.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.title===${JSON.stringify(title)});if(b){b.click();return true}return false})()`);
    for (const v of ["Preview", "Source", "Split"]) { check(`clicked ${v}`, (await clickTitle(v)) === true); await sleep(300); }
    const cmText = await c.evaluate("document.querySelector('.cm-content')?.textContent || ''");
    check("Source pane still shows content after toggling", cmText.includes(MARK), `cm.len=${cmText.length}`);

    // --- Find: focus must stay in the Find box while typing ---
    console.log("\n# Find focus retention");
    await key(c, "f", true); // Ctrl+F
    await c.waitFor("!!document.querySelector('.nv-find-input')");
    await c.evaluate("document.querySelector('.nv-find-input')?.focus()");
    await sleep(150);
    check("Find box focused", /nv-find-input/.test(await c.evaluate("document.activeElement?.className || ''")));
    let held = true;
    for (const ch of "alpha") {
      await c.send("Input.insertText", { text: ch });
      await sleep(90);
      if (!/nv-find-input/.test(await c.evaluate("document.activeElement?.className || ''"))) held = false;
    }
    check("Find box KEEPS focus while typing (focus-steal bug)", held);
    check("Find input has the full query", (await c.evaluate("document.querySelector('.nv-find-input')?.value || ''")) === "alpha");
    check("Find counted all matches",
      (await c.evaluate("document.querySelector('.nv-find-count')?.textContent || ''")).trim() === "3");
    c.close();
  } finally {
    killApp();
    for (const f of CONFIG_FILES) {
      const p = join(CONFIG_DIR, f);
      if (backup[f] !== undefined) writeFileSync(p, backup[f]);
      else if (existsSync(p)) rmSync(p);
    }
    console.log("\nRestored original app-config files.");
  }
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
  process.exit(failures === 0 ? 0 : 1);
}
main();

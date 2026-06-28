// @ts-check
/*
 * Minimal CDP smoke test for the Noteview audit fixes (F-01, F-02, F-03, F-04, F-05).
 *
 * There is no test runner in this project, so this is a small, self-contained
 * script that drives the freshly built release binary over the WebView2
 * remote-debugging (CDP) endpoint. Run it AFTER `npm run tauri build`:
 *
 *     node scripts/smoke.mjs            (needs Node 22+ for global WebSocket/fetch)
 *
 * Safety:
 *   - Refuses to run if Noteview is already running. A second launch would route
 *     into the live instance (single-instance), and the kill step at the end of
 *     each phase would close the user's real session.
 *   - Backs up the real app-config files (settings/session/recent/page) before
 *     the tests and restores them afterwards in a finally block.
 *
 * NOT covered here (need native dialogs / OS state — verify manually):
 *   - F-06 default save format → exercised through the native Save As dialog.
 *   - F-07 Arabic strings → switch the UI to Arabic and read the labels.
 *   - Windows file-association registration.
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
const TMP = `${ROOT}/app/scripts/.smoke-tmp`;
const CONFIG_FILES = ["session.json", "settings.json", "page.json", "recent.json"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures += 1;
}

function isRunning() {
  const out =
    spawnSync("tasklist", ["/FI", "IMAGENAME eq noteview.exe", "/NH"], { encoding: "utf8" }).stdout || "";
  return /noteview\.exe/i.test(out);
}
function killApp() {
  spawnSync("taskkill", ["/F", "/IM", "noteview.exe"], { encoding: "utf8" });
}
function launch() {
  return spawn(BIN, [], {
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: WEBVIEW_ARGS },
    stdio: "ignore",
  });
}

async function getPageTargets() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await res.json();
    return list.filter(
      (t) => t.type === "page" && /tauri\.localhost/.test(t.url || "") && t.webSocketDebuggerUrl,
    );
  } catch {
    return [];
  }
}
async function waitForApp(timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const targets = await getPageTargets();
    if (targets.length) return targets[0];
    await sleep(300);
  }
  return null;
}

/** Tiny CDP client over one WebSocket. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(undefined));
    ws.addEventListener("error", (e) => reject(e));
  });
  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression, awaitPromise = false) {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || "evaluate threw");
    }
    return r.result?.value;
  }
  return { ready, evaluate, close: () => ws.close() };
}

/** Poll until a selector exists — the app shows .nv-splash until async init()
 *  flips `loaded`, so the React tree mounts a beat after the target appears. */
async function waitFor(client, expr, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await client.evaluate(expr)) === true) return true;
    await sleep(200);
  }
  return false;
}

// ---- F-02 + F-03: new window + open_external allowlist ---------------------
async function phaseWindowAndExternal() {
  console.log("\n# Phase A — F-02 (new window) + F-03 (open_external allowlist)");
  writeFileSync(join(CONFIG_DIR, "session.json"), JSON.stringify({ activeTabId: null, tabs: [] }));
  launch();
  try {
    const t = await waitForApp();
    check("F-02 main window renders", !!t);
    if (!t) return;
    const c = connect(t.webSocketDebuggerUrl);
    await c.ready;
    check("main .nv-app present", await waitFor(c, "!!document.querySelector('.nv-app')"));

    for (const url of ["javascript:alert(1)", "file:///C:/Windows/win.ini", "steam://run/1"]) {
      const r = await c.evaluate(
        `window.__TAURI_INTERNALS__.invoke('open_external',{url:${JSON.stringify(
          url,
        )}}).then(()=>'RESOLVED').catch(()=>'REJECTED')`,
        true,
      );
      check(`F-03 rejects ${url}`, r === "REJECTED", `got ${r}`);
    }

    const res = await c.evaluate(
      "window.__TAURI_INTERNALS__.invoke('open_new_window').then(()=>'OK').catch(e=>'ERR:'+e)",
      true,
    );
    check("F-02 open_new_window resolves (no hang)", res === "OK", `got ${res}`);
    await sleep(2000);
    const targets = await getPageTargets();
    check("F-02 second window target exists", targets.length >= 2, `targets=${targets.length}`);
    let rendered = 0;
    for (const tg of targets) {
      const cc = connect(tg.webSocketDebuggerUrl);
      await cc.ready;
      if ((await cc.evaluate("!!document.querySelector('.nv-app')")) === true) rendered += 1;
      cc.close();
    }
    check("F-02 all windows render .nv-app (no about:blank)", rendered === targets.length && rendered >= 2,
      `rendered=${rendered}/${targets.length}`);
    c.close();
  } finally {
    killApp();
    await sleep(1000);
  }
}

// ---- F-01 + F-04: dirty restore + persisted active tab --------------------
async function phaseSessionRestore() {
  console.log("\n# Phase B — F-01 (dirty restore) + F-04 (active tab restore)");
  const tmpFile = `${TMP}/loss.md`;
  writeFileSync(tmpFile, "original");
  const session = {
    activeTabId: "tab-A", // NOT the last tab — proves F-04
    tabs: [
      { id: "tab-A", path: tmpFile, name: "loss.md", kind: "markdown", mode: "markdown",
        content: "modified unsaved audit", direction: "auto", mdView: "split",
        dirty: true, encoding: "UTF-8", hadBom: false },
      { id: "tab-B", path: null, name: "Untitled", kind: "text", mode: "plain",
        content: "", direction: "auto", mdView: "split",
        dirty: false, encoding: "UTF-8", hadBom: false },
    ],
  };
  writeFileSync(join(CONFIG_DIR, "session.json"), JSON.stringify(session));
  launch();
  try {
    const t = await waitForApp();
    if (!t) return check("F-01/F-04 app rendered", false);
    const c = connect(t.webSocketDebuggerUrl);
    await c.ready;
    check("F-01 both tabs restored", await waitFor(c, "document.querySelectorAll('.nv-tab').length===2"));
    const dirtyOnLoss = await c.evaluate(
      "(()=>{const tabs=[...document.querySelectorAll('.nv-tab')];" +
        "const el=tabs.find(t=>t.querySelector('.nv-tab-name')?.textContent==='loss.md');" +
        "return !!el && !!el.querySelector('.nv-dirty-dot');})()",
    );
    check("F-01 restored edited tab is dirty (shows dirty dot)", dirtyOnLoss === true);
    const activeName = await c.evaluate(
      "document.querySelector('.nv-tab.active .nv-tab-name')?.textContent || ''",
    );
    check("F-04 persisted active tab restored", activeName === "loss.md", `active=${activeName}`);
    c.close();
    check("F-01 disk file NOT silently overwritten",
      readFileSync(tmpFile, "utf8") === "original", `disk=${JSON.stringify(readFileSync(tmpFile, "utf8"))}`);
  } finally {
    killApp();
    await sleep(1000);
  }
}

// ---- F-05: corrupt config must not block startup --------------------------
async function phaseCorruptConfig() {
  console.log("\n# Phase C — F-05 (malformed settings.json must not block startup)");
  writeFileSync(join(CONFIG_DIR, "settings.json"), "{ this is : not valid json ");
  writeFileSync(join(CONFIG_DIR, "session.json"), JSON.stringify({ activeTabId: null, tabs: [] }));
  launch();
  try {
    const t = await waitForApp();
    if (!t) return check("F-05 app rendered despite corrupt settings", false);
    const c = connect(t.webSocketDebuggerUrl);
    await c.ready;
    const hasApp = await waitFor(c, "!!document.querySelector('.nv-app')");
    const stuckSplash = await c.evaluate("!!document.querySelector('.nv-splash')");
    check("F-05 startup completes with corrupt settings.json", hasApp && stuckSplash === false,
      `app=${hasApp} splash=${stuckSplash}`);
    c.close();
  } finally {
    killApp();
    await sleep(1000);
  }
}

async function main() {
  if (!existsSync(BIN)) {
    console.error(`Binary not found: ${BIN}\nBuild first: npm run tauri build`);
    process.exit(2);
  }
  if (isRunning()) {
    console.error("Noteview is already running. Close it first — this test force-kills noteview.exe.");
    process.exit(2);
  }
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

  // Back up the user's real config so the tests never clobber it.
  const backup = {};
  for (const f of CONFIG_FILES) {
    const p = join(CONFIG_DIR, f);
    if (existsSync(p)) backup[f] = readFileSync(p);
  }

  try {
    await phaseWindowAndExternal();
    await phaseSessionRestore();
    await phaseCorruptConfig();
  } finally {
    killApp();
    for (const f of CONFIG_FILES) {
      const p = join(CONFIG_DIR, f);
      if (backup[f] !== undefined) writeFileSync(p, backup[f]);
      else if (existsSync(p)) rmSync(p);
    }
    try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
    console.log("\nRestored original app-config files.");
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

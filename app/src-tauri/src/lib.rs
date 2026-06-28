//! Noteview Tauri backend.
//!
//! All file I/O is funnelled through a small set of narrow commands rather than
//! the broad `fs` plugin: this keeps the capability surface minimal while still
//! letting the editor open any file the user explicitly points it at.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

/// Paths passed to the *first* instance on the command line (file associations,
/// "Open with", or a path argument). Consumed once by the frontend on mount.
struct Startup(Mutex<Vec<String>>);

static WINDOW_COUNTER: AtomicUsize = AtomicUsize::new(1);

#[derive(Serialize)]
struct FileData {
    path: String,
    content: String,
    encoding: String,
    had_bom: bool,
}

/// Decode raw bytes into a `String`, honouring a leading byte-order mark.
/// Defaults to UTF-8 (lossy) so Arabic and mixed-script content round-trips.
fn decode_bytes(bytes: &[u8]) -> (String, &'static str, bool) {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        (
            String::from_utf8_lossy(&bytes[3..]).into_owned(),
            "UTF-8 with BOM",
            true,
        )
    } else if bytes.starts_with(&[0xFF, 0xFE]) {
        let (cow, _, _) = encoding_rs::UTF_16LE.decode(&bytes[2..]);
        (cow.into_owned(), "UTF-16 LE", true)
    } else if bytes.starts_with(&[0xFE, 0xFF]) {
        let (cow, _, _) = encoding_rs::UTF_16BE.decode(&bytes[2..]);
        (cow.into_owned(), "UTF-16 BE", true)
    } else {
        (String::from_utf8_lossy(bytes).into_owned(), "UTF-8", false)
    }
}

/// Read a user file (any path) and return its decoded contents + metadata.
#[tauri::command]
fn read_file(path: String) -> Result<FileData, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let (content, encoding, had_bom) = decode_bytes(&bytes);
    Ok(FileData {
        path,
        content,
        encoding: encoding.to_string(),
        had_bom,
    })
}

/// Write `content` to `path` as UTF-8, optionally prefixed with a UTF-8 BOM.
#[tauri::command]
fn write_file(path: String, content: String, bom: bool) -> Result<(), String> {
    let mut bytes = Vec::with_capacity(content.len() + 3);
    if bom {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    bytes.extend_from_slice(content.as_bytes());
    std::fs::write(&path, bytes).map_err(|e| format!("Failed to write {path}: {e}"))
}

/// Write arbitrary binary data (base64-encoded) to `path` — used by .docx export.
#[tauri::command]
fn write_bytes(path: String, base64_data: String) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| format!("Failed to write {path}: {e}"))
}

fn config_path(app: &AppHandle, name: &str) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

/// Read a small app-managed JSON file (settings / recent / session) from the
/// per-user config directory. Returns `None` when it does not exist yet.
#[tauri::command]
fn read_app_file(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let p = config_path(&app, &name)?;
    match std::fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(_) => Ok(None),
    }
}

/// Persist a small app-managed JSON file into the per-user config directory.
#[tauri::command]
fn write_app_file(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let p = config_path(&app, &name)?;
    std::fs::write(&p, content).map_err(|e| e.to_string())
}

/// Hand the frontend any files passed on the command line at startup, then clear
/// them so a reload does not re-open the same documents.
#[tauri::command]
fn take_startup_files(state: State<Startup>) -> Vec<String> {
    let mut guard = state.0.lock().unwrap();
    std::mem::take(&mut *guard)
}

/// Open an additional Noteview window in the *same* process (File ▸ New window).
///
/// This command MUST be `async`. On Windows, building a webview window inside a
/// *synchronous* command deadlocks the WebView2 / main event loop: the new
/// window comes up as a blank `about:blank` target and the invoke never
/// resolves (Tauri documents this on `WebviewWindowBuilder::new`). An async
/// command runs off the main thread, so `.build()` can dispatch window creation
/// to the event loop and return normally.
#[tauri::command]
async fn open_new_window(app: AppHandle) -> Result<(), String> {
    let n = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let label = format!("win-{n}");
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("Noteview")
        .inner_size(1180.0, 760.0)
        .min_inner_size(680.0, 480.0)
        .build()
        .map_err(|e| {
            eprintln!("open_new_window: failed to build {label}: {e}");
            e.to_string()
        })?;
    Ok(())
}

/// Open the OS default browser at `url` (used for "Search the web for selection"
/// and clicking links in the Markdown preview).
///
/// This is the trust boundary for document links (Markdown / opened HTML), so it
/// enforces a strict scheme allowlist: only `http`, `https`, and `mailto` are
/// ever handed to the OS opener. Everything else — `javascript:`, `file:`, and
/// any other registered protocol — is rejected without launching anything.
#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    use url::Url;

    let scheme = Url::parse(&url)
        .map_err(|_| format!("Refusing to open malformed URL: {url}"))?
        .scheme()
        .to_owned();
    if !matches!(scheme.as_str(), "http" | "https" | "mailto") {
        return Err(format!("Refusing to open URL with disallowed scheme: {scheme}"));
    }

    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let startup: Vec<String> = std::env::args()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .collect();

    tauri::Builder::default()
        // single-instance MUST be registered first so the callback fires before
        // any window is created on the second launch.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files: Vec<String> = argv
                .iter()
                .skip(1)
                .filter(|a| !a.starts_with('-'))
                .cloned()
                .collect();
            // Route the opened file(s) to exactly ONE real window so each file
            // becomes a single new tab (broadcasting to every window would
            // duplicate the tab). Prefer "main"; if it has been closed, fall
            // back to any open window so the file still opens somewhere.
            let target = app
                .get_webview_window("main")
                .or_else(|| app.webview_windows().into_values().next());
            if let Some(w) = target {
                let _ = w.unminimize();
                let _ = w.set_focus();
                let _ = app.emit_to(w.label(), "open-files", files);
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Startup(Mutex::new(startup)))
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            write_bytes,
            read_app_file,
            write_app_file,
            take_startup_files,
            open_new_window,
            open_external,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

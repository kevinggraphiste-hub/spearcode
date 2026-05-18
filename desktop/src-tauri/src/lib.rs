// SpearCode desktop: host the existing Ink TUI inside a Tauri 2 window.
// A real PTY runs the self-contained SpearCode binary; its output is
// streamed to xterm.js in the webview and keystrokes are piped back.
//
// The engine is started as soon as the window is created (Rust `setup`),
// not on a frontend request: output produced before the webview has
// attached its listeners is buffered in `backlog` and flushed on
// `pty_ready`, so the very first TUI frame is never lost.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;

use base64::Engine as _;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

#[derive(Default)]
struct OutState {
    ready: bool,
    backlog: Vec<u8>,
}

#[derive(Default)]
struct Pty {
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Option<Box<dyn Child + Send + Sync>>>>,
    out: Arc<Mutex<OutState>>,
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

/// Append a diagnostic line to ~/.cache/spearcode/desktop.log.
/// Lets a misbehaving window ("blank") be diagnosed after the fact.
fn log(msg: &str) {
    let dir = std::env::var("XDG_CACHE_HOME")
        .unwrap_or_else(|_| format!("{}/.cache", std::env::var("HOME").unwrap_or_default()));
    let dir = format!("{dir}/spearcode");
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(format!("{dir}/desktop.log"))
    {
        use std::io::Write as _;
        let _ = writeln!(f, "[{}] {msg}", std::process::id());
    }
}

/// Resolve the SpearCode engine binary.
/// Order: $SPEARCODE_BIN → bundled resource → `spearcode` on PATH →
/// dev fallback to the repo's `release/` build.
fn resolve_bin(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("SPEARCODE_BIN") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }

    let res_name = if cfg!(target_os = "windows") {
        "spearcode.exe"
    } else {
        "spearcode"
    };
    for rel in [res_name, &format!("binaries/{res_name}")] {
        if let Ok(res) = app
            .path()
            .resolve(rel, tauri::path::BaseDirectory::Resource)
        {
            if res.is_file() {
                return Some(res);
            }
        }
    }

    let out = if cfg!(target_os = "windows") {
        std::process::Command::new("where").arg("spearcode").output()
    } else {
        std::process::Command::new("sh")
            .arg("-c")
            .arg("command -v spearcode")
            .output()
    };
    if let Ok(o) = out {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !s.is_empty() && PathBuf::from(&s).is_file() {
                return Some(PathBuf::from(s));
            }
        }
    }

    // Dev fallback: <repo>/release/<os binary>
    let dev_name = if cfg!(target_os = "windows") {
        "spearcode-win-x64.exe"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "spearcode-macos-arm64"
        } else {
            "spearcode-macos-x64"
        }
    } else {
        "spearcode-linux-x64"
    };
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../release")
        .join(dev_name);
    if dev.is_file() {
        return Some(dev);
    }
    None
}

fn workdir() -> String {
    std::env::var("SPEARCODE_WORKDIR")
        .ok()
        .or_else(|| std::env::var("HOME").ok())
        .or_else(|| std::env::var("USERPROFILE").ok())
        .unwrap_or_else(|| ".".to_string())
}

/// Spawn the SpearCode engine in a PTY and start streaming.
fn start_engine(app: &AppHandle, state: &Pty, cols: u16, rows: u16) -> Result<(), String> {
    log(&format!("start_engine cols={cols} rows={rows}"));
    let bin = resolve_bin(app).ok_or_else(|| {
        "Binaire SpearCode introuvable (définis $SPEARCODE_BIN ou build release/)".to_string()
    })?;
    log(&format!("resolved bin = {}", bin.display()));

    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&bin);
    for (k, v) in std::env::vars() {
        cmd.env(k, v);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.cwd(workdir());

    let child = pair.slave.spawn_command(cmd).map_err(|e| {
        log(&format!("spawn_command FAILED: {e}"));
        e.to_string()
    })?;
    log(&format!("engine spawned, child pid = {:?}", child.process_id()));
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    *state.writer.lock().unwrap() = Some(writer);
    *state.master.lock().unwrap() = Some(pair.master);
    *state.child.lock().unwrap() = Some(child);

    let child_arc = Arc::clone(&state.child);
    let out_arc = Arc::clone(&state.out);
    let app2 = app.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        let mut logged_first = false;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    log("engine stdout EOF");
                    break;
                }
                Err(e) => {
                    log(&format!("engine read error: {e}"));
                    break;
                }
                Ok(n) => {
                    if !logged_first {
                        log(&format!("first {n} bytes from engine"));
                        logged_first = true;
                    }
                    // Emit live once the webview is attached; until then
                    // accumulate so the first frame is not lost.
                    let mut g = out_arc.lock().unwrap();
                    if g.ready {
                        drop(g);
                        if app2.emit("pty-output", b64(&buf[..n])).is_err() {
                            break;
                        }
                    } else {
                        g.backlog.extend_from_slice(&buf[..n]);
                    }
                }
            }
        }
        let code = {
            let mut c = child_arc.lock().unwrap();
            c.take()
                .and_then(|mut c| c.wait().ok())
                .map(|st| st.exit_code() as i32)
        };
        log(&format!("engine exited, code = {code:?}"));
        let _ = app2.emit("pty-exit", code);
    });

    Ok(())
}

/// Webview is up and listening: switch to live streaming, return any
/// output produced before now (base64) and resize to the real terminal.
#[tauri::command]
fn pty_ready(state: State<'_, Pty>, cols: u16, rows: u16) -> String {
    if cols > 0 && rows > 0 {
        if let Some(m) = state.master.lock().unwrap().as_ref() {
            let _ = m.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
        }
    }
    let mut g = state.out.lock().unwrap();
    g.ready = true;
    let drained = std::mem::take(&mut g.backlog);
    b64(&drained)
}

#[tauri::command]
fn pty_write(state: State<'_, Pty>, data: String) -> Result<(), String> {
    if let Some(w) = state.writer.lock().unwrap().as_mut() {
        w.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        w.flush().ok();
    }
    Ok(())
}

#[tauri::command]
fn pty_resize(state: State<'_, Pty>, cols: u16, rows: u16) -> Result<(), String> {
    if let Some(m) = state.master.lock().unwrap().as_ref() {
        m.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Pty::default())
        .invoke_handler(tauri::generate_handler![pty_ready, pty_write, pty_resize])
        .setup(|app| {
            log("=== setup ===");
            // Launch the engine immediately so the window has content the
            // moment it appears (default size; the webview resizes on attach).
            let handle = app.handle().clone();
            let state = app.state::<Pty>();
            if let Err(e) = start_engine(&handle, state.inner(), 100, 30) {
                log(&format!("start_engine error: {e}"));
                let mut g = state.out.lock().unwrap();
                g.backlog
                    .extend_from_slice(format!("\r\n\x1b[31m{e}\x1b[0m\r\n").as_bytes());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                // Clone the Arc out so we don't hold the `State` borrow,
                // and take() in its own statement so the lock guard is
                // dropped at the `;` (not extended to the if-let block).
                let child = window.state::<Pty>().child.clone();
                let taken = child.lock().unwrap().take();
                if let Some(mut c) = taken {
                    let _ = c.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erreur au lancement de la fenêtre SpearCode");
}

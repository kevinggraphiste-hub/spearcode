// SpearCode desktop: host the existing Ink TUI inside a Tauri 2 window.
// A real PTY runs the self-contained SpearCode binary; its output is
// streamed to xterm.js in the webview and keystrokes are piped back.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;

use base64::Engine as _;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

#[derive(Default)]
struct Pty {
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Option<Box<dyn Child + Send + Sync>>>>,
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
    if let Ok(res) = app
        .path()
        .resolve(res_name, tauri::path::BaseDirectory::Resource)
    {
        if res.is_file() {
            return Some(res);
        }
    }

    let probe = if cfg!(target_os = "windows") {
        ("where", "spearcode")
    } else {
        ("sh", "-c")
    };
    let out = if cfg!(target_os = "windows") {
        std::process::Command::new(probe.0).arg(probe.1).output()
    } else {
        std::process::Command::new(probe.0)
            .arg(probe.1)
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

#[tauri::command]
fn pty_start(
    app: AppHandle,
    state: State<'_, Pty>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let bin = resolve_bin(&app).ok_or_else(|| {
        "Binaire SpearCode introuvable (définis $SPEARCODE_BIN ou build release/)".to_string()
    })?;

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

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    *state.writer.lock().unwrap() = Some(writer);
    *state.master.lock().unwrap() = Some(pair.master);
    *state.child.lock().unwrap() = Some(child);

    let child_arc = Arc::clone(&state.child);
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let payload = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    if app.emit("pty-output", payload).is_err() {
                        break;
                    }
                }
            }
        }
        let code = {
            let mut g = child_arc.lock().unwrap();
            g.take()
                .and_then(|mut c| c.wait().ok())
                .map(|st| st.exit_code() as i32)
        };
        let _ = app.emit("pty-exit", code);
    });

    Ok(())
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
        .invoke_handler(tauri::generate_handler![pty_start, pty_write, pty_resize])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<Pty>();
                if let Some(mut c) = state.child.lock().unwrap().take() {
                    let _ = c.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erreur au lancement de la fenêtre SpearCode");
}

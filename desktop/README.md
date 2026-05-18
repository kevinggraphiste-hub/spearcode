# SpearCode Desktop

SpearCode as a **real windowed application** — the exact same Ink TUI, hosted
in a native Tauri 2 window (own icon, own dock/alt-tab entry, no terminal
chrome) instead of a terminal emulator.

```
desktop/
  index.html  src/main.ts  src/styles.css   # webview: xterm.js terminal
  src-tauri/                                  # Rust: PTY bridge + window
    src/lib.rs                                # spawns the SpearCode binary
    tauri.conf.json  Cargo.toml  capabilities/
```

How it works: the webview renders an [xterm.js] terminal; the Rust side runs
the self-contained SpearCode binary inside a real **PTY** (`portable-pty`)
and streams bytes both ways. The UI is byte-identical to the CLI — it *is*
the CLI, just in a window. The terminal binary stays available separately.

## Prerequisites (one-time)

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
. "$HOME/.cargo/env"

# Tauri 2 system libs (Ubuntu/Debian)
sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  libsoup-3.0-dev librsvg2-dev build-essential curl wget file libssl-dev \
  libayatana-appindicator3-dev patchelf
```

## Dev / build

```bash
cd desktop
npm install
node scripts/gen-icons.mjs          # (re)generate the icon set
npm run dev                         # hot-reload window (needs release/ binary or $SPEARCODE_BIN)
npm run build                       # .deb + .AppImage in src-tauri/target/release/bundle/
```

Binary resolution order: `$SPEARCODE_BIN` → bundled resource → `spearcode`
on `PATH` → `../release/spearcode-linux-x64` (source build).

[xterm.js]: https://xtermjs.org

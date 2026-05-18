# Changelog

## 0.2.0 (2026-05-18)

SpearCode is now a **real windowed desktop app** — not just a terminal tool.

### Added
- **`desktop/` — Tauri 2 application.** The exact same Ink TUI, hosted in a
  native window (own icon, own dock/alt-tab entry, no terminal chrome).
  A real PTY (`portable-pty`) runs the self-contained SpearCode engine and
  streams it to xterm.js in a system WebView. Zero UI rewrite — the window
  *is* SpearCode. Lean: ~3.5 MB binary, no Chromium/Node bundled.
- Engine starts in Rust `setup` with output buffered until the webview
  attaches, so the first TUI frame is never lost; clean close kills the
  engine; window/PTY resize kept in sync; copy/paste; slate/red theme.
- Binary resolution: `$SPEARCODE_BIN` → bundled resource → `spearcode` on
  `PATH` → source `release/` build. Diagnostics: `~/.cache/spearcode/desktop.log`.
- Release CI now also builds the desktop bundles (`.deb`/`.AppImage`/`.dmg`/
  NSIS `.exe`) per OS and attaches them to the GitHub Release.

## 0.1.3 (2026-05-18)

The Linux GUI launcher now actually opens SpearCode.

### Fixed
- **Desktop icon did nothing**: clicking a plain `.desktop` for a TUI app
  opens no window (the launch scope has no terminal/keyboard). New tracked,
  idempotent installer `scripts/install-desktop-launcher.sh` writes a
  hardened terminal wrapper (robust multi-terminal detection, `setsid`
  detach, sane `PATH`, visible error dialogs) plus a trusted + executable
  `.desktop` in the app menu **and** on the Desktop. Every launch attempt
  is logged to `~/.cache/spearcode/launch.log` for diagnosis.
- **Duplicate menu entry / validator warning**: packaged `.desktop`
  (`.deb`/`.AppImage`) used two main `Categories`; now `Development;` only,
  plus `Version=1.0` and `StartupNotify=true`.

## 0.1.2 (2026-05-18)

Portable binary now actually launches the TUI. Fixes four real bugs on the
`chat` (default) path that made the standalone binary unusable.

### Fixed
- **Segfault on launch**: pkg's Node base lacks full ICU; Ink's text-width
  libs called native `Intl.Segmenter` → V8 crash. Now polyfilled (pure-JS
  code-point segmenter) in the bundle.
- **`ReactCurrentOwner` crash**: Ink 5 is incompatible with React 19 →
  pinned `react`/`@types/react` to 18.
- **`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`**: dynamic `import('node:*')`
  fails inside a pkg snapshot → converted to static imports.
- **Setup wizard crash**: empty/non-numeric provider choice → `undefined`.
  Hardened input; the wizard is now skipped when a provider key is already
  in the environment, and exits cleanly with guidance when none is.
- Version is now sourced from a single `src/version.ts` (no more hardcoded
  `0.1.0` in `--version`).

## 0.1.1 (2026-05-18)

First standalone, distributable release — isolated from the Gungnir plugin.

### Distribution
- **Self-contained binaries — no Node.js required** (esbuild + @yao-pkg/pkg)
- Portable executables for Linux x64, macOS arm64/x64, Windows x64
- Native installers: `.deb` + `.AppImage` (Linux), `.dmg` (macOS), `.exe` setup (Windows)
- `install.sh` / `install.bat` one-line installers; multi-OS release CI

### Changed
- License moved to **Apache 2.0**
- Gungnir bridge is now **optional, off by default** (opt-in via `spearcode/gungnir`)
- `better-sqlite3` native addon embedded and loaded via `nativeBinding`

## 0.1.0 (2026-04-02)

Initial release of SpearCode.

### Features
- **51 tools** across 12 categories (files, git, GitHub, web, vision, semantic search, test gen, diff, PR review, deps, explainer, impact)
- **31 models** via OpenRouter, Anthropic, OpenAI, Ollama
- **TUI** built with Ink/React (chat, sessions, model selector, help, logs)
- **Auto-compact** with conversation summarization
- **Permission system** for dangerous operations
- **MCP client** (stdio + SSE)
- **LSP diagnostics** support
- **Custom commands** via .md files
- **Project memory** (.spearcode.md)
- **Syntax highlighting** in terminal
- **External editor** support (Ctrl+E)
- **Token counting** with per-model context windows
- **Auto-retry** with exponential backoff
- **Semantic search** (TF-IDF based code search)
- **Learning from corrections** (AI remembers your fixes)
- **Cost tracking** per session/provider/model/day
- **7 AI personas** (Architect, Debugger, Reviewer, Writer, Tester, Optimizer, Hacker)
- **Test auto-generation** (vitest/jest/mocha/node)
- **Conversation → Docs export**
- **Visual diff** (side-by-side ANSI colored)
- **PR review** with scoring (security, perf, bugs, style)
- **Dependency intelligence** (vulns, unused, upgrades)
- **GitHub native** (PR/issues/workflows via gh CLI)
- **Session forking** (explore multiple approaches)
- **Code explainer** (function/file analysis)
- **Impact analysis** (find references, dependency graph)
- **Real-time collaboration** (WebSocket server)
- **Session sharing** (export/import as JSON/Markdown)
- **Gungnir bridge** (sub-agents, skills, heartbeat, modes)
- **Multi-workspace** support
- **Custom system prompts** per project
- **Setup wizard** on first launch
- **Windows/macOS/Linux** support

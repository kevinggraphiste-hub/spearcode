# Installing SpearCode

SpearCode is distributed as a **self-contained executable**. You do **not**
need Node.js, npm, or any runtime installed — the binary bundles everything,
including the native SQLite engine.

Three ways to get it, on every platform:

| | Portable (no install) | Native installer | One-line script |
|---|---|---|---|
| **macOS** | `spearcode-macos-arm64` / `-x64` | `Spearcode-<ver>-macos-<arch>.dmg` | `install.sh` |
| **Windows** | `spearcode-win-x64.exe` | `Spearcode-<ver>-windows-x64-setup.exe` | `install.bat` |
| **Linux** | `spearcode-linux-x64` | `.AppImage` or `.deb` | `install.sh` |

All artifacts are attached to every
[GitHub release](https://github.com/kevinggraphiste-hub/spearcode/releases/latest).

> **Unsigned builds.** These binaries are not yet code-signed. macOS Gatekeeper
> and Windows SmartScreen may warn about an unidentified developer on first
> launch. Instructions to bypass are below; signing is planned.

---

## Portable — run without installing

### macOS / Linux
```bash
# Download the right binary from the latest release, then:
chmod +x spearcode-*        # make it executable
./spearcode-*               # run it
```
On macOS, if Gatekeeper blocks it:
```bash
xattr -dr com.apple.quarantine ./spearcode-macos-*
```

### Windows
Download `spearcode-win-x64.exe`, then run it from a terminal:
```powershell
.\spearcode-win-x64.exe
```
If SmartScreen warns: **More info → Run anyway**.

---

## One-line install (recommended)

### macOS / Linux
```bash
curl -fsSL https://raw.githubusercontent.com/kevinggraphiste-hub/spearcode/main/install.sh | bash
```
Installs to `/usr/local/bin/spearcode` (override with `SPEARCODE_BINDIR`).

### Windows (PowerShell)
```powershell
iwr -useb https://raw.githubusercontent.com/kevinggraphiste-hub/spearcode/main/install.bat -OutFile install.bat
.\install.bat
```
Installs to `%LOCALAPPDATA%\SpearCode` and adds it to your user `PATH`.

---

## Native installers

### macOS — `.dmg`
1. Download `Spearcode-<ver>-macos-<arch>.dmg` (arm64 for Apple Silicon, x64 for Intel).
2. Open it, then double-click **Install.command** (installs to `/usr/local/bin`),
   or just run `./spearcode` straight from the mounted image (portable).

### Windows — `.exe` setup
Download and run `Spearcode-<ver>-windows-x64-setup.exe`. It installs to
*Program Files* and can add SpearCode to `PATH`. Uninstall via *Add/Remove Programs*.

### Linux — `.deb` (Debian/Ubuntu)
```bash
sudo dpkg -i spearcode_<ver>_amd64.deb
spearcode
```

### Linux — AppImage (any distro)
```bash
chmod +x Spearcode-<ver>-x86_64.AppImage
./Spearcode-<ver>-x86_64.AppImage
```

### Linux — desktop launcher (clickable icon)

SpearCode is a terminal app, so a bare `.desktop` that just runs the binary
opens nothing when clicked. This installs a proper launcher (app menu **and**
Desktop icon) that opens a terminal window:

```bash
bash scripts/install-desktop-launcher.sh            # local source build
bash scripts/install-desktop-launcher.sh "$(command -v spearcode)"   # after install.sh/.deb
```

Idempotent — re-run after each upgrade. Launch logs: `~/.cache/spearcode/launch.log`.

---

## From source

Requires Node.js ≥ 20.

```bash
git clone https://github.com/kevinggraphiste-hub/spearcode
cd spearcode
npm install
npm run build          # compile TypeScript
node dist/cli/index.js # run

# Or build your own portable binary:
npm run build:bin      # → release/spearcode-<host>
```

---

## Configuration

Set at least one provider key (env var or `.env` in your working dir):

```bash
export ANTHROPIC_API_KEY=sk-...
export OPENAI_API_KEY=sk-...
export OPENROUTER_API_KEY=sk-or-...
# or a local Ollama endpoint:
export LOCAL_ENDPOINT=http://localhost:11434
```

Then run `spearcode setup` for the interactive wizard.

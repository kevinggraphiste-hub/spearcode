#!/usr/bin/env bash
# SpearCode installer for macOS & Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/kevinggraphiste-hub/spearcode/main/install.sh | bash
#
# Downloads the portable self-contained binary (no Node.js required)
# from the latest GitHub release and installs it to a bin directory.
set -euo pipefail

REPO="kevinggraphiste-hub/spearcode"
BINDIR="${SPEARCODE_BINDIR:-/usr/local/bin}"

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux)  asset="spearcode-linux-x64" ;;
  Darwin)
    case "$arch" in
      arm64) asset="spearcode-macos-arm64" ;;
      x86_64) asset="spearcode-macos-x64" ;;
      *) echo "Unsupported macOS arch: $arch" >&2; exit 1 ;;
    esac ;;
  *) echo "Unsupported OS: $os (use install.bat on Windows)" >&2; exit 1 ;;
esac

if [ "$os" = "Linux" ] && [ "$arch" != "x86_64" ]; then
  echo "Only x86_64 Linux is prebuilt for now (got $arch)." >&2
  exit 1
fi

url="https://github.com/${REPO}/releases/latest/download/${asset}"
tmp="$(mktemp)"
echo "↓ Downloading ${asset} …"
curl -fsSL "$url" -o "$tmp"
chmod 755 "$tmp"

if [ -w "$BINDIR" ]; then
  mv "$tmp" "$BINDIR/spearcode"
else
  echo "→ ${BINDIR} needs root; using sudo"
  sudo mv "$tmp" "$BINDIR/spearcode"
fi

# Unsigned build: clear macOS download quarantine.
if [ "$os" = "Darwin" ]; then
  sudo xattr -dr com.apple.quarantine "$BINDIR/spearcode" 2>/dev/null || true
fi

echo "✓ Installed to ${BINDIR}/spearcode"
echo "  Run: spearcode"

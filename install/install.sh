#!/bin/sh
# aiws installer for macOS / Linux — downloads the prebuilt binary (no Node.js required).
#
#   curl -fsSL https://raw.githubusercontent.com/vanhbakaa/aiws/main/install/install.sh | sh
#
# Env overrides:  AIWS_INSTALL_DIR (default ~/.local/bin)
set -e

REPO="vanhbakaa/aiws"
BIN="aiws"

os=$(uname -s)
case "$os" in
  Linux)  os="linux" ;;
  Darwin) os="darwin" ;;
  *) echo "aiws: unsupported OS '$os'. Try the npm install: npm install -g aiws" >&2; exit 1 ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64|amd64)   arch="x64" ;;
  arm64|aarch64)  arch="arm64" ;;
  *) echo "aiws: unsupported architecture '$arch'. Try the npm install: npm install -g aiws" >&2; exit 1 ;;
esac

asset="aiws-${os}-${arch}"
url="https://github.com/${REPO}/releases/latest/download/${asset}"
dir="${AIWS_INSTALL_DIR:-$HOME/.local/bin}"
mkdir -p "$dir"

echo "→ Downloading ${asset} …"
if command -v curl >/dev/null 2>&1; then
  curl -fSL "$url" -o "$dir/$BIN"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$dir/$BIN" "$url"
else
  echo "aiws: need curl or wget to download." >&2; exit 1
fi
chmod +x "$dir/$BIN"

echo "✓ Installed $BIN → $dir/$BIN"
case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "  Add it to your PATH:  export PATH=\"$dir:\$PATH\"" ;;
esac
echo "  Run:  $BIN"

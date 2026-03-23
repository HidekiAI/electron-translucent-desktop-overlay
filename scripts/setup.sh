#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Node.js via nvm ────────────────────────────────────────────────────────────
if [ ! -d "$HOME/.nvm" ]; then
    echo "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
else
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
fi

# Install & activate the Node version pinned in .nvmrc
nvm install   # reads .nvmrc
nvm use       # reads .nvmrc
echo "Node: $(node --version)"

# ── pnpm ──────────────────────────────────────────────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi
echo "pnpm: $(pnpm --version)"

# ── Project dependencies ───────────────────────────────────────────────────────
echo "Installing project dependencies..."
pnpm install

# Run install scripts for electron and esbuild (pnpm may skip them on first install)
node node_modules/esbuild/install.js   2>/dev/null || true
node node_modules/electron/install.js 2>/dev/null || true

echo ""
echo "Setup complete. To run the demo:"
echo "  nvm use && bash demo.sh"
echo ""
echo "Or start the app directly:"
echo "  nvm use && pnpm start"

#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ── Node.js via nvm ────────────────────────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
if [ ! -d "$NVM_DIR" ]; then
    echo "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck source=/dev/null
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

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
# onlyBuiltDependencies in pnpm-workspace.yaml whitelists electron and esbuild
# so their install scripts (binary downloads) run automatically.
echo "Installing project dependencies..."
nvm use && pnpm install && pnpm approve-builds

echo ""
echo "Setup complete."
echo ""
echo "To run the demo:"
echo "  nvm use && bash scripts/demo.sh"
echo ""
echo "To start the app directly:"
echo "  nvm use && pnpm start"

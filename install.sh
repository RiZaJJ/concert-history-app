#!/bin/bash
# One-line installer for Concert History App
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/concert-history-app/main/install.sh | bash

set -e

REPO_URL="https://github.com/YOUR_USERNAME/concert-history-app.git"
INSTALL_DIR="$HOME/concert-history-app"

echo "🎵 Concert History App - One-Line Installer"
echo "==========================================="
echo ""

# Check git
if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required but not installed"
  echo "Install with: brew install git"
  exit 1
fi

# Clone repository
echo "📥 Cloning repository..."
if [ -d "$INSTALL_DIR" ]; then
  echo "Directory $INSTALL_DIR already exists!"
  read -p "Remove and reinstall? (y/N): " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$INSTALL_DIR"
  else
    echo "Installation cancelled."
    exit 1
  fi
fi

git clone "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Run setup
echo ""
echo "🚀 Running setup script..."
bash setup.sh

echo ""
echo "✨ Installation complete!"
echo ""
echo "To start the app:"
echo "  cd $INSTALL_DIR"
echo "  pnpm dev"

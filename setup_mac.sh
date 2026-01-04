#!/bin/bash

# 🎸 Concert History App - Turnkey Mac Setup Script
# This script automates the installation of dependencies and starts the app.

set -e

echo "🚀 Starting Concert History App setup..."

# 1. Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew not found. Please install it from https://brew.sh and try again."
    exit 1
fi

# 2. Install Node.js and MySQL if missing
echo "📦 Checking dependencies..."
brew install node mysql pnpm || true

# 3. Start MySQL Service
echo "🗄️ Starting MySQL service..."
brew services start mysql || true

# 4. Create Database
echo "🔨 Creating database..."
mysql -u root -e "CREATE DATABASE IF NOT EXISTS concert_history;" || echo "⚠️ Database might already exist or root has a password."

# 5. Install App Dependencies
echo "npm_modules: Installing..."
pnpm install

# 6. Setup Environment Variables
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat <<EOT >> .env
DATABASE_URL=mysql://root@localhost:3306/concert_history
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
VITE_APP_ID=concert-history-local
EOT
    echo "⚠️  IMPORTANT: Please edit the .env file and add your API keys:"
    echo "   - GOOGLE_DRIVE_CREDENTIALS"
    echo "   - GOOGLE_DRIVE_FOLDER_ID"
    echo "   - SETLISTFM_API_KEY"
    echo "   - OPENWEATHER_API_KEY"
fi

# 7. Initialize Database Schema
echo "🏗️ Initializing database schema..."
pnpm db:push

echo "✅ Setup complete!"
echo "--------------------------------------------------"
echo "🏃 To start the app, run:"
echo "   pnpm dev"
echo "--------------------------------------------------"
echo "🌐 The app will be available at http://localhost:3000"

#!/bin/bash
set -e

echo "🎵 Concert History App - Automated Setup"
echo "========================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Step 1: Check dependencies
echo "📋 Step 1: Checking dependencies..."
echo ""

MISSING_DEPS=0

# Check Node.js
if command_exists node; then
  NODE_VERSION=$(node -v)
  echo -e "${GREEN}✓${NC} Node.js ${NODE_VERSION} found"
else
  echo -e "${RED}✗${NC} Node.js not found"
  echo "  Install from: https://nodejs.org/ (v20 or higher)"
  MISSING_DEPS=1
fi

# Check pnpm (or npm)
if command_exists pnpm; then
  PNPM_VERSION=$(pnpm -v)
  echo -e "${GREEN}✓${NC} pnpm ${PNPM_VERSION} found"
  PKG_MANAGER="pnpm"
elif command_exists npm; then
  NPM_VERSION=$(npm -v)
  echo -e "${YELLOW}⚠${NC} npm ${NPM_VERSION} found (pnpm recommended)"
  echo "  Install pnpm: npm install -g pnpm"
  PKG_MANAGER="npm"
else
  echo -e "${RED}✗${NC} No package manager found"
  MISSING_DEPS=1
fi

# Check MySQL
if command_exists mysql; then
  MYSQL_VERSION=$(mysql --version | awk '{print $3}' | sed 's/,$//')
  echo -e "${GREEN}✓${NC} MySQL ${MYSQL_VERSION} found"
else
  echo -e "${RED}✗${NC} MySQL not found"
  echo "  Install with: brew install mysql"
  MISSING_DEPS=1
fi

echo ""

if [ $MISSING_DEPS -eq 1 ]; then
  echo -e "${RED}Error: Missing required dependencies${NC}"
  echo "Please install the missing dependencies and run this script again."
  exit 1
fi

# Step 2: Install npm dependencies
echo "📦 Step 2: Installing dependencies..."
$PKG_MANAGER install
echo -e "${GREEN}✓${NC} Dependencies installed"
echo ""

# Step 3: Setup environment file
echo "⚙️  Step 3: Setting up environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${GREEN}✓${NC} Created .env file from template"
  echo -e "${YELLOW}⚠${NC}  IMPORTANT: You need to edit .env with your API keys!"
  echo ""
  echo "Required API keys:"
  echo "  • OpenWeather API: https://openweathermap.org/api"
  echo "  • Setlist.fm API: https://www.setlist.fm/settings/api"
  echo "  • Google Drive: https://console.cloud.google.com/"
  echo ""

  read -p "Press Enter to open .env in your default editor, or Ctrl+C to edit later..."
  ${EDITOR:-nano} .env
else
  echo -e "${YELLOW}⚠${NC}  .env already exists, skipping..."
fi
echo ""

# Step 4: Setup database
echo "🗄️  Step 4: Setting up database..."

# Check if MySQL is running
if ! mysqladmin ping -h localhost --silent 2>/dev/null; then
  echo -e "${RED}✗${NC} MySQL is not running"
  echo "  Start MySQL with: brew services start mysql"
  echo "  Or manually: mysql.server start"
  exit 1
fi

# Get database credentials from .env
DB_URL=$(grep DATABASE_URL .env | cut -d '=' -f2)
DB_NAME="concert_history"

# Try to create database
echo "Creating database '$DB_NAME'..."
mysql -u root -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;" 2>/dev/null && {
  echo -e "${GREEN}✓${NC} Database created"
} || {
  echo -e "${YELLOW}⚠${NC}  Database might already exist or need password"
  read -sp "Enter MySQL root password (or press Enter if no password): " MYSQL_PASS
  echo ""
  if [ -z "$MYSQL_PASS" ]; then
    mysql -u root -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;"
  else
    mysql -u root -p"$MYSQL_PASS" -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;"
  fi
  echo -e "${GREEN}✓${NC} Database created"
}

# Run migrations
echo "Running database migrations..."
for migration in migrations/*.sql; do
  if [ -f "$migration" ]; then
    echo "  → $(basename "$migration")"
    mysql -u root "$DB_NAME" < "$migration" 2>/dev/null || {
      read -sp "Enter MySQL root password: " MYSQL_PASS
      echo ""
      mysql -u root -p"$MYSQL_PASS" "$DB_NAME" < "$migration"
    }
  fi
done
echo -e "${GREEN}✓${NC} Migrations completed"
echo ""

# Step 5: Create default user
echo "👤 Step 5: Creating default user..."
mysql -u root "$DB_NAME" -e "INSERT IGNORE INTO users (id, name, email, googleId) VALUES (1, 'User', 'user@localhost', 'local-user');" 2>/dev/null || {
  read -sp "Enter MySQL root password: " MYSQL_PASS
  echo ""
  mysql -u root -p"$MYSQL_PASS" "$DB_NAME" -e "INSERT IGNORE INTO users (id, name, email, googleId) VALUES (1, 'User', 'user@localhost', 'local-user');"
}
echo -e "${GREEN}✓${NC} Default user created"
echo ""

# Final message
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Make sure your .env file has valid API keys"
echo "  2. Start the development server: $PKG_MANAGER dev"
echo "  3. Open http://localhost:5173 in your browser"
echo ""
echo "Need help? Check README.md or CLAUDE.md for documentation"

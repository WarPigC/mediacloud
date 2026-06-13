#!/bin/sh
# ════════════════════════════════════════════════════════════════
# MediaCloud — Production Entrypoint Script
# ════════════════════════════════════════════════════════════════
#
# WHY THIS EXISTS:
# Prisma's $queryRawUnsafe('PRAGMA journal_mode = WAL') runs
# AFTER the Prisma client connects, but PRAGMAs set by the
# application can be silently lost if the Prisma connection pool
# reopens connections. More critically, if the container crashes
# and restarts, SQLite defaults back to journal_mode=DELETE.
#
# This script enforces WAL mode at the OS level using the sqlite3
# CLI BEFORE Node.js even starts, guaranteeing it persists.
# ════════════════════════════════════════════════════════════════

set -e

DB_PATH="/app/data/mediacloud.db"
PRISMA_DIR="/app/server/prisma"

echo "🚀 MediaCloud production init..."

# ── Step 1: Run Prisma migrations ──
echo "📦 Running Prisma migrations..."
cd /app/server
npx prisma migrate deploy --schema="$PRISMA_DIR/schema.prisma"
echo "✅ Migrations complete"

# ── Step 2: Enforce SQLite PRAGMAs via CLI ──
# This runs DIRECTLY against the database file, not through Prisma.
# WAL mode persists across connections once set at the file level.
# busy_timeout is per-connection, but we also set it in the app code.
echo "🔧 Enforcing SQLite WAL mode + busy_timeout..."

sqlite3 "$DB_PATH" <<EOF
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
EOF

# Verify WAL was applied
WAL_MODE=$(sqlite3 "$DB_PATH" "PRAGMA journal_mode;")
if [ "$WAL_MODE" != "wal" ]; then
  echo "❌ FATAL: Failed to set WAL mode (got: $WAL_MODE)"
  exit 1
fi
echo "✅ SQLite: journal_mode=$WAL_MODE, busy_timeout=5000ms"

# ── Step 3: Start the Node.js server ──
echo "🚀 Starting MediaCloud server..."
cd /app
exec node server/dist/index.js

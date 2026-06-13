# ════════════════════════════════════════════════════════════════
# MediaCloud — Unified ARM64 Production Dockerfile
# ════════════════════════════════════════════════════════════════
#
# Strategy:
#   Stage 1 (deps)   — install ALL deps with lockfile caching
#   Stage 2 (build)  — compile server TS, build Vite frontend
#   Stage 3 (runner) — production-only deps, static files baked
#                      into Express's /public directory
#
# Result: single container, ~200MB, no devDeps, no Vite, no tsc.
# ════════════════════════════════════════════════════════════════

# ──── Stage 1: Dependency Cache ────
FROM --platform=linux/arm64 node:20-slim AS deps
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy only package files first for layer caching
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm ci

# ──── Stage 2: Build ────
FROM --platform=linux/arm64 node:20-slim AS build
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy deps from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy all source
COPY . .

# Generate Prisma client (must happen before TS compilation)
RUN cd server && npx prisma generate

# Build server (TypeScript → dist/)
RUN npm run build -w server

# Build client (Vite → client/dist/)
RUN npm run build -w client

# ──── Stage 3: Production Runner ────
FROM --platform=linux/arm64 node:20-slim AS runner
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl sqlite3 && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system mediacloud && adduser --system --ingroup mediacloud mediacloud

# Copy workspace root package files
COPY --from=build /app/package.json ./
COPY --from=build /app/packages/shared ./packages/shared

# Copy server production files
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/scripts ./server/scripts

# ── Key: Move Vite's built frontend INTO the server's public dir ──
# Express serves these statically in production via express.static()
COPY --from=build /app/client/dist ./server/public

# Install production-only dependencies (prune devDependencies)
COPY --from=build /app/node_modules ./node_modules
RUN cd server && npm prune --omit=dev 2>/dev/null; exit 0

# Regenerate Prisma client in the production node_modules
RUN cd server && npx prisma generate

# Copy the production entrypoint script
COPY scripts/prod-init.sh ./scripts/prod-init.sh
RUN chmod +x ./scripts/prod-init.sh

# Create storage mount points (actual data comes from Docker volumes)
RUN mkdir -p /app/storage/ext4_mount /app/storage/windows_mount /app/data \
    && chown -R mediacloud:mediacloud /app

USER mediacloud

ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/mediacloud.db
ENV EXT4_MOUNT_PATH=/app/storage/ext4_mount
ENV NTFS_MOUNT_PATH=/app/storage/windows_mount

EXPOSE 3000

# Use the init script as entrypoint (handles migrations + WAL pragma)
ENTRYPOINT ["./scripts/prod-init.sh"]

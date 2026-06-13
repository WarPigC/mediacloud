# ──── Stage 1: Builder ────
FROM node:20-slim AS builder
WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy workspace root + all package.json files first (better layer caching)
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma client
RUN cd server && npx prisma generate

# Build client
RUN npm run build -w client

# Build server
RUN npm run build -w server

# ──── Stage 2: Runner ────
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN addgroup --system mediacloud && adduser --system --ingroup mediacloud mediacloud

# Copy built assets
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/node_modules ./node_modules

# Create storage directories
RUN mkdir -p /app/storage/ext4_mount /app/storage/windows_mount \
    && chown -R mediacloud:mediacloud /app

USER mediacloud

ENV NODE_ENV=production
EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "cd server && npx prisma migrate deploy && node dist/index.js"]

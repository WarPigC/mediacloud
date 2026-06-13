import { PrismaClient } from '@prisma/client';

// ─── BigInt JSON Serialization Fix ───
// BigInt cannot be serialized by JSON.stringify(). Express's res.json()
// will throw a TypeError if any response contains a BigInt.
// Our max value is ~5.4 billion (5GB quota), well within Number.MAX_SAFE_INTEGER
// (9 quadrillion), so converting to Number is safe.
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

/**
 * Singleton Prisma client.
 * In development, attach to globalThis to survive HMR restarts
 * without leaking database connections.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Enable SQLite WAL mode and a generous busy timeout.
 * - WAL allows concurrent reads while a write is in progress.
 * - busy_timeout of 5000ms makes SQLite retry instead of
 *   immediately throwing SQLITE_BUSY.
 */
export async function configureSQLite(): Promise<void> {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
  console.log('✅ SQLite configured: WAL mode + 5s busy timeout');
}

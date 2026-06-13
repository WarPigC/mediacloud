import app from './app';
import { env } from './config/env';
import { prisma, configureSQLite } from './config/db';
import { ensureStorageMounts } from './services/storage.service';
import { cleanupStaleUploads } from './services/upload.service';
import { STALE_UPLOAD_HOURS } from './config/constants';

async function main() {
  console.log('🚀 MediaCloud Server starting...');
  console.log(`   Environment: ${env.NODE_ENV}`);

  // Configure SQLite for concurrent access
  await configureSQLite();

  // Verify storage mount points exist
  await ensureStorageMounts();

  // Verify database connection
  await prisma.$connect();
  console.log('✅ Database connected');

  // Cleanup any stale uploads from previous crashes
  const cleaned = await cleanupStaleUploads();
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} stale upload sessions`);
  }

  // Schedule periodic stale upload cleanup (every hour)
  setInterval(async () => {
    try {
      const count = await cleanupStaleUploads();
      if (count > 0) {
        console.log(`🧹 Periodic cleanup: removed ${count} stale uploads`);
      }
    } catch (err) {
      console.error('Stale upload cleanup error:', err);
    }
  }, STALE_UPLOAD_HOURS * 60 * 60 * 1000 / 24); // Run every hour (24 checks per stale period)

  // Start listening
  app.listen(env.PORT, () => {
    console.log(`✅ Server listening on http://localhost:${env.PORT}`);
  });
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n⏳ ${signal} received — shutting down gracefully...`);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});

/**
 * Prisma seed script — creates the initial admin user.
 * Run with: npm run db:seed -w server
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('❌ ADMIN_PASSWORD environment variable is required for seeding.');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (existing) {
    console.log(`ℹ️  Admin user "${adminUsername}" already exists — skipping seed.`);
    return;
  }

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  const passwordHash = await bcrypt.hash(adminPassword, rounds);

  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      email: `${adminUsername}@mediacloud.local`,
      passwordHash,
      role: 'admin',
      storageQuotaBytes: BigInt(0), // Admin has no quota (uses NTFS mount)
    },
  });

  console.log(`✅ Admin user created: ${admin.username} (${admin.id})`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

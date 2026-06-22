/**
 * NTFS Drive Indexer for MediaCloud
 * 
 * Scans the NTFS mount and registers existing files into the MediaCloud
 * database so they appear on the admin's dashboard.
 * 
 * Usage:
 *   node server/scripts/sync-ntfs.js                        # Index everything
 *   node server/scripts/sync-ntfs.js Movies                 # Index only /Movies folder
 *   node server/scripts/sync-ntfs.js Movies "TV Shows"      # Index multiple folders
 *   MEDIA_ONLY=1 node server/scripts/sync-ntfs.js           # Index only media files
 *   WIPE=1 node server/scripts/sync-ntfs.js                 # Wipe all admin files first
 */

const fs = require('fs/promises');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

const NTFS_ROOT = process.env.NTFS_MOUNT_PATH || '/app/storage/windows_mount';
const MEDIA_ONLY = process.env.MEDIA_ONLY === '1';
const WIPE = process.env.WIPE === '1';

// Extended MIME mapping for common file types
const MIME_MAP = {
  // Video
  '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime', '.webm': 'video/webm', '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv', '.m4v': 'video/mp4', '.ts': 'video/mp2t',
  // Audio
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.wav': 'audio/wav',
  '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  // Image
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  // Documents
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
  // Archives
  '.zip': 'application/zip', '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed', '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  // Subtitles
  '.srt': 'text/plain', '.ass': 'text/plain', '.vtt': 'text/vtt',
};

const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.webm', '.wmv', '.flv', '.m4v', '.ts',
  '.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.wma',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
  '.srt', '.ass', '.vtt',
]);

async function scan(dir, root, files = []) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const fullPath = path.join(dir, e.name);
      if (e.isDirectory()) {
        await scan(fullPath, root, files);
      } else {
        const ext = path.extname(e.name).toLowerCase();
        if (MEDIA_ONLY && !MEDIA_EXTENSIONS.has(ext)) continue;

        files.push({
          name: e.name,
          relative: path.relative(root, fullPath),
          path: fullPath,
          ext,
        });
      }
    }
  } catch (err) {
    console.error(`  ⚠ Skipping unreadable: ${dir} (${err.message})`);
  }
  return files;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!admin) {
    console.error('❌ Admin user not found in the database!');
    process.exit(1);
  }

  console.log(`👤 Admin user: ${admin.username} (${admin.id})`);

  // Wipe existing admin files from DB if requested
  if (WIPE) {
    const deleted = await prisma.file.deleteMany({ where: { userId: admin.id } });
    console.log(`🗑  Wiped ${deleted.count} existing file entries from the database`);
  }

  // Determine scan targets
  const folderArgs = process.argv.slice(2);
  const scanPaths = folderArgs.length > 0
    ? folderArgs.map((f) => path.join(NTFS_ROOT, f))
    : [NTFS_ROOT];

  console.log(`📂 Scan targets: ${scanPaths.join(', ')}`);
  if (MEDIA_ONLY) console.log('🎬 Media-only mode: filtering to video/audio/image/subtitle files');

  let totalAdded = 0;

  for (const scanPath of scanPaths) {
    try {
      await fs.access(scanPath);
    } catch {
      console.error(`  ❌ Path does not exist: ${scanPath}`);
      continue;
    }

    console.log(`\n🔍 Scanning: ${scanPath}...`);
    const files = await scan(scanPath, NTFS_ROOT);
    console.log(`   Found ${files.length} files`);

    let added = 0;
    for (const f of files) {
      const existing = await prisma.file.findFirst({
        where: { userId: admin.id, relativePath: f.relative },
      });

      if (!existing) {
        try {
          const stat = await fs.stat(f.path);
          const mime = MIME_MAP[f.ext] || 'application/octet-stream';

          await prisma.file.create({
            data: {
              userId: admin.id,
              originalName: f.name,
              sanitizedName: f.name,
              mimeType: mime,
              sizeBytes: BigInt(stat.size),
              relativePath: f.relative,
              shareHash: crypto.randomBytes(16).toString('hex'),
            },
          });
          added++;
          if (added % 100 === 0) console.log(`   Indexed ${added} files...`);
        } catch (err) {
          console.error(`   ⚠ Failed: ${f.name} (${err.message})`);
        }
      }
    }

    console.log(`   ✅ Added ${added} new files from this folder`);
    totalAdded += added;
  }

  const totalInDb = await prisma.file.count({ where: { userId: admin.id } });
  console.log(`\n🎉 Done! Added ${totalAdded} files. Total admin files in DB: ${totalInDb}`);
}

main()
  .catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

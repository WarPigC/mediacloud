const fs = require('fs/promises');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function scan(dir, root, files = []) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const fullPath = path.join(dir, e.name);
      if (e.isDirectory()) {
        await scan(fullPath, root, files);
      } else {
        files.push({
          name: e.name,
          relative: path.relative(root, fullPath),
          path: fullPath,
        });
      }
    }
  } catch (err) {
    console.error(`Skipping unreadable path: ${dir}`, err.message);
  }
  return files;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!admin) throw new Error('Admin user not found in the database!');

  const root = '/app/storage/windows_mount';
  console.log(`Scanning NTFS drive at ${root}...`);
  
  const files = await scan(root, root);
  console.log(`Found ${files.length} files. Indexing to database...`);

  let added = 0;
  for (const f of files) {
    // Check if file already exists in DB
    const existing = await prisma.file.findFirst({
      where: { userId: admin.id, relativePath: f.relative },
    });

    if (!existing) {
      try {
        const stat = await fs.stat(f.path);
        const ext = path.extname(f.name).toLowerCase();
        
        // Extended MIME mapping for common media types
        const mimeMap = {
          '.mp4': 'video/mp4',
          '.mkv': 'video/x-matroska',
          '.avi': 'video/x-msvideo',
          '.mov': 'video/quicktime',
          '.webm': 'video/webm',
          '.mp3': 'audio/mpeg',
          '.flac': 'audio/flac',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.srt': 'text/plain',
        };
        const mime = mimeMap[ext] || 'application/octet-stream';
        
        await prisma.file.create({
          data: {
            userId: admin.id,
            originalName: f.name,
            sanitizedName: f.name, // Keep exact name for pre-existing files
            mimeType: mime,
            sizeBytes: BigInt(stat.size),
            relativePath: f.relative,
            shareHash: crypto.randomBytes(16).toString('hex'),
          }
        });
        added++;
        if (added % 100 === 0) console.log(`Indexed ${added} files...`);
      } catch (err) {
        console.error(`Failed to index file ${f.name}:`, err.message);
      }
    }
  }
  console.log(`✅ Success! Added ${added} new files to the database.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

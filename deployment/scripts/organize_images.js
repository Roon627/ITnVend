import fs from 'fs';
import path from 'path';

// Scans the Images folder for files directly under Images or under uploads
// and moves any loose files into a category folder named 'uncategorized' or
// into subfolders based on a simple heuristic (filename contains category_)

const imagesRoot = path.join(process.cwd(), 'server', 'server', 'public', 'Images');

function normalizeName(name) {
  return name.replace(/[^a-z0-9\-_.]/gi, '_');
}

async function ensureDir(dir) {
  try { await fs.promises.mkdir(dir, { recursive: true }); } catch (e) { }
}

async function run() {
  console.log('Scanning images folder:', imagesRoot);
  await ensureDir(imagesRoot);
  const entries = await fs.promises.readdir(imagesRoot, { withFileTypes: true });
  const moved = [];
  for (const ent of entries) {
    const full = path.join(imagesRoot, ent.name);
    if (ent.isFile()) {
      // move file into uncategorized
      const targetDir = path.join(imagesRoot, 'uncategorized');
      await ensureDir(targetDir);
      const target = path.join(targetDir, normalizeName(ent.name));
      await fs.promises.rename(full, target);
      moved.push({ from: full, to: target });
    } else if (ent.isDirectory()) {
      // check for any files directly inside this folder that look uncategorized
      const sub = await fs.promises.readdir(full, { withFileTypes: true });
      for (const s of sub) {
        if (s.isFile()) continue; // already in a category
      }
    }
  }
  console.log('Moved files:', moved.length);
  for (const m of moved) console.log(m.from, '->', m.to);
}

run().catch(err => { console.error('organize_images failed', err); process.exit(1); });

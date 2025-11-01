import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { setupDatabase } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
}

async function backupAndReset() {
  const root = path.resolve(__dirname, '..');
  const dbPath = path.join(root, 'database.db');
  const backupsDir = path.join(root, 'backups');

  // Check if db exists
  try {
    await fs.access(dbPath);
  } catch (err) {
    console.log('No existing database file found at', dbPath);
    console.log('A fresh database will be created.');
  }

  // Create backups dir
  await ensureDir(backupsDir);

  // If database exists, move it to backups with timestamp
  try {
    const stat = await fs.stat(dbPath);
    if (stat.isFile()) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = path.join(backupsDir, `database.db.${ts}.bak`);
      await fs.rename(dbPath, dest);
      console.log(`Moved existing database to backup: ${dest}`);
    }
  } catch (e) {
    // file doesn't exist
  }

  // Create a fresh database by running setupDatabase
  try {
    const db = await setupDatabase();
    // Close the returned db handle if available
    if (db && typeof db.close === 'function') {
      await db.close();
    }
    console.log('Fresh database created at', dbPath);
  } catch (err) {
    console.error('Failed to create fresh database:', err);
    process.exitCode = 2;
  }
}

backupAndReset().then(() => {
  console.log('Reset script finished.');
}).catch((err) => {
  console.error('Reset script failed:', err);
  process.exitCode = 1;
});

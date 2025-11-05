import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const sqlite = sqlite3.verbose();

function findDatabasePath() {
  // Prefer the backend-local database used by the server
  const candidates = [
    path.resolve(process.cwd(), 'POS', 'Backend', 'database.db'),
    path.resolve(process.cwd(), 'POS', 'Backend', 'database', 'database.db'),
    path.resolve(process.cwd(), 'database.db'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) { /* ignore */ }
  }
  // fallback to first candidate path (will likely fail) so caller sees attempted path
  return candidates[0];
}

const dbPath = findDatabasePath();
console.log('Using database path:', dbPath);

const db = new sqlite.Database(dbPath, sqlite.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open database at', dbPath, err);
    process.exit(1);
  }
  db.all("PRAGMA table_info('casual_items')", (err2, rows) => {
    if (err2) {
      console.error('PRAGMA failed:', err2);
      db.close();
      process.exit(1);
    }
    console.log("PRAGMA table_info('casual_items') output:");
    console.log(JSON.stringify(rows, null, 2));
    db.close();
  });
});

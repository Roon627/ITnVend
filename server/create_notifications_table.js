import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  try {
    const dbPath = path.join(__dirname, 'database.db');
    const db = await open({ filename: dbPath, driver: sqlite3.Database });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT,
        message TEXT,
        link TEXT,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const row = await db.get('SELECT COUNT(*) as c FROM notifications');
    console.log('NOTIFICATIONS_TABLE_OK, count =', row ? row.c : 0);
    await db.close();
  } catch (err) {
    console.error('CREATE_NOTIFICATIONS_ERROR:', err?.message || err);
    process.exit(1);
  }
})();

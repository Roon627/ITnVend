import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function run() {
  const db = await open({ filename: './database.db', driver: sqlite3.Database });
  try {
    console.log('Deleting all rows from products...');
    await db.run('DELETE FROM products');
    console.log('Products cleared. Note: categories are derived from products; if you need persistent categories create a categories table.');
  } catch (err) {
    console.error('Failed to clear products:', err.message || err);
    process.exit(1);
  } finally {
    await db.close();
  }
}

run();

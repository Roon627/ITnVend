import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function checkDB() {
  try {
    const db = await open({
      filename: './database.db',
      driver: sqlite3.Database
    });

    console.log('Checking database...');

    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables found:', tables.length);
    console.log('Table names:', tables.map(t => t.name).join(', '));

    // Check settings
    try {
      const settings = await db.get('SELECT * FROM settings WHERE id = 1');
      console.log('Settings exists:', !!settings);
      if (settings) {
        console.log('Settings data:', JSON.stringify(settings, null, 2));
      }
    } catch (e) {
      console.log('Settings table issue:', e.message);
    }

    // Check staff
    try {
      const staff = await db.all('SELECT COUNT(*) as count FROM staff');
      console.log('Staff count:', staff[0].count);
    } catch (e) {
      console.log('Staff table issue:', e.message);
    }

    // Check roles
    try {
      const roles = await db.all('SELECT * FROM roles');
      console.log('Roles found:', roles.length);
      console.log('Role names:', roles.map(r => r.name).join(', '));
    } catch (e) {
      console.log('Roles table issue:', e.message);
    }

    // Check products
    try {
      const products = await db.get('SELECT COUNT(*) as count FROM products');
      console.log('Products count:', products.count);
    } catch (e) {
      console.log('Products table issue:', e.message);
    }

    await db.close();
    console.log('Database check completed');
  } catch (err) {
    console.error('Database check failed:', err);
  }
}

checkDB();
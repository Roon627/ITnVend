// Check database tables
import { setupDatabase } from './database.js';

async function checkTables() {
  try {
    const db = await setupDatabase();
    console.log('Database tables:');
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    tables.forEach(t => console.log('- ' + t.name));
    await db.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkTables();
#!/usr/bin/env node
/*
  Recreate Postgres database schema for POS backend.
  WARNING: This will DROP the public schema (all tables) and recreate it.
  Usage:
    - Set DATABASE_URL environment variable to your Postgres connection string
    - Run: node scripts/recreate_db.js
  The script will:
    1) Connect and DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    2) Call setupDatabase() from ../database.js to create tables and ensure columns.
*/
import { Pool } from 'pg';
import { setupDatabase } from '../database.js';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Export DATABASE_URL and re-run.');
    process.exitCode = 2;
    return;
  }

  console.log('Connecting to Postgres...');
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    console.log('Dropping public schema (this will remove ALL tables)...');
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    console.log('Public schema recreated. Re-running application migrations/schema creation...');
  } catch (err) {
    console.error('Failed to reset schema:', err?.message || err);
    client.release();
    await pool.end();
    process.exitCode = 3;
    return;
  }
  client.release();
  await pool.end();

  try {
    // This will connect using DATABASE_URL as well
    const db = await setupDatabase();
    console.log('Database setup completed successfully.');
    // If setupDatabase returns a db adapter with close, close it
    if (db && typeof db.close === 'function') await db.close();
    process.exitCode = 0;
  } catch (err) {
    console.error('Failed to run setupDatabase():', err?.message || err);
    process.exitCode = 4;
  }
}

main();

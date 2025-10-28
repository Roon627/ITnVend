import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { Pool } from 'pg';

// convert '?' placeholders to $1, $2 for postgres
function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

export async function setupDatabase() {
    const DATABASE_URL = process.env.DATABASE_URL;
    if (DATABASE_URL) {
        const pool = new Pool({ connectionString: DATABASE_URL });
        // lightweight idempotent check to ensure DB is reachable
        await pool.query("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, outlet_name TEXT DEFAULT 'My Outlet')");

        return {
            run: async (sql, params = []) => {
                const converted = convertPlaceholders(sql);
                const isInsert = /^\s*INSERT\s+/i.test(sql) && !/RETURNING\s+/i.test(sql);
                const exec = isInsert ? converted + ' RETURNING id' : converted;
                const res = await pool.query(exec, params);
                if (isInsert) return { lastID: res.rows[0] ? (res.rows[0].id || null) : null, changes: res.rowCount };
                return { changes: res.rowCount };
            },
            get: async (sql, params = []) => {
                const res = await pool.query(convertPlaceholders(sql), params);
                return res.rows[0] || null;
            },
            all: async (sql, params = []) => {
                const res = await pool.query(convertPlaceholders(sql), params);
                return res.rows || [];
            }
        };
    }

    // fallback to sqlite file
    const db = await open({ filename: './database.db', driver: sqlite3.Database });
    return db;
}

#!/usr/bin/env node
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: './.env' });

const SQLITE_FILE = './database.db';
let DATABASE_URL = process.env.DATABASE_URL;
// Prefer explicit POSTGRES_* variables if available (build a host=localhost URL)
if (process.env.POSTGRES_USER && process.env.POSTGRES_DB) {
    const host = 'localhost';
    const port = process.env.POSTGRES_PORT || '5432';
    const user = process.env.POSTGRES_USER;
    const pass = process.env.POSTGRES_PASSWORD || '';
    const db = process.env.POSTGRES_DB;
    DATABASE_URL = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${encodeURIComponent(db)}`;
} else if (DATABASE_URL && DATABASE_URL.includes('@postgres:')) {
    // when running from host, replace Docker service hostname 'postgres' with localhost
    DATABASE_URL = DATABASE_URL.replace('@postgres:', '@localhost:');
}

if (!DATABASE_URL) {
    console.error('DATABASE_URL not set in server/.env');
    process.exit(1);
}

async function main() {
    if (!fs.existsSync(SQLITE_FILE)) {
        console.error('SQLite file not found:', SQLITE_FILE);
        process.exit(1);
    }

    const sqlite = await open({ filename: SQLITE_FILE, driver: sqlite3.Database });
    const pg = new Client({ connectionString: DATABASE_URL });
    await pg.connect();

    try {
        // A safe list of tables to migrate (in order to respect FKs where possible)
        const tables = [
            'settings', 'settings_email', 'outlets', 'roles', 'staff', 'staff_roles', 'products', 'customers',
            'invoices', 'invoice_items', 'payments', 'quotes', 'orders', 'order_items', 'vendors', 'activity_logs',
            'notifications', 'refresh_tokens', 'chart_of_accounts', 'general_ledger', 'journal_entries', 'journal_entry_lines',
            'accounts_payable', 'accounts_receivable', 'bank_accounts', 'bank_transactions', 'tax_rates', 'financial_periods'
        ];

        for (const t of tables) {
            console.log('Migrating table:', t);
            const rows = await sqlite.all(`SELECT * FROM ${t}`);
            if (!rows || rows.length === 0) continue;
            const cols = Object.keys(rows[0]);
            const colList = cols.map(c => `"${c}"`).join(', ');
            // Build parameter placeholders $1..$n
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
            const insertSql = `INSERT INTO ${t} (${colList}) VALUES (${placeholders})`;
            for (const r of rows) {
                const vals = cols.map(c => r[c]);
                try {
                    await pg.query(insertSql, vals);
                } catch (e) {
                    console.warn(`Failed to insert into ${t}:`, e.message);
                }
            }
        }

        console.log('Migration complete');
    } finally {
        await pg.end();
        await sqlite.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

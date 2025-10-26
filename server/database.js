import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export async function setupDatabase() {
    const db = await open({
        filename: './database.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT
        );
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            subtotal REAL NOT NULL DEFAULT 0,
            tax_amount REAL NOT NULL DEFAULT 0,
            total REAL NOT NULL DEFAULT 0,
            outlet_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        );
        CREATE TABLE IF NOT EXISTS invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER,
            product_id INTEGER,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (invoice_id) REFERENCES invoices(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            outlet_name TEXT DEFAULT 'My Outlet',
            currency TEXT DEFAULT 'MVR',
            gst_rate REAL DEFAULT 0.0,
            store_address TEXT,
            invoice_template TEXT,
            current_outlet_id INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS outlets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            currency TEXT DEFAULT 'MVR',
            gst_rate REAL DEFAULT 0.0,
            store_address TEXT,
            invoice_template TEXT
        );
    `);

    // ensure a default settings row exists with id = 1
    const existing = await db.get('SELECT id FROM settings WHERE id = 1');
    if (!existing) {
        await db.run("INSERT INTO settings (id, outlet_name, currency, gst_rate, current_outlet_id) VALUES (1, 'My Outlet', 'MVR', 0, 1)");
    }

    // ensure at least one outlet exists; seed from settings values if needed
    const outletCount = await db.get('SELECT COUNT(*) as c FROM outlets');
    if (!outletCount || outletCount.c === 0) {
        // try to copy from settings
        const s = await db.get('SELECT outlet_name, currency, gst_rate, store_address, invoice_template FROM settings WHERE id = 1');
        const name = s?.outlet_name || 'My Outlet';
        const currency = s?.currency || 'MVR';
        const gst_rate = s?.gst_rate || 0;
        const store_address = s?.store_address || null;
        const invoice_template = s?.invoice_template || null;
        const r = await db.run('INSERT INTO outlets (name, currency, gst_rate, store_address, invoice_template) VALUES (?, ?, ?, ?, ?)', [name, currency, gst_rate, store_address, invoice_template]);
        // ensure settings current_outlet_id points to the created outlet
        await db.run('UPDATE settings SET current_outlet_id = ? WHERE id = 1', [r.lastID]);
    }

    // Backfill: add columns to settings/invoices if older schema present (for safety)
    const settingsInfo = await db.all("PRAGMA table_info('settings')");
    const hasCurrentOutlet = settingsInfo.some(c => c.name === 'current_outlet_id');
    if (!hasCurrentOutlet) {
        await db.run('ALTER TABLE settings ADD COLUMN current_outlet_id INTEGER DEFAULT 1');
    }

    const invoiceInfo = await db.all("PRAGMA table_info('invoices')");
    const hasSubtotal = invoiceInfo.some(c => c.name === 'subtotal');
    if (!hasSubtotal) {
        await db.run('ALTER TABLE invoices ADD COLUMN subtotal REAL NOT NULL DEFAULT 0');
    }
    const hasTax = invoiceInfo.some(c => c.name === 'tax_amount');
    if (!hasTax) {
        await db.run('ALTER TABLE invoices ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0');
    }
    const hasOutletId = invoiceInfo.some(c => c.name === 'outlet_id');
    if (!hasOutletId) {
        await db.run('ALTER TABLE invoices ADD COLUMN outlet_id INTEGER');
    }

    return db;
}

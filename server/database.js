import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export async function setupDatabase() {
    const db = await open({
        filename: './database.db',
        driver: sqlite3.Database
    });

    await db.exec(`
        -- Products
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL,
            category TEXT,
            subcategory TEXT
        );

        -- Customers (extended for business details)
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            address TEXT,
            gst_number TEXT,
            registration_number TEXT,
            is_business INTEGER DEFAULT 0
        );

        -- Invoices & items
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            subtotal REAL NOT NULL DEFAULT 0,
            tax_amount REAL NOT NULL DEFAULT 0,
            total REAL NOT NULL DEFAULT 0,
            outlet_id INTEGER,
            type TEXT DEFAULT 'invoice',
            status TEXT DEFAULT 'issued',
            due_date DATETIME,
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

        -- Payments linked to invoices
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER,
            amount REAL NOT NULL,
            method TEXT,
            note TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(invoice_id) REFERENCES invoices(id)
        );

        -- Settings and email configuration
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            outlet_name TEXT DEFAULT 'My Outlet',
            currency TEXT DEFAULT 'MVR',
            gst_rate REAL DEFAULT 0.0,
            store_address TEXT,
            invoice_template TEXT,
            current_outlet_id INTEGER DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS settings_email (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT,
            api_key TEXT,
            email_from TEXT,
            email_to TEXT,
            smtp_host TEXT,
            smtp_port INTEGER,
            smtp_user TEXT,
            smtp_pass TEXT
        );

        -- Quotes submitted by public (kept for records)
        CREATE TABLE IF NOT EXISTS quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT,
            contact_name TEXT,
            email TEXT,
            phone TEXT,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Outlets
        CREATE TABLE IF NOT EXISTS outlets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            currency TEXT DEFAULT 'MVR',
            gst_rate REAL DEFAULT 0.0,
            store_address TEXT,
            invoice_template TEXT
        );

        -- Orders (guest/online orders)
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            total REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            product_id INTEGER,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );

        -- Vendors
        CREATE TABLE IF NOT EXISTS vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            legal_name TEXT NOT NULL,
            contact_person TEXT,
            email TEXT NOT NULL UNIQUE,
            phone TEXT,
            address TEXT,
            website TEXT,
            capabilities TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Activity logs for audit trail
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT,
            entity_id INTEGER,
            action TEXT,
            user TEXT,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Staff & roles
        CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            display_name TEXT,
            email TEXT,
            phone TEXT,
            password TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS staff_roles (
            staff_id INTEGER,
            role_id INTEGER,
            PRIMARY KEY (staff_id, role_id),
            FOREIGN KEY (staff_id) REFERENCES staff(id),
            FOREIGN KEY (role_id) REFERENCES roles(id)
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
    const hasTypeColumn = invoiceInfo.some(c => c.name === 'type');
    if (!hasTypeColumn) {
        await db.run("ALTER TABLE invoices ADD COLUMN type TEXT DEFAULT 'invoice'");
    }
    const hasStatusColumn = invoiceInfo.some(c => c.name === 'status');
    if (!hasStatusColumn) {
        await db.run("ALTER TABLE invoices ADD COLUMN status TEXT DEFAULT 'issued'");
    }

    // Ensure customers table has extra fields for GST/business details
    const customerInfo = await db.all("PRAGMA table_info('customers')");
    const custCols = customerInfo.map(c => c.name);
    if (!custCols.includes('phone')) {
        try { await db.run('ALTER TABLE customers ADD COLUMN phone TEXT'); } catch (e) { /* ignore */ }
    }
    if (!custCols.includes('address')) {
        try { await db.run('ALTER TABLE customers ADD COLUMN address TEXT'); } catch (e) { /* ignore */ }
    }
    if (!custCols.includes('gst_number')) {
        try { await db.run('ALTER TABLE customers ADD COLUMN gst_number TEXT'); } catch (e) { /* ignore */ }
    }
    if (!custCols.includes('registration_number')) {
        try { await db.run('ALTER TABLE customers ADD COLUMN registration_number TEXT'); } catch (e) { /* ignore */ }
    }
    if (!custCols.includes('is_business')) {
        try { await db.run("ALTER TABLE customers ADD COLUMN is_business INTEGER DEFAULT 0"); } catch (e) { /* ignore */ }
    }

    // Ensure settings_email has SMTP columns if older schema exists
    const emailInfo = await db.all("PRAGMA table_info('settings_email')");
    const emailCols = emailInfo.map(c => c.name);
    if (!emailCols.includes('smtp_host')) {
        try { await db.run('ALTER TABLE settings_email ADD COLUMN smtp_host TEXT'); } catch (e) { /* ignore */ }
    }
    if (!emailCols.includes('smtp_port')) {
        try { await db.run('ALTER TABLE settings_email ADD COLUMN smtp_port INTEGER'); } catch (e) { /* ignore */ }
    }
    if (!emailCols.includes('smtp_user')) {
        try { await db.run('ALTER TABLE settings_email ADD COLUMN smtp_user TEXT'); } catch (e) { /* ignore */ }
    }
    if (!emailCols.includes('smtp_pass')) {
        try { await db.run('ALTER TABLE settings_email ADD COLUMN smtp_pass TEXT'); } catch (e) { /* ignore */ }
    }

    // Seed initial products if the table is empty
    const productCount = await db.get('SELECT COUNT(*) as c FROM products');
    if (!productCount || productCount.c === 0) {
        const products = [
            // Procurement > Digital Licenses
            { name: 'Microsoft 365 Business Standard', price: 12.50, stock: 1000, category: 'Procurement', subcategory: 'Digital Licenses' },
            { name: 'Windows 11 Enterprise E3 License', price: 150.00, stock: 500, category: 'Procurement', subcategory: 'Digital Licenses' },
            { name: 'Adobe Creative Cloud for Teams', price: 79.99, stock: 300, category: 'Procurement', subcategory: 'Digital Licenses' },
            { name: 'Slack Pro Subscription (per user/year)', price: 87.00, stock: 1000, category: 'Procurement', subcategory: 'Digital Licenses' },
            { name: 'Zoom Business License (per host/year)', price: 199.90, stock: 1000, category: 'Procurement', subcategory: 'Digital Licenses' },

            // Procurement > Hardware
            { name: 'Dell Latitude 7430 Business Laptop', price: 1450.00, stock: 50, category: 'Procurement', subcategory: 'Hardware' },
            { name: 'Apple MacBook Pro 14" (M3 Pro)', price: 2199.00, stock: 40, category: 'Procurement', subcategory: 'Hardware' },
            { name: 'Logitech MX Master 3S for Business', price: 109.99, stock: 200, category: 'Procurement', subcategory: 'Hardware' },
            { name: 'Cisco Catalyst 9120AX Access Point', price: 650.00, stock: 100, category: 'Procurement', subcategory: 'Hardware' },
            
            // Managed IT Services
            { name: 'MSP - Standard Support Tier (per user/month)', price: 75.00, stock: 100, category: 'Managed IT', subcategory: 'Support Plans' },
            { name: 'MSP - Premium Support Tier (per user/month)', price: 150.00, stock: 100, category: 'Managed IT', subcategory: 'Support Plans' },
            { name: 'Cloud Backup Solution (per 1TB/month)', price: 50.00, stock: 500, category: 'Managed IT', subcategory: 'Cloud Services' },
            { name: 'Quarterly Security Audit', price: 2500.00, stock: 20, category: 'Managed IT', subcategory: 'Security' },

            // Digital Media Services
            { name: 'Social Media Management Retainer', price: 1200.00, stock: 15, category: 'Digital Media', subcategory: 'Retainers' },
            { name: 'Content Creation Package (5 assets)', price: 800.00, stock: 30, category: 'Digital Media', subcategory: 'Content' },
            { name: 'SEO & Analytics Report', price: 600.00, stock: 50, category: 'Digital Media', subcategory: 'Analytics' },

            // Smart Vending Solutions
            { name: 'Smart Vending Machine - Model S', price: 4500.00, stock: 10, category: 'Smart Vending', subcategory: 'Hardware' },
            { name: 'Vending Telemetry & Restock Plan (per machine/month)', price: 49.99, stock: 100, category: 'Smart Vending', subcategory: 'Service Plans' },
        ];

        const stmt = await db.prepare('INSERT INTO products (name, price, stock, category, subcategory) VALUES (?, ?, ?, ?, ?)');
        for (const p of products) {
            await stmt.run(p.name, p.price, p.stock, p.category, p.subcategory);
        }
        await stmt.finalize();
    }

    return db;
}

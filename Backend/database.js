import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { Pool } from 'pg';

// convert '?' placeholders to $1, $2 for postgres
function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

async function ensureColumn(db, table, column, definition) {
    const info = await db.all(`PRAGMA table_info(${table})`);
    const exists = info.some((col) => col.name === column);
    if (!exists) {
        await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
}

export async function setupDatabase() {
    const DATABASE_URL = process.env.DATABASE_URL;
    if (DATABASE_URL) {
        const pool = new Pool({ connectionString: DATABASE_URL });
        // lightweight idempotent check to ensure DB is reachable
        await pool.query("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, outlet_name TEXT DEFAULT 'My Outlet')");

<<<<<<< HEAD:Backend/database.js
    await db.exec(`
        -- Products
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL,
            category TEXT,
            subcategory TEXT,
            image TEXT,
            image_source TEXT,
            description TEXT,
            technical_details TEXT,
            sku TEXT UNIQUE,
            barcode TEXT,
            cost REAL DEFAULT 0,
            track_inventory INTEGER DEFAULT 1
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
            email_template_invoice TEXT,
            email_template_quote TEXT,
            email_template_quote_request TEXT,
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

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER,
            username TEXT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT DEFAULT 'info',
            link TEXT,
            metadata TEXT,
            read_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (staff_id) REFERENCES staff(id)
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
        
        -- Refresh tokens for long-lived sessions (hashed)
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER,
            token_hash TEXT,
            expires_at DATETIME,
            FOREIGN KEY (staff_id) REFERENCES staff(id)
        );

        -- Accounting System Tables
        CREATE TABLE IF NOT EXISTS chart_of_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT UNIQUE NOT NULL,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL, -- Asset, Liability, Equity, Revenue, Expense
            category TEXT, -- Current Assets, Fixed Assets, etc.
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS general_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER,
            transaction_date DATE NOT NULL,
            description TEXT,
            debit REAL DEFAULT 0,
            credit REAL DEFAULT 0,
            reference_type TEXT, -- invoice, payment, journal, etc.
            reference_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        );

        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_date DATE NOT NULL,
            description TEXT NOT NULL,
            reference TEXT,
            total_debit REAL NOT NULL DEFAULT 0,
            total_credit REAL NOT NULL DEFAULT 0,
            status TEXT DEFAULT 'draft', -- draft, posted, voided
            created_by INTEGER,
            approved_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES staff(id),
            FOREIGN KEY (approved_by) REFERENCES staff(id)
        );

        CREATE TABLE IF NOT EXISTS journal_entry_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER,
            account_id INTEGER,
            description TEXT,
            debit REAL DEFAULT 0,
            credit REAL DEFAULT 0,
            FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
            FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id)
        );

        CREATE TABLE IF NOT EXISTS accounts_payable (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendor_id INTEGER,
            invoice_number TEXT,
            invoice_date DATE,
            due_date DATE,
            amount REAL NOT NULL,
            paid_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'pending', -- pending, partial, paid, overdue
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (vendor_id) REFERENCES vendors(id)
        );

        CREATE TABLE IF NOT EXISTS accounts_receivable (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER,
            invoice_id INTEGER,
            amount REAL NOT NULL,
            paid_amount REAL DEFAULT 0,
            due_date DATE,
            status TEXT DEFAULT 'pending', -- pending, partial, paid, overdue
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (customer_id) REFERENCES customers(id),
            FOREIGN KEY (invoice_id) REFERENCES invoices(id)
        );

        CREATE TABLE IF NOT EXISTS bank_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_name TEXT NOT NULL,
            account_number TEXT,
            bank_name TEXT,
            currency TEXT DEFAULT 'MVR',
            opening_balance REAL DEFAULT 0,
            current_balance REAL DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bank_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_account_id INTEGER,
            transaction_date DATE NOT NULL,
            description TEXT,
            amount REAL NOT NULL,
            transaction_type TEXT, -- deposit, withdrawal, transfer
            reference_type TEXT,
            reference_id INTEGER,
            reconciled INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id)
        );

        CREATE TABLE IF NOT EXISTS tax_rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tax_name TEXT NOT NULL,
            rate REAL NOT NULL,
            tax_type TEXT, -- gst, vat, income_tax, etc.
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS financial_periods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            period_name TEXT NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            is_closed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await ensureColumn(db, 'products', 'image', 'TEXT');
    await ensureColumn(db, 'products', 'image_source', 'TEXT');
    await ensureColumn(db, 'products', 'description', 'TEXT');
    await ensureColumn(db, 'products', 'technical_details', 'TEXT');
    await ensureColumn(db, 'products', 'sku', 'TEXT');
    await ensureColumn(db, 'products', 'barcode', 'TEXT');
    await ensureColumn(db, 'products', 'cost', 'REAL DEFAULT 0');
    await ensureColumn(db, 'products', 'track_inventory', 'INTEGER DEFAULT 1');
    await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku)');

    await ensureColumn(db, 'settings', 'jwt_secret', 'TEXT');

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

    // Add email template columns if missing
    const hasInvoiceTemplateCol = settingsInfo.some(c => c.name === 'email_template_invoice');
    if (!hasInvoiceTemplateCol) {
        try { await db.run("ALTER TABLE settings ADD COLUMN email_template_invoice TEXT"); } catch (e) { /* ignore */ }
    }
    const hasQuoteTemplateCol = settingsInfo.some(c => c.name === 'email_template_quote');
    if (!hasQuoteTemplateCol) {
        try { await db.run("ALTER TABLE settings ADD COLUMN email_template_quote TEXT"); } catch (e) { /* ignore */ }
    }
    const hasQuoteReqTemplateCol = settingsInfo.some(c => c.name === 'email_template_quote_request');
    if (!hasQuoteReqTemplateCol) {
        try { await db.run("ALTER TABLE settings ADD COLUMN email_template_quote_request TEXT"); } catch (e) { /* ignore */ }
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

    // Seed default roles if not exist
    const roleCount = await db.get('SELECT COUNT(*) as c FROM roles');
    if (!roleCount || roleCount.c === 0) {
        const roles = ['admin', 'manager', 'cashier', 'accounts'];
        const roleStmt = await db.prepare('INSERT INTO roles (name) VALUES (?)');
        for (const role of roles) {
            await roleStmt.run(role);
        }
        await roleStmt.finalize();
    } else {
        // Ensure 'accounts' role exists even if other roles were already seeded
        const accountsRole = await db.get('SELECT id FROM roles WHERE name = ?', ['accounts']);
        if (!accountsRole) {
            await db.run('INSERT INTO roles (name) VALUES (?)', ['accounts']);
        }
    }

    // Seed chart of accounts if empty
    const coaCount = await db.get('SELECT COUNT(*) as c FROM chart_of_accounts');
    if (!coaCount || coaCount.c === 0) {
        const chartOfAccounts = [
            // Assets
            { code: '1000', name: 'Cash', type: 'Asset', category: 'Current Assets' },
            { code: '1100', name: 'Bank Account', type: 'Asset', category: 'Current Assets' },
            { code: '1200', name: 'Accounts Receivable', type: 'Asset', category: 'Current Assets' },
            { code: '1300', name: 'Inventory', type: 'Asset', category: 'Current Assets' },
            { code: '1400', name: 'Prepaid Expenses', type: 'Asset', category: 'Current Assets' },
            { code: '1500', name: 'Fixed Assets', type: 'Asset', category: 'Fixed Assets' },
            { code: '1600', name: 'Accumulated Depreciation', type: 'Asset', category: 'Fixed Assets' },

            // Liabilities
            { code: '2000', name: 'Accounts Payable', type: 'Liability', category: 'Current Liabilities' },
            { code: '2100', name: 'Loans Payable', type: 'Liability', category: 'Current Liabilities' },
            { code: '2200', name: 'Taxes Payable', type: 'Liability', category: 'Current Liabilities' },
            { code: '2300', name: 'Accrued Expenses', type: 'Liability', category: 'Current Liabilities' },

            // Equity
            { code: '3000', name: 'Owner\'s Equity', type: 'Equity', category: 'Equity' },
            { code: '3100', name: 'Retained Earnings', type: 'Equity', category: 'Equity' },

            // Revenue
            { code: '4000', name: 'Sales Revenue', type: 'Revenue', category: 'Revenue' },
            { code: '4100', name: 'Service Revenue', type: 'Revenue', category: 'Revenue' },
            { code: '4200', name: 'Other Income', type: 'Revenue', category: 'Revenue' },

            // Expenses
            { code: '5000', name: 'Cost of Goods Sold', type: 'Expense', category: 'Cost of Sales' },
            { code: '5100', name: 'Operating Expenses', type: 'Expense', category: 'Operating Expenses' },
            { code: '5200', name: 'Salaries and Wages', type: 'Expense', category: 'Operating Expenses' },
            { code: '5300', name: 'Rent Expense', type: 'Expense', category: 'Operating Expenses' },
            { code: '5400', name: 'Utilities', type: 'Expense', category: 'Operating Expenses' },
            { code: '5500', name: 'Marketing and Advertising', type: 'Expense', category: 'Operating Expenses' },
            { code: '5600', name: 'Depreciation Expense', type: 'Expense', category: 'Operating Expenses' },
            { code: '5700', name: 'Taxes and Licenses', type: 'Expense', category: 'Operating Expenses' },
        ];

        const coaStmt = await db.prepare('INSERT INTO chart_of_accounts (account_code, account_name, account_type, category) VALUES (?, ?, ?, ?)');
        for (const account of chartOfAccounts) {
            await coaStmt.run(account.code, account.name, account.type, account.category);
        }
        await coaStmt.finalize();
=======
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
>>>>>>> a2206d25d59f774106b2fd37712d6665978019d0:server/database.js
    }

    // fallback to sqlite file
    const db = await open({ filename: './database.db', driver: sqlite3.Database });
    return db;
}

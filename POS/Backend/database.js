import dotenv from 'dotenv';
// sqlite support intentionally disabled for Postgres-only deployments.
// If you need to re-enable SQLite, uncomment the imports below.
// import sqlite3 from 'sqlite3';
// import { open } from 'sqlite';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
    path: path.join(__dirname, '.env'),
    override: true
});

const DIALECTS = {
    POSTGRES: 'postgres',
    SQLITE: 'sqlite'
};

const DATABASE_PATH = process.env.DATABASE_PATH || './database.db';
const DATABASE_URL = resolveDatabaseUrl();

function resolveDatabaseUrl() {
    let url = process.env.DATABASE_URL || null;

    if (!url && process.env.POSTGRES_USER && process.env.POSTGRES_DB) {
        const host = process.env.POSTGRES_HOST || 'localhost';
        const port = process.env.POSTGRES_PORT || '5432';
        const user = process.env.POSTGRES_USER;
        const password = process.env.POSTGRES_PASSWORD || '';
        const database = process.env.POSTGRES_DB;
        const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
        url = `postgres://${auth}@${host}:${port}/${encodeURIComponent(database)}`;
    }

    if (url && url.includes('@postgres:')) {
        url = url.replace('@postgres:', '@localhost:');
    }

    return url;
}

// convert '?' placeholders to $1, $2 for postgres
function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

function sanitizeIdentifier(value = '') {
    return (value || '').replace(/[^a-zA-Z0-9_]/g, '');
}

function normalizeParams(params) {
    if (params == null) return [];
    return Array.isArray(params) ? params : [params];
}

function splitStatements(sql) {
    return sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((statement) => statement.trim())
        .filter(Boolean);
}

function transformSqlForDialect(sql, dialect, { isSchema = false } = {}) {
    if (dialect !== DIALECTS.POSTGRES) {
        return sql;
    }

    let transformed = sql;

    if (isSchema) {
        transformed = transformed.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
        transformed = transformed.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
        transformed = transformed.replace(/\bBOOLEAN\s+DEFAULT\s+0\b/gi, 'BOOLEAN DEFAULT FALSE');
        transformed = transformed.replace(/\bBOOLEAN\s+DEFAULT\s+1\b/gi, 'BOOLEAN DEFAULT TRUE');
    }

    const usesInsertOrIgnore = /^\s*INSERT\s+OR\s+IGNORE/i.test(transformed);
    if (usesInsertOrIgnore) {
        transformed = transformed.replace(/^\s*INSERT\s+OR\s+IGNORE/i, 'INSERT');
        if (!/ON\s+CONFLICT/i.test(transformed)) {
            transformed = `${transformed} ON CONFLICT DO NOTHING`;
        }
    }

    transformed = transformed.replace(/DEFAULT\s*\(\s*datetime\('now'\)\s*\)/gi, 'DEFAULT CURRENT_TIMESTAMP');
    transformed = transformed.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');

    return transformed;
}

function prepareQuery(sql, params, dialect, options = {}) {
    const normalizedSql = transformSqlForDialect(sql, dialect, options);
    const values = normalizeParams(params);

    if (dialect === DIALECTS.POSTGRES) {
        return { text: convertPlaceholders(normalizedSql), values };
    }

    return { text: normalizedSql, values };
}

function createPreparedStatement(adapter, sql) {
    return {
        run: (...params) => adapter.run(sql, params),
        finalize: async () => {}
    };
}

function createPostgresAdapter(connectionString) {
    const pool = new Pool({ connectionString });
    const schemaStatementRegex = /^\s*(CREATE|ALTER|DROP)\s+/i;

    const adapter = {
        dialect: DIALECTS.POSTGRES,
        async all(sql, params = []) {
            const { text, values } = prepareQuery(sql, params, this.dialect);
            const result = await pool.query(text, values);
            return result.rows;
        },
        async get(sql, params = []) {
            const rows = await this.all(sql, params);
            return rows[0] || null;
        },
        async run(sql, params = []) {
            const treatAsSchema = schemaStatementRegex.test(sql);
            const { text, values } = prepareQuery(sql, params, this.dialect, { isSchema: treatAsSchema });
            const isInsert = /^\s*insert/i.test(sql);
            const client = await pool.connect();
            try {
                const result = await client.query(text, values);
                let lastID = null;
                if (isInsert) {
                    try {
                        const lastVal = await client.query('SELECT LASTVAL() AS id');
                        lastID = lastVal.rows[0]?.id ?? null;
                    } catch (err) {
                        lastID = null;
                    }
                }
                return { changes: result.rowCount ?? 0, lastID };
            } finally {
                client.release();
            }
        },
        async exec(sql) {
            const statements = splitStatements(sql);
            if (!statements.length) return;
            const client = await pool.connect();
            try {
                for (const statement of statements) {
                    const finalSql = transformSqlForDialect(statement, this.dialect, { isSchema: true });
                    if (!finalSql) continue;
                    await client.query(finalSql);
                }
            } finally {
                client.release();
            }
        },
        prepare(sql) {
            return createPreparedStatement(this, sql);
        },
        async close() {
            await pool.end();
        }
    };

    return adapter;
}

function decorateSqliteDb(db) {
    db.dialect = DIALECTS.SQLITE;
    if (typeof db.prepare === 'function') {
        const originalPrepare = db.prepare.bind(db);
        db.prepare = async function patchedPrepare(sql) {
            return originalPrepare(sql);
        };
    }
    cachedDb = db;
    return db;
}

let cachedDb = null;

function slugifyValue(value = '') {
    return (value || '')
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
        || 'vendor';
}

async function ensureVendorSlugs(db) {
    const rows = await db.all("SELECT id, legal_name, contact_person, email, slug FROM vendors WHERE slug IS NULL OR slug = ''");
    for (const row of rows) {
        const base = slugifyValue(row.legal_name || row.contact_person || row.email || `vendor-${row.id}`);
        let candidate = base;
        let suffix = 2;
        while (true) {
            const clash = await db.get('SELECT id FROM vendors WHERE slug = ? AND id != ?', [candidate, row.id]);
            if (!clash) break;
            candidate = `${base}-${suffix++}`;
        }
        await db.run('UPDATE vendors SET slug = ? WHERE id = ?', [candidate, row.id]);
    }
    await db.run("UPDATE vendors SET public_description = notes WHERE (public_description IS NULL OR public_description = '') AND notes IS NOT NULL AND notes != ''");
}

export async function ensureColumn(db, table, column, definition) {
    const safeTable = sanitizeIdentifier(table);
    const safeColumn = sanitizeIdentifier(column);
    let columnDefinition = definition;

    if (db.dialect === DIALECTS.POSTGRES) {
        columnDefinition = columnDefinition
            .replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
            .replace(/\bDATETIME\b/gi, 'TIMESTAMP');
    }

    if (db.dialect === DIALECTS.POSTGRES) {
        // When running on Postgres, first ensure the table actually exists in public schema.
        // Some bootstrap flows call ensureColumn before the CREATE TABLE statements run, which
        // would cause ALTER TABLE to fail with "relation does not exist". If the table is
        // not present yet, skip adding the column — the CREATE TABLE will include it.
        const exists = await db.get(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?",
            [safeTable]
        );
        if (!exists) {
            return;
        }

        await db.run(`ALTER TABLE ${safeTable} ADD COLUMN IF NOT EXISTS ${safeColumn} ${columnDefinition}`);
        return;
    }

    const info = await db.all(`PRAGMA table_info(${safeTable})`);
    const exists = info.some((col) => col.name === column);
    if (!exists) {
        await db.run(`ALTER TABLE ${safeTable} ADD COLUMN ${safeColumn} ${columnDefinition}`);
    }
}

async function migrateLegacyShifts(db) {
    if (db.dialect === DIALECTS.POSTGRES) {
        return;
    }
    const info = await db.all("PRAGMA table_info('shifts')");
    if (!info.length) return;
    const hasLegacyColumns = info.some((col) => col.name === 'opened_by');
    const hasModernOutlet = info.some((col) => col.name === 'outlet_id');
    if (!hasLegacyColumns || hasModernOutlet) return;

    console.warn('Detected legacy shifts table; migrating to modern schema');
    await db.exec('ALTER TABLE shifts RENAME TO shifts_legacy');
    await db.exec(`
        CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outlet_id INTEGER,
            started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            started_by INTEGER,
            closed_by INTEGER,
            starting_balance REAL,
            closing_balance REAL,
            device_id TEXT,
            note TEXT,
            totals TEXT,
            discrepancies TEXT,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const legacyRows = await db.all('SELECT * FROM shifts_legacy');
    if (legacyRows.length) {
        const insert = await db.prepare(`
            INSERT INTO shifts (
                outlet_id,
                started_at,
                ended_at,
                started_by,
                closed_by,
                starting_balance,
                closing_balance,
                device_id,
                note,
                totals,
                discrepancies,
                status,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const row of legacyRows) {
            const startedAt = row.opened_at || new Date().toISOString();
            const endedAt = row.closed_at || null;
            const status = endedAt ? 'closed' : 'active';
            const noteParts = [];
            if (row.notes) noteParts.push(row.notes);
            if (row.opened_by) noteParts.push(`Opened by: ${row.opened_by}`);
            if (row.closed_by) noteParts.push(`Closed by: ${row.closed_by}`);
            const note = noteParts.length ? noteParts.join('\n') : null;
            const discrepancies = row.discrepancy != null ? JSON.stringify({ cash: row.discrepancy }) : null;
            const totals = row.cash_counts || null;
            const createdAt = startedAt;
            const updatedAt = endedAt || startedAt;

            await insert.run(
                1, // default outlet
                startedAt,
                endedAt,
                null,
                null,
                row.starting_cash ?? null,
                row.actual_cash ?? null,
                null,
                note,
                totals,
                discrepancies,
                status,
                createdAt,
                updatedAt
            );
        }

        await insert.finalize();
    }

    await db.exec('DROP TABLE shifts_legacy');
}

export async function setupDatabase() {
    if (cachedDb) {
        return cachedDb;
    }

    // Enforce Postgres-only mode. Ensure DATABASE_URL is set in your environment.
    if (!DATABASE_URL) {
        throw new Error('DATABASE_URL is not set. This deployment is configured for Postgres only. Set DATABASE_URL in POS/Backend/.env');
    }
    const db = createPostgresAdapter(DATABASE_URL);

    // Ensure foreign keys are enforced (SQLite requires pragma)
    if (db.dialect === DIALECTS.SQLITE) {
        await db.exec('PRAGMA foreign_keys = ON;');
    }

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
            track_inventory INTEGER DEFAULT 1,
            preorder_enabled INTEGER DEFAULT 0,
            preorder_release_date TEXT,
            preorder_notes TEXT,
            availability_status TEXT DEFAULT 'in_stock'
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

        -- optional customer_type to distinguish vendors/sellers/regular
        `);

        // add customer_type column non-destructively
        await ensureColumn(db, 'customers', 'customer_type', "TEXT DEFAULT 'regular'");
    // allow storing uploaded logo URL and attachments metadata for business customers
    await ensureColumn(db, 'customers', 'logo_url', 'TEXT');
    await ensureColumn(db, 'customers', 'attachments', 'TEXT');
    // vendor attachments metadata
    await ensureColumn(db, 'vendors', 'attachments', 'TEXT');
        await ensureColumn(db, 'products', 'availability_status', "TEXT DEFAULT 'in_stock'");
        try {
            await db.run("UPDATE products SET availability_status = 'preorder' WHERE preorder_enabled = 1 AND (availability_status IS NULL OR availability_status = '' OR availability_status = 'in_stock')");
        } catch (err) {
            console.warn('Failed to backfill availability_status for preorder items', err?.message || err);
        }

        await db.exec(`

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
            reference TEXT,
            slip_path TEXT,
            recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(invoice_id) REFERENCES invoices(id)
        );

        -- Payment slips persisted for staff review and validation
        CREATE TABLE IF NOT EXISTS slips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            storage_key TEXT,
            storage_path TEXT,
            source TEXT DEFAULT 'pos', -- pos | website
            uploaded_by INTEGER,
            uploaded_by_name TEXT,
            ocr_text TEXT,
            ocr_confidence REAL,
            validation_result TEXT, -- JSON blob
            status TEXT DEFAULT 'pending', -- pending | validated | failed
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Settings and email configuration
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            outlet_name TEXT DEFAULT 'My Outlet',
            currency TEXT DEFAULT 'MVR',
            gst_rate REAL DEFAULT 0.0,
            exchange_rate REAL,
            store_address TEXT,
            invoice_template TEXT,
            email_template_invoice TEXT,
            email_template_quote TEXT,
            email_template_quote_request TEXT,
            email_template_new_order_staff TEXT,
            email_template_password_reset_subject TEXT,
            email_template_password_reset TEXT,
            logo_url TEXT,
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

        CREATE TABLE IF NOT EXISTS product_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT NOT NULL UNIQUE,
            parent_id INTEGER REFERENCES product_categories(id) ON DELETE CASCADE,
            level INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1
        );

        CREATE INDEX IF NOT EXISTS idx_product_categories_parent ON product_categories(parent_id);
        CREATE INDEX IF NOT EXISTS idx_product_categories_slug ON product_categories(slug);

        CREATE TABLE IF NOT EXISTS brands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT
        );

        CREATE TABLE IF NOT EXISTS materials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS colors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            hex TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS product_tags (
            product_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (product_id, tag_id),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        -- Staff & roles (must exist before dependent tables/foreign keys)
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

        -- Password reset tokens for staff (one-time, short lived)
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            used INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (staff_id) REFERENCES staff(id)
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
            customer_phone TEXT,
            customer_company TEXT,
            total REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            payment_method TEXT,
            payment_reference TEXT,
            payment_slip TEXT,
            source TEXT DEFAULT 'pos',
            is_preorder INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER,
            product_id INTEGER,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL,
            is_preorder INTEGER DEFAULT 0,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS preorders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_store TEXT,
            cart_links TEXT,
            notes TEXT,
            customer_name TEXT,
            customer_email TEXT,
            customer_phone TEXT,
            delivery_address TEXT,
            usd_total REAL,
            exchange_rate REAL,
            mvr_total REAL,
            payment_reference TEXT,
            payment_date TEXT,
            payment_slip TEXT,
            payment_bank TEXT,
            status TEXT DEFAULT 'pending',
            status_history TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            bank_details TEXT,
            logo_url TEXT,
            attachments TEXT,
            commission_rate REAL DEFAULT 0.0,
            status TEXT DEFAULT 'pending',
            customer_id INTEGER,
            slug TEXT UNIQUE,
            tagline TEXT,
            public_description TEXT,
            hero_image TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Activity logs for audit trail
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT,
            entity_id INTEGER,
            action TEXT,
            actor TEXT,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Shifts: track POS staff shifts and reconciliation metadata
        CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            outlet_id INTEGER,
            started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            started_by INTEGER,
            closed_by INTEGER,
            starting_balance REAL,
            closing_balance REAL,
            device_id TEXT,
            note TEXT,
            totals TEXT, -- JSON blob with aggregated totals by method
            discrepancies TEXT, -- JSON
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Stock adjustments audit table
        CREATE TABLE IF NOT EXISTS stock_adjustments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            staff_id INTEGER,
            username TEXT,
            delta INTEGER,
            new_stock INTEGER,
            reason TEXT,
            reference TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (staff_id) REFERENCES staff(id)
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

        -- Operations tables
        CREATE TABLE IF NOT EXISTS day_end_closes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            close_date DATE NOT NULL,
            actual_cash REAL,
            discrepancy REAL DEFAULT 0,
            notes TEXT,
            closed_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS monthly_closes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            month INTEGER NOT NULL, -- 1-12
            year INTEGER NOT NULL,
            closed_by TEXT NOT NULL,
            closed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS card_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT UNIQUE,
            amount DECIMAL(10,2) NOT NULL,
            status TEXT DEFAULT 'pending',
            card_type TEXT,
            reference_number TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER,
            reference_number TEXT,
            purchase_date DATE NOT NULL,
            total_amount REAL NOT NULL,
            status TEXT DEFAULT 'pending', -- pending, received, cancelled
            reversed INTEGER DEFAULT 0,
            reversed_at DATETIME,
            reversed_by TEXT,
            reversal_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (supplier_id) REFERENCES vendors(id)
        );

        CREATE TABLE IF NOT EXISTS purchase_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_id INTEGER,
            product_id INTEGER,
            quantity INTEGER NOT NULL,
            unit_cost REAL NOT NULL,
            total_cost REAL NOT NULL,
            received_quantity INTEGER DEFAULT 0,
            FOREIGN KEY (purchase_id) REFERENCES purchases(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact_person TEXT,
            email TEXT,
            phone TEXT,
            address TEXT,
            gst_number TEXT,
            payment_terms TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS inventory_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER,
            type TEXT NOT NULL, -- sale, purchase, adjustment, transfer
            quantity INTEGER NOT NULL,
            unit_cost REAL DEFAULT 0,
            reference TEXT, -- invoice id, purchase id, etc.
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id)
        );

        CREATE TABLE IF NOT EXISTS cash_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL, -- cash_in, cash_out
            amount REAL NOT NULL,
            description TEXT,
            reference TEXT,
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await migrateLegacyShifts(db);

    await ensureColumn(db, 'products', 'image', 'TEXT');
    await ensureColumn(db, 'products', 'image_source', 'TEXT');
    await ensureColumn(db, 'products', 'description', 'TEXT');
    await ensureColumn(db, 'products', 'technical_details', 'TEXT');
    await ensureColumn(db, 'products', 'sku', 'TEXT');
    await ensureColumn(db, 'products', 'barcode', 'TEXT');
    await ensureColumn(db, 'products', 'cost', 'REAL DEFAULT 0');
    await ensureColumn(db, 'products', 'track_inventory', 'INTEGER DEFAULT 1');
    await ensureColumn(db, 'products', 'preorder_enabled', 'INTEGER DEFAULT 0');
    await ensureColumn(db, 'products', 'preorder_release_date', 'TEXT');
    await ensureColumn(db, 'products', 'preorder_notes', 'TEXT');
    await ensureColumn(db, 'products', 'short_description', 'TEXT');
    await ensureColumn(db, 'products', 'type', 'TEXT');
    await ensureColumn(db, 'products', 'brand_id', 'INTEGER');
    await ensureColumn(db, 'products', 'category_id', 'INTEGER');
    await ensureColumn(db, 'products', 'subcategory_id', 'INTEGER');
    await ensureColumn(db, 'products', 'subsubcategory_id', 'INTEGER');
    await ensureColumn(db, 'products', 'material_id', 'INTEGER');
    await ensureColumn(db, 'products', 'color_id', 'INTEGER');
    await ensureColumn(db, 'products', 'audience', 'TEXT');
    await ensureColumn(db, 'products', 'delivery_type', 'TEXT');
    await ensureColumn(db, 'products', 'warranty_term', 'TEXT');
    await ensureColumn(db, 'products', 'preorder_eta', 'TEXT');
    await ensureColumn(db, 'products', 'year', 'INTEGER');
    await ensureColumn(db, 'products', 'auto_sku', 'INTEGER DEFAULT 1');
    await ensureColumn(db, 'products', 'tags_cache', 'TEXT');
    await ensureColumn(db, 'products', 'vendor_id', 'INTEGER');
    await ensureColumn(db, 'products', 'gallery', 'TEXT');
    await ensureColumn(db, 'products', 'digital_download_url', 'TEXT');
    await ensureColumn(db, 'products', 'digital_license_key', 'TEXT');
    await ensureColumn(db, 'products', 'digital_activation_limit', 'INTEGER');
    await ensureColumn(db, 'products', 'digital_expiry', 'TEXT');
    await ensureColumn(db, 'products', 'digital_support_url', 'TEXT');
    await ensureColumn(db, 'products', 'highlight_active', 'INTEGER DEFAULT 0');
    await ensureColumn(db, 'products', 'highlight_label', 'TEXT');
    await ensureColumn(db, 'products', 'highlight_priority', 'INTEGER DEFAULT 0');
    await ensureColumn(db, 'products', 'new_arrival', 'INTEGER DEFAULT 0');
    await ensureColumn(db, 'products', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
    await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products(subcategory_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_products_subsubcategory ON products(subsubcategory_id)');

    await ensureColumn(db, 'shifts', 'opened_at', 'DATETIME');
    await ensureColumn(db, 'shifts', 'opened_by', 'TEXT');
    await ensureColumn(db, 'shifts', 'closed_at', 'DATETIME');
    await ensureColumn(db, 'shifts', 'starting_cash', 'REAL DEFAULT 0');
    await ensureColumn(db, 'shifts', 'actual_cash', 'REAL');
    await ensureColumn(db, 'shifts', 'cash_counts', 'TEXT');
    await ensureColumn(db, 'shifts', 'discrepancy', 'REAL DEFAULT 0');
    await ensureColumn(db, 'shifts', 'notes', 'TEXT');

    await db.run("UPDATE shifts SET opened_at = started_at WHERE opened_at IS NULL AND started_at IS NOT NULL");
    
    // Ensure outlets can store payment instructions shown on invoices
    await ensureColumn(db, 'outlets', 'payment_instructions', 'TEXT');
    await ensureColumn(db, 'outlets', 'footer_note', 'TEXT');
    await ensureColumn(db, 'settings', 'footer_note', 'TEXT');
    // Control which storefront sections appear in the public header/hero.
    // Allowed values: 'both' (default) | 'featured'
    await ensureColumn(db, 'settings', 'storefront_header_source', "TEXT DEFAULT 'both'");

    // Vendor extensions: commission rate (default 10%), bank/payment details and logo
    await ensureColumn(db, 'vendors', 'commission_rate', 'REAL DEFAULT 0.0');
    await ensureColumn(db, 'vendors', 'bank_details', 'TEXT');
    await ensureColumn(db, 'vendors', 'logo_url', 'TEXT');
    await ensureColumn(db, 'vendors', 'status', "TEXT DEFAULT 'pending'");
    // optional link to customers table when vendor is approved
    await ensureColumn(db, 'vendors', 'customer_id', 'INTEGER');
    await ensureColumn(db, 'vendors', 'slug', 'TEXT');
    await ensureColumn(db, 'vendors', 'tagline', 'TEXT');
    await ensureColumn(db, 'vendors', 'public_description', 'TEXT');
    await ensureColumn(db, 'vendors', 'hero_image', 'TEXT');
    await ensureVendorSlugs(db);
    await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_slug ON vendors(slug)');

    // Casual sellers / one-time listings (lightweight flow)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS casual_sellers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT,
            phone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS casual_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            casual_seller_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            condition TEXT,
            asking_price REAL,
            featured INTEGER DEFAULT 0,
            listing_fee REAL DEFAULT 0,
            product_id INTEGER,
            invoice_id INTEGER,
            status TEXT DEFAULT 'pending_payment',
            -- user provided category/subcategory and tag to help admins triage
            user_category TEXT,
            user_subcategory TEXT,
            user_tag TEXT,
            details_payload TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (casual_seller_id) REFERENCES casual_sellers(id),
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (invoice_id) REFERENCES invoices(id)
        );

        CREATE TABLE IF NOT EXISTS casual_item_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            casual_item_id INTEGER,
            path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (casual_item_id) REFERENCES casual_items(id)
        );
    `);
    // link casual sellers to customers when approved
    await ensureColumn(db, 'casual_sellers', 'customer_id', 'INTEGER');
    // Ensure casual_items has product_id column for approvals that set product_id
    await ensureColumn(db, 'casual_items', 'product_id', 'INTEGER');
    // Ensure casual_items has user-provided category/subcategory/tag fields
    await ensureColumn(db, 'casual_items', 'user_category', "TEXT");
    await ensureColumn(db, 'casual_items', 'user_subcategory', "TEXT");
    await ensureColumn(db, 'casual_items', 'user_tag', "TEXT");
    await ensureColumn(db, 'casual_items', 'details_payload', "TEXT");
    await db.run("UPDATE shifts SET opened_by = COALESCE(opened_by, CAST(started_by AS TEXT)) WHERE started_by IS NOT NULL");
    await db.run("UPDATE shifts SET closed_at = ended_at WHERE closed_at IS NULL AND ended_at IS NOT NULL");
    await db.run("UPDATE shifts SET starting_cash = COALESCE(starting_cash, starting_balance) WHERE starting_balance IS NOT NULL");
    await db.run("UPDATE shifts SET actual_cash = COALESCE(actual_cash, closing_balance) WHERE closing_balance IS NOT NULL");
    await db.run("UPDATE shifts SET notes = COALESCE(notes, note) WHERE note IS NOT NULL AND (notes IS NULL OR TRIM(notes) = '')");

    const slugify = (value) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

    // Seed lookup tables with baseline data if empty
    const brandCount = await db.get('SELECT COUNT(*) as c FROM brands');
    if (!brandCount || brandCount.c === 0) {
        const defaultBrands = ['Microsoft', 'Apple', 'HP', 'Dell', 'Lenovo', 'Generic'];
        for (const name of defaultBrands) {
            await db.run('INSERT OR IGNORE INTO brands (name, description) VALUES (?, ?)', [name, null]);
        }
    }

    const materialCount = await db.get('SELECT COUNT(*) as c FROM materials');
    if (!materialCount || materialCount.c === 0) {
        const defaultMaterials = ['Cotton', 'Polyester', 'Leather', 'Metal', 'Digital'];
        for (const name of defaultMaterials) {
            await db.run('INSERT OR IGNORE INTO materials (name) VALUES (?)', [name]);
        }
    }

    const colorCount = await db.get('SELECT COUNT(*) as c FROM colors');
    if (!colorCount || colorCount.c === 0) {
        const defaultColors = [
            { name: 'Classic Black', hex: '#111111' },
            { name: 'Snow White', hex: '#FFFFFF' },
            { name: 'Azure Blue', hex: '#0078D4' },
            { name: 'Sunrise Orange', hex: '#FF8A3D' }
        ];
        for (const color of defaultColors) {
            await db.run('INSERT OR IGNORE INTO colors (name, hex) VALUES (?, ?)', [color.name, color.hex]);
        }
    }

    const categoryCount = await db.get('SELECT COUNT(*) as c FROM product_categories');
    if (!categoryCount || categoryCount.c === 0) {
        // Seed example hierarchy for digital licences and apparel
        const categories = [
            { name: 'Digital License', parent: null },
            { name: 'Microsoft', parent: 'Digital License' },
            { name: 'Office Professional Plus 2021', parent: 'Microsoft' },
            { name: 'Men', parent: null },
            { name: 'Fashion', parent: 'Men' },
            { name: 'Garments', parent: 'Fashion' },
            { name: 'Shirts', parent: 'Garments' }
        ];

        const inserted = new Map();
        for (const entry of categories) {
            let parentId = null;
            let level = 0;
            if (entry.parent && inserted.has(entry.parent)) {
                const parent = inserted.get(entry.parent);
                parentId = parent.id;
                level = parent.level + 1;
            }
            const slug = slugify(`${entry.parent ? `${entry.parent}-` : ''}${entry.name}`);
            const { lastID } = await db.run(
                'INSERT INTO product_categories (name, slug, parent_id, level) VALUES (?, ?, ?, ?)',
                [entry.name, slug, parentId, level]
            );
            inserted.set(entry.name, { id: lastID, level });
        }
    }

    const tagCount = await db.get('SELECT COUNT(*) as c FROM tags');
    if (!tagCount || tagCount.c === 0) {
        const defaultTags = ['Digital Download', 'Instant Delivery', 'Men', 'Women', 'Preorder', 'Best Seller'];
        for (const name of defaultTags) {
            await db.run('INSERT OR IGNORE INTO tags (name, slug) VALUES (?, ?)', [name, slugify(name)]);
        }
    }

    // staff avatar column for profile images
    await ensureColumn(db, 'staff', 'avatar', 'TEXT');
    // lock flag to disable staff accounts without removing them
    await ensureColumn(db, 'staff', 'locked', 'INTEGER DEFAULT 0');

    await ensureColumn(db, 'quotes', 'submission_type', 'TEXT');
    await ensureColumn(db, 'quotes', 'existing_customer_ref', 'TEXT');
    await ensureColumn(db, 'quotes', 'registration_number', 'TEXT');

    await ensureColumn(db, 'orders', 'customer_phone', 'TEXT');
    await ensureColumn(db, 'orders', 'customer_company', 'TEXT');
    await ensureColumn(db, 'orders', 'payment_method', 'TEXT');
    await ensureColumn(db, 'orders', 'payment_reference', 'TEXT');
    await ensureColumn(db, 'orders', 'payment_slip', 'TEXT');
    await ensureColumn(db, 'orders', 'source', "TEXT DEFAULT 'pos'");
    await ensureColumn(db, 'orders', 'is_preorder', 'INTEGER DEFAULT 0');
    await ensureColumn(db, 'order_items', 'is_preorder', 'INTEGER DEFAULT 0');
    await ensureColumn(db, 'payments', 'reference', 'TEXT');
    await ensureColumn(db, 'payments', 'slip_path', 'TEXT');
    await ensureColumn(db, 'settings', 'social_facebook', 'TEXT');
    await ensureColumn(db, 'settings', 'social_instagram', 'TEXT');
    await ensureColumn(db, 'settings', 'social_whatsapp', 'TEXT');
    await ensureColumn(db, 'settings', 'social_telegram', 'TEXT');
    await ensureColumn(db, 'settings', 'email_template_new_order_staff', 'TEXT');
    await ensureColumn(db, 'settings', 'logo_url', 'TEXT');
    await ensureColumn(db, 'settings', 'payment_qr_code_url', 'TEXT');
    await ensureColumn(db, 'settings', 'payment_transfer_details', 'TEXT');

    await ensureColumn(db, 'invoices', 'total_amount', 'REAL DEFAULT 0');
    await ensureColumn(db, 'invoices', 'payment_method', 'TEXT');
    await ensureColumn(db, 'invoices', 'payment_reference', 'TEXT');
    await ensureColumn(db, 'preorders', 'delivery_address', 'TEXT');
    await ensureColumn(db, 'preorders', 'payment_bank', 'TEXT');
    await ensureColumn(db, 'preorders', 'payment_type', 'TEXT DEFAULT \'bank_transfer\'');
    await ensureColumn(db, 'preorders', 'items_snapshot', 'TEXT');

    // ensure a default settings row exists with id = 1
    const existing = await db.get('SELECT id FROM settings WHERE id = 1');
    if (!existing) {
    await db.run(`INSERT INTO settings (id, outlet_name, currency, gst_rate, exchange_rate, email_template_password_reset_subject, email_template_password_reset, current_outlet_id, social_facebook, social_instagram, social_whatsapp, social_telegram) VALUES (1, 'My Outlet', 'MVR', 0, NULL, 'Reset your password', 'Hello {{name}},<br/><br/>Click the link below to reset your password:<br/><a href="{{reset_link}}">Reset password</a><br/><br/>If you did not request this, ignore this email.', 1, NULL, NULL, NULL, NULL)`);
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
    await ensureColumn(db, 'settings', 'current_outlet_id', 'INTEGER DEFAULT 1');
    await ensureColumn(db, 'settings', 'exchange_rate', 'REAL');
    await ensureColumn(db, 'settings', 'email_template_invoice', 'TEXT');
    await ensureColumn(db, 'settings', 'email_template_quote', 'TEXT');
    await ensureColumn(db, 'settings', 'email_template_quote_request', 'TEXT');
    await ensureColumn(db, 'settings', 'email_template_password_reset_subject', 'TEXT');
    await ensureColumn(db, 'settings', 'email_template_password_reset', 'TEXT');

    await ensureColumn(db, 'invoices', 'subtotal', 'REAL NOT NULL DEFAULT 0');
    await ensureColumn(db, 'invoices', 'tax_amount', 'REAL NOT NULL DEFAULT 0');
    await ensureColumn(db, 'invoices', 'outlet_id', 'INTEGER');
    await ensureColumn(db, 'invoices', 'type', "TEXT DEFAULT 'invoice'");
    await ensureColumn(db, 'invoices', 'status', "TEXT DEFAULT 'issued'");

    // Ensure customers table has extra fields for GST/business details
    await ensureColumn(db, 'customers', 'phone', 'TEXT');
    await ensureColumn(db, 'customers', 'address', 'TEXT');
    await ensureColumn(db, 'customers', 'gst_number', 'TEXT');
    await ensureColumn(db, 'customers', 'registration_number', 'TEXT');
    await ensureColumn(db, 'customers', 'is_business', 'INTEGER DEFAULT 0');

    // Ensure settings_email has SMTP columns if older schema exists
    await ensureColumn(db, 'settings_email', 'smtp_host', 'TEXT');
    await ensureColumn(db, 'settings_email', 'smtp_port', 'INTEGER');
    await ensureColumn(db, 'settings_email', 'smtp_user', 'TEXT');
    await ensureColumn(db, 'settings_email', 'smtp_pass', 'TEXT');
    await ensureColumn(db, 'settings_email', 'smtp_secure', 'INTEGER DEFAULT 0');
    await ensureColumn(db, 'settings_email', 'smtp_require_tls', 'INTEGER DEFAULT 0');
    await ensureColumn(db, 'settings_email', 'smtp_from_name', 'TEXT');
    await ensureColumn(db, 'settings_email', 'smtp_reply_to', 'TEXT');

    // Seed initial products if the table is empty. Controlled by SEED_PRODUCTS env var to avoid demo data in production.
    const productCount = await db.get('SELECT COUNT(*) as c FROM products');
    if ((process.env.SEED_PRODUCTS === 'true') && (!productCount || productCount.c === 0)) {
        const products = [
            // Procurement > Digital Licenses
            { name: 'Microsoft 365 Business Standard', price: 12.50, stock: 1000, category: 'Procurement', subcategory: 'Digital Licenses' },
            { name: 'Windows 11 Enterprise E3 License', price: 150.00, stock: 500, category: 'Procurement', subcategory: 'Digital Licenses' },
            { name: 'Adobe Creative Cloud for Teams', price: 79.99, stock: 300, category: 'Procurement', subcategory: 'Digital Licenses' },
            { name: 'Slack Pro Subscription (per user/year)', price: 87.00, stock: 1000, category: 'Procurement', subcategory: 'Digital Licenses' },
            { name: 'Zoom Business License (per host/year)', price: 199.90, stock: 1000, category: 'Procurement', subcategory: 'Digital Licenses' },
            { name: 'POS License - Single Terminal (1 year)', price: 199.00, stock: 1000, category: 'Procurement', subcategory: 'Digital Licenses' },
            { name: 'POS License - Multi-Terminal (per terminal/year)', price: 149.00, stock: 500, category: 'Procurement', subcategory: 'Digital Licenses' },

            // Procurement > Hardware
            { name: 'Dell Latitude 7430 Business Laptop', price: 1450.00, stock: 50, category: 'Procurement', subcategory: 'Hardware' },
            { name: 'Apple MacBook Pro 14" (M3 Pro)', price: 2199.00, stock: 40, category: 'Procurement', subcategory: 'Hardware' },
            { name: 'Logitech MX Master 3S for Business', price: 109.99, stock: 200, category: 'Procurement', subcategory: 'Hardware' },
            { name: 'Cisco Catalyst 9120AX Access Point', price: 650.00, stock: 100, category: 'Procurement', subcategory: 'Hardware' },
            { name: 'Thermal Printer - Desktop (USB)', price: 249.00, stock: 25, category: 'Procurement', subcategory: 'Hardware' },
            { name: 'Barcode Scanner - USB', price: 49.99, stock: 0, category: 'Procurement', subcategory: 'Hardware' },
            { name: 'Cash Drawer - Heavy Duty', price: 89.99, stock: 10, category: 'Procurement', subcategory: 'Hardware' },

            // POS Consumables (include some zero-stock items intentionally)
            { name: 'Receipt Paper Roll (pack of 10)', price: 12.50, stock: 0, category: 'Consumables', subcategory: 'POS Supplies' },
            { name: 'Thermal Printer Replacement Head', price: 45.00, stock: 0, category: 'Consumables', subcategory: 'POS Supplies' },

            // Managed IT Services
            { name: 'MSP - Standard Support Tier (per user/month)', price: 75.00, stock: 100, category: 'Managed IT', subcategory: 'Support Plans' },
            { name: 'MSP - Premium Support Tier (per user/month)', price: 150.00, stock: 100, category: 'Managed IT', subcategory: 'Support Plans' },
            { name: 'Cloud Backup Solution (per 1TB/month)', price: 50.00, stock: 500, category: 'Managed IT', subcategory: 'Cloud Services' },
            { name: 'Quarterly Security Audit', price: 2500.00, stock: 20, category: 'Managed IT', subcategory: 'Security' },

            // Digital Media Services
            { name: 'Social Media Management Retainer', price: 300.00, stock: 15, category: 'Digital Media', subcategory: 'Retainers' },
            { name: 'Content Creation Package (5 assets)', price: 800.00, stock: 30, category: 'Digital Media', subcategory: 'Content' },
            { name: 'SEO & Analytics Report', price: 600.00, stock: 50, category: 'Digital Media', subcategory: 'Analytics' },

            // Smart Vending Solutions
            { name: 'Smart Vending Machine - Model S', price: 4500.00, stock: 10, category: 'Smart Vending', subcategory: 'Hardware' },
            { name: 'Vending Telemetry & Restock Plan (per machine/month)', price: 49.99, stock: 100, category: 'Smart Vending', subcategory: 'Service Plans' },

            // Extras & spare parts
            { name: 'Spare Parts Kit - Vending (assorted)', price: 120.00, stock: 5, category: 'Smart Vending', subcategory: 'Parts' },
        ];

        const stmt = await db.prepare('INSERT INTO products (name, price, stock, category, subcategory) VALUES (?, ?, ?, ?, ?)');
        for (const p of products) {
            await stmt.run(p.name, p.price, p.stock, p.category, p.subcategory);
        }
        await stmt.finalize();
    } else {
        if (!productCount || productCount.c === 0) {
            console.log('SEED_PRODUCTS is not enabled; skipping default product seeding.');
        }
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
    }

    // return the opened sqlite database instance
    // Ensure essential Chart of Accounts entries exist (idempotent).
    // These are required by the commission & vendor payable posting logic.
    // We prefer not to auto-create many accounts, only the minimal ones used in code paths.
    try {
        const ensureCoa = async (code, name, type = 'Revenue', category = 'Revenue') => {
            const existing = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', [code]);
            if (!existing) {
                await db.run('INSERT INTO chart_of_accounts (account_code, account_name, account_type, category) VALUES (?, ?, ?, ?)', [code, name, type, category]);
                console.log(`Created missing chart_of_accounts entry ${code} - ${name}`);
            }
        };

    // Ensure essential accounts exist that the application expects in various flows.
    // Accounts Receivable (1200) is required when creating invoices/orders.
    await ensureCoa('1200', 'Accounts Receivable', 'Asset', 'Current Assets');
    // Sales Revenue (4000) and Taxes Payable (2200) are used by invoice posting logic.
    await ensureCoa('4000', 'Sales Revenue', 'Revenue', 'Revenue');
    await ensureCoa('2200', 'Taxes Payable', 'Liability', 'Current Liabilities');
    // Accounts Payable (2000) - used for vendor payable GL lines
    await ensureCoa('2000', 'Accounts Payable', 'Liability', 'Current Liabilities');
    // Commission revenue (company's share) - if the seeded 4200 doesn't exist create a commission revenue account
    // Note: the seed normally includes 4200 as Other Income; here we ensure an appropriate revenue account exists
    await ensureCoa('4200', 'Commission Revenue', 'Revenue', 'Revenue');
    } catch (err) {
        // Do not throw - logging only so DB initialization continues in case of transient issues
        console.warn('Failed to ensure minimal chart_of_accounts entries:', err?.message || err);
    }

    return db;
}

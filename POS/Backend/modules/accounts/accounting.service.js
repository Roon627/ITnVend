// Small accounting service helper to create immutable accounting entries used by reporting.

function resolveSchemaFragments(db) {
    const isPostgres = (db?.dialect || '').toLowerCase() === 'postgres';
    return {
        idColumn: isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT',
        timestampType: isPostgres ? 'TIMESTAMP' : 'DATETIME'
    };
}

export async function ensureAccountingSchema(db) {
    // Use existing journal_entries/journal_entry_lines tables; create accounting_entries table as immutable record
    const { idColumn, timestampType } = resolveSchemaFragments(db);
    await db.run(`
        CREATE TABLE IF NOT EXISTS accounting_entries (
            id ${idColumn},
            type TEXT NOT NULL,
            vendor_id INTEGER,
            invoice_id INTEGER,
            gross_sales REAL,
            commission_rate REAL,
            commission_amount REAL,
            payable_amount REAL,
            created_at ${timestampType} DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

export async function createVendorPayoutAccountingEntry({ db, vendorId, invoiceId, grossSales, commissionRate, commissionAmount, payableAmount }) {
    await ensureAccountingSchema(db);
    const r = await db.run(`INSERT INTO accounting_entries (type, vendor_id, invoice_id, gross_sales, commission_rate, commission_amount, payable_amount) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['vendor_payout', vendorId, invoiceId, grossSales, commissionRate, commissionAmount, payableAmount]
    );
    return await db.get('SELECT * FROM accounting_entries WHERE id = ?', [r.lastID]);
}

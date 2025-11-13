// Small accounting service helper to create immutable accounting entries used by reporting.

export async function ensureAccountingSchema(db) {
    // Use existing journal_entries/journal_entry_lines tables; create accounting_entries table as immutable record
    await db.run(`
        CREATE TABLE IF NOT EXISTS accounting_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            vendor_id INTEGER,
            invoice_id INTEGER,
            gross_sales REAL,
            commission_rate REAL,
            commission_amount REAL,
            payable_amount REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

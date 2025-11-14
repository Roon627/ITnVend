import crypto from 'crypto';
import { sendMail } from '../../lib/mail.js';
import { createVendorPayoutAccountingEntry } from '../accounts/accounting.service.js';

// Lightweight payout service. Creates a vendor_payouts table if missing and
// returns a payout invoice object. Uses orders/order_items where order.status = 'paid'.

function resolveSchemaFragments(db) {
    const isPostgres = (db?.dialect || '').toLowerCase() === 'postgres';
    return {
        idColumn: isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT',
        timestampType: isPostgres ? 'TIMESTAMP' : 'DATETIME'
    };
}

export async function ensurePayoutSchema(db) {
    const { idColumn, timestampType } = resolveSchemaFragments(db);
    await db.run(`
        CREATE TABLE IF NOT EXISTS vendor_payouts (
            id ${idColumn},
            vendor_id INTEGER NOT NULL,
            gross_sales REAL NOT NULL,
            commission_rate REAL NOT NULL,
            commission_amount REAL NOT NULL,
            payable_amount REAL NOT NULL,
            created_by TEXT,
            created_at ${timestampType} DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT
        );
    `);
}

export async function generatePayoutForVendor({ db, vendorId, createdBy = null }) {
    if (!db) throw new Error('Database required');
    await ensurePayoutSchema(db);
    const vendor = await db.get('SELECT id, commission_rate, email, legal_name, bank_details FROM vendors WHERE id = ?', [vendorId]);
    if (!vendor) throw new Error('Vendor not found');
    const commissionRate = (vendor.commission_rate != null) ? Number(vendor.commission_rate) : 0.0;

    // Sum completed/paid orders for this vendor
    const grossRow = await db.get(
        `SELECT COALESCE(SUM(oi.price * oi.quantity), 0) AS gross
         FROM order_items oi
         INNER JOIN orders o ON o.id = oi.order_id
         INNER JOIN products p ON p.id = oi.product_id
         WHERE p.vendor_id = ? AND o.status = 'paid'
        `,
        [vendorId]
    );
    const grossSales = Number(grossRow?.gross || 0);
    const commissionAmount = +(grossSales * (commissionRate || 0));
    const payableAmount = +(grossSales - commissionAmount);

    const r = await db.run(
        `INSERT INTO vendor_payouts (vendor_id, gross_sales, commission_rate, commission_amount, payable_amount, created_by, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [vendorId, grossSales, commissionRate, commissionAmount, payableAmount, createdBy, null]
    );
    const invoice = await db.get('SELECT * FROM vendor_payouts WHERE id = ?', [r.lastID]);

    // create an immutable accounting entry record (used by reporting)
    try {
        await createVendorPayoutAccountingEntry({ db, vendorId, invoiceId: invoice.id, grossSales, commissionRate, commissionAmount, payableAmount });
    } catch (acctErr) {
        console.warn('Failed to create accounting entry for payout', acctErr?.message || acctErr);
    }

    // Email vendor a simple notification (if configured)
    try {
        if (vendor.email) {
            const html = `<p>Hello ${vendor.legal_name || ''},</p>
                <p>We have generated a payout invoice (ID: ${invoice.id}).</p>
                <ul>
                  <li>Gross sales: ${grossSales}</li>
                  <li>Commission rate: ${commissionRate}</li>
                  <li>Commission amount: ${commissionAmount}</li>
                  <li>Payable amount: ${payableAmount}</li>
                </ul>
                <p>If you have questions, reply to this email.</p>`;
            await sendMail({ to: vendor.email, subject: `Payout invoice #${invoice.id}`, html });
        }
    } catch (mailErr) {
        console.warn('Failed to notify vendor by email', mailErr?.message || mailErr);
    }

    return invoice;
}

export async function listPayoutsForVendor({ db, vendorId }) {
    await ensurePayoutSchema(db);
    const rows = await db.all('SELECT * FROM vendor_payouts WHERE vendor_id = ? ORDER BY created_at DESC', [vendorId]);
    return rows || [];
}

export async function getPayoutForVendor({ db, vendorId, invoiceId }) {
    await ensurePayoutSchema(db);
    const row = await db.get('SELECT * FROM vendor_payouts WHERE id = ? AND vendor_id = ?', [invoiceId, vendorId]);
    return row || null;
}

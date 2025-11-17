import express from 'express';

const router = express.Router();

router.get('/vendor-invoices', async (req, res) => {
    try {
        const db = req.app.get('db');
        const rows = await db.all(`
            SELECT vi.*, v.legal_name AS vendor_name, v.slug AS vendor_slug
            FROM vendor_invoices vi
            LEFT JOIN vendors v ON v.id = vi.vendor_id
            ORDER BY vi.issued_at DESC
            LIMIT 250
        `);
        return res.json({ rows });
    } catch (err) {
        console.error('report vendor-invoices error', err);
        return res.status(500).json({ error: err?.message || 'Unable to fetch report' });
    }
});

router.get('/vendor-invoices/summary', async (req, res) => {
    try {
        const db = req.app.get('db');
        const rows = await db.all(`
            SELECT vendor_id,
                   SUM(CASE WHEN status = 'unpaid' THEN fee_amount ELSE 0 END) AS unpaid_total,
                   SUM(CASE WHEN status = 'paid' THEN fee_amount ELSE 0 END) AS paid_total,
                   COUNT(*) AS invoice_count
            FROM vendor_invoices
            GROUP BY vendor_id
        `);
        return res.json({ rows });
    } catch (err) {
        console.error('report vendor invoice summary error', err);
        return res.status(500).json({ error: err?.message || 'Unable to fetch report' });
    }
});

export default router;

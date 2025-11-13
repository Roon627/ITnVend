import express from 'express';

const router = express.Router();

// GET /api/reports/vendor-payouts
router.get('/vendor-payouts', async (req, res) => {
    try {
        const db = req.app.get('db');
        const rows = await db.all('SELECT * FROM accounting_entries WHERE type = ? ORDER BY created_at DESC', ['vendor_payout']);
        return res.json({ rows });
    } catch (err) {
        console.error('report vendor-payouts error', err);
        return res.status(500).json({ error: err?.message || 'Unable to fetch report' });
    }
});

// GET /api/reports/commission-summary
router.get('/commission-summary', async (req, res) => {
    try {
        const db = req.app.get('db');
        const rows = await db.all(`SELECT vendor_id, SUM(gross_sales) AS gross_sales, SUM(commission_amount) AS commission_amount, SUM(payable_amount) AS payable_amount FROM accounting_entries WHERE type = 'vendor_payout' GROUP BY vendor_id`);
        return res.json({ rows });
    } catch (err) {
        console.error('report commission-summary error', err);
        return res.status(500).json({ error: err?.message || 'Unable to fetch report' });
    }
});

export default router;

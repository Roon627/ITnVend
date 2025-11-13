import express from 'express';
import { generatePayoutForVendor, listPayoutsForVendor, getPayoutForVendor } from './payout.service.js';

const router = express.Router({ mergeParams: true });

// POST /api/vendors/:id/payouts/generate
router.post('/generate', async (req, res) => {
    try {
        const vendorId = Number(req.params.id);
        const db = req.app.get('db');
        if (!vendorId) return res.status(400).json({ error: 'Invalid vendor id' });
        const invoice = await generatePayoutForVendor({ db, vendorId, createdBy: req.user?.username || null });
        return res.status(201).json(invoice);
    } catch (err) {
        console.error('generate payout error', err);
        return res.status(500).json({ error: err?.message || 'Unable to generate payout' });
    }
});

// GET /api/vendors/:id/payouts
router.get('/', async (req, res) => {
    try {
        const vendorId = Number(req.params.id);
        const db = req.app.get('db');
        const rows = await listPayoutsForVendor({ db, vendorId });
        return res.json({ payouts: rows });
    } catch (err) {
        console.error('list payouts error', err);
        return res.status(500).json({ error: err?.message || 'Unable to list payouts' });
    }
});

// GET /api/vendors/:id/payouts/:invoiceId
router.get('/:invoiceId', async (req, res) => {
    try {
        const vendorId = Number(req.params.id);
        const invoiceId = Number(req.params.invoiceId);
        const db = req.app.get('db');
        const inv = await getPayoutForVendor({ db, vendorId, invoiceId });
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });
        return res.json(inv);
    } catch (err) {
        console.error('get payout error', err);
        return res.status(500).json({ error: err?.message || 'Unable to fetch payout' });
    }
});

export default router;

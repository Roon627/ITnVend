import express from 'express';
import slipProcessor from '../lib/slipProcessor.js';

const router = express.Router();

function dataUrlToBuffer(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  const base64 = match[2];
  return Buffer.from(base64, 'base64');
}

router.post('/', express.json({ limit: '12mb' }), async (req, res) => {
  try {
    const { slip, transactionId, expectedAmount } = req.body || {};
    if (!transactionId || !transactionId.toString().trim()) return res.status(400).json({ error: 'transactionId is required' });
    if (!slip || typeof slip !== 'string') return res.status(400).json({ error: 'Slip (base64 data URL) is required' });

    let parsedExpectedAmount = null;
    if (expectedAmount !== undefined && expectedAmount !== null && expectedAmount !== '') {
      const normalized = expectedAmount.toString().replace(/[^0-9.,-]/g, '').replace(/,/g, '');
      const numeric = Number.parseFloat(normalized);
      if (!Number.isFinite(numeric)) return res.status(400).json({ error: 'expectedAmount must be a number' });
      parsedExpectedAmount = numeric;
    }

  const rawTransactionId = transactionId.toString().trim();
  if (!/[A-Za-z0-9]/.test(rawTransactionId)) return res.status(400).json({ error: 'transactionId must contain alphanumeric characters' });

    const buffer = dataUrlToBuffer(slip);
    if (!buffer) return res.status(400).json({ error: 'Slip must be a data URL (data:<mime>;base64,...)' });

    const result = await slipProcessor.processSlip({ buffer, mimetype: null, transactionId, expectedAmount });
    return res.json(result);
  } catch (err) {
    console.error('Public slip validation error', err);
    return res.status(500).json({ error: 'Failed to validate slip' });
  }
});

export default router;

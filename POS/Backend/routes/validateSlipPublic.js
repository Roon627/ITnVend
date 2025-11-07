import express from 'express';
import slipProcessor from '../lib/slipProcessor.js';

const router = express.Router();

const slipRateMap = new Map();
const SLIP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const SLIP_MAX_REQUESTS = 30;

function publicSlipLimiter(req, res, next) {
  const key = `${req.ip || req.connection?.remoteAddress || 'unknown'}|${req.headers['user-agent'] || 'na'}`;
  const now = Date.now();
  const entry = slipRateMap.get(key);
  if (!entry || entry.resetAt <= now) {
    slipRateMap.set(key, { count: 1, resetAt: now + SLIP_WINDOW_MS });
    return next();
  }
  if (entry.count >= SLIP_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many attempts. Please wait before uploading another slip.' });
  }
  entry.count += 1;
  slipRateMap.set(key, entry);
  return next();
}

function dataUrlToPayload(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) return null;
  const mimetype = match[1] || null;
  const base64 = match[2];
  return { buffer: Buffer.from(base64, 'base64'), mimetype };
}

router.post('/', publicSlipLimiter, express.json({ limit: '12mb' }), async (req, res) => {
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

    const payload = dataUrlToPayload(slip);
    if (!payload || !payload.buffer) return res.status(400).json({ error: 'Slip must be a data URL (data:<mime>;base64,...)' });

    const result = await slipProcessor.processSlip({
      buffer: payload.buffer,
      mimetype: payload.mimetype,
      transactionId: rawTransactionId,
      expectedAmount: parsedExpectedAmount,
    });
    return res.json(result);
  } catch (err) {
    console.error('Public slip validation error', err);
    return res.status(500).json({ error: 'Failed to validate slip' });
  }
});

export default router;

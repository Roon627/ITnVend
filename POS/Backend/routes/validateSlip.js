import express from 'express';
import multer from 'multer';
import slipProcessor from '../lib/slipProcessor.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { transactionId, expectedAmount } = req.body || {};
    if (!transactionId || !transactionId.toString().trim()) {
      return res.status(400).json({ error: 'transactionId is required' });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Slip file is required' });
    }

    const mimetype = req.file.mimetype || '';
    if (!mimetype.startsWith('image/') && mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Unsupported file type. Upload an image or PDF.' });
    }

    const result = await slipProcessor.processSlip({ buffer: req.file.buffer, mimetype, transactionId, expectedAmount });
    return res.json(result);
  } catch (err) {
    console.error('Slip validation error', err);
    return res.status(500).json({ error: 'Failed to validate slip' });
  }
});

export default router;

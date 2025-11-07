import express from 'express';
import multer from 'multer';
import storage from '../storage.js';
import path from 'path';
import slipProcessor from '../lib/slipProcessor.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } });

const createSlipValidationRules = [
  body('source').optional().isString().trim().escape(),
  body('transactionId').optional().trim().escape(),
  body('expectedAmount').optional().isFloat({ gt: 0 }).toFloat(),
];

// Create a slip (multipart file)
router.post('/', upload.single('slip'), createSlipValidationRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { source = 'pos', transactionId, expectedAmount } = req.body || {};
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'file (slip) is required' });

    const mimetype = req.file.mimetype || '';
    if (!mimetype.startsWith('image/') && mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Save file using storage abstraction
  const saved = await storage.saveSlip(req.file.buffer, req.file.originalname || req.file.fieldname || 'slip');

    // Persist metadata
    const now = new Date().toISOString();
    const db = req.app.get('db');
    const initialResult = {
      stage: 'queued',
      transactionId: transactionId || null,
      expectedAmount: expectedAmount ?? null,
      queuedAt: now,
    };
    // prefer storing a URL path for client use; saved.url is present for local and S3 backends
    const storedPathForDb = saved.url || saved.path || saved.key || null;

    const insert = await db.run(
      `INSERT INTO slips (filename, storage_key, storage_path, source, uploaded_by, uploaded_by_name, ocr_text, ocr_confidence, validation_result, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
    req.file.originalname || null,
    saved.key || null,
    storedPathForDb,
    source,
    req.user?.id || null,
    req.user?.display_name || req.user?.username || null,
    null,
    null,
    JSON.stringify(initialResult),
    'processing',
        now,
        now,
      ]
    );

  const id = insert.lastID || insert.insertId || null;
  if (!id) {
    throw new Error('Slip record identifier missing after insert');
  }

  const queue = req.app.get('slipProcessingQueue');
  if (queue && typeof queue.enqueue === 'function') {
    queue.enqueue({
      id,
      buffer: req.file.buffer,
      mimetype,
      transactionId,
      expectedAmount,
    });
    return res.status(202).json({ id, url: saved.url, status: 'processing' });
  }

  // Fallback: process synchronously if queue unavailable
  const proc = await slipProcessor.processSlip({ buffer: req.file.buffer, mimetype, transactionId, expectedAmount });
  const autoStatus = proc.match === true || proc.amountMatch === true ? 'validated' : 'pending';
  await db.run(
    `UPDATE slips SET ocr_text = ?, ocr_confidence = ?, validation_result = ?, status = ?, updated_at = ? WHERE id = ?`,
    [
      proc.extractedText,
      proc.confidence || 0,
      JSON.stringify({
        transactionId: transactionId || null,
        match: proc.match,
        distance: proc.distance,
        detectedAmount: proc.detectedAmount,
        expectedAmount: proc.expectedAmount,
        amountMatch: proc.amountMatch,
      }),
      autoStatus,
      new Date().toISOString(),
      id,
    ]
  );
  return res.json({ id, url: saved.url, status: autoStatus, match: proc.match, ocr_confidence: proc.confidence });
  } catch (err) {
    console.error('Create slip error', err);
    return res.status(500).json({ error: 'Failed to create slip' });
  }
});

// List slips (paginated + filters)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const per_page = Math.min(100, Math.max(10, parseInt(req.query.per_page || '20', 10)));
    const offset = (page - 1) * per_page;
    const { date_from, date_to, source, status } = req.query || {};
    const filters = [];
    const params = [];
    if (date_from) {
      filters.push('created_at >= ?');
      params.push(date_from);
    }
    if (date_to) {
      filters.push('created_at <= ?');
      params.push(date_to);
    }
    if (source) {
      filters.push('source = ?');
      params.push(source);
    }
    if (status) {
      filters.push('status = ?');
      params.push(status);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const db = req.app.get('db');
    const totalRow = await db.get(`SELECT COUNT(*) as c FROM slips ${where}`, params);
    const total = totalRow ? totalRow.c : 0;
    const rows = await db.all(`SELECT * FROM slips ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, per_page, offset]);
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    const items = rows.map((r) => {
      let url = null;
      if (r.storage_path) {
        // strip file:// or file:/// prefixes that may have been stored accidentally
        let sp = String(r.storage_path || '').replace(/^file:\/+/i, '');
        // if it's already a web path (starts with / or http or s3) use as-is
        if (/^(\/|https?:\/\/|s3:\/\/)/i.test(sp)) {
          url = sp;
        } else {
          // filesystem absolute path: convert to /uploads/... URL relative to uploads root
          try {
            const rel = path.relative(uploadsRoot, sp).replace(/\\/g, '/');
            url = rel ? `/uploads/${rel}` : null;
          } catch (e) {
            url = null;
          }
        }
      } else if (r.storage_key) {
        // storage_key may already include a prefix like 'slips/..'
        const key = String(r.storage_key || '');
        url = key.startsWith('/') ? key : `/uploads/${key}`;
      }
      return {
        id: r.id,
        filename: r.filename,
        source: r.source,
        uploaded_by: r.uploaded_by,
        uploaded_by_name: r.uploaded_by_name,
        url,
        status: r.status,
        created_at: r.created_at,
      };
    });
    return res.json({ items, total, page, per_page });
  } catch (err) {
    console.error('List slips error', err);
    return res.status(500).json({ error: 'Failed to list slips' });
  }
});

// Detail
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const db = req.app.get('db');
    const row = await db.get('SELECT * FROM slips WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
      // Normalize storage path to a client-friendly URL
      let url = null;
      if (row.storage_path) {
        if (/^(\/|https?:\/\/|s3:\/\/)/.test(row.storage_path)) {
          url = row.storage_path;
        } else {
          try {
            const uploadsRoot = path.join(process.cwd(), 'uploads');
            const rel = path.relative(uploadsRoot, row.storage_path).replace(/\\/g, '/');
            url = rel ? `/uploads/${rel}` : null;
          } catch (e) {
            url = row.storage_path;
          }
        }
      } else if (row.storage_key) {
        url = `/uploads/${row.storage_key}`;
      }

      return res.json({
        id: row.id,
        filename: row.filename,
        source: row.source,
        uploaded_by: row.uploaded_by,
        uploaded_by_name: row.uploaded_by_name,
        url,
        ocr_text: row.ocr_text,
        ocr_confidence: row.ocr_confidence,
        validation_result: row.validation_result ? JSON.parse(row.validation_result) : null,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
  } catch (err) {
    console.error('Slip detail error', err);
    return res.status(500).json({ error: 'Failed to get slip' });
  }
});

const updateSlipValidationRules = [
  body('status').optional().isIn(['pending', 'validated', 'rejected', 'processing', 'failed']).trim(),
  body('validation_result').optional(),
];

// Update slip (status, validation_result)
router.patch('/:id', updateSlipValidationRules, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const id = req.params.id;
    const { status, validation_result } = req.body || {};
    if (!status && !validation_result) return res.status(400).json({ error: 'Nothing to update' });
    const db = req.app.get('db');
    const now = new Date().toISOString();
    const updates = [];
    const params = [];
    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    if (validation_result !== undefined) {
      updates.push('validation_result = ?');
      params.push(typeof validation_result === 'string' ? validation_result : JSON.stringify(validation_result));
    }
    updates.push('updated_at = ?');
    params.push(now);
    params.push(id);
    const sql = `UPDATE slips SET ${updates.join(', ')} WHERE id = ?`;
    await db.run(sql, params);
    const row = await db.get('SELECT * FROM slips WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.json({
      id: row.id,
      filename: row.filename,
      source: row.source,
      uploaded_by: row.uploaded_by,
      uploaded_by_name: row.uploaded_by_name,
      url: row.storage_path || row.storage_key,
      ocr_text: row.ocr_text,
      ocr_confidence: row.ocr_confidence,
      validation_result: row.validation_result ? JSON.parse(row.validation_result) : null,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  } catch (err) {
    console.error('Slip update error', err);
    return res.status(500).json({ error: 'Failed to update slip' });
  }
});

export default router;

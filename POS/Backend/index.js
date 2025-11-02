import express from 'express';
import cors from 'cors';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupDatabase } from './database.js';
import { generateInvoicePdf } from './invoice-service.js';
import PDFDocument from 'pdfkit';
import { getWebSocketService } from './websocket-service.js';
import cacheService from './cache-service.js';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

const STOREFRONT_API_KEY = process.env.STOREFRONT_API_KEY || null;

app.set('trust proxy', true);
// make port configurable so multiple services can run without colliding
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// handle server listen errors (EADDRINUSE etc) so process logs a clear message
server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
                console.error(`Port ${port} is already in use. If you have another instance running, stop it or set PORT to a different value.`);
        } else {
                console.error('Server error:', err);
        }
        // allow process manager or developer to restart; don't rethrow here
});

app.use(cors({ origin: true, credentials: true }));

// Cookie helpers: use secure, SameSite=None in production so cookies work cross-site over HTTPS
const IN_PROD = process.env.NODE_ENV === 'production';
function setRefreshCookie(res, token) {
    const opts = { httpOnly: true, path: '/', maxAge: 60 * 24 * 60 * 60 * 1000, sameSite: IN_PROD ? 'none' : 'lax', secure: IN_PROD };
    res.cookie('ITnvend_refresh', token, opts);
    // keep legacy name for a short transition window
    res.cookie('irnvend_refresh', token, opts);
}
function clearRefreshCookie(res) {
    const opts = { httpOnly: true, path: '/', expires: new Date(0), sameSite: IN_PROD ? 'none' : 'lax', secure: IN_PROD };
    res.cookie('ITnvend_refresh', '', opts);
    res.cookie('irnvend_refresh', '', opts);
}
// allow larger payloads for uploads (base64 images) and long requests
app.use(express.json({ limit: '10mb' }));
// Simple request logging for diagnostics
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${req.ip}`);
    next();
});

app.get('/', (req, res) => {
    res.send('ITnVend API is running...');
});

// Health endpoint
app.get('/health', async (req, res) => {
    try {
        const settings = db ? await db.get('SELECT id FROM settings WHERE id = 1') : null;
        const redisStatus = await cacheService.ping();
        res.json({
            status: 'ok',
            db: !!settings,
            redis: redisStatus,
            pid: process.pid
        });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

let db;
let JWT_SECRET = null;

const AUDIENCE_OPTIONS = ['men', 'women', 'unisex'];
const DELIVERY_TYPES = ['instant_download', 'shipping', 'pickup'];
const WARRANTY_TERMS = ['none', '1_year', 'lifetime'];

const slugify = (value = '') =>
    value
        .toString()
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

async function ensureUniqueCategorySlug(rawSlug, ignoreId = null) {
    let base = (rawSlug || '').trim();
    if (!base) {
        base = `category-${Date.now()}`;
    }
    let candidate = base;
    let suffix = 2;
    while (true) {
        const existing = ignoreId != null
            ? await db.get('SELECT id FROM product_categories WHERE slug = ? AND id != ?', [candidate, ignoreId])
            : await db.get('SELECT id FROM product_categories WHERE slug = ?', [candidate]);
        if (!existing) return candidate;
        candidate = `${base}-${suffix++}`;
    }
}

function normalizeEnum(value, allowed, fallback = null) {
  if (!value) return fallback;
  const normalized = value.toString().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

async function fetchCategoryPath(categoryId, subcategoryId, subsubcategoryId) {
  const ids = [categoryId, subcategoryId, subsubcategoryId].filter(Boolean);
  if (!ids.length) {
    return {
      categoryName: null,
      subcategoryName: null,
      subsubcategoryName: null,
    };
  }

  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT id, name, parent_id FROM product_categories WHERE id IN (${placeholders})`,
    ids
  );
  const map = new Map(rows.map((row) => [row.id, row]));
  return {
    categoryName: categoryId && map.has(Number(categoryId)) ? map.get(Number(categoryId)).name : null,
    subcategoryName: subcategoryId && map.has(Number(subcategoryId)) ? map.get(Number(subcategoryId)).name : null,
    subsubcategoryName:
      subsubcategoryId && map.has(Number(subsubcategoryId)) ? map.get(Number(subsubcategoryId)).name : null,
  };
}

async function fetchBrandName(brandId) {
  if (!brandId) return null;
  const brand = await db.get('SELECT name FROM brands WHERE id = ?', [brandId]);
  return brand ? brand.name : null;
}

function computeAutoSku({ brandName, productName, year }) {
  const brandSegment = brandName
    ? brandName
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 3)
        .toUpperCase()
    : 'GN';
  const productSegment = productName
    ? productName
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 4)
        .toUpperCase()
    : 'PRD';
  const yearSegment = year && Number.isFinite(Number(year))
    ? Number(year).toString().slice(-2).padStart(2, '0')
    : new Date().getFullYear().toString().slice(-2);
  return `${brandSegment}${productSegment}-${yearSegment}`;
}

async function ensureUniqueSku(baseSku, ignoreId = null) {
  if (!baseSku) return null;
  let candidate = baseSku.trim().toUpperCase();
  let counter = 1;
  while (true) {
    const existing = ignoreId
      ? await db.get('SELECT id FROM products WHERE sku = ? AND id != ?', [candidate, ignoreId])
      : await db.get('SELECT id FROM products WHERE sku = ?', [candidate]);
    if (!existing) return candidate;
    candidate = `${baseSku}-${++counter}`;
  }
}

async function syncProductTags(productId, tags = []) {
  const numericIds = Array.from(
    new Set(
      (tags || [])
        .map((tag) => (typeof tag === 'object' ? tag.id : tag))
        .map((value) => parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0)
    )
  );

  await db.run('DELETE FROM product_tags WHERE product_id = ?', [productId]);

  if (!numericIds.length) {
    await db.run('UPDATE products SET tags_cache = NULL WHERE id = ?', [productId]);
    return [];
  }

  for (const tagId of numericIds) {
    await db.run('INSERT OR IGNORE INTO product_tags (product_id, tag_id) VALUES (?, ?)', [productId, tagId]);
  }

  const placeholders = numericIds.map(() => '?').join(',');
  const tagRows = await db.all(
    `SELECT id, name, slug FROM tags WHERE id IN (${placeholders}) ORDER BY name`,
    numericIds
  );
  await db.run('UPDATE products SET tags_cache = ? WHERE id = ?', [JSON.stringify(tagRows.map((tag) => tag.name)), productId]);
  return tagRows;
}

async function sendNotificationEmail(subject, html, toOverride, throwOnError = false) {
    try {
        const emailCfg = await db.get('SELECT * FROM settings_email ORDER BY id DESC LIMIT 1');
        if (!emailCfg) return;
    const fromAddress = emailCfg.email_from || emailCfg.smtp_user || 'no-reply@example.com';
    const fromName = emailCfg.smtp_from_name || null;
    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
        const to = toOverride || emailCfg.email_to || emailCfg.email_from;

        if (emailCfg.provider === 'sendgrid' && emailCfg.api_key) {
            await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${emailCfg.api_key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    personalizations: [{ to: [{ email: to }], subject }],
                    from: { email: from },
                    content: [{ type: 'text/html', value: html }]
                })
            });
            return;
        }

        if (emailCfg.provider === 'smtp' && emailCfg.smtp_host) {
            const port = Number(emailCfg.smtp_port) || 465;
            const secureFlag = (emailCfg.smtp_secure === 1) || port === 465;
            const requireTLS = emailCfg.smtp_require_tls === 1;
            const transporter = nodemailer.createTransport({
                host: emailCfg.smtp_host,
                port,
                secure: secureFlag,
                requireTLS,
                auth: {
                    user: emailCfg.smtp_user,
                    pass: emailCfg.smtp_pass || emailCfg.api_key
                }
            });
            const mailOptions = { from, to, subject, html };
            if (emailCfg.smtp_reply_to) mailOptions.replyTo = emailCfg.smtp_reply_to;
            await transporter.sendMail(mailOptions);
            return { ok: true };
        }
    } catch (err) {
        console.warn('Failed to send notification email', err?.message || err);
        if (throwOnError) throw err;
        return { ok: false, error: err?.message || String(err) };
    }
}

// Simple in-memory users & sessions for demo purposes
const users = [
    { username: 'admin', password: 'admin', role: 'admin' },
    { username: 'cashier', password: 'cashier', role: 'cashier' }
];
const sessions = new Map(); // token -> user

function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Missing authorization header' });
    const token = auth.replace('Bearer ', '');
    // first check in-memory sessions for compatibility
    const user = sessions.get(token);
    if (user) {
        req.user = user;
        return next();
    }
    // otherwise try verifying JWT
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = { username: payload.username, role: payload.role, staffId: payload.staffId };
        return next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

function requireRole(required) {
    // supports a minimum role (string) or explicit array of allowed roles
    const rank = (r) => {
        const map = { cashier: 1, accounts: 2, manager: 3, admin: 4 };
        return map[r] || 0;
    };
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
        const userRole = req.user.role || 'staff';
        if (Array.isArray(required)) {
            // Allow if the user's role is explicitly included OR if their role rank
            // is equal/greater than the highest rank required by the array.
            // This makes array checks behave as "allowed roles or higher" for admins
            // while preserving explicit allow lists.
            try {
                const requiredRanks = required.map(r => rank(r));
                const maxRequiredRank = Math.max(...requiredRanks);
                if (required.includes(userRole) || rank(userRole) >= maxRequiredRank) {
                    return next();
                }
            } catch (e) {
                // fallback to strict include if mapping fails
                if (required.includes(userRole)) return next();
            }
            return res.status(403).json({ error: 'Forbidden' });
        }
        // required is a minimum role name
        if (typeof required === 'string') {
            if (rank(userRole) < rank(required)) return res.status(403).json({ error: 'Forbidden' });
            return next();
        }
        // default deny
        return res.status(403).json({ error: 'Forbidden' });
    };
}

// Simple activity logger helper
async function logActivity(entity_type, entity_id, action, user, details) {
    try {
        if (!db) return;
        await db.run('INSERT INTO activity_logs (entity_type, entity_id, action, user, details) VALUES (?, ?, ?, ?, ?)', [entity_type, entity_id || null, action, user || null, details || null]);
    } catch (err) {
        console.warn('Failed to log activity', err?.message || err);
    }
}

async function queueNotification({ staffId, username, title, message, type = 'info', link = null, metadata = null }) {
    try {
        if (!db) return;
        const metaPayload = metadata ? JSON.stringify(metadata) : null;
        await db.run(
            'INSERT INTO notifications (staff_id, username, title, message, type, link, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [staffId || null, username || null, title, message, type, link || null, metaPayload]
        );
    } catch (err) {
        console.warn('Failed to queue notification', err?.message || err);
    }
}

app.use('/api', (req, res, next) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not ready' });
    }
    next();
});

// Shifts API
app.post('/api/shifts/start', authMiddleware, async (req, res) => {
    try {
        // attempt to derive outlet from body or settings
        const outletId = req.body.outlet_id || (await db.get('SELECT current_outlet_id AS id FROM settings WHERE id = 1')).id || 1;
        // enforce single active shift per outlet
        const active = await db.get('SELECT id FROM shifts WHERE outlet_id = ? AND status = ?', [outletId, 'active']);
        if (active) return res.status(409).json({ error: 'Active shift already exists for this outlet', id: active.id });

        const startedBy = req.user?.staffId || null;
        const startingBalance = typeof req.body.starting_balance === 'number' ? req.body.starting_balance : (req.body.starting_balance ? Number(req.body.starting_balance) : null);
        const deviceId = req.body.device_id || null;
        const note = req.body.note || null;

        const r = await db.run(
            'INSERT INTO shifts (outlet_id, started_at, started_by, starting_balance, device_id, note, status) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)',
            [outletId, startedBy, startingBalance, deviceId, note, 'active']
        );
        const created = await db.get('SELECT * FROM shifts WHERE id = ?', [r.lastID]);
        // broadcast via websocket to outlet room
        try { global.io?.to(`outlet:${outletId}`).emit('shift.started', { shift: created }); } catch (e) { console.debug('WS broadcast failed', e); }
        return res.status(201).json(created);
    } catch (err) {
        console.error('Failed to start shift', err);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/shifts/:id/stop', authMiddleware, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) return res.status(400).json({ error: 'Invalid shift id' });
        const shift = await db.get('SELECT * FROM shifts WHERE id = ?', [id]);
        if (!shift) return res.status(404).json({ error: 'Shift not found' });
        if (shift.status !== 'active') return res.status(409).json({ error: 'Shift already closed' });

        const closingBalance = typeof req.body.closing_balance === 'number' ? req.body.closing_balance : (req.body.closing_balance ? Number(req.body.closing_balance) : null);
        const tillNotes = req.body.till_notes || null;
        const safeDrop = typeof req.body.safe_drop === 'number' ? req.body.safe_drop : (req.body.safe_drop ? Number(req.body.safe_drop) : null);
        const discrepancies = req.body.discrepancies ? JSON.stringify(req.body.discrepancies) : null;
        const closedBy = req.user?.staffId || null;

        // compute richer reconciliation totals for the shift period
        let reconciliation = {
            totalsByMethod: {},
            totalSales: 0,
            transactionCount: 0,
            taxCollected: 0,
            refundsTotal: 0,
            refundsCount: 0,
            generatedAt: new Date().toISOString()
        };

        try {
            // totals grouped by payment method
            const byMethod = await db.all(
                `SELECT p.method as method, COUNT(p.id) as payments_count, COUNT(DISTINCT p.invoice_id) as transactions, COALESCE(SUM(p.amount),0) as amount
                 FROM payments p
                 JOIN invoices i ON i.id = p.invoice_id
                 WHERE i.outlet_id = ? AND p.recorded_at >= ? AND p.recorded_at <= CURRENT_TIMESTAMP
                 GROUP BY p.method`,
                [shift.outlet_id, shift.started_at]
            );
            (byMethod || []).forEach((row) => {
                reconciliation.totalsByMethod[row.method || 'unknown'] = {
                    paymentsCount: Number(row.payments_count) || 0,
                    transactions: Number(row.transactions) || 0,
                    amount: Number(row.amount) || 0
                };
            });

            // overall sales, tax and transaction count (paid invoices)
            const salesRow = await db.get(
                `SELECT COUNT(DISTINCT i.id) as transactionCount, COALESCE(SUM(i.total),0) as totalSales, COALESCE(SUM(i.tax_amount),0) as taxCollected
                 FROM invoices i
                 WHERE i.outlet_id = ? AND i.created_at >= ? AND i.created_at <= CURRENT_TIMESTAMP AND i.status = 'paid'`,
                [shift.outlet_id, shift.started_at]
            );
            reconciliation.totalSales = Number(salesRow?.totalSales || 0);
            reconciliation.transactionCount = Number(salesRow?.transactionCount || 0);
            reconciliation.taxCollected = Number(salesRow?.taxCollected || 0);

            // refunds (payments with negative amount)
            const refundsRow = await db.get(
                `SELECT COALESCE(SUM(CASE WHEN p.amount < 0 THEN p.amount ELSE 0 END),0) as refundsTotal, COALESCE(SUM(CASE WHEN p.amount < 0 THEN 1 ELSE 0 END),0) as refundsCount
                 FROM payments p
                 JOIN invoices i ON i.id = p.invoice_id
                 WHERE i.outlet_id = ? AND p.recorded_at >= ? AND p.recorded_at <= CURRENT_TIMESTAMP`,
                [shift.outlet_id, shift.started_at]
            );
            reconciliation.refundsTotal = Number(refundsRow?.refundsTotal || 0);
            reconciliation.refundsCount = Number(refundsRow?.refundsCount || 0);
        } catch (e) {
            console.debug('Failed to compute reconciliation for shift', e);
        }

        // persist shift closed state + reconciliation summary
        await db.run(
            'UPDATE shifts SET ended_at = CURRENT_TIMESTAMP, closing_balance = ?, discrepancies = ?, closed_by = ?, totals = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [closingBalance, discrepancies, closedBy, JSON.stringify(reconciliation), 'closed', id]
        );

        const updated = await db.get('SELECT * FROM shifts WHERE id = ?', [id]);

        // create a short-lived signed link for reconciliation PDF (15 minutes)
        let pdfUrl = null;
        try {
            const token = jwt.sign({ shiftId: id }, JWT_SECRET, { expiresIn: '15m' });
            pdfUrl = `${req.protocol}://${req.get('host')}/api/shifts/${id}/reconciliation.pdf?pdf_token=${encodeURIComponent(token)}`;
        } catch (e) {
            console.debug('Failed to create pdf token', e);
        }

        try { global.io?.to(`outlet:${updated.outlet_id}`).emit('shift.stopped', { shift: updated }); } catch (e) { console.debug('WS broadcast failed', e); }
        return res.json({ shift: updated, reconciliation, pdfUrl });
    } catch (err) {
        console.error('Failed to stop shift', err);
        return res.status(500).json({ error: err.message });
    }
});

// Serve reconciliation PDF for a shift (signed token or auth)
app.get('/api/shifts/:id/reconciliation.pdf', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const token = req.query.pdf_token || null;
        let authorized = false;
        if (token) {
            try {
                const payload = jwt.verify(token, JWT_SECRET);
                if (payload && Number(payload.shiftId) === id) authorized = true;
            } catch (e) { /* token invalid */ }
        }
        // allow access with Authorization header too
        if (!authorized && req.headers.authorization) {
            try {
                const auth = req.headers.authorization.replace('Bearer ', '');
                const payload = jwt.verify(auth, JWT_SECRET);
                if (payload) authorized = true;
            } catch (e) { /* ignore */ }
        }
        if (!authorized) return res.status(401).send('Unauthorized');

        const shift = await db.get('SELECT * FROM shifts WHERE id = ?', [id]);
        if (!shift) return res.status(404).send('Shift not found');

        // build reconciliation object from stored totals (if present) or compute minimal
        let reconciliation = shift.totals ? (typeof shift.totals === 'string' ? JSON.parse(shift.totals) : shift.totals) : null;
        if (!reconciliation) reconciliation = { generatedAt: new Date().toISOString() };

        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment;filename=shift-reconciliation-${id}.pdf`,
        });

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.pipe(res);

        const settingsRow = await db.get('SELECT * FROM settings WHERE id = 1');
        const outlet = settingsRow ? { name: settingsRow.outlet_name || 'My Outlet', currency: settingsRow.currency || 'MVR' } : { name: 'My Outlet', currency: 'MVR' };

        doc.fontSize(18).text(`${outlet.name}`, { align: 'left' });
        doc.fontSize(12).text(`Shift Reconciliation`, { align: 'right' });
        doc.moveDown(0.5);
        doc.fontSize(10).text(`Shift ID: ${shift.id}`);
        doc.text(`Started: ${shift.started_at || 'N/A'}`);
        doc.text(`Ended: ${shift.ended_at || 'N/A'}`);
        doc.moveDown(0.5);

        doc.fontSize(12).text('Summary', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).text(`Total sales: ${reconciliation.totalSales ?? 0}`);
        doc.text(`Transactions: ${reconciliation.transactionCount ?? 0}`);
        doc.text(`Tax collected: ${reconciliation.taxCollected ?? 0}`);
        doc.text(`Refunds: ${reconciliation.refundsTotal ?? 0} (${reconciliation.refundsCount ?? 0})`);
        doc.moveDown(0.5);

        doc.fontSize(12).text('By payment method', { underline: true });
        doc.moveDown(0.3);
        const methods = reconciliation.totalsByMethod || {};
        Object.keys(methods).forEach((m) => {
            const row = methods[m];
            doc.fontSize(10).text(`${m}: ${row.amount ?? 0} (${row.transactions ?? 0} tx, ${row.paymentsCount ?? 0} payments)`);
        });

        doc.moveDown(1);
        doc.fontSize(9).fillColor('#666').text('Generated: ' + (reconciliation.generatedAt || new Date().toISOString()));
        doc.end();
    } catch (err) {
        console.error('Failed to generate reconciliation PDF', err);
        return res.status(500).send('Failed to generate PDF');
    }
});

app.get('/api/shifts/active', authMiddleware, async (req, res) => {
    try {
        const settingsRow = await db.get('SELECT current_outlet_id AS id FROM settings WHERE id = 1');
        const outletIdRaw = req.query.outlet_id ?? settingsRow?.id ?? 1;
        const outletId = Number.isFinite(Number(outletIdRaw)) ? Number(outletIdRaw) : 1;
        const row = await db.get('SELECT * FROM shifts WHERE outlet_id = ? AND status = ? ORDER BY started_at DESC LIMIT 1', [outletId, 'active']);
        if (!row) return res.json(null);
        return res.json(row);
    } catch (err) {
        console.error('Failed to fetch active shift', err);
        return res.status(500).json({ error: err.message });
    }
});

// Serve uploaded images from backend/public/images and organize by category
// Use process.cwd() + public path so this works whether the server is started from the repo root
// or when running inside a container with working_dir set to the backend folder.
// Use lowercase `images` to match the frontend public/images convention and avoid
// case-sensitivity issues on Linux filesystems.
const imagesDir = path.join(process.cwd(), 'public', 'images');
try { fs.mkdirSync(imagesDir, { recursive: true }); } catch (e) { /* ignore */ }
app.use('/uploads', express.static(imagesDir));
app.use('/images', express.static(imagesDir));

function sanitizeSegments(input, fallback = 'uncategorized') {
    if (!input) return [fallback];
    const value = Array.isArray(input) ? input : String(input).split(/[\\/]+/);
    const segments = value
        .map((segment) => String(segment || '').trim().toLowerCase())
        .map((segment) => segment.replace(/[^a-z0-9\-_]+/g, '-'))
        .filter(Boolean);
    if (!segments.length) return [fallback];
    return segments;
}

function ensureUploadDir(category, fallback = 'uncategorized') {
    const segments = sanitizeSegments(category, fallback);
    const dir = path.join(imagesDir, ...segments);
    fs.mkdirSync(dir, { recursive: true });
    return { dir, segments };
}

function normalizeUploadPath(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let value = raw.trim();
    if (/^https?:\/\//i.test(value)) {
        try {
            const url = new URL(value);
            value = url.pathname;
        } catch (err) {
            return null;
        }
    }
    if (value.startsWith('/uploads/')) {
        value = value.slice('/uploads/'.length);
    }
    if (value.startsWith('uploads/')) {
        value = value.slice('uploads/'.length);
    }
    const normalized = path.posix.normalize(value).replace(/^\.\//, '');
    if (!normalized || normalized.includes('..')) return null;
    return normalized;
}

// Setup upload endpoint: prefer multer multipart handling if available, otherwise fall back to base64 JSON upload
(async function setupUploadsRoute() {
    try {
        const multerMod = await import('multer');
        const multer = multerMod.default || multerMod;
        // configure multer storage
        const storage = multer.diskStorage({
            destination: function (req, file, cb) {
                const category = (req.query && req.query.category) || (req.body && req.body.category) || 'uncategorized';
                try {
                    const { dir } = ensureUploadDir(category, 'uncategorized');
                    cb(null, dir);
                } catch (err) {
                    cb(err);
                }
            },
            filename: function (req, file, cb) {
                const safe = `${Date.now()}-${file.originalname.replace(/[^a-z0-9\.\-_]/gi, '_')}`;
                cb(null, safe);
            }
        });
        function imageFileFilter(req, file, cb) {
            if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'), false);
            cb(null, true);
        }
        const upload = multer({ storage, fileFilter: imageFileFilter, limits: { fileSize: 3 * 1024 * 1024 } });
        app.post('/api/uploads', upload.single('file'), async (req, res) => {
            try {
                if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
                // build public URL path relative to /uploads
                const rel = path.relative(imagesDir, req.file.path).replace(/\\/g, '/');
                const urlPath = `/uploads/${rel}`;
                const absoluteUrl = `${req.protocol}://${req.get('host')}${urlPath}`;
                return res.json({ url: absoluteUrl, path: urlPath });
            } catch (err) {
                return res.status(500).json({ error: err.message });
            }
        });
        console.log('Upload route configured: multer multipart enabled');
    } catch (e) {
        // fallback to base64 upload endpoint (saves under images/<category> if provided via query or body)
        app.post('/api/uploads', async (req, res) => {
            try {
                const { filename, data, category } = req.body || {};
                if (!data) return res.status(400).json({ error: 'Missing data' });
                let base64 = data;
                let ext = '';
                const m = String(data).match(/^data:(.+);base64,(.+)$/);
                if (m) {
                    const mime = m[1];
                    base64 = m[2];
                    const parts = mime.split('/');
                    ext = parts[1] ? '.' + parts[1].split('+')[0] : '';
                }
                const cat = (req.query && req.query.category) || category || 'uncategorized';
                const { dir } = ensureUploadDir(cat, 'uncategorized');
                const safeName = `${Date.now()}-${(filename || 'upload').replace(/[^a-z0-9\.\-_]/gi, '_')}${ext}`;
                const filePath = path.join(dir, safeName);
                const buffer = Buffer.from(base64, 'base64');
                fs.writeFileSync(filePath, buffer);
                const rel = path.relative(imagesDir, filePath).replace(/\\/g, '/');
                const urlPath = `/uploads/${rel}`;
                const absoluteUrl = `${req.protocol}://${req.get('host')}${urlPath}`;
                return res.json({ url: absoluteUrl, path: urlPath });
            } catch (err2) {
                return res.status(500).json({ error: err2.message });
            }
        });
        console.warn('multer not available — using base64 fallback for /api/uploads');
    }
})();

async function startServer() {
    try {
        db = await setupDatabase();
        // ensure settings has jwt_secret column (safe add)
        try { await db.run("ALTER TABLE settings ADD COLUMN jwt_secret TEXT"); } catch (e) { /* ignore if exists */ }
        // load or create JWT secret (persist in settings row)
        const srow = await db.get('SELECT jwt_secret FROM settings WHERE id = 1');
        if (srow && srow.jwt_secret) {
            JWT_SECRET = srow.jwt_secret;
        } else {
            JWT_SECRET = crypto.randomBytes(32).toString('hex');
            try { await db.run('UPDATE settings SET jwt_secret = ? WHERE id = 1', [JWT_SECRET]); } catch (e) { /* ignore */ }
        }
        // ensure basic roles exist
        const existingRoles = await db.all('SELECT name FROM roles');
        const roleNames = existingRoles.map(r => r.name);
        const required = ['admin', 'manager', 'cashier'];
        for (const r of required) {
            if (!roleNames.includes(r)) {
                try { await db.run('INSERT INTO roles (name) VALUES (?)', [r]); } catch (e) { }
            }
        }

        // ensure at least one staff user exists (seed admin) - do not overwrite if present
        const staffCountRow = await db.get('SELECT COUNT(*) as c FROM staff');
        if (!staffCountRow || staffCountRow.c === 0) {
            const pwdHash = await bcrypt.hash('admin', 10);
            const r = await db.run('INSERT INTO staff (username, display_name, email, phone, password) VALUES (?, ?, ?, ?, ?)', ['admin', 'Administrator', null, null, pwdHash]);
            const createdId = r.lastID;
            const adminRole = await db.get('SELECT id FROM roles WHERE name = ?', ['admin']);
            if (adminRole) {
                try { await db.run('INSERT INTO staff_roles (staff_id, role_id) VALUES (?, ?)', [createdId, adminRole.id]); } catch (e) { }
            }
            console.log('Seeded default admin user: username=admin password=admin (please change)');
        }

        // WebSocket connection handling
        io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
            });

            socket.on('join', (room) => {
                socket.join(room);
                console.log(`Client ${socket.id} joined room: ${room}`);
            });

            socket.on('leave', (room) => {
                socket.leave(room);
                console.log(`Client ${socket.id} left room: ${room}`);
            });
        });

        // Make io available globally for broadcasting
        global.io = io;

        // Initialize WebSocket service
        const wsService = getWebSocketService();

        server.listen(port, '0.0.0.0', () => {
            console.log(`Server running at http://0.0.0.0:${port}`);
            console.log(`WebSocket server ready`);
        });
        // Cleanup uploaded images older than 30 days (run once on startup and then daily)
        async function cleanupOldImages(days = 30) {
            try {
                const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
                async function walk(dir) {
                    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                    for (const ent of entries) {
                        const full = path.join(dir, ent.name);
                        if (ent.isDirectory()) {
                            await walk(full);
                            // remove empty directories
                            try {
                                const rem = await fs.promises.readdir(full);
                                if (rem.length === 0) {
                                    await fs.promises.rmdir(full);
                                }
                            } catch (e) { /* ignore */ }
                        } else if (ent.isFile()) {
                            try {
                                const st = await fs.promises.stat(full);
                                if (st.mtimeMs < cutoff) {
                                    await fs.promises.unlink(full);
                                    console.log('Deleted old upload:', full);
                                }
                            } catch (e) { /* ignore individual file errors */ }
                        }
                    }
                }
                await walk(imagesDir);
            } catch (err) {
                console.warn('cleanupOldImages failed', err?.message || err);
            }
        }
        // run cleanup once, then daily
        cleanupOldImages(30).catch(() => {});
        setInterval(() => cleanupOldImages(30).catch(() => {}), 24 * 60 * 60 * 1000);
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    if (cacheService) {
        await cacheService.close();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    if (cacheService) {
        await cacheService.close();
    }
    process.exit(0);
});

// Seed Data Endpoint
app.get('/api/seed', async (req, res) => {
    try {
        await db.run("DELETE FROM products");
        await db.run("DELETE FROM customers");
        await db.run("DELETE FROM invoices");
        await db.run("DELETE FROM invoice_items");

        const products = [
            { name: 'Laptop', price: 1200, stock: 50 },
            { name: 'Mouse', price: 25, stock: 200 },
            { name: 'Keyboard', price: 75, stock: 150 },
            { name: 'Monitor', price: 300, stock: 100 },
        ];

        const customers = [
            { name: 'Alice Johnson', email: 'alice@example.com' },
            { name: 'Bob Williams', email: 'bob@example.com' },
        ];

        for (const p of products) {
            await db.run('INSERT INTO products (name, price, stock) VALUES (?, ?, ?)', [p.name, p.price, p.stock]);
        }
        for (const c of customers) {
            await db.run('INSERT INTO customers (name, email) VALUES (?, ?)', [c.name, c.email]);
        }
        res.status(200).send('Database seeded successfully');
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login endpoint - supports staff table (bcrypt) and falls back to demo users
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
    try {
        // try staff table first
        const staff = await db.get('SELECT * FROM staff WHERE username = ?', [username]);
        if (staff) {
            const ok = await bcrypt.compare(password, staff.password || '');
            if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
            // fetch roles
            const roles = await db.all('SELECT r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [staff.id]);
            const roleName = (roles && roles[0] && roles[0].name) ? roles[0].name : 'staff';
            // create JWT token (long lived)
            const token = jwt.sign({ username: staff.username, role: roleName, staffId: staff.id }, JWT_SECRET, { expiresIn: '30d' });
            // create a refresh token and persist its hash
            const refreshToken = crypto.randomBytes(32).toString('hex');
            const rhash = crypto.createHash('sha256').update(refreshToken).digest('hex');
            const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days
            try { await db.run('INSERT INTO refresh_tokens (staff_id, token_hash, expires_at) VALUES (?, ?, ?)', [staff.id, rhash, expiresAt]); } catch (e) { /* ignore */ }
            // keep session map for compatibility
            sessions.set(token, { username: staff.username, role: roleName, staffId: staff.id });
            await logActivity('staff', staff.id, 'login', staff.username, 'staff login');
            // set HttpOnly refresh token cookie (helper sets both new + legacy names)
            setRefreshCookie(res, refreshToken);
            return res.json({ token, role: roleName });
        }

        // fallback to demo in-memory users for compatibility
        const user = users.find((u) => u.username === username && u.password === password);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    // create JWT for demo users as well (no refresh token persisted)
    const demoToken = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    sessions.set(demoToken, { username: user.username, role: user.role });
    res.json({ token: demoToken, role: user.role });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Password reset request (staff only)
app.post('/api/password-reset/request', async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Missing email' });
    try {
        const staff = await db.get('SELECT * FROM staff WHERE email = ?', [email]);
        // Always return OK to avoid leaking which emails exist
        if (!staff) return res.json({ status: 'ok' });

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
        await db.run('INSERT INTO password_reset_tokens (staff_id, token_hash, expires_at) VALUES (?, ?, ?)', [staff.id, tokenHash, expiresAt]);

        const frontendBase = process.env.FRONTEND_URL || req.get('origin') || `${req.protocol}://${req.get('host')}`;
        const resetLink = `${frontendBase.replace(/\/$/, '')}/reset-password?token=${token}`;

        const settings = await db.get('SELECT email_template_password_reset_subject, email_template_password_reset FROM settings WHERE id = 1');
        const subject = (settings && settings.email_template_password_reset_subject) ? settings.email_template_password_reset_subject : 'Reset your password';
        const template = (settings && settings.email_template_password_reset) ? settings.email_template_password_reset : 'Hello {{name}},<br/><br/>Click the link below to reset your password:<br/><a href="{{reset_link}}">Reset password</a><br/><br/>If you did not request this, ignore this email.';
        const html = (template || '').replace(/{{name}}/g, staff.display_name || staff.username || '').replace(/{{reset_link}}/g, resetLink);

        // fire-and-forget email sending
        try { await sendNotificationEmail(subject, html, staff.email); } catch (e) { console.warn('Failed to send reset email', e?.message || e); }
        await logActivity('staff', staff.id, 'password_reset_requested', staff.username, `Password reset requested for ${staff.email}`);
        return res.json({ status: 'ok' });
    } catch (err) {
        console.error('password reset request error', err?.message || err);
        return res.status(500).json({ error: 'Internal error' });
    }
});

// Password reset confirmation
app.post('/api/password-reset/confirm', async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ error: 'Missing token or password' });
    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const row = await db.get('SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used = 0', [tokenHash]);
        if (!row) return res.status(400).json({ error: 'Invalid or used token' });
        if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'Token expired' });

        const hashed = await bcrypt.hash(password, 10);
        await db.run('UPDATE staff SET password = ? WHERE id = ?', [hashed, row.staff_id]);
        await db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [row.id]);
        await logActivity('staff', row.staff_id, 'password_reset', null, 'Password reset via token');
        return res.json({ status: 'ok' });
    } catch (err) {
        console.error('password reset confirm error', err?.message || err);
        return res.status(500).json({ error: 'Internal error' });
    }
});

// Product Routes
app.get('/api/products', async (req, res) => {
    const {
        category,
        subcategory,
        search,
        preorderOnly,
        categoryId,
        subcategoryId,
        subsubcategoryId,
        tagId,
        tag,
        brandId,
        type,
    } = req.query;

    const cacheKey = `products:${JSON.stringify({
        category,
        subcategory,
        search,
        preorderOnly: preorderOnly === 'true',
        categoryId,
        subcategoryId,
        subsubcategoryId,
        tagId,
        tag,
        brandId,
        type,
    })}`;

    try {
        const cachedProducts = await cacheService.get(cacheKey);
        if (cachedProducts) {
            console.log('Serving products from cache');
            return res.json(cachedProducts);
        }

        let query = `
            SELECT
                p.*,
                b.name AS brand_name,
                mat.name AS material_name,
                col.name AS color_name,
                cat.name AS category_name_resolved,
                sub.name AS subcategory_name_resolved,
                subsub.name AS subsubcategory_name_resolved
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN materials mat ON p.material_id = mat.id
            LEFT JOIN colors col ON p.color_id = col.id
            LEFT JOIN product_categories cat ON p.category_id = cat.id
            LEFT JOIN product_categories sub ON p.subcategory_id = sub.id
            LEFT JOIN product_categories subsub ON p.subsubcategory_id = subsub.id
            WHERE 1=1
        `;
        const params = [];

        if (category && category !== 'all') {
            query += ' AND (p.category = ? OR (cat.name = ?))';
            params.push(category, category);
        }
        if (subcategory) {
            query += ' AND (p.subcategory = ? OR (sub.name = ?))';
            params.push(subcategory, subcategory);
        }
        if (categoryId) {
            query += ' AND p.category_id = ?';
            params.push(categoryId);
        }
        if (subcategoryId) {
            query += ' AND p.subcategory_id = ?';
            params.push(subcategoryId);
        }
        if (subsubcategoryId) {
            query += ' AND p.subsubcategory_id = ?';
            params.push(subsubcategoryId);
        }
        if (brandId) {
            query += ' AND p.brand_id = ?';
            params.push(brandId);
        }
        if (type) {
            query += ' AND p.type = ?';
            params.push(type);
        }
        if (search) {
            query += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.short_description LIKE ? OR p.sku LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (preorderOnly === 'true') {
            query += ' AND p.preorder_enabled = 1';
        }
        if (tagId) {
            query += ' AND EXISTS (SELECT 1 FROM product_tags pt WHERE pt.product_id = p.id AND pt.tag_id = ?)';
            params.push(tagId);
        } else if (tag) {
            query += `
                AND EXISTS (
                    SELECT 1 FROM product_tags pt
                    INNER JOIN tags t ON t.id = pt.tag_id
                    WHERE pt.product_id = p.id AND (t.slug = ? OR t.name = ?)
                )
            `;
            params.push(slugify(tag), tag);
        }

        query += ' ORDER BY p.name COLLATE NOCASE';

        const productRows = await db.all(query, params);

        const productIds = productRows.map((row) => row.id);
        let tagsByProduct = {};
        if (productIds.length) {
            const placeholders = productIds.map(() => '?').join(',');
            const tagRows = await db.all(
                `SELECT pt.product_id, t.id, t.name, t.slug
                 FROM product_tags pt
                 INNER JOIN tags t ON t.id = pt.tag_id
                 WHERE pt.product_id IN (${placeholders})
                 ORDER BY t.name`,
                productIds
            );
            tagsByProduct = tagRows.reduce((acc, row) => {
                if (!acc[row.product_id]) acc[row.product_id] = [];
                acc[row.product_id].push({ id: row.id, name: row.name, slug: row.slug });
                return acc;
            }, {});
        }

        const products = productRows.map((row) => ({
            id: row.id,
            name: row.name,
            price: row.price,
            stock: row.stock,
            category: row.category,
            subcategory: row.subcategory,
            image: row.image,
            image_source: row.image_source,
            description: row.description,
            technical_details: row.technical_details,
            sku: row.sku,
            barcode: row.barcode,
            cost: row.cost,
            track_inventory: row.track_inventory,
            preorder_enabled: row.preorder_enabled,
            preorder_release_date: row.preorder_release_date,
            preorder_notes: row.preorder_notes,
            short_description: row.short_description,
            type: row.type,
            brand_id: row.brand_id,
            brand_name: row.brand_name,
            category_id: row.category_id,
            category_name: row.category_name_resolved || row.category,
            subcategory_id: row.subcategory_id,
            subcategory_name: row.subcategory_name_resolved || row.subcategory,
            subsubcategory_id: row.subsubcategory_id,
            subsubcategory_name: row.subsubcategory_name_resolved || null,
            material_id: row.material_id,
            material_name: row.material_name,
            color_id: row.color_id,
            color_name: row.color_name,
            audience: row.audience,
            delivery_type: row.delivery_type,
            warranty_term: row.warranty_term,
            preorder_eta: row.preorder_eta,
            year: row.year,
            auto_sku: row.auto_sku,
            tags: tagsByProduct[row.id] || [],
        }));

        await cacheService.set(cacheKey, products, 180);

        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/products/categories', async (req, res) => {
    try {
        const cachedCategories = await cacheService.getCategories();
        if (cachedCategories) {
            console.log('Serving product categories from cache');
            return res.json(cachedCategories);
        }

        const rows = await db.all(
            'SELECT id, name, parent_id FROM product_categories WHERE is_active = 1 ORDER BY parent_id IS NULL DESC, name'
        );

        const roots = rows.filter((row) => row.parent_id == null);
        const categoryMap = {};
        for (const root of roots) {
            categoryMap[root.name] = rows
                .filter((row) => row.parent_id === root.id)
                .map((row) => row.name)
                .sort((a, b) => a.localeCompare(b));
        }

        await cacheService.setCategories(categoryMap, 600);

        res.json(categoryMap);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/categories/tree', authMiddleware, async (req, res) => {
    try {
        const cachedTree = await cacheService.getCategoriesTree();
        if (cachedTree) {
            console.log('Serving category tree from cache');
            return res.json(cachedTree);
        }

        const rows = await db.all(
            'SELECT id, name, slug, parent_id FROM product_categories WHERE is_active = 1 ORDER BY name'
        );
        const nodeMap = new Map(
            rows.map((row) => [row.id, { id: row.id, name: row.name, slug: row.slug, parent_id: row.parent_id, children: [] }])
        );

        const roots = [];
        nodeMap.forEach((node) => {
            if (node.parent_id && nodeMap.has(node.parent_id)) {
                nodeMap.get(node.parent_id).children.push(node);
            } else {
                roots.push(node);
            }
        });

        const sortNodes = (nodes) => {
            nodes.sort((a, b) => a.name.localeCompare(b.name));
            nodes.forEach((child) => sortNodes(child.children));
        };
        sortNodes(roots);

        await cacheService.setCategoriesTree(roots, 600);

        res.json(roots);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/lookups', authMiddleware, async (req, res) => {
    try {
        const cached = await cacheService.getLookups();
        if (cached) {
            console.log('Serving product lookups from cache');
            return res.json(cached);
        }

        const [brands, materials, colors, tags] = await Promise.all([
            db.all('SELECT id, name FROM brands ORDER BY name'),
            db.all('SELECT id, name FROM materials ORDER BY name'),
            db.all('SELECT id, name, hex FROM colors ORDER BY name'),
            db.all('SELECT id, name, slug FROM tags ORDER BY name'),
        ]);

        const payload = {
            brands,
            materials,
            colors,
            tags,
            audiences: AUDIENCE_OPTIONS,
            deliveryTypes: DELIVERY_TYPES,
            warrantyTerms: WARRANTY_TERMS,
        };

        await cacheService.setLookups(payload, 600);

        res.json(payload);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/brands', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const result = await db.run('INSERT INTO brands (name) VALUES (?)', [name]);
        await cacheService.invalidateLookups();
        getWebSocketService().broadcast('lookups:update', { type: 'brands' });
        res.status(201).json({ id: result.lastID, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/materials', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const result = await db.run('INSERT INTO materials (name) VALUES (?)', [name]);
        await cacheService.invalidateLookups();
        getWebSocketService().broadcast('lookups:update', { type: 'materials' });
        res.status(201).json({ id: result.lastID, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/colors', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const result = await db.run('INSERT INTO colors (name) VALUES (?)', [name]);
        await cacheService.invalidateLookups();
        getWebSocketService().broadcast('lookups:update', { type: 'colors' });
        res.status(201).json({ id: result.lastID, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tags', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const slug = slugify(name);
        const result = await db.run('INSERT INTO tags (name, slug) VALUES (?, ?)', [name, slug]);
        await cacheService.invalidateLookups();
        getWebSocketService().broadcast('lookups:update', { type: 'tags' });
        res.status(201).json({ id: result.lastID, name, slug });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name, parentId } = req.body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) return res.status(400).json({ error: 'Missing name' });

    const normalizedParentId = parentId === undefined || parentId === null || parentId === ''
        ? null
        : Number(parentId);
    if (normalizedParentId !== null && (!Number.isFinite(normalizedParentId) || !Number.isInteger(normalizedParentId))) {
        return res.status(400).json({ error: 'Invalid parentId' });
    }

    try {
        console.log('[categories:create] payload:', { name: trimmedName, parentId: normalizedParentId });
        const existingByName = await db.get(
            `SELECT id, name, slug, parent_id
             FROM product_categories
             WHERE name = ?
               AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)`
            , [trimmedName, normalizedParentId, normalizedParentId]
        );
        if (existingByName) {
            return res.status(200).json(existingByName);
        }

        const slugBase = slugify(trimmedName);
        const uniqueSlug = await ensureUniqueCategorySlug(slugBase);
        const result = await db.run(
            'INSERT INTO product_categories (name, slug, parent_id) VALUES (?, ?, ?)',
            [trimmedName, uniqueSlug, normalizedParentId]
        );

        const payload = { id: result.lastID, name: trimmedName, slug: uniqueSlug, parent_id: normalizedParentId };

        await cacheService.invalidateCategories();
        await cacheService.invalidateCategoriesTree();
        getWebSocketService().broadcast('categories:update');
        res.status(201).json(payload);
    } catch (err) {
        console.error('[categories:create] failed:', err && err.stack ? err.stack : err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/categories/:id', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name, parentId } = req.body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) return res.status(400).json({ error: 'Missing name' });

    const categoryId = Number(req.params.id);
    if (!Number.isInteger(categoryId)) {
        return res.status(400).json({ error: 'Invalid category id' });
    }

    const normalizedParentId = parentId === undefined || parentId === null || parentId === ''
        ? null
        : Number(parentId);
    if (normalizedParentId !== null && (!Number.isFinite(normalizedParentId) || !Number.isInteger(normalizedParentId))) {
        return res.status(400).json({ error: 'Invalid parentId' });
    }

    try {
        console.log('[categories:update] payload:', { id: categoryId, name: trimmedName, parentId: normalizedParentId });
        const existingCategory = await db.get('SELECT id FROM product_categories WHERE id = ?', [categoryId]);
        if (!existingCategory) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const existingByName = await db.get(
            `SELECT id
             FROM product_categories
             WHERE name = ?
               AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
               AND id != ?`,
            [trimmedName, normalizedParentId, normalizedParentId, categoryId]
        );
        if (existingByName) {
            return res.status(409).json({ error: 'A category with that name already exists at this level.' });
        }

        const slugBase = slugify(trimmedName);
        const uniqueSlug = await ensureUniqueCategorySlug(slugBase, categoryId);

        await db.run(
            'UPDATE product_categories SET name = ?, slug = ?, parent_id = ? WHERE id = ?',
            [trimmedName, uniqueSlug, normalizedParentId, categoryId]
        );

        const payload = { id: categoryId, name: trimmedName, slug: uniqueSlug, parent_id: normalizedParentId };

        await cacheService.invalidateCategories();
        await cacheService.invalidateCategoriesTree();
        getWebSocketService().broadcast('categories:update');
        res.json(payload);
    } catch (err) {
        console.error('[categories:update] failed:', err && err.stack ? err.stack : err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/categories/:id', authMiddleware, requireRole('manager'), async (req, res) => {
    try {
        // Note: This is a simple delete. A real-world app should handle orphaned children,
        // re-parenting them or preventing deletion if children exist.
        await db.run('DELETE FROM product_categories WHERE id = ?', [req.params.id]);
        await cacheService.invalidateCategories();
        await cacheService.invalidateCategoriesTree();
        getWebSocketService().broadcast('categories:update');
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/storefront/preorders', async (req, res) => {
    if (!STOREFRONT_API_KEY) {
        return res.status(404).json({ error: 'Storefront API not configured' });
    }
    const providedKey = req.headers['x-storefront-key'] || req.query.key;
    if (!providedKey || providedKey !== STOREFRONT_API_KEY) {
        return res.status(403).json({ error: 'Invalid storefront key' });
    }
    try {
        const products = await db.all(
            `SELECT id, name, price, stock, sku, barcode, image, image_source, description, technical_details, preorder_enabled, preorder_release_date, preorder_notes
             FROM products
             WHERE preorder_enabled = 1`
        );
        const transformed = products.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            stock: p.stock,
            sku: p.sku,
            barcode: p.barcode,
            image: p.image,
            imageUrl: p.image_source,
            description: p.description,
            technicalDetails: p.technical_details,
            preorderReleaseDate: p.preorder_release_date,
            preorderNotes: p.preorder_notes,
        }));
        res.json(transformed);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', authMiddleware, requireRole('cashier'), async (req, res) => {
    const {
        name,
        price,
        stock,
        categoryId,
        subcategoryId,
        subsubcategoryId,
        brandId,
        shortDescription,
        description,
        technicalDetails,
        type,
        image,
        imageUrl,
        sku,
        autoSku = true,
        barcode,
        cost,
        trackInventory = true,
        availableForPreorder = false,
        preorderReleaseDate,
        preorderNotes,
        preorderEta,
        tags = [],
        materialId,
        colorId,
        audience,
        deliveryType,
        warrantyTerm,
        year,
        category,
        subcategory,
    } = req.body;

    if (!name || price == null) return res.status(400).json({ error: 'Missing fields' });

    const normalizedPrice = parseFloat(price);
    if (!Number.isFinite(normalizedPrice)) return res.status(400).json({ error: 'Invalid price value' });
    const normalizedStock = Number.isFinite(stock) ? stock : parseInt(stock || '0', 10) || 0;
    const normalizedCost = cost != null ? parseFloat(cost) || 0 : 0;
    const normalizedTrack = trackInventory === false || trackInventory === 0 ? 0 : 1;
    const storedImage = image?.trim() || null;
    const storedImageSource = imageUrl?.trim() || null;
    const technical = technicalDetails || null;
    const normalizedType = type === 'digital' ? 'digital' : 'physical';
    const normalizedAudience = normalizeEnum(audience, AUDIENCE_OPTIONS);
    const normalizedDelivery = normalizeEnum(deliveryType, DELIVERY_TYPES);
    const normalizedWarranty = normalizeEnum(warrantyTerm, WARRANTY_TERMS);
    const normalizedEta = preorderEta && preorderEta.toString().trim() ? preorderEta.toString().trim() : null;
    const normalizedYear = year != null && year !== '' ? parseInt(year, 10) : null;
    const normalizedAutoSku = autoSku === false || autoSku === 0 ? 0 : 1;
    const preorderEnabled = availableForPreorder ? 1 : 0;
    const preorderDate = typeof preorderReleaseDate === 'string' && preorderReleaseDate.trim() ? preorderReleaseDate.trim() : null;
    const preorderMessage = typeof preorderNotes === 'string' && preorderNotes.trim() ? preorderNotes.trim() : null;
    const brandIdInt = brandId ? parseInt(brandId, 10) : null;
    const materialIdInt = materialId ? parseInt(materialId, 10) : null;
    const colorIdInt = colorId ? parseInt(colorId, 10) : null;

    let resolvedCategoryId = categoryId ? parseInt(categoryId, 10) : null;
    let resolvedSubcategoryId = subcategoryId ? parseInt(subcategoryId, 10) : null;
    let resolvedSubsubcategoryId = subsubcategoryId ? parseInt(subsubcategoryId, 10) : null;

    if (!resolvedCategoryId && category) {
        const existingCategory = await db.get('SELECT id FROM product_categories WHERE name = ?', [category]);
        if (existingCategory) resolvedCategoryId = existingCategory.id;
    }
    if (!resolvedSubcategoryId && subcategory) {
        const existingSubcategory = await db.get('SELECT id, parent_id FROM product_categories WHERE name = ?', [subcategory]);
        if (existingSubcategory) {
            resolvedSubcategoryId = existingSubcategory.id;
            if (!resolvedCategoryId) resolvedCategoryId = existingSubcategory.parent_id;
        }
    }

    const { categoryName, subcategoryName, subsubcategoryName } = await fetchCategoryPath(
        resolvedCategoryId,
        resolvedSubcategoryId,
        resolvedSubsubcategoryId
    );

    const trimmedBarcode = barcode?.trim() || null;
    if (trimmedBarcode && !/^[0-9]{8,13}$/.test(trimmedBarcode)) {
        return res.status(400).json({ error: 'Invalid barcode format (8-13 digits expected)' });
    }

    const brandName = await fetchBrandName(brandIdInt);
    let finalSku = sku?.trim() || null;
    if ((!finalSku || normalizedAutoSku) && name) {
        const computedSku = computeAutoSku({
            brandName: brandName || name,
            productName: name,
            year: normalizedYear || new Date().getFullYear(),
        });
        finalSku = await ensureUniqueSku(computedSku);
    } else if (finalSku) {
        const existingSku = await db.get('SELECT id FROM products WHERE sku = ?', [finalSku]);
        if (existingSku) return res.status(409).json({ error: 'SKU already in use' });
    }

    try {
        const { lastID } = await db.run(
            `INSERT INTO products (
                name, price, stock, category, subcategory,
                image, image_source, description, technical_details,
                sku, barcode, cost, track_inventory, preorder_enabled,
                preorder_release_date, preorder_notes, short_description, type,
                brand_id, category_id, subcategory_id, subsubcategory_id,
                material_id, color_id, audience, delivery_type, warranty_term,
                preorder_eta, year, auto_sku
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                normalizedPrice,
                normalizedStock,
                categoryName || category || null,
                subcategoryName || subcategory || null,
                storedImage,
                storedImageSource,
                description || null,
                technical,
                finalSku || null,
                trimmedBarcode,
                normalizedCost,
                normalizedTrack,
                preorderEnabled,
                preorderDate,
                preorderMessage,
                shortDescription ? shortDescription.trim() : null,
                normalizedType,
                brandIdInt,
                resolvedCategoryId,
                resolvedSubcategoryId,
                resolvedSubsubcategoryId,
                materialIdInt,
                colorIdInt,
                normalizedAudience,
                normalizedDelivery,
                normalizedWarranty,
                normalizedEta,
                normalizedYear,
                normalizedAutoSku,
            ]
        );

        const tagRows = await syncProductTags(lastID, tags);

        await cacheService.invalidateProducts();
        await cacheService.invalidateProduct(lastID);
        await cacheService.invalidateCategories();
        await cacheService.invalidateCategoriesTree();
        await cacheService.invalidateLookups();

        res.status(201).json({
            id: lastID,
            name,
            price: normalizedPrice,
            stock: normalizedStock,
            category: categoryName || category || null,
            subcategory: subcategoryName || subcategory || null,
            subsubcategory_name: subsubcategoryName,
            category_id: resolvedCategoryId,
            subcategory_id: resolvedSubcategoryId,
            subsubcategory_id: resolvedSubsubcategoryId,
            image: storedImage,
            image_source: storedImageSource,
            description: description || null,
            technical_details: technical,
            sku: finalSku || null,
            barcode: trimmedBarcode,
            cost: normalizedCost,
            track_inventory: normalizedTrack,
            preorder_enabled: preorderEnabled,
            preorder_release_date: preorderDate,
            preorder_notes: preorderMessage,
            short_description: shortDescription ? shortDescription.trim() : null,
            type: normalizedType,
            brand_id: brandIdInt,
            brand_name: brandName,
            material_id: materialIdInt,
            color_id: colorIdInt,
            audience: normalizedAudience,
            delivery_type: normalizedDelivery,
            warranty_term: normalizedWarranty,
            preorder_eta: normalizedEta,
            year: normalizedYear,
            auto_sku: normalizedAutoSku,
            tags: tagRows,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id', authMiddleware, requireRole('cashier'), async (req, res) => {
    const { id } = req.params;
    const {
        name,
        price,
        stock,
        categoryId,
        subcategoryId,
        subsubcategoryId,
        brandId,
        shortDescription,
        description,
        technicalDetails,
        type,
        image,
        imageUrl,
        sku,
        autoSku,
        barcode,
        cost,
        trackInventory,
        availableForPreorder,
        preorderReleaseDate,
        preorderNotes,
        preorderEta,
        tags,
        materialId,
        colorId,
        audience,
        deliveryType,
        warrantyTerm,
        year,
        category,
        subcategory,
    } = req.body;

    try {
        const existing = await db.get('SELECT * FROM products WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ error: 'Product not found' });

        const updatedName = name != null ? name : existing.name;
        const normalizedPrice = price != null ? parseFloat(price) : existing.price;
        if (!Number.isFinite(normalizedPrice)) return res.status(400).json({ error: 'Invalid price value' });
        const normalizedStock = stock != null ? (Number.isFinite(stock) ? stock : parseInt(stock || '0', 10) || 0) : (existing.stock ?? 0);
        const normalizedCost = cost != null ? parseFloat(cost) || 0 : (existing.cost ?? 0);
        const normalizedTrack = trackInventory != null ? (trackInventory === false || trackInventory === 0 ? 0 : 1) : (existing.track_inventory ?? 1);
        const normalizedType = type != null ? (type === 'digital' ? 'digital' : 'physical') : (existing.type || 'physical');
        const normalizedAudience = audience !== undefined ? normalizeEnum(audience, AUDIENCE_OPTIONS) : existing.audience;
        const normalizedDelivery = deliveryType !== undefined ? normalizeEnum(deliveryType, DELIVERY_TYPES) : existing.delivery_type;
        const normalizedWarranty = warrantyTerm !== undefined ? normalizeEnum(warrantyTerm, WARRANTY_TERMS) : existing.warranty_term;
        const normalizedEta = preorderEta !== undefined ? (preorderEta && preorderEta.toString().trim() ? preorderEta.toString().trim() : null) : existing.preorder_eta;
        let normalizedYear = existing.year ?? null;
        if (year !== undefined) {
            if (year === null || year === '') {
                normalizedYear = null;
            } else {
                const parsedYear = parseInt(year, 10);
                normalizedYear = Number.isFinite(parsedYear) ? parsedYear : null;
            }
        }

        const brandIdInt = brandId !== undefined ? (brandId ? parseInt(brandId, 10) : null) : (existing.brand_id ?? null);
        const materialIdInt = materialId !== undefined ? (materialId ? parseInt(materialId, 10) : null) : (existing.material_id ?? null);
        const colorIdInt = colorId !== undefined ? (colorId ? parseInt(colorId, 10) : null) : (existing.color_id ?? null);

        let resolvedCategoryId = categoryId !== undefined ? (categoryId ? parseInt(categoryId, 10) : null) : (existing.category_id ?? null);
        let resolvedSubcategoryId = subcategoryId !== undefined ? (subcategoryId ? parseInt(subcategoryId, 10) : null) : (existing.subcategory_id ?? null);
        let resolvedSubsubcategoryId = subsubcategoryId !== undefined ? (subsubcategoryId ? parseInt(subsubcategoryId, 10) : null) : (existing.subsubcategory_id ?? null);

        if (!resolvedCategoryId && category) {
            const existingCategory = await db.get('SELECT id FROM product_categories WHERE name = ?', [category]);
            if (existingCategory) resolvedCategoryId = existingCategory.id;
        }
        if (!resolvedSubcategoryId && subcategory) {
            const existingSubcategory = await db.get('SELECT id, parent_id FROM product_categories WHERE name = ?', [subcategory]);
            if (existingSubcategory) {
                resolvedSubcategoryId = existingSubcategory.id;
                if (!resolvedCategoryId) resolvedCategoryId = existingSubcategory.parent_id;
            }
        }

        const { categoryName, subcategoryName, subsubcategoryName } = await fetchCategoryPath(
            resolvedCategoryId,
            resolvedSubcategoryId,
            resolvedSubsubcategoryId
        );

        const storedImage = image !== undefined ? (image ? image.trim() : null) : existing.image;
        const storedImageSource = imageUrl !== undefined ? (imageUrl ? imageUrl.trim() : null) : existing.image_source;
        const descriptionValue = description !== undefined ? description : existing.description;
        const technicalValue = technicalDetails !== undefined ? technicalDetails : existing.technical_details;
        const shortDescriptionValue = shortDescription !== undefined ? (shortDescription ? shortDescription.trim() : null) : existing.short_description;

        const trimmedBarcode = barcode !== undefined ? (barcode ? barcode.trim() : null) : (existing.barcode || null);
        if (trimmedBarcode && !/^[0-9]{8,13}$/.test(trimmedBarcode)) {
            return res.status(400).json({ error: 'Invalid barcode format (8-13 digits expected)' });
        }

        const preorderEnabledValue = availableForPreorder !== undefined ? (availableForPreorder ? 1 : 0) : (existing.preorder_enabled ?? 0);
        const preorderDateValue = preorderReleaseDate !== undefined ? (preorderReleaseDate && preorderReleaseDate.trim() ? preorderReleaseDate.trim() : null) : (existing.preorder_release_date ?? null);
        const preorderMessageValue = preorderNotes !== undefined ? (preorderNotes && preorderNotes.trim() ? preorderNotes.trim() : null) : (existing.preorder_notes ?? null);

        const autoFlag = autoSku !== undefined ? (autoSku ? 1 : 0) : (existing.auto_sku ?? 1);
        const brandName = await fetchBrandName(brandIdInt);
        let finalSku = sku !== undefined ? (sku ? sku.trim() : null) : (existing.sku ?? null);
        if (autoFlag) {
            const computedSku = computeAutoSku({
                brandName: brandName || updatedName,
                productName: updatedName,
                year: normalizedYear || new Date().getFullYear(),
            });
            finalSku = await ensureUniqueSku(computedSku, id);
        } else if (finalSku && finalSku !== existing.sku) {
            const existingSku = await db.get('SELECT id FROM products WHERE sku = ? AND id != ?', [finalSku, id]);
            if (existingSku) return res.status(409).json({ error: 'SKU already in use' });
        }

        await db.run(
            `UPDATE products SET
                name = ?,
                price = ?,
                stock = ?,
                category = ?,
                subcategory = ?,
                image = ?,
                image_source = ?,
                description = ?,
                technical_details = ?,
                sku = ?,
                barcode = ?,
                cost = ?,
                track_inventory = ?,
                preorder_enabled = ?,
                preorder_release_date = ?,
                preorder_notes = ?,
                short_description = ?,
                type = ?,
                brand_id = ?,
                category_id = ?,
                subcategory_id = ?,
                subsubcategory_id = ?,
                material_id = ?,
                color_id = ?,
                audience = ?,
                delivery_type = ?,
                warranty_term = ?,
                preorder_eta = ?,
                year = ?,
                auto_sku = ?
             WHERE id = ?`,
            [
                updatedName,
                normalizedPrice,
                normalizedStock,
                categoryName || category || existing.category || null,
                subcategoryName || subcategory || existing.subcategory || null,
                storedImage,
                storedImageSource,
                descriptionValue,
                technicalValue,
                finalSku,
                trimmedBarcode,
                normalizedCost,
                normalizedTrack,
                preorderEnabledValue,
                preorderDateValue,
                preorderMessageValue,
                shortDescriptionValue,
                normalizedType,
                brandIdInt,
                resolvedCategoryId,
                resolvedSubcategoryId,
                resolvedSubsubcategoryId,
                materialIdInt,
                colorIdInt,
                normalizedAudience,
                normalizedDelivery,
                normalizedWarranty,
                normalizedEta,
                normalizedYear,
                autoFlag,
                id,
            ]
        );

        let tagRows;
        if (Array.isArray(tags)) {
            tagRows = await syncProductTags(id, tags);
        } else {
            tagRows = await db.all(
                `SELECT t.id, t.name, t.slug
                 FROM product_tags pt
                 INNER JOIN tags t ON t.id = pt.tag_id
                 WHERE pt.product_id = ?
                 ORDER BY t.name`,
                [id]
            );
        }

        await cacheService.invalidateProduct(id);
        await cacheService.invalidateProducts();
        await cacheService.invalidateCategories();
        await cacheService.invalidateCategoriesTree();
        await cacheService.invalidateLookups();

        res.json({
            id: Number(id),
            name: updatedName,
            price: normalizedPrice,
            stock: normalizedStock,
            category: categoryName || category || existing.category || null,
            subcategory: subcategoryName || subcategory || existing.subcategory || null,
            subsubcategory_name: subsubcategoryName || null,
            category_id: resolvedCategoryId,
            subcategory_id: resolvedSubcategoryId,
            subsubcategory_id: resolvedSubsubcategoryId,
            image: storedImage,
            image_source: storedImageSource,
            description: descriptionValue,
            technical_details: technicalValue,
            sku: finalSku,
            barcode: trimmedBarcode,
            cost: normalizedCost,
            track_inventory: normalizedTrack,
            preorder_enabled: preorderEnabledValue,
            preorder_release_date: preorderDateValue,
            preorder_notes: preorderMessageValue,
            short_description: shortDescriptionValue,
            type: normalizedType,
            brand_id: brandIdInt,
            brand_name: brandName,
            material_id: materialIdInt,
            color_id: colorIdInt,
            audience: normalizedAudience,
            delivery_type: normalizedDelivery,
            warranty_term: normalizedWarranty,
            preorder_eta: normalizedEta,
            year: normalizedYear,
            auto_sku: autoFlag,
            tags: tagRows,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.post('/api/products/bulk-import', authMiddleware, requireRole('manager'), async (req, res) => {
    const { products: incomingProducts } = req.body || {};
    if (!Array.isArray(incomingProducts) || incomingProducts.length === 0) {
        return res.status(400).json({ error: 'products array is required' });
    }
    const summary = { inserted: 0, updated: 0, failed: [] };
    for (const [index, raw] of incomingProducts.entries()) {
        const name = raw.name?.trim();
        const price = raw.price != null ? parseFloat(raw.price) : null;
        if (!name || !Number.isFinite(price)) {
            summary.failed.push({ index, name: name || '(missing)', reason: 'Missing name or price' });
            continue;
        }
        const payload = {
            name,
            price,
            stock: raw.stock != null ? parseInt(raw.stock, 10) || 0 : 0,
            category: raw.category || null,
            subcategory: raw.subcategory || null,
            image: raw.image || null,
            image_source: raw.imageUrl || raw.image_source || null,
            description: raw.description || null,
            technical_details: raw.technicalDetails || raw.technical_details || null,
            sku: raw.sku || null,
            barcode: raw.barcode || null,
            cost: raw.cost != null ? parseFloat(raw.cost) : 0,
            track_inventory: raw.trackInventory === false || raw.trackInventory === 0 ? 0 : 1
        };
        try {
            let existing = null;
            if (payload.sku) {
                existing = await db.get('SELECT id FROM products WHERE sku = ?', [payload.sku]);
            }
            if (!existing && raw.externalId) {
                existing = await db.get('SELECT id FROM products WHERE id = ?', [raw.externalId]);
            }
            if (existing) {
                await db.run(
                    `UPDATE products SET name = ?, price = ?, stock = ?, category = ?, subcategory = ?, image = ?, image_source = ?, description = ?, technical_details = ?, barcode = ?, cost = ?, track_inventory = ?
                     WHERE id = ?`,
                    [
                        payload.name,
                        payload.price,
                        payload.stock,
                        payload.category,
                        payload.subcategory,
                        payload.image,
                        payload.image_source,
                        payload.description,
                        payload.technical_details,
                        payload.barcode,
                        payload.cost,
                        payload.track_inventory,
                        existing.id
                    ]
                );
                summary.updated += 1;
            } else {
                await db.run(
                    `INSERT INTO products (name, price, stock, category, subcategory, image, image_source, description, technical_details, sku, barcode, cost, track_inventory)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        payload.name,
                        payload.price,
                        payload.stock,
                        payload.category,
                        payload.subcategory,
                        payload.image,
                        payload.image_source,
                        payload.description,
                        payload.technical_details,
                        payload.sku,
                        payload.barcode,
                        payload.cost,
                        payload.track_inventory
                    ]
                );
                summary.inserted += 1;
            }
        } catch (err) {
            summary.failed.push({ index, name, reason: err.message });
        }
    }
    await logActivity('product', null, 'bulk_import', req.user?.username, JSON.stringify(summary));
    await queueNotification({
        staffId: req.user?.staffId || null,
        username: req.user?.username || null,
        title: 'Bulk product import completed',
        message: `${summary.inserted} created, ${summary.updated} updated, ${summary.failed.length} failed`,
        type: summary.failed.length ? 'warning' : 'success',
        metadata: summary
    });
    res.json(summary);
});

app.delete('/api/products/:id', authMiddleware, requireRole('manager'), async (req, res) => {
    try {
        const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
        await logActivity('product', req.params.id, 'delete', req.user?.username, JSON.stringify(product));
        await queueNotification({
            staffId: null,
            username: null,
            title: 'Product removed',
            message: `${product.name} has been archived`,
            type: 'info',
            metadata: { productId: Number(req.params.id) }
        });

        // Invalidate product caches
        await cacheService.invalidateProducts();
        await cacheService.invalidateCategories();

        res.status(204).end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Stock adjustment endpoint (recorded for audit). Managers and admins only.
app.post('/api/products/:id/adjust-stock', authMiddleware, requireRole(['manager','admin']), async (req, res) => {
    const { id } = req.params;
    const { new_stock, reason, reference } = req.body || {};
    if (new_stock == null) return res.status(400).json({ error: 'new_stock is required' });
    if (!reason || String(reason).trim().length === 0) return res.status(400).json({ error: 'reason is required for audit' });
    try {
        const product = await db.get('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const prev = Number(product.stock || 0);
        const next = parseInt(new_stock, 10) || 0;
        const delta = next - prev;

        // update product stock
        await db.run('UPDATE products SET stock = ? WHERE id = ?', [next, id]);

        // insert stock adjustment record
        const r = await db.run(
            'INSERT INTO stock_adjustments (product_id, staff_id, username, delta, new_stock, reason, reference) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, req.user?.staffId || null, req.user?.username || null, delta, next, reason || null, reference || null]
        );

        const adjustment = await db.get('SELECT * FROM stock_adjustments WHERE id = ?', [r.lastID]);

        // log activity and optionally notify low stock
        await logActivity('product', id, 'adjust_stock', req.user?.username, JSON.stringify({ prev, next, delta, reason }));
        if (next <= 5) {
            await queueNotification({
                staffId: null,
                username: null,
                title: 'Low stock warning',
                message: `${product.name} stock adjusted to ${next} (low)`,
                type: 'warning',
                metadata: { productId: id, newStock: next }
            });
        }

        const updated = await db.get('SELECT * FROM products WHERE id = ?', [id]);
        res.json({ product: updated, adjustment });

        // WebSocket broadcast for real-time updates
        try {
            const wsService = getWebSocketService();
            wsService.notifyStockChange(id, {
                productId: id,
                productName: product.name,
                previousStock: prev,
                newStock: next,
                delta: delta,
                reason: reason,
                reference: reference,
                adjustedBy: req.user?.username || 'system',
                timestamp: new Date()
            });
        } catch (wsErr) {
            console.warn('WebSocket broadcast failed:', wsErr.message);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/me', authMiddleware, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
        if (req.user.staffId) {
            const staff = await db.get('SELECT id, username, display_name, email, phone, created_at FROM staff WHERE id = ?', [req.user.staffId]);
            if (!staff) return res.status(404).json({ error: 'Profile not found' });
            const roles = await db.all('SELECT r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [staff.id]);
            return res.json({
                id: staff.id,
                username: staff.username,
                displayName: staff.display_name,
                email: staff.email,
                phone: staff.phone,
                avatar: staff.avatar || null,
                createdAt: staff.created_at,
                roles: roles.map((r) => r.name),
                editable: true
            });
        }
        return res.json({
            username: req.user.username,
            role: req.user.role,
            editable: false,
            message: 'Demo users cannot update profile details. Sign in with a staff account to edit your profile.'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/me', authMiddleware, async (req, res) => {
    try {
        if (!req.user?.staffId) {
            return res.status(400).json({ error: 'Profile editing is only available for staff accounts' });
        }
    const { displayName, email, phone, password, currentPassword, avatar } = req.body || {};
        const staff = await db.get('SELECT * FROM staff WHERE id = ?', [req.user.staffId]);
        if (!staff) return res.status(404).json({ error: 'Profile not found' });

    const nextDisplayName = displayName != null ? displayName.trim() : staff.display_name;
    const nextEmail = email != null ? email.trim() : staff.email;
    const nextPhone = phone != null ? phone.trim() : staff.phone;
    const nextAvatar = avatar != null ? (String(avatar).trim() || null) : (staff.avatar || null);
        let nextPasswordHash = staff.password;

        if (password) {
            if (!currentPassword) return res.status(400).json({ error: 'Current password required to set a new password' });
            const ok = await bcrypt.compare(currentPassword, staff.password || '');
            if (!ok) return res.status(400).json({ error: 'Current password is incorrect' });
            if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters long' });
            nextPasswordHash = await bcrypt.hash(password, 10);
        }

        await db.run(
            'UPDATE staff SET display_name = ?, email = ?, phone = ?, password = ?, avatar = ? WHERE id = ?',
            [nextDisplayName || null, nextEmail || null, nextPhone || null, nextPasswordHash || null, nextAvatar, staff.id]
        );
        const roles = await db.all('SELECT r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [staff.id]);

        await logActivity('staff', staff.id, 'profile_update', req.user.username, JSON.stringify({ displayName: nextDisplayName, email: nextEmail, phone: nextPhone }));
        await queueNotification({
            staffId: staff.id,
            username: staff.username,
            title: 'Profile updated',
            message: 'Your profile changes have been saved successfully.',
            type: 'success'
        });

        res.json({
            id: staff.id,
            username: staff.username,
            displayName: nextDisplayName,
            email: nextEmail,
            phone: nextPhone,
            avatar: nextAvatar,
            roles: roles.map((r) => r.name)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/notifications', authMiddleware, async (req, res) => {
    try {
        const staffId = req.user?.staffId || null;
        const username = req.user?.username || null;
        const unreadOnly = String(req.query.unreadOnly || '').toLowerCase() === 'true';
        const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 100);
        const notifications = await db.all(
            `SELECT * FROM notifications
             WHERE ((staff_id IS NULL AND username IS NULL)
                 OR (staff_id IS NOT NULL AND staff_id = ?)
                 OR (username IS NOT NULL AND username = ?))
             ${unreadOnly ? 'AND read_at IS NULL' : ''}
             ORDER BY created_at DESC
             LIMIT ?`,
            [staffId, username, limit]
        );
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// List stock adjustments (with filters and optional CSV export)
app.get('/api/stock-adjustments', authMiddleware, requireRole('manager'), async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page || '1', 10));
        const pageSize = Math.min(200, Math.max(10, parseInt(req.query.pageSize || '50', 10)));
        const productId = req.query.productId ? parseInt(req.query.productId, 10) : null;
        const username = req.query.username ? String(req.query.username) : null;
        const startDate = req.query.startDate ? String(req.query.startDate) : null;
        const endDate = req.query.endDate ? String(req.query.endDate) : null;
        const exportCsv = String(req.query.export || '').toLowerCase() === 'csv';

        let where = 'WHERE 1=1';
        const params = [];
        if (productId) { where += ' AND sa.product_id = ?'; params.push(productId); }
        if (username) { where += ' AND sa.username = ?'; params.push(username); }
        if (startDate) { where += ' AND sa.created_at >= ?'; params.push(startDate); }
        if (endDate) { where += ' AND sa.created_at <= ?'; params.push(endDate); }

        const totalRow = await db.get(`SELECT COUNT(*) as c FROM stock_adjustments sa ${where}`, params);
        const total = totalRow ? totalRow.c : 0;

        const offset = (page - 1) * pageSize;
        const rows = await db.all(
            `SELECT sa.*, p.name as product_name FROM stock_adjustments sa LEFT JOIN products p ON p.id = sa.product_id ${where} ORDER BY sa.created_at DESC LIMIT ? OFFSET ?`,
            [...params, pageSize, offset]
        );

        if (exportCsv) {
            // Build a simple CSV
            const header = ['id','product_id','product_name','staff_id','username','delta','new_stock','reason','reference','created_at'];
            const lines = [header.join(',')];
            for (const r of rows) {
                const vals = header.map((h) => {
                    let v = r[h] == null ? '' : String(r[h]);
                    // escape quotes
                    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
                        v = '"' + v.replace(/"/g, '""') + '"';
                    }
                    return v;
                });
                lines.push(vals.join(','));
            }
            const csv = lines.join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="stock_adjustments_${Date.now()}.csv"`);
            return res.send(csv);
        }

        res.json({ total, page, pageSize, items: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notifications/:id/read', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const staffId = req.user?.staffId || null;
        const username = req.user?.username || null;
        const notification = await db.get('SELECT * FROM notifications WHERE id = ?', [id]);
        if (!notification) return res.status(404).json({ error: 'Notification not found' });
        if (
            notification.staff_id &&
            staffId !== notification.staff_id
        ) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (
            notification.username &&
            notification.username !== username
        ) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        await db.run('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notifications/read-all', authMiddleware, async (req, res) => {
    try {
        const staffId = req.user?.staffId || null;
        const username = req.user?.username || null;
        await db.run(
            `UPDATE notifications
             SET read_at = CURRENT_TIMESTAMP
             WHERE (staff_id IS NOT NULL AND staff_id = ?)
                OR (username IS NOT NULL AND username = ?)`,
            [staffId, username]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Vendor Onboarding Route
app.post('/api/vendors', async (req, res) => {
    const { legal_name, contact_person, email, phone, address, website, capabilities, notes } = req.body;
    if (!legal_name || !email) {
        return res.status(400).json({ error: 'Legal name and email are required.' });
    }
    try {
        const result = await db.run(
            'INSERT INTO vendors (legal_name, contact_person, email, phone, address, website, capabilities, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [legal_name, contact_person, email, phone, address, website, capabilities, notes]
        );
        res.status(201).json({ id: result.lastID, message: 'Vendor application submitted successfully.' });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A vendor with this email already exists.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Customer update
app.put('/api/customers/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, address, gst_number, registration_number, is_business } = req.body;
    try {
        await db.run(
            'UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, gst_number = ?, registration_number = ?, is_business = COALESCE(?, is_business) WHERE id = ?',
            [name, email, phone || null, address || null, gst_number || null, registration_number || null, is_business ? 1 : 0, id]
        );
        const customer = await db.get('SELECT * FROM customers WHERE id = ?', [id]);

        // Invalidate customer cache
        await cacheService.invalidateCustomers();

        res.json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Customer Routes
app.get('/api/customers', async (req, res) => {
    try {
        // Try to get from cache first
        const cachedCustomers = await cacheService.getCustomers();
        if (cachedCustomers) {
            console.log('Serving customers from cache');
            return res.json(cachedCustomers);
        }

        // Cache miss - fetch from database
        const customers = await db.all('SELECT * FROM customers');

        // Cache the result for 5 minutes
        await cacheService.setCustomers(customers, 300);

        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/customers', async (req, res) => {
    const { name, email, phone, address, gst_number, registration_number, is_business } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const result = await db.run(
            'INSERT INTO customers (name, email, phone, address, gst_number, registration_number, is_business) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email || null, phone || null, address || null, gst_number || null, registration_number || null, is_business ? 1 : 0]
        );
        const customer = await db.get('SELECT * FROM customers WHERE id = ?', [result.lastID]);

        // Invalidate customer cache
        await cacheService.invalidateCustomers();

        res.status(201).json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/customers/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM customers WHERE id = ?', [req.params.id]);

        // Invalidate customer cache
        await cacheService.invalidateCustomers();

        res.status(204).end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/customers/:id', async (req, res) => {
    try {
        const customer = await db.get('SELECT * FROM customers WHERE id = ?', [req.params.id]);
        if (!customer) return res.status(404).json({ error: 'Customer not found' });
        res.json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/customers/:id/invoices', async (req, res) => {
    try {
        const invoices = await db.all('SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC', [req.params.id]);
        res.json(invoices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Settings Routes
app.get('/api/settings', async (req, res) => {
    try {
        // Try to get from cache first
        const cachedSettings = await cacheService.getSettings();
        if (cachedSettings) {
            console.log('Serving settings from cache');
            return res.json(cachedSettings);
        }

        // Cache miss - fetch from database
        const settings = await db.get('SELECT * FROM settings WHERE id = 1');
        let outlet = null;
        if (settings && settings.current_outlet_id) {
            outlet = await db.get('SELECT * FROM outlets WHERE id = ?', [settings.current_outlet_id]);
        }
        // if no outlet found, try to return a minimal outlet object from settings
        if (!outlet && settings) {
            outlet = {
                id: 0,
                name: settings.outlet_name,
                currency: settings.currency,
                gst_rate: settings.gst_rate,
                store_address: settings.store_address,
                invoice_template: settings.invoice_template
            };
        }
        // also include email settings if present
    // include SMTP flags and friendly from/reply-to in the returned payload so frontend can render them
    const emailCfg = await db.get('SELECT provider, api_key, email_from, email_to, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, smtp_require_tls, smtp_from_name, smtp_reply_to FROM settings_email ORDER BY id DESC LIMIT 1');
        const fullSettings = { ...settings, outlet, email: emailCfg || null };

        // Cache the result for 10 minutes (settings change infrequently)
        await cacheService.setSettings(fullSettings, 600);

        res.json(fullSettings);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Allow managers to edit a subset of settings. Admins can edit everything.
app.put('/api/settings', authMiddleware, requireRole(['admin', 'manager']), async (req, res) => {
    try {
        const { outlet_name, currency, gst_rate, store_address, invoice_template, current_outlet_id,
            email_provider, email_api_key, email_from, email_to,
            smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, smtp_require_tls, smtp_from_name, smtp_reply_to,
            email_template_invoice, email_template_quote, email_template_quote_request } = req.body;

        // Define fields managers are allowed to update
        const managerAllowed = ['currency', 'gst_rate', 'store_address', 'invoice_template', 'current_outlet_id', 'outlet_name'];

        // If caller is manager, ensure they only change allowed fields
        if (req.user && req.user.role === 'manager') {
            const provided = Object.keys(req.body || {});
            const disallowed = provided.filter(p => !managerAllowed.includes(p));
            if (disallowed.length > 0) {
                return res.status(403).json({ error: 'Managers may not modify the following settings: ' + disallowed.join(', ') });
            }
        }

        await db.run(
            `UPDATE settings SET outlet_name = COALESCE(?, outlet_name), currency = COALESCE(?, currency), gst_rate = COALESCE(?, gst_rate), store_address = COALESCE(?, store_address), invoice_template = COALESCE(?, invoice_template), email_template_invoice = COALESCE(?, email_template_invoice), email_template_quote = COALESCE(?, email_template_quote), email_template_quote_request = COALESCE(?, email_template_quote_request), current_outlet_id = COALESCE(?, current_outlet_id) WHERE id = 1`,
            [outlet_name || null, currency || null, gst_rate || null, store_address || null, invoice_template || null, email_template_invoice || null, email_template_quote || null, email_template_quote_request || null, current_outlet_id || null]
        );

        // Only admins may update email configuration and email templates
        if (req.user && req.user.role !== 'admin' && (email_provider || email_api_key || email_from || email_to || smtp_host || smtp_port || smtp_user || smtp_pass || smtp_secure || smtp_require_tls || smtp_from_name || smtp_reply_to || email_template_invoice || email_template_quote || email_template_quote_request)) {
            return res.status(403).json({ error: 'Only administrators may modify email/SMTP settings' });
        }

        // update email config if provided (store as last row in settings_email)
        if (email_provider || email_api_key || email_from || email_to || smtp_host || smtp_port || smtp_user || smtp_pass || smtp_secure || smtp_require_tls || smtp_from_name || smtp_reply_to) {
            // Fetch existing email config so we don't overwrite fields the admin didn't submit (e.g. password)
            const existingEmail = await db.get('SELECT * FROM settings_email ORDER BY id DESC LIMIT 1');

            const nextProvider = (typeof email_provider !== 'undefined' && email_provider !== null) ? email_provider : (existingEmail ? existingEmail.provider : null);
            const nextApiKey = (typeof email_api_key !== 'undefined' && email_api_key !== null) ? email_api_key : (existingEmail ? existingEmail.api_key : null);
            const nextFrom = (typeof email_from !== 'undefined' && email_from !== null) ? email_from : (existingEmail ? existingEmail.email_from : null);
            const nextTo = (typeof email_to !== 'undefined' && email_to !== null) ? email_to : (existingEmail ? existingEmail.email_to : null);
            const nextHost = (typeof smtp_host !== 'undefined' && smtp_host !== null) ? smtp_host : (existingEmail ? existingEmail.smtp_host : null);
            const nextPort = (typeof smtp_port !== 'undefined' && smtp_port !== null) ? smtp_port : (existingEmail ? existingEmail.smtp_port : null);
            const nextUser = (typeof smtp_user !== 'undefined' && smtp_user !== null) ? smtp_user : (existingEmail ? existingEmail.smtp_user : null);
            // Do NOT return the existing password to the client, but preserve it when admin does not submit a new one
            const nextPass = (typeof smtp_pass !== 'undefined' && smtp_pass !== null && smtp_pass !== '') ? smtp_pass : (existingEmail ? existingEmail.smtp_pass : null);
            const nextSecure = (typeof smtp_secure !== 'undefined' && smtp_secure !== null) ? (smtp_secure ? 1 : 0) : (existingEmail ? (existingEmail.smtp_secure ? 1 : 0) : 0);
            const nextRequireTLS = (typeof smtp_require_tls !== 'undefined' && smtp_require_tls !== null) ? (smtp_require_tls ? 1 : 0) : (existingEmail ? (existingEmail.smtp_require_tls ? 1 : 0) : 0);
            const nextFromName = (typeof smtp_from_name !== 'undefined' && smtp_from_name !== null) ? smtp_from_name : (existingEmail ? existingEmail.smtp_from_name : null);
            const nextReplyTo = (typeof smtp_reply_to !== 'undefined' && smtp_reply_to !== null) ? smtp_reply_to : (existingEmail ? existingEmail.smtp_reply_to : null);

            await db.run(
                'INSERT INTO settings_email (provider, api_key, email_from, email_to, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, smtp_require_tls, smtp_from_name, smtp_reply_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    nextProvider,
                    nextApiKey,
                    nextFrom,
                    nextTo,
                    nextHost,
                    nextPort,
                    nextUser,
                    nextPass,
                    nextSecure,
                    nextRequireTLS,
                    nextFromName,
                    nextReplyTo
                ]
            );
        }
        const settings = await db.get('SELECT * FROM settings WHERE id = 1');
    const emailCfg = await db.get('SELECT provider, api_key, email_from, email_to, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, smtp_require_tls, smtp_from_name, smtp_reply_to FROM settings_email ORDER BY id DESC LIMIT 1');

        // Invalidate settings cache
        await cacheService.invalidateSettings();

        res.json({ ...settings, email: emailCfg || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Test SMTP/sendgrid settings by sending a small test email. Admin only.
app.post('/api/settings/test-smtp', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const emailCfg = await db.get('SELECT * FROM settings_email ORDER BY id DESC LIMIT 1');
        if (!emailCfg) return res.status(400).json({ error: 'No email configuration found' });
        // send a test email to configured recipient or to the provided one
        const to = req.body.to || emailCfg.email_to || emailCfg.email_from;
        if (!to) return res.status(400).json({ error: 'No recipient configured to send test email to' });

    const subject = 'ITnVend SMTP test message';
    const html = `<p>This is a test message from ITnVend to verify email settings.</p><p>If you receive this, SMTP is configured correctly.</p>`;

    await sendNotificationEmail(subject, html, to, true);
    res.json({ success: true, to });
    } catch (err) {
        console.warn('SMTP test failed', err?.message || err);
        res.status(500).json({ error: err.message || String(err) });
    }
});

// Quote endpoints (public submit, admin list)
app.post('/api/quotes', async (req, res) => {
    try {
        const {
            company_name,
            contact_name,
            email: contact_email,
            phone,
            details,
            cart,
            submission_type,
            existing_customer_ref,
            registration_number
        } = req.body;
        if (!contact_name || !contact_email) return res.status(400).json({ error: 'Missing contact name or email' });

        const result = await db.run(
            'INSERT INTO quotes (company_name, contact_name, email, phone, details, submission_type, existing_customer_ref, registration_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                company_name || null,
                contact_name,
                contact_email,
                phone || null,
                details || null,
                submission_type || null,
                existing_customer_ref || null,
                registration_number || null
            ]
        );
        const quote = await db.get('SELECT * FROM quotes WHERE id = ?', [result.lastID]);

        // ensure customer exists or is updated
        let customer = await db.get('SELECT * FROM customers WHERE email = ?', [contact_email]);
        if (customer) {
            await db.run('UPDATE customers SET name = ? WHERE id = ?', [contact_name, customer.id]);
        } else {
            const cRes = await db.run('INSERT INTO customers (name, email) VALUES (?, ?)', [contact_name, contact_email]);
            customer = await db.get('SELECT * FROM customers WHERE id = ?', [cRes.lastID]);
        }

        // compute subtotal/tax/total if cart provided, and store invoice_items so admin can edit later
        let subtotal = 0, taxAmount = 0, total = 0;
        // determine gst_rate/outlet
        const settingsRow = await db.get('SELECT gst_rate, current_outlet_id FROM settings WHERE id = 1');
        const outletId = settingsRow?.current_outlet_id || null;
        const gstRate = parseFloat(settingsRow?.gst_rate || 0);

        // Create a manage-able invoice record (type=quote) linked to this customer so admin can review/convert
        const invRes = await db.run('INSERT INTO invoices (customer_id, subtotal, tax_amount, total, outlet_id, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [customer.id, 0, 0, 0, outletId, 'quote', 'draft']);
        const createdInvoice = await db.get('SELECT * FROM invoices WHERE id = ?', [invRes.lastID]);

        if (Array.isArray(cart) && cart.length > 0) {
            const stmt = await db.prepare('INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
            for (const it of cart) {
                const productId = it.id || it.product_id || null;
                const qty = parseInt(it.quantity || 0, 10) || 0;
                const price = parseFloat(it.price || it.unit_price || 0) || 0;
                if (qty <= 0) continue;
                await stmt.run(createdInvoice.id, productId, qty, price);
                subtotal += price * qty;
            }
            await stmt.finalize();

            taxAmount = +(subtotal * (gstRate / 100));
            total = +(subtotal + taxAmount);

            // update invoice totals
            await db.run('UPDATE invoices SET subtotal = ?, tax_amount = ?, total = ? WHERE id = ?', [subtotal, taxAmount, total, createdInvoice.id]);
        }

        // send admin/staff notification (supports sendgrid or smtp via settings_email)
        try {
            const subject = `Quotation request from ${contact_name}${company_name ? ' @ ' + company_name : ''}`;
            const bodyHtml = `<p>New quotation request received:</p>
                <ul>
                  <li><strong>Company:</strong> ${company_name || '-'}</li>
                  <li><strong>Contact:</strong> ${contact_name}</li>
                  <li><strong>Email:</strong> ${contact_email}</li>
                  <li><strong>Phone:</strong> ${phone || '-'}</li>
                  <li><strong>Submission type:</strong> ${submission_type || '-'}</li>
                  <li><strong>Existing account reference:</strong> ${existing_customer_ref || '-'}</li>
                  <li><strong>Registration number:</strong> ${registration_number || '-'}</li>
                  <li><strong>Details:</strong> ${details || '-'}</li>
                  <li><strong>Linked Quote ID:</strong> ${quote.id}</li>
                  <li><strong>Created Invoice ID:</strong> ${createdInvoice.id}</li>
                  <li><strong>Subtotal:</strong> ${subtotal}</li>
                  <li><strong>Tax:</strong> ${taxAmount}</li>
                  <li><strong>Total:</strong> ${total}</li>
                </ul>`;
            await sendNotificationEmail(subject, bodyHtml);

            // Send a confirmation email to the requester if outbound email is configured
            try {
                const customerHtml = `<p>Hi ${contact_name.split(' ')[0] || contact_name},</p>
                    <p>Thanks for your interest. We received your quotation request and will respond shortly.</p>
                    <p><strong>Summary</strong></p>
                    <ul>
                      <li><strong>Reference:</strong> Quote #${quote.id}</li>
                      <li><strong>Submitted:</strong> ${new Date().toLocaleString()}</li>
                      <li><strong>Items:</strong> ${Array.isArray(cart) && cart.length ? cart.length : 'see attached details'}</li>
                    </ul>
                    <p>If you need to add more information reply to this email or call our team.</p>`;
                await sendNotificationEmail(`We received your quote request (#${quote.id})`, customerHtml, contact_email);
            } catch (errEmail) {
                console.warn('Failed to send quote receipt to customer', errEmail?.message || errEmail);
            }

            // Also notify staff users with email addresses (cashiers/admins) so in-house staff get alerted
            try {
                const staffList = await db.all("SELECT email FROM staff WHERE email IS NOT NULL AND email != ''");
                const emails = staffList.map(s => s.email).filter(Boolean);
                if (emails.length > 0) {
                    // Send a single email to staff list (toOverride accepts a comma-separated string)
                    await sendNotificationEmail(subject, bodyHtml, emails.join(','));
                }
            } catch (e) {
                console.warn('Failed to notify staff emails', e?.message || e);
            }
        } catch (err) {
            console.warn('Failed to send quote notification', err?.message || err);
        }

        // Log activity
        try { await logActivity('quotes', quote.id, 'created', null, `Quote ${quote.id} created and linked invoice ${createdInvoice.id}`); } catch (e) { /* ignore */ }

        await queueNotification({
            staffId: null,
            username: null,
            title: 'New quote request',
            message: `Quotation request ${quote.id} is ready for review`,
            type: 'info',
            link: `/invoices/${createdInvoice.id}`,
            metadata: { quoteId: quote.id, invoiceId: createdInvoice.id }
        });

        res.status(201).json(quote);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/quotes', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const quotes = await db.all('SELECT * FROM quotes ORDER BY created_at DESC');
        res.json(quotes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Outlets endpoints
app.get('/api/outlets', async (req, res) => {
    try {
        const outlets = await db.all('SELECT * FROM outlets ORDER BY id');
        res.json(outlets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/outlets', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { name, currency, gst_rate, store_address, invoice_template } = req.body;
        if (!name) return res.status(400).json({ error: 'Missing outlet name' });
        const result = await db.run('INSERT INTO outlets (name, currency, gst_rate, store_address, invoice_template) VALUES (?, ?, ?, ?, ?)', [name, currency || 'MVR', gst_rate || 0, store_address || null, invoice_template || null]);
        const outlet = await db.get('SELECT * FROM outlets WHERE id = ?', [result.lastID]);
        res.status(201).json(outlet);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/outlets/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, currency, gst_rate, store_address, invoice_template } = req.body;
        await db.run('UPDATE outlets SET name = ?, currency = ?, gst_rate = ?, store_address = ?, invoice_template = ? WHERE id = ?', [name, currency, gst_rate || 0, store_address || null, invoice_template || null, id]);
        const outlet = await db.get('SELECT * FROM outlets WHERE id = ?', [id]);
        res.json(outlet);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// (settings and outlets modification routes are protected above)

// Invoice Routes
app.post('/api/invoices', async (req, res) => {
    const { customerId, items, type: rawType } = req.body;
    if (!customerId || !items || items.length === 0) {
        return res.status(400).json({ error: 'Missing customerId or items' });
    }

    const type = (rawType || 'invoice').toLowerCase() === 'quote' ? 'quote' : 'invoice';

    try {
        // Ignore items with non-positive quantity to avoid charging tax on zero-quantity lines
        const validItems = (items || []).filter(it => Number(it.quantity || 0) > 0);
        if (validItems.length === 0) {
            return res.status(400).json({ error: 'No items with positive quantity were provided' });
        }

        const subtotal = validItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);

        const settingsRow = await db.get('SELECT * FROM settings WHERE id = 1');
        let outlet = null;
        if (settingsRow && settingsRow.current_outlet_id) {
            outlet = await db.get('SELECT * FROM outlets WHERE id = ?', [settingsRow.current_outlet_id]);
        }
        if (!outlet) {
            outlet = {
                id: null,
                gst_rate: settingsRow?.gst_rate || 0,
                currency: settingsRow?.currency || 'MVR',
                name: settingsRow?.outlet_name || 'My Outlet'
            };
        }

        const gstRate = parseFloat(outlet.gst_rate || 0);
        const taxAmount = +(subtotal * (gstRate / 100));
        const total = +(subtotal + taxAmount);

        const status = type === 'invoice' ? 'issued' : 'draft';

        const result = await db.run(
            'INSERT INTO invoices (customer_id, subtotal, tax_amount, total, outlet_id, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [customerId, subtotal, taxAmount, total, outlet.id || null, type, status]
        );
        const invoiceId = result.lastID;

        const customerRow = await db.get('SELECT name, email FROM customers WHERE id = ?', [customerId]);
        const customerName = customerRow ? customerRow.name : 'Customer';

        // Insert only valid items (quantity > 0) to invoice_items and adjust stock accordingly
        for (const item of validItems) {
            const qty = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            await db.run(
                'INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [invoiceId, item.id || null, qty, price]
            );
            if (type === 'invoice' && item.id) {
                const productRow = await db.get('SELECT stock, track_inventory, name FROM products WHERE id = ?', [item.id]);
                if (productRow && (productRow.track_inventory === null || productRow.track_inventory === undefined || productRow.track_inventory)) {
                    const currentStock = parseInt(productRow.stock ?? 0, 10) || 0;
                    if (currentStock < qty) {
                        throw new Error(`Insufficient stock for product ${productRow.name || item.id}`);
                    }
                    const nextStock = currentStock - qty;
                    await db.run('UPDATE products SET stock = ? WHERE id = ?', [nextStock, item.id]);
                    if (nextStock <= 5) {
                        await queueNotification({
                            staffId: null,
                            username: null,
                            title: 'Low stock warning',
                            message: `${productRow.name || 'A product'} fell to ${nextStock} units after invoice #${invoiceId}`,
                            type: 'warning',
                            metadata: { productId: item.id, invoiceId, stock: nextStock }
                        });
                    }
                }
            }
        }

        // Create accounting journal entries for invoices (not quotes)
        if (type === 'invoice') {
            // Get account IDs
            const accountsReceivable = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['1200']);
            const salesRevenue = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['4000']);
            const taxesPayable = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['2200']);

            if (accountsReceivable && salesRevenue) {
                // Create journal entry
                const journalResult = await db.run(
                    'INSERT INTO journal_entries (entry_date, description, reference, total_debit, total_credit, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [new Date().toISOString().split('T')[0], `Sale Invoice #${invoiceId}`, `INV-${invoiceId}`, total, total, 'posted', new Date().toISOString()]
                );
                const journalId = journalResult.lastID;

                // Debit Accounts Receivable (customer owes money)
                await db.run(
                    'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)',
                    [journalId, accountsReceivable.id, total, 0, `Invoice #${invoiceId} - ${customerName}`]
                );

                // Credit Sales Revenue (company earned revenue)
                await db.run(
                    'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)',
                    [journalId, salesRevenue.id, 0, subtotal, `Sales revenue from invoice #${invoiceId}`]
                );

                // Credit Taxes Payable if there's tax
                if (taxAmount > 0 && taxesPayable) {
                    await db.run(
                        'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)',
                        [journalId, taxesPayable.id, 0, taxAmount, `GST on invoice #${invoiceId}`]
                    );
                }
            }
        }

        await logActivity('invoice', invoiceId, 'create', req.user?.username, JSON.stringify({ subtotal, total, type, customerId }));
        const actionLabel = type === 'invoice' ? 'Invoice issued' : 'Quote prepared';
        await queueNotification({
            staffId: req.user?.staffId || null,
            username: req.user?.username || null,
            title: actionLabel,
            message: `${actionLabel} for ${customerName} (total ${total.toFixed(2)})`,
            type: type === 'invoice' ? 'success' : 'info',
            metadata: { invoiceId, type, customerId, total }
        });

        const paymentInfo = req.body?.paymentInfo;
        if (paymentInfo && type === 'invoice') {
            try {
                const paymentMethodValue = typeof paymentInfo.method === 'string' ? paymentInfo.method : 'cash';
                const paymentMethod = paymentMethodValue;
                const methodLower = paymentMethodValue.toLowerCase();
                const isTransferPayment = ['transfer', 'bank_transfer'].includes(methodLower);
                const paymentReference = paymentInfo.reference || null;
                const paymentAmount = Number.isFinite(Number(paymentInfo.amount)) ? Number(paymentInfo.amount) : total;
                let slipPath = null;

                if (paymentInfo.slipPath) {
                    const normalized = normalizeUploadPath(paymentInfo.slipPath);
                    if (normalized) slipPath = `/uploads/${normalized}`;
                }

                if (!slipPath && isTransferPayment && paymentInfo.slip) {
                    try {
                        let base64 = paymentInfo.slip;
                        let ext = 'png';
                        const match = String(base64).match(/^data:(.+);base64,(.+)$/);
                        if (match) {
                            const mime = match[1];
                            base64 = match[2];
                            const parts = mime.split('/');
                            ext = parts[1] ? parts[1].split('+')[0] : ext;
                        }
                        const now = new Date();
                        const slipCategory = ['payment_slips', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0')];
                        const { dir } = ensureUploadDir(slipCategory, 'payment_slips');
                        const fileName = `slip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext || 'png'}`;
                        const filePath = path.join(dir, fileName);
                        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
                        const rel = path.relative(imagesDir, filePath).replace(/\\/g, '/');
                        slipPath = `/uploads/${rel}`;
                    } catch (err) {
                        console.warn('Failed to persist payment slip for invoice', err?.message || err);
                    }
                }

                await db.run(
                    'INSERT INTO payments (invoice_id, amount, method, note, reference, slip_path) VALUES (?, ?, ?, ?, ?, ?)',
                    [invoiceId, paymentAmount, paymentMethod, null, paymentReference, slipPath]
                );
                await db.run('UPDATE invoices SET payment_method = ?, payment_reference = ? WHERE id = ?', [paymentMethod, paymentReference, invoiceId]);
            } catch (err) {
                console.warn('Failed to record payment info for invoice', err?.message || err);
            }
        }

        res.status(201).json({
            id: invoiceId,
            message: `${type === 'invoice' ? 'Invoice' : 'Quote'} created`,
            subtotal,
            taxAmount,
            total,
            type,
            status,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/invoices', async (req, res) => {
    try {
        const invoices = await db.all(`
            SELECT 
                i.id, i.total, i.subtotal, i.tax_amount, i.created_at, i.type, i.status,
                c.name as customer_name,
                o.name as outlet_name
            FROM invoices i
            LEFT JOIN customers c ON c.id = i.customer_id
            LEFT JOIN outlets o ON o.id = i.outlet_id
            ORDER BY i.created_at DESC
        `);
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/transactions/recent', authMiddleware, requireRole('cashier'), async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10) || 50, 1), 200);
        const invoices = await db.all(`
            SELECT
                i.id,
                i.type,
                i.status,
                i.subtotal,
                i.tax_amount,
                i.total,
                i.created_at,
                i.customer_id,
                c.name as customer_name
            FROM invoices i
            LEFT JOIN customers c ON c.id = i.customer_id
            ORDER BY datetime(i.created_at) DESC
            LIMIT ?
        `, [limit]);

        if (invoices.length === 0) {
            return res.json([]);
        }

        const ids = invoices.map((inv) => inv.id);
        const placeholders = ids.map(() => '?').join(',');

        const lineItems = await db.all(`
            SELECT
                ii.invoice_id,
                ii.product_id,
                ii.quantity,
                ii.price,
                p.name as product_name
            FROM invoice_items ii
            LEFT JOIN products p ON p.id = ii.product_id
            WHERE ii.invoice_id IN (${placeholders})
            ORDER BY ii.invoice_id, ii.id
        `, ids);

        const itemsByInvoice = new Map();
        for (const row of lineItems) {
            if (!itemsByInvoice.has(row.invoice_id)) {
                itemsByInvoice.set(row.invoice_id, []);
            }
            itemsByInvoice.get(row.invoice_id).push({
                product_id: row.product_id,
                product_name: row.product_name,
                quantity: row.quantity,
                price: row.price
            });
        }

        const paymentRows = await db.all(`
            SELECT invoice_id, method
            FROM payments
            WHERE invoice_id IN (${placeholders})
        `, ids);

        const paymentMap = new Map();
        for (const row of paymentRows) {
            if (!paymentMap.has(row.invoice_id)) {
                paymentMap.set(row.invoice_id, new Set());
            }
            if (row.method) {
                paymentMap.get(row.invoice_id).add(row.method);
            }
        }

        const result = invoices.map((invoice) => {
            const items = itemsByInvoice.get(invoice.id) || [];
            const paymentMethodsSet = paymentMap.get(invoice.id) || new Set();
            return {
                ...invoice,
                item_count: items.length,
                items,
                payment_methods: Array.from(paymentMethodsSet)
            };
        });

        res.json(result);
    } catch (err) {
        console.error('Failed to load recent transactions', err?.message || err);
        res.status(500).json({ error: err.message || String(err) });
    }
});

// Get single invoice with line items (for edit/view in UI)
app.get('/api/invoices/:id', authMiddleware, requireRole(['accounts','admin']), async (req, res) => {
        const { id } = req.params;
        try {
            const invoice = await db.get(`
                SELECT i.*, c.name as customer_name, o.name as outlet_name
                FROM invoices i
                LEFT JOIN customers c ON c.id = i.customer_id
                LEFT JOIN outlets o ON o.id = i.outlet_id
                WHERE i.id = ?
            `, [id]);
            if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

            const items = await db.all(`
                SELECT ii.id, ii.product_id, p.name as product_name, ii.quantity, ii.price, p.stock as product_stock, p.image as product_image
                FROM invoice_items ii
                LEFT JOIN products p ON p.id = ii.product_id
                WHERE ii.invoice_id = ?
            `, [id]);

            res.json({ ...invoice, items });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

// Admin: edit invoice/quote and its line items (replace items atomically and recompute totals)
app.put('/api/invoices/:id', authMiddleware, requireRole(['accounts','admin']), async (req, res) => {
    const { id } = req.params;
    const { items, status, type } = req.body;
    try {
        const invoice = await db.get('SELECT * FROM invoices WHERE id = ?', [id]);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        // Begin transaction
        await db.run('BEGIN TRANSACTION');

        // If items provided, replace them
        if (Array.isArray(items)) {
            // Get existing items to compute stock deltas if invoice already issued
            const existing = await db.all('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?', [id]);
            const existingMap = new Map(existing.map(e => [e.product_id, e.quantity]));

            // compute new subtotal
            let newSubtotal = 0;
            // delete existing items
            await db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
            const stmt = await db.prepare('INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
            for (const it of items) {
                const pid = it.product_id || it.id || null;
                const qty = parseInt(it.quantity || 0, 10) || 0;
                const price = parseFloat(it.price || it.unit_price || 0) || 0;
                if (qty <= 0) continue;
                await stmt.run(id, pid, qty, price);
                newSubtotal += price * qty;

                // If invoice was already issued (type === 'invoice'), adjust stock by delta
                if (invoice.type === 'invoice' && pid) {
                    const oldQty = existingMap.get(pid) || 0;
                    const delta = qty - oldQty; // positive => reduce stock more
                    if (delta > 0) {
                        // ensure enough stock
                        const prod = await db.get('SELECT stock FROM products WHERE id = ?', [pid]);
                        if (!prod || prod.stock < delta) {
                            throw new Error(`Insufficient stock for product ${pid}`);
                        }
                        await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [delta, pid]);
                    } else if (delta < 0) {
                        // return stock
                        await db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [-delta, pid]);
                    }
                }
            }
            await stmt.finalize();

            const settingsRow = await db.get('SELECT gst_rate FROM settings WHERE id = 1');
            const gstRate = parseFloat(settingsRow?.gst_rate || 0);
            const newTax = +(newSubtotal * (gstRate / 100));
            const newTotal = +(newSubtotal + newTax);

            await db.run('UPDATE invoices SET subtotal = ?, tax_amount = ?, total = ? WHERE id = ?', [newSubtotal, newTax, newTotal, id]);
        }

        // allow status/type updates
        if (status) {
            await db.run('UPDATE invoices SET status = ? WHERE id = ?', [status, id]);
        }
        if (type) {
            await db.run('UPDATE invoices SET type = ? WHERE id = ?', [type, id]);
        }

        await db.run('COMMIT');
        const updated = await db.get('SELECT * FROM invoices WHERE id = ?', [id]);
        const itemsList = await db.all(
            `SELECT ii.id, ii.product_id, ii.quantity, ii.price, p.name as product_name, p.image as product_image
             FROM invoice_items ii
             LEFT JOIN products p ON p.id = ii.product_id
             WHERE ii.invoice_id = ?`,
            [id]
        );
        await logActivity('invoice', id, 'update', req.user?.username, JSON.stringify({ status, type, items: itemsList.length }));
        await queueNotification({
            staffId: req.user?.staffId || null,
            username: req.user?.username || null,
            title: 'Invoice updated',
            message: `Invoice #${id} has been updated`,
            type: 'info',
            metadata: { invoiceId: Number(id), status: status || invoice.status, type: type || invoice.type }
        });
        res.json({ ...updated, items: itemsList });
    } catch (err) {
        try { await db.run('ROLLBACK'); } catch (e) {}
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/invoices/:id/status', authMiddleware, requireRole(['accounts','admin']), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
        return res.status(400).json({ error: 'Status is required' });
    }

    try {
        const invoice = await db.get('SELECT * FROM invoices WHERE id = ?', [id]);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const allowedStatuses = invoice.type === 'quote'
            ? ['draft', 'sent', 'accepted', 'cancelled']
            : ['issued', 'paid', 'cancelled'];

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status for this document type' });
        }

        await db.run('UPDATE invoices SET status = ? WHERE id = ?', [status, id]);
        await logActivity('invoice', id, 'status_update', req.user?.username, JSON.stringify({ from: invoice.status, to: status }));
        await queueNotification({
            staffId: req.user?.staffId || null,
            username: req.user?.username || null,
            title: 'Invoice status updated',
            message: `Invoice #${id} moved to ${status.toUpperCase()}`,
            type: status === 'paid' ? 'success' : 'info',
            metadata: { invoiceId: Number(id), status }
        });
        res.json({ ...invoice, status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/invoices/:id/convert', authMiddleware, requireRole('manager'), async (req, res) => {
    const { id } = req.params;
    try {
        const invoice = await db.get('SELECT * FROM invoices WHERE id = ?', [id]);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        if (invoice.type !== 'quote') {
            return res.status(400).json({ error: 'Only quotes can be converted to invoices' });
        }

        const items = await db.all('SELECT product_id, quantity FROM invoice_items WHERE invoice_id = ?', [id]);

        for (const item of items) {
            if (!item.product_id) continue;
            const product = await db.get('SELECT stock, track_inventory, name FROM products WHERE id = ?', [item.product_id]);
            if (!product) {
                return res.status(400).json({ error: `Product ${item.product_id} no longer exists` });
            }
            if (product.track_inventory === 0) continue;
            if ((product.stock ?? 0) < item.quantity) {
                return res.status(400).json({ error: `Insufficient stock for product ${product.name || item.product_id}` });
            }
        }

        for (const item of items) {
            if (!item.product_id) continue;
            const product = await db.get('SELECT stock, track_inventory, name FROM products WHERE id = ?', [item.product_id]);
            if (!product || product.track_inventory === 0) continue;
            const nextStock = (product.stock ?? 0) - item.quantity;
            await db.run('UPDATE products SET stock = ? WHERE id = ?', [nextStock, item.product_id]);
            if (nextStock <= 5) {
                await queueNotification({
                    staffId: null,
                    username: null,
                    title: 'Low stock warning',
                    message: `${product.name || 'A product'} fell to ${nextStock} units after converting quote #${id}`,
                    type: 'warning',
                    metadata: { productId: item.product_id, invoiceId: Number(id), stock: nextStock }
                });
            }
        }

        await db.run(
            'UPDATE invoices SET type = ?, status = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['invoice', 'issued', id]
        );

        const updated = await db.get('SELECT * FROM invoices WHERE id = ?', [id]);
        await logActivity('invoice', id, 'convert', req.user?.username, JSON.stringify({ from: 'quote', to: 'invoice' }));
        await queueNotification({
            staffId: req.user?.staffId || null,
            username: req.user?.username || null,
            title: 'Quote converted',
            message: `Quote #${id} converted to invoice`,
            type: 'success',
            metadata: { invoiceId: Number(id) }
        });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/invoices/:id', authMiddleware, requireRole(['admin','accounts']), async (req, res) => {
    const { id } = req.params;
    try {
        const invoice = await db.get('SELECT * FROM invoices WHERE id = ?', [id]);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const items = await db.all('SELECT * FROM invoice_items WHERE invoice_id = ?', [id]);
        if (invoice.type === 'invoice') {
            for (const item of items) {
                if (!item.product_id) continue;
                await db.run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
            }
        }

        await db.run('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
        await db.run('DELETE FROM invoices WHERE id = ?', [id]);

        res.status(204).end();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/invoices/:id/pdf', async (req, res) => {
    try {
        // Allow access either via a short-lived signed pdf_token or via Authorization Bearer token
        const pdfToken = req.query.pdf_token;
        let authorized = false;
        if (pdfToken) {
            try {
                const payload = jwt.verify(pdfToken, JWT_SECRET);
                if (String(payload.invoiceId) === String(req.params.id)) authorized = true;
            } catch (err) {
                // invalid pdf token
            }
        }
        if (!authorized) {
            // fallback to Authorization header (regular JWT access)
            const auth = req.headers.authorization;
            if (auth && auth.startsWith('Bearer ')) {
                try {
                    const token = auth.replace('Bearer ', '');
                    const payload = jwt.verify(token, JWT_SECRET);
                    // basic validation: allow if token verifies
                    authorized = true;
                } catch (err) {
                    // invalid bearer
                }
            }
        }
        if (!authorized) {
            return res.status(401).send('Unauthorized: missing valid pdf token or Authorization header');
        }

        const invoice = await db.get('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
        if (!invoice) {
            return res.status(404).send('Invoice not found');
        }
        const customer = await db.get('SELECT * FROM customers WHERE id = ?', [invoice.customer_id]);
        const items = await db.all(`
            SELECT p.name, ii.quantity, ii.price 
            FROM invoice_items ii 
            JOIN products p ON p.id = ii.product_id 
            WHERE ii.invoice_id = ?
        `, [req.params.id]);
        // determine outlet (prefer invoice.outlet_id)
        let outlet = null;
        if (invoice.outlet_id) {
            outlet = await db.get('SELECT * FROM outlets WHERE id = ?', [invoice.outlet_id]);
        }
        if (!outlet) {
            outlet = await db.get('SELECT * FROM outlets WHERE id = (SELECT current_outlet_id FROM settings WHERE id = 1)');
        }
        if (!outlet) {
            const settingsRow = await db.get('SELECT * FROM settings WHERE id = 1');
            outlet = {
                name: settingsRow?.outlet_name || 'My Outlet',
                currency: settingsRow?.currency || 'MVR',
                gst_rate: settingsRow?.gst_rate || 0,
                store_address: settingsRow?.store_address || null,
                invoice_template: settingsRow?.invoice_template || null,
            };
        }

        const stream = res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment;filename=invoice-${invoice.id}.pdf`,
        });

        generateInvoicePdf(
            { ...invoice, customer, items, outlet },
            (chunk) => stream.write(chunk),
            () => stream.end()
        );

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a short-lived signed link for viewing/downloading invoice PDFs in a new tab
app.post('/api/invoices/:id/pdf-link', authMiddleware, async (req, res) => {
    try {
        const id = req.params.id;
        // issue a short-lived token (5 minutes)
        const pdfToken = jwt.sign({ invoiceId: id }, JWT_SECRET, { expiresIn: '5m' });
        const url = `${req.protocol}://${req.get('host')}/api/invoices/${id}/pdf?pdf_token=${encodeURIComponent(pdfToken)}`;
        res.json({ url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Order processing for guests
app.post('/api/orders', async (req, res) => {
    const { customer, cart, payment, source, isPreorder: explicitPreorder } = req.body || {};
    const sanitizedCart = Array.isArray(cart)
        ? cart.filter((item) => item && Number(item.quantity) > 0 && item.id != null)
        : [];
    if (!customer || !customer.name || !customer.email || sanitizedCart.length === 0) {
        console.warn('Order rejected due to missing data', {
            hasCustomer: !!customer,
            name: customer?.name,
            email: customer?.email,
            cartLength: Array.isArray(cart) ? cart.length : 'n/a',
        });
        return res.status(400).json({ error: 'Missing customer data or cart is empty' });
    }

    const normalizedSource = typeof source === 'string' && source.trim() ? source.trim().toLowerCase() : 'pos';
    const providedStorefrontKey = req.headers['x-storefront-key'] || req.body?.storefrontKey || req.query?.key;
    const requiresStorefrontKey = STOREFRONT_API_KEY && normalizedSource !== 'pos';
    if (requiresStorefrontKey && providedStorefrontKey !== STOREFRONT_API_KEY) {
        return res.status(403).json({ error: 'Invalid storefront key' });
    }

    const paymentMethodRaw = payment?.method || 'cod';
    const paymentMethod = String(paymentMethodRaw).toLowerCase();
    const isTransferMethod = ['transfer', 'bank_transfer'].includes(paymentMethod);
    const paymentReference = payment?.reference || null;
    let paymentSlipPath = null;

    if (payment?.slipPath) {
        const normalized = normalizeUploadPath(payment.slipPath);
        if (normalized) {
            paymentSlipPath = `/uploads/${normalized}`;
        }
    }

    if (!paymentSlipPath && isTransferMethod && payment?.slip) {
        try {
            let base64 = payment.slip;
            let ext = 'png';
            const match = String(base64).match(/^data:(.+);base64,(.+)$/);
            if (match) {
                const mime = match[1];
                base64 = match[2];
                const parts = mime.split('/');
                ext = parts[1] ? parts[1].split('+')[0] : ext;
            }
            const now = new Date();
            const slipCategory = ['payment_slips', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0')];
            const { dir } = ensureUploadDir(slipCategory, 'payment_slips');
            const fileName = `slip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext || 'png'}`;
            const filePath = path.join(dir, fileName);
            fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
            const rel = path.relative(imagesDir, filePath).replace(/\\/g, '/');
            paymentSlipPath = `/uploads/${rel}`;
        } catch (err) {
            console.warn('Failed to persist payment slip', err?.message || err);
        }
    }

    try {
        const itemsWithDetails = [];
        let hasPreorderItems = explicitPreorder === true || explicitPreorder === 1;

        for (const item of sanitizedCart) {
            let productRow = null;
            try {
                productRow = await db.get('SELECT preorder_enabled, track_inventory FROM products WHERE id = ?', [item.id]);
            } catch (err) {
                console.warn('Failed to inspect product for preorder status', err?.message || err);
            }
            const quantity = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            const itemPreorder = item.preorder === true || item.preorder === 1 || (productRow && productRow.preorder_enabled === 1);
            if (itemPreorder) hasPreorderItems = true;
            itemsWithDetails.push({
                id: item.id,
                quantity,
                price,
                isPreorder: itemPreorder,
                trackInventory: productRow ? productRow.track_inventory : 1,
            });
        }

        const total = itemsWithDetails.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const orderStatus = hasPreorderItems ? 'preorder' : (isTransferMethod ? 'awaiting_verification' : 'pending');

        const orderResult = await db.run(
            'INSERT INTO orders (customer_name, customer_email, customer_phone, customer_company, total, status, payment_method, payment_reference, payment_slip, source, is_preorder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                customer.name,
                customer.email,
                customer.phone || null,
                customer.company || null,
                total,
                orderStatus,
                paymentMethod,
                paymentReference || null,
                paymentSlipPath,
                normalizedSource,
                hasPreorderItems ? 1 : 0
            ]
        );
        const orderId = orderResult.lastID;

        const stmt = await db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price, is_preorder) VALUES (?, ?, ?, ?, ?)');
        for (const item of itemsWithDetails) {
            await stmt.run(orderId, item.id, item.quantity, item.price, item.isPreorder ? 1 : 0);
            // Only decrement stock for non-preorder items where inventory is tracked
            if (!item.isPreorder && item.trackInventory !== 0) {
                await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
            }
        }
        await stmt.finalize();
        if (hasPreorderItems) {
            await queueNotification({
                staffId: null,
                username: null,
                title: 'New preorder received',
                message: `Order #${orderId} from ${customer.name} includes preorder items`,
                type: 'info',
                metadata: { orderId, source: normalizedSource }
            });
        }
        // ensure customer is persisted
        try {
            const existing = await db.get('SELECT * FROM customers WHERE email = ?', [customer.email]);
            if (existing) {
                await db.run('UPDATE customers SET name = ?, phone = COALESCE(?, phone) WHERE id = ?', [customer.name, customer.phone || existing.phone || null, existing.id]);
            } else {
                await db.run('INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)', [customer.name, customer.email, customer.phone || null]);
            }
        } catch (err) {
            console.warn('Failed to persist customer for order', err?.message || err);
        }

        // Create an invoice for this order and create journal entries so sales appear in accounting
        try {
            // compute subtotal/tax using current settings/outlet
            const settingsRow = await db.get('SELECT gst_rate, current_outlet_id FROM settings WHERE id = 1');
            const gstRate = parseFloat(settingsRow?.gst_rate || 0);
            const outletId = settingsRow?.current_outlet_id || null;

            const invoiceStatus = hasPreorderItems ? 'preorder' : 'issued';
            const invResult = await db.run('INSERT INTO invoices (customer_id, subtotal, tax_amount, total, outlet_id, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [null, 0, 0, 0, outletId, 'invoice', invoiceStatus]);
            const invoiceId = invResult.lastID;

            // persist invoice_items and compute subtotal
            let invSubtotal = 0;
            const invStmt = await db.prepare('INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
            for (const item of itemsWithDetails) {
                await invStmt.run(invoiceId, item.id, item.quantity, item.price);
                invSubtotal += item.price * item.quantity;
            }
            await invStmt.finalize();

            const invTax = +(invSubtotal * (gstRate / 100));
            const invTotal = +(invSubtotal + invTax);
            await db.run('UPDATE invoices SET customer_id = (SELECT id FROM customers WHERE email = ? LIMIT 1), subtotal = ?, tax_amount = ?, total = ? WHERE id = ?', [customer.email, invSubtotal, invTax, invTotal, invoiceId]);

            // Create accounting journal entries (debit AR, credit sales, credit taxes)
            const accountsReceivable = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['1200']);
            const salesRevenue = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['4000']);
            const taxesPayable = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['2200']);

            if (accountsReceivable && salesRevenue) {
                const jr = await db.run('INSERT INTO journal_entries (entry_date, description, reference, total_debit, total_credit, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [new Date().toISOString().split('T')[0], `Order #${orderId}`, `ORDER-${orderId}`, invTotal, invTotal, 'posted', new Date().toISOString()]);
                const journalId = jr.lastID;

                await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)', [journalId, accountsReceivable.id, `Order #${orderId}`, invTotal, 0]);
                await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)', [journalId, salesRevenue.id, `Sales from order #${orderId}`, 0, invSubtotal]);
                if (invTax > 0 && taxesPayable) {
                    await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)', [journalId, taxesPayable.id, `Tax for order #${orderId}`, 0, invTax]);
                }
            }

            // ensure customer is persisted
            try {
                const existing = await db.get('SELECT * FROM customers WHERE email = ?', [customer.email]);
                if (existing) {
                    await db.run('UPDATE customers SET name = ? WHERE id = ?', [customer.name, existing.id]);
                } else {
                    await db.run('INSERT INTO customers (name, email) VALUES (?, ?)', [customer.name, customer.email]);
                }
            } catch (err) {
                console.warn('Failed to persist customer for order', err?.message || err);
            }

            // send admin notification about new order and create in-app notification
            try {
                const subject = `New order placed by ${customer.name}`;
                const itemsHtml = sanitizedCart.map(it => `<li>${it.name} x ${it.quantity} - ${it.price}</li>`).join('');
                const bodyHtml = `<p>A new order was placed:</p><ul><li><strong>Name:</strong> ${customer.name}</li><li><strong>Email:</strong> ${customer.email}</li><li><strong>Total:</strong> ${invTotal}</li></ul><p>Items:</p><ul>${itemsHtml}</ul><p>Order ID: ${orderId}</p><p>Invoice ID: ${invoiceId}</p>`;
                await sendNotificationEmail(subject, bodyHtml);
            } catch (err) {
                console.warn('Failed to send order notification', err?.message || err);
            }

            await queueNotification({
                staffId: null,
                username: null,
                title: 'New online order',
                message: `Order ${orderId} placed and converted to invoice #${invoiceId}`,
                type: 'info',
                link: `/invoices/${invoiceId}`,
                metadata: { orderId, invoiceId, total: invTotal }
            });
            res.status(201).json({ message: 'Order created successfully', orderId, invoiceId });

            // WebSocket broadcast for real-time updates
            try {
                const wsService = getWebSocketService();
                const orderData = {
                    orderId,
                    invoiceId,
                    customer: {
                        name: customer.name,
                        email: customer.email,
                        phone: customer.phone
                    },
                    total: invTotal,
                    items: sanitizedCart,
                    paymentMethod,
                    status: isTransferMethod ? 'awaiting_verification' : 'pending',
                    timestamp: new Date()
                };
                wsService.notifyNewOrder(orderData);
                wsService.notifyInvoiceCreated({
                    id: invoiceId,
                    customer: customer.name,
                    total: invTotal,
                    type: 'invoice',
                    status: 'issued',
                    timestamp: new Date()
                });
            } catch (wsErr) {
                console.warn('WebSocket broadcast failed:', wsErr.message);
            }
        } catch (err) {
            console.error('Order creation failed (invoice/journal step):', err);
            return res.status(500).json({ error: 'Order created but failed to create invoice/journal' });
        }
    } catch (err) {
        console.error('Order creation failed:', err);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Roles endpoints
app.get('/api/roles', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const roles = await db.all('SELECT * FROM roles ORDER BY id');
        res.json(roles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/roles', authMiddleware, requireRole('admin'), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing role name' });
    try {
        const result = await db.run('INSERT INTO roles (name) VALUES (?)', [name]);
        res.status(201).json({ id: result.lastID, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/roles/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing role name' });
    try {
        await db.run('UPDATE roles SET name = ? WHERE id = ?', [name, id]);
        const role = await db.get('SELECT * FROM roles WHERE id = ?', [id]);
        res.json(role);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/roles/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const assigned = await db.get('SELECT COUNT(*) as c FROM staff_roles WHERE role_id = ?', [id]);
        if (assigned && assigned.c > 0) return res.status(400).json({ error: 'Role is assigned to staff and cannot be deleted' });
        await db.run('DELETE FROM roles WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Staff endpoints
app.get('/api/staff', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const staff = await db.all('SELECT id, username, display_name, email, phone, created_at FROM staff ORDER BY id');
        for (const s of staff) {
            const roles = await db.all('SELECT r.id, r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [s.id]);
            s.roles = roles;
        }
        res.json(staff);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/staff', authMiddleware, requireRole('admin'), async (req, res) => {
    const { username, display_name, email, phone, password, roles } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
    try {
        const exists = await db.get('SELECT id FROM staff WHERE username = ?', [username]);
        if (exists) return res.status(409).json({ error: 'Username already exists' });
        const hash = await bcrypt.hash(password, 10);
        const r = await db.run('INSERT INTO staff (username, display_name, email, phone, password) VALUES (?, ?, ?, ?, ?)', [username, display_name || null, email || null, phone || null, hash]);
        const staffId = r.lastID;
        if (Array.isArray(roles)) {
            for (const rid of roles) {
                try { await db.run('INSERT INTO staff_roles (staff_id, role_id) VALUES (?, ?)', [staffId, rid]); } catch (e) { }
            }
        }
        const staff = await db.get('SELECT id, username, display_name, email, phone, created_at FROM staff WHERE id = ?', [staffId]);
        const assigned = await db.all('SELECT r.id, r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [staffId]);
        staff.roles = assigned;
        await logActivity('staff', staffId, 'created', req.user?.username, `created staff ${username}`);
        res.status(201).json(staff);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/staff/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const s = await db.get('SELECT id, username, display_name, email, phone, created_at FROM staff WHERE id = ?', [req.params.id]);
        if (!s) return res.status(404).json({ error: 'Staff not found' });
        const roles = await db.all('SELECT r.id, r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [s.id]);
        s.roles = roles;
        res.json(s);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/staff/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { display_name, email, phone, password, roles } = req.body;
    try {
        const existing = await db.get('SELECT * FROM staff WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ error: 'Staff not found' });
        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await db.run('UPDATE staff SET display_name = ?, email = ?, phone = ?, password = ? WHERE id = ?', [display_name || existing.display_name, email || existing.email, phone || existing.phone, hash, id]);
        } else {
            await db.run('UPDATE staff SET display_name = ?, email = ?, phone = ? WHERE id = ?', [display_name || existing.display_name, email || existing.email, phone || existing.phone, id]);
        }
        if (Array.isArray(roles)) {
            await db.run('DELETE FROM staff_roles WHERE staff_id = ?', [id]);
            for (const rid of roles) {
                try { await db.run('INSERT INTO staff_roles (staff_id, role_id) VALUES (?, ?)', [id, rid]); } catch (e) { }
            }
        }
        const s = await db.get('SELECT id, username, display_name, email, phone, created_at FROM staff WHERE id = ?', [id]);
        const assigned = await db.all('SELECT r.id, r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [id]);
        s.roles = assigned;
        await logActivity('staff', id, 'updated', req.user?.username, 'staff updated');
        res.json(s);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/staff/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const s = await db.get('SELECT * FROM staff WHERE id = ?', [id]);
        if (!s) return res.status(404).json({ error: 'Staff not found' });
        await db.run('DELETE FROM staff_roles WHERE staff_id = ?', [id]);
        await db.run('DELETE FROM staff WHERE id = ?', [id]);
        await logActivity('staff', id, 'deleted', req.user?.username, `deleted staff ${s.username}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/staff/:id/roles', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { roles } = req.body;
    try {
        const existing = await db.get('SELECT id FROM staff WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ error: 'Staff not found' });
        await db.run('DELETE FROM staff_roles WHERE staff_id = ?', [id]);
        if (Array.isArray(roles)) {
            for (const rid of roles) {
                try { await db.run('INSERT INTO staff_roles (staff_id, role_id) VALUES (?, ?)', [id, rid]); } catch (e) { }
            }
        }
        const assigned = await db.all('SELECT r.id, r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [id]);
        await logActivity('staff', id, 'roles_updated', req.user?.username, JSON.stringify(assigned));
        res.json({ success: true, roles: assigned });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Refresh token exchange - rotate refresh token for a new JWT
app.post('/api/token/refresh', async (req, res) => {
    try {
        // read refresh token from HttpOnly cookie OR accept a fallback refresh token in request body (useful for dev)
        const cookieHeader = req.headers.cookie || '';
        const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('ITnvend_refresh=') || c.startsWith('irnvend_refresh='));
        let refreshToken = null;
        if (match) {
            refreshToken = decodeURIComponent(match.split('=')[1] || '');
        }
        // fallback: allow refresh token in request body (note: less secure; intended for local/dev compatibility)
        if (!refreshToken && req.body && req.body.refreshToken) {
            refreshToken = req.body.refreshToken;
            console.warn('Using refresh token provided in request body for refresh (fallback)');
        }
        if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token (cookie or request body)' });
        const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const row = await db.get('SELECT * FROM refresh_tokens WHERE token_hash = ?', [hash]);
        if (!row) return res.status(401).json({ error: 'Invalid refresh token' });
        if (new Date(row.expires_at) < new Date()) {
            // expired - remove
            try { await db.run('DELETE FROM refresh_tokens WHERE id = ?', [row.id]); } catch (e) { }
            // clear cookie (helper clears both names)
            clearRefreshCookie(res);
            return res.status(401).json({ error: 'Refresh token expired' });
        }
        const staff = await db.get('SELECT * FROM staff WHERE id = ?', [row.staff_id]);
        if (!staff) return res.status(401).json({ error: 'Staff not found' });
        // determine staff role
        const roles = await db.all('SELECT r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [staff.id]);
        const roleName = (roles && roles[0] && roles[0].name) ? roles[0].name : 'staff';
        // issue new JWT
        const token = jwt.sign({ username: staff.username, role: roleName, staffId: staff.id }, JWT_SECRET, { expiresIn: '30d' });
        // rotate refresh token
        const newRefresh = crypto.randomBytes(32).toString('hex');
        const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days
        await db.run('UPDATE refresh_tokens SET token_hash = ?, expires_at = ? WHERE id = ?', [newHash, expiresAt, row.id]);
        // update session map for compatibility
        sessions.set(token, { username: staff.username, role: roleName, staffId: staff.id });
        // set rotated refresh token cookie
    // set rotated refresh token cookie (helper sets both names with appropriate options)
    setRefreshCookie(res, newRefresh);
        res.json({ token, role: roleName });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Logout: clear refresh tokens for current authenticated staff and clear cookie
app.post('/api/token/logout', authMiddleware, async (req, res) => {
    try {
        const staffId = req.user?.staffId;
        if (staffId) {
            try { await db.run('DELETE FROM refresh_tokens WHERE staff_id = ?', [staffId]); } catch (e) { }
        }
        // clear cookie
    // clear both cookie names for safety
    clearRefreshCookie(res);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: switch/impersonate staff - returns a token for the specified staff
app.post('/api/staff/:id/switch', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const staff = await db.get('SELECT * FROM staff WHERE id = ?', [id]);
        if (!staff) return res.status(404).json({ error: 'Staff not found' });
        const roles = await db.all('SELECT r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [id]);
    const roleName = (roles && roles[0] && roles[0].name) ? roles[0].name : 'staff';
    const token = jwt.sign({ username: staff.username, role: roleName, staffId: staff.id }, JWT_SECRET, { expiresIn: '30d' });
    // also create a refresh token for the impersonated session and set cookie
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const rhash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days
    try { await db.run('INSERT INTO refresh_tokens (staff_id, token_hash, expires_at) VALUES (?, ?, ?)', [staff.id, rhash, expiresAt]); } catch (e) { /* ignore */ }
    sessions.set(token, { username: staff.username, role: roleName, staffId: staff.id });
        await logActivity('staff', id, 'impersonated', req.user?.username, `impersonated ${staff.username}`);
    // set refresh cookie(s) using helper
    setRefreshCookie(res, refreshToken);
        res.json({ token, role: roleName });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get activity logs for a staff member
app.get('/api/staff/:id/activity', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const logs = await db.all('SELECT id, entity_type, entity_id, action, user, details, created_at FROM activity_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 200', ['staff', id]);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== ACCOUNTING ENDPOINTS ====================

// Chart of Accounts endpoints
app.get('/api/accounts/chart', authMiddleware, requireRole('accounts'), async (req, res) => {
    try {
        // return canonical fields (account_number, name, type) while DB may use account_code/account_name/account_type
        const accounts = await db.all(`
            SELECT id,
                   COALESCE(account_code, account_number) as account_number,
                   COALESCE(account_name, name) as name,
                   COALESCE(account_type, type) as type,
                   category,
                   description,
                   is_active,
                   parent_account_id,
                   (SELECT COALESCE(account_name, name) FROM chart_of_accounts WHERE id = parent_account_id) as parent_name
            FROM chart_of_accounts
            ORDER BY COALESCE(account_code, account_number)
        `);
        res.json(accounts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/accounts/chart', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { account_number, name, type, category, description, parent_account_id } = req.body;
    try {
        // Insert using canonical DB column names (account_code/account_name/account_type)
        const result = await db.run(`
            INSERT INTO chart_of_accounts (account_code, account_name, account_type, category, description, parent_account_id, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `, [account_number, name, type, category, description, parent_account_id]);
        
        await logActivity('chart_of_accounts', result.lastID, 'created', req.user?.username, `Created account: ${name}`);
        res.json({ id: result.lastID, message: 'Account created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/accounts/chart/:id', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { id } = req.params;
    const { account_number, name, type, category, description, parent_account_id, is_active } = req.body;
    try {
        await db.run(`
            UPDATE chart_of_accounts 
            SET account_code = ?, account_name = ?, account_type = ?, category = ?, description = ?, parent_account_id = ?, is_active = ?
            WHERE id = ?
        `, [account_number, name, type, category, description, parent_account_id, is_active, id]);
        
        await logActivity('chart_of_accounts', id, 'updated', req.user?.username, `Updated account: ${name}`);
        res.json({ message: 'Account updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/accounts/chart/:id', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { id } = req.params;
    try {
        // Check if account has transactions
        const hasTransactions = await db.get('SELECT COUNT(*) as c FROM general_ledger WHERE account_id = ?', [id]);
        if (hasTransactions.c > 0) {
            return res.status(400).json({ error: 'Cannot delete account with existing transactions' });
        }
        
        await db.run('DELETE FROM chart_of_accounts WHERE id = ?', [id]);
        await logActivity('chart_of_accounts', id, 'deleted', req.user?.username, 'Deleted account');
        res.json({ message: 'Account deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Journal Entries endpoints
app.get('/api/accounts/journal-entries', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { page = 1, limit = 50, start_date, end_date } = req.query;
    const offset = (page - 1) * limit;
    
    try {
        let query = `
            SELECT je.id, je.entry_date, je.description, je.reference, je.created_by, je.created_at,
                   s.username as created_by_name,
                   SUM(CASE WHEN jel.debit > 0 THEN jel.debit ELSE 0 END) as total_debit,
                   SUM(CASE WHEN jel.credit > 0 THEN jel.credit ELSE 0 END) as total_credit
            FROM journal_entries je
            LEFT JOIN staff s ON je.created_by = s.id
            LEFT JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
        `;
        let params = [];
        
        if (start_date && end_date) {
            query += ' WHERE je.entry_date BETWEEN ? AND ?';
            params.push(start_date, end_date);
        }
        
        query += ' GROUP BY je.id ORDER BY je.entry_date DESC, je.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const entries = await db.all(query, params);
        
        // Get line items for each entry
        for (const entry of entries) {
            entry.lines = await db.all(`
                SELECT jel.*, coa.account_number, coa.name as account_name
                FROM journal_entry_lines jel
                JOIN chart_of_accounts coa ON jel.account_id = coa.id
                WHERE jel.journal_entry_id = ?
                ORDER BY jel.id
            `, [entry.id]);
        }
        
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/accounts/journal-entries', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { entry_date, description, reference, lines } = req.body;
    
    try {
        // Validate that debits equal credits
        const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
        const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
        
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            return res.status(400).json({ error: 'Debits must equal credits' });
        }
        
        // Start transaction
        await db.run('BEGIN TRANSACTION');
        
        // Insert journal entry
        const entryResult = await db.run(`
            INSERT INTO journal_entries (entry_date, description, reference, created_by)
            VALUES (?, ?, ?, ?)
        `, [entry_date, description, reference, req.user?.staffId]);
        
        const entryId = entryResult.lastID;
        
        // Insert line items and general ledger entries
        for (const line of lines) {
            // Insert journal entry line
            const lineResult = await db.run(`
                INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, ?, ?)
            `, [entryId, line.account_id, line.debit || 0, line.credit || 0, line.description]);
            
            // Insert general ledger entry
            await db.run(`
                INSERT INTO general_ledger (account_id, transaction_date, transaction_type, reference, 
                                          debit, credit, description, journal_entry_id)
                VALUES (?, ?, 'journal', ?, ?, ?, ?, ?)
            `, [line.account_id, entry_date, reference, line.debit || 0, line.credit || 0, 
                line.description || description, entryId]);
        }
        
        await db.run('COMMIT');
        await logActivity('journal_entries', entryId, 'created', req.user?.username, `Created journal entry: ${description}`);
        res.json({ id: entryId, message: 'Journal entry created successfully' });
    } catch (err) {
        await db.run('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/accounts/journal-entries/:id', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { id } = req.params;
    const { entry_date, description, reference, lines } = req.body;
    
    try {
        // Validate that debits equal credits
        const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
        const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
        
        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            return res.status(400).json({ error: 'Debits must equal credits' });
        }
        
        // Start transaction
        await db.run('BEGIN TRANSACTION');
        
        // Update journal entry
        await db.run(`
            UPDATE journal_entries 
            SET entry_date = ?, description = ?, reference = ?
            WHERE id = ?
        `, [entry_date, description, reference, id]);
        
        // Delete existing lines and ledger entries
        await db.run('DELETE FROM journal_entry_lines WHERE journal_entry_id = ?', [id]);
        await db.run('DELETE FROM general_ledger WHERE journal_entry_id = ?', [id]);
        
        // Insert new line items and general ledger entries
        for (const line of lines) {
            // Insert journal entry line
            await db.run(`
                INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
                VALUES (?, ?, ?, ?, ?)
            `, [id, line.account_id, line.debit || 0, line.credit || 0, line.description]);
            
            // Insert general ledger entry
            await db.run(`
                INSERT INTO general_ledger (account_id, transaction_date, transaction_type, reference, 
                                          debit, credit, description, journal_entry_id)
                VALUES (?, ?, 'journal', ?, ?, ?, ?, ?)
            `, [line.account_id, entry_date, reference, line.debit || 0, line.credit || 0, 
                line.description || description, id]);
        }
        
        await db.run('COMMIT');
        await logActivity('journal_entries', id, 'updated', req.user?.username, `Updated journal entry: ${description}`);
        res.json({ message: 'Journal entry updated successfully' });
    } catch (err) {
        await db.run('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/accounts/journal-entries/:id', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { id } = req.params;
    try {
        await db.run('BEGIN TRANSACTION');
        
        // Delete journal entry lines and ledger entries
        await db.run('DELETE FROM journal_entry_lines WHERE journal_entry_id = ?', [id]);
        await db.run('DELETE FROM general_ledger WHERE journal_entry_id = ?', [id]);
        await db.run('DELETE FROM journal_entries WHERE id = ?', [id]);
        
        await db.run('COMMIT');
        await logActivity('journal_entries', id, 'deleted', req.user?.username, 'Deleted journal entry');
        res.json({ message: 'Journal entry deleted successfully' });
    } catch (err) {
        await db.run('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// General Ledger endpoints
app.get('/api/accounts/general-ledger', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { account_id, start_date, end_date, page = 1, limit = 100 } = req.query;
    const offset = (page - 1) * limit;
    
    try {
        let query = `
            SELECT gl.id, gl.transaction_date, gl.transaction_type, gl.reference, gl.debit, gl.credit, 
                   gl.description, gl.balance, gl.journal_entry_id,
                   coa.account_number, coa.name as account_name
            FROM general_ledger gl
            JOIN chart_of_accounts coa ON gl.account_id = coa.id
            WHERE 1=1
        `;
        let params = [];
        
        if (account_id) {
            query += ' AND gl.account_id = ?';
            params.push(account_id);
        }
        
        if (start_date && end_date) {
            query += ' AND gl.transaction_date BETWEEN ? AND ?';
            params.push(start_date, end_date);
        }
        
        query += ' ORDER BY gl.transaction_date DESC, gl.id DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const entries = await db.all(query, params);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get account balance
app.get('/api/accounts/balance/:account_id', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { account_id } = req.params;
    const { as_of_date } = req.query;
    
    try {
        let query = `
            SELECT 
                SUM(debit) as total_debit,
                SUM(credit) as total_credit,
                (SUM(debit) - SUM(credit)) as balance
            FROM general_ledger 
            WHERE account_id = ?
        `;
        let params = [account_id];
        
        if (as_of_date) {
            query += ' AND transaction_date <= ?';
            params.push(as_of_date);
        }
        
        const result = await db.get(query, params);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Accounts Payable endpoints
app.get('/api/accounts/payable', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { status = 'all', vendor_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    try {
        let query = `
            SELECT ap.id, ap.vendor_id, ap.invoice_number, ap.invoice_date, ap.due_date, ap.amount, 
                   ap.paid_amount, ap.status, ap.description, ap.created_at,
                   v.name as vendor_name, v.email as vendor_email
            FROM accounts_payable ap
            JOIN vendors v ON ap.vendor_id = v.id
            WHERE 1=1
        `;
        let params = [];
        
        if (status !== 'all') {
            query += ' AND ap.status = ?';
            params.push(status);
        }
        
        if (vendor_id) {
            query += ' AND ap.vendor_id = ?';
            params.push(vendor_id);
        }
        
        query += ' ORDER BY ap.due_date ASC, ap.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const invoices = await db.all(query, params);
        res.json(invoices);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/accounts/payable', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { vendor_id, invoice_number, invoice_date, due_date, amount, description } = req.body;
    
    try {
        const result = await db.run(`
            INSERT INTO accounts_payable (vendor_id, invoice_number, invoice_date, due_date, amount, 
                                        paid_amount, status, description)
            VALUES (?, ?, ?, ?, ?, 0, 'unpaid', ?)
        `, [vendor_id, invoice_number, invoice_date, due_date, amount, description]);
        
        await logActivity('accounts_payable', result.lastID, 'created', req.user?.username, `Created payable invoice: ${invoice_number}`);
        res.json({ id: result.lastID, message: 'Payable invoice created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/accounts/payable/:id/payment', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { id } = req.params;
    const { payment_amount, payment_date, payment_method, reference } = req.body;
    
    try {
        await db.run('BEGIN TRANSACTION');
        
        // Update paid amount
        await db.run(`
            UPDATE accounts_payable 
            SET paid_amount = paid_amount + ?, 
                status = CASE WHEN paid_amount + ? >= amount THEN 'paid' ELSE 'partial' END
            WHERE id = ?
        `, [payment_amount, payment_amount, id]);
        
        // Record payment in general ledger (assuming payment from checking account)
        const payable = await db.get('SELECT * FROM accounts_payable WHERE id = ?', [id]);
        
        // Get accounts payable account (2000) and cash/checking account (1001)
        const apAccount = await db.get('SELECT id FROM chart_of_accounts WHERE account_number = 2000');
        const cashAccount = await db.get('SELECT id FROM chart_of_accounts WHERE account_number = 1001');
        
        if (apAccount && cashAccount) {
            // Debit accounts payable, credit cash
            await db.run(`
                INSERT INTO general_ledger (account_id, transaction_date, transaction_type, reference, 
                                          debit, credit, description)
                VALUES (?, ?, 'payment', ?, ?, 0, ?)
            `, [apAccount.id, payment_date, reference, payment_amount, `Payment for invoice ${payable.invoice_number}`]);
            
            await db.run(`
                INSERT INTO general_ledger (account_id, transaction_date, transaction_type, reference, 
                                          debit, credit, description)
                VALUES (?, ?, 'payment', ?, 0, ?, ?)
            `, [cashAccount.id, payment_date, reference, payment_amount, `Payment for invoice ${payable.invoice_number}`]);
        }
        
        await db.run('COMMIT');
        await logActivity('accounts_payable', id, 'payment', req.user?.username, `Recorded payment: ${payment_amount}`);
        res.json({ message: 'Payment recorded successfully' });
    } catch (err) {
        await db.run('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// Accounts Receivable endpoints
app.get('/api/accounts/receivable', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { status = 'all', customer_id, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    try {
        let query = `
            SELECT ar.id, ar.customer_id, ar.invoice_id, ar.amount, ar.paid_amount, ar.status, 
                   ar.due_date, ar.created_at,
                   c.name as customer_name, c.email as customer_email,
                   i.invoice_number, i.total as invoice_total
            FROM accounts_receivable ar
            JOIN customers c ON ar.customer_id = c.id
            LEFT JOIN invoices i ON ar.invoice_id = i.id
            WHERE 1=1
        `;
        let params = [];
        
        if (status !== 'all') {
            query += ' AND ar.status = ?';
            params.push(status);
        }
        
        if (customer_id) {
            query += ' AND ar.customer_id = ?';
            params.push(customer_id);
        }
        
        query += ' ORDER BY ar.due_date ASC, ar.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const receivables = await db.all(query, params);
        res.json(receivables);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/accounts/receivable/:id/payment', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { id } = req.params;
    const { payment_amount, payment_date, payment_method, reference } = req.body;
    
    try {
        await db.run('BEGIN TRANSACTION');
        
        // Update paid amount
        await db.run(`
            UPDATE accounts_receivable 
            SET paid_amount = paid_amount + ?, 
                status = CASE WHEN paid_amount + ? >= amount THEN 'paid' ELSE 'partial' END
            WHERE id = ?
        `, [payment_amount, payment_amount, id]);
        
        // Record payment in general ledger
        const receivable = await db.get('SELECT * FROM accounts_receivable WHERE id = ?', [id]);
        
        // Get accounts receivable account (1100) and cash/checking account (1001)
        const arAccount = await db.get('SELECT id FROM chart_of_accounts WHERE account_number = 1100');
        const cashAccount = await db.get('SELECT id FROM chart_of_accounts WHERE account_number = 1001');
        
        if (arAccount && cashAccount) {
            // Debit cash, credit accounts receivable
            await db.run(`
                INSERT INTO general_ledger (account_id, transaction_date, transaction_type, reference, 
                                          debit, credit, description)
                VALUES (?, ?, 'payment', ?, ?, 0, ?)
            `, [cashAccount.id, payment_date, reference, payment_amount, `Payment received for invoice ${receivable.invoice_id}`]);
            
            await db.run(`
                INSERT INTO general_ledger (account_id, transaction_date, transaction_type, reference, 
                                          debit, credit, description)
                VALUES (?, ?, 'payment', ?, 0, ?, ?)
            `, [arAccount.id, payment_date, reference, payment_amount, `Payment received for invoice ${receivable.invoice_id}`]);
        }
        
        await db.run('COMMIT');
        await logActivity('accounts_receivable', id, 'payment', req.user?.username, `Recorded payment: ${payment_amount}`);
        res.json({ message: 'Payment recorded successfully' });
    } catch (err) {
        await db.run('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// Financial Reports endpoints
app.get('/api/accounts/reports/trial-balance', authMiddleware, requireRole(['accounts', 'manager']), async (req, res) => {
    const { as_of_date } = req.query;
    
    try {
        let dateCondition = '';
        let params = [];
        
        if (as_of_date) {
            dateCondition = ' AND gl.transaction_date <= ?';
            params.push(as_of_date);
        }
        
        const accounts = await db.all(`
            SELECT 
                coa.id, coa.account_code as account_number, coa.account_name as name, coa.account_type as type, coa.category,
                COALESCE(SUM(gl.debit), 0) as debit_total,
                COALESCE(SUM(gl.credit), 0) as credit_total,
                (COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0)) as balance
            FROM chart_of_accounts coa
            LEFT JOIN general_ledger gl ON coa.id = gl.account_id ${dateCondition}
            GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, coa.category
            ORDER BY coa.account_code
        `, params);
        
        res.json(accounts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/accounts/reports/balance-sheet', authMiddleware, requireRole(['accounts', 'manager']), async (req, res) => {
    const { as_of_date } = req.query;
    
    try {
        let dateCondition = '';
        let params = [];
        
        if (as_of_date) {
            dateCondition = ' AND gl.transaction_date <= ?';
            params.push(as_of_date);
        }
        
        // Get asset accounts
        const assets = await db.all(`
            SELECT 
                coa.account_code as account_number, coa.account_name as name, coa.category,
                (COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0)) as balance
            FROM chart_of_accounts coa
            LEFT JOIN general_ledger gl ON coa.id = gl.account_id ${dateCondition}
            WHERE coa.account_type = 'asset'
            GROUP BY coa.id, coa.account_code, coa.account_name, coa.category
            HAVING balance != 0
            ORDER BY coa.account_code
        `, params);
        
        // Get liability accounts
        const liabilities = await db.all(`
            SELECT 
                coa.account_code as account_number, coa.account_name as name, coa.category,
                (COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0)) as balance
            FROM chart_of_accounts coa
            LEFT JOIN general_ledger gl ON coa.id = gl.account_id ${dateCondition}
            WHERE coa.account_type = 'liability'
            GROUP BY coa.id, coa.account_code, coa.account_name, coa.category
            HAVING balance != 0
            ORDER BY coa.account_code
        `, params);
        
        // Get equity accounts
        const equity = await db.all(`
            SELECT 
                coa.account_code as account_number, coa.account_name as name, coa.category,
                (COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0)) as balance
            FROM chart_of_accounts coa
            LEFT JOIN general_ledger gl ON coa.id = gl.account_id ${dateCondition}
            WHERE coa.account_type = 'equity'
            GROUP BY coa.id, coa.account_code, coa.account_name, coa.category
            HAVING balance != 0
            ORDER BY coa.account_code
        `, params);
        
        const totalAssets = assets.reduce((sum, acc) => sum + acc.balance, 0);
        const totalLiabilities = liabilities.reduce((sum, acc) => sum + acc.balance, 0);
        const totalEquity = equity.reduce((sum, acc) => sum + acc.balance, 0);
        
        res.json({
            assets,
            liabilities,
            equity,
            totals: {
                assets: totalAssets,
                liabilities: totalLiabilities,
                equity: totalEquity,
                liabilitiesAndEquity: totalLiabilities + totalEquity
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/accounts/reports/profit-loss', authMiddleware, requireRole(['accounts', 'manager']), async (req, res) => {
    const { start_date, end_date } = req.query;
    
    try {
        let dateCondition = ' AND gl.transaction_date BETWEEN ? AND ?';
        let params = [start_date, end_date];
        
        // Get revenue accounts
        const revenue = await db.all(`
            SELECT 
                coa.account_code as account_number, coa.account_name as name, coa.category,
                COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) as amount
            FROM chart_of_accounts coa
            LEFT JOIN general_ledger gl ON coa.id = gl.account_id ${dateCondition}
            WHERE coa.account_type = 'revenue'
            GROUP BY coa.id, coa.account_code, coa.account_name, coa.category
            HAVING amount != 0
            ORDER BY coa.account_code
        `, params);
        
        // Get expense accounts
        const expenses = await db.all(`
            SELECT 
                coa.account_code as account_number, coa.account_name as name, coa.category,
                COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0) as amount
            FROM chart_of_accounts coa
            LEFT JOIN general_ledger gl ON coa.id = gl.account_id ${dateCondition}
            WHERE coa.account_type = 'expense'
            GROUP BY coa.id, coa.account_code, coa.account_name, coa.category
            HAVING amount != 0
            ORDER BY coa.account_code
        `, params);
        
        const totalRevenue = revenue.reduce((sum, acc) => sum + acc.amount, 0);
        const totalExpenses = expenses.reduce((sum, acc) => sum + acc.amount, 0);
        const netIncome = totalRevenue - totalExpenses;
        
        res.json({
            revenue,
            expenses,
            totals: {
                revenue: totalRevenue,
                expenses: totalExpenses,
                netIncome: netIncome
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tax rates endpoints
app.get('/api/accounts/tax-rates', authMiddleware, requireRole('accounts'), async (req, res) => {
    try {
        const taxRates = await db.all('SELECT * FROM tax_rates ORDER BY name');
        res.json(taxRates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/accounts/tax-rates', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { name, rate, type, is_active } = req.body;
    try {
        const result = await db.run(`
            INSERT INTO tax_rates (name, rate, type, is_active)
            VALUES (?, ?, ?, ?)
        `, [name, rate, type, is_active ? 1 : 0]);
        
        await logActivity('tax_rates', result.lastID, 'created', req.user?.username, `Created tax rate: ${name}`);
        res.json({ id: result.lastID, message: 'Tax rate created successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/accounts/tax-rates/:id', authMiddleware, requireRole('accounts'), async (req, res) => {
    const { id } = req.params;
    const { name, rate, type, is_active } = req.body;
    try {
        await db.run(`
            UPDATE tax_rates 
            SET name = ?, rate = ?, type = ?, is_active = ?
            WHERE id = ?
        `, [name, rate, type, is_active ? 1 : 0, id]);
        
        await logActivity('tax_rates', id, 'updated', req.user?.username, `Updated tax rate: ${name}`);
        res.json({ message: 'Tax rate updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== OPERATIONS ENDPOINTS ====================

// Day End Operations
app.get('/api/operations/day-end', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    try {
        // Get outlet information
        const settingsRow = await db.get('SELECT * FROM settings WHERE id = 1');
        let outlet = null;
        if (settingsRow && settingsRow.current_outlet_id) {
            outlet = await db.get('SELECT * FROM outlets WHERE id = ?', [settingsRow.current_outlet_id]);
        }
        if (!outlet) {
            outlet = {
                id: 0,
                name: settingsRow?.outlet_name || 'My Outlet',
                currency: settingsRow?.currency || 'MVR',
                gst_rate: settingsRow?.gst_rate || 0,
                store_address: settingsRow?.store_address || null,
                invoice_template: settingsRow?.invoice_template || null,
            };
        }

        // Get current user info
        const currentUser = req.user;
        let cashierInfo = null;
        if (currentUser?.staffId) {
            cashierInfo = await db.get('SELECT display_name, username FROM staff WHERE id = ?', [currentUser.staffId]);
        }

        // Get sales summary for today
        const salesSummary = await db.get(`
            SELECT
                COUNT(DISTINCT i.id) as transactionCount,
                COALESCE(SUM(i.total), 0) as totalSales,
                COALESCE(SUM(CASE WHEN p.method = 'cash' THEN i.total ELSE 0 END), 0) as cashSales,
                COALESCE(SUM(CASE WHEN p.method != 'cash' THEN i.total ELSE 0 END), 0) as cardSales
            FROM invoices i
            LEFT JOIN payments p ON p.invoice_id = i.id
            WHERE DATE(i.created_at) = ? AND i.status = 'paid'
        `, [today]);

        // Get cash reconciliation data
        const cashReconciliation = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN p.method = 'cash' THEN i.total ELSE 0 END), 0) as expectedCash,
                COALESCE(SUM(CASE WHEN ct.type = 'cash_in' THEN ct.amount ELSE 0 END), 0) as cashIn,
                COALESCE(SUM(CASE WHEN ct.type = 'cash_out' THEN ct.amount ELSE 0 END), 0) as cashOut
            FROM invoices i
            LEFT JOIN payments p ON p.invoice_id = i.id
            LEFT JOIN cash_transactions ct ON DATE(ct.created_at) = ?
            WHERE DATE(i.created_at) = ? AND i.status = 'paid'
            GROUP BY DATE(i.created_at)
        `, [today, today]);

        const netCash = (cashReconciliation?.expectedCash || 0) + (cashReconciliation?.cashIn || 0) - (cashReconciliation?.cashOut || 0);
        const cashVariance = netCash - (cashReconciliation?.expectedCash || 0);

        // Get inventory movement
        const inventoryMovement = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END), 0) as itemsSold,
                COALESCE(SUM(CASE WHEN type = 'adjustment' AND quantity > 0 THEN quantity ELSE 0 END), 0) as itemsAdded,
                COALESCE(SUM(CASE WHEN type = 'adjustment' AND quantity < 0 THEN ABS(quantity) ELSE 0 END), 0) as itemsRemoved
            FROM inventory_transactions
            WHERE DATE(created_at) = ?
        `, [today]);

        // Get card reconciliation data
        let cardReconciliation = { cardSlipsCount: 0, cardSlipsTotal: 0 };
        try {
            cardReconciliation = await db.get(`
                SELECT
                    COUNT(*) as cardSlipsCount,
                    COALESCE(SUM(amount), 0) as cardSlipsTotal
                FROM card_transactions
                WHERE DATE(created_at) = ? AND status = 'approved'
            `, [today]);
        } catch (err) {
            // Table might not exist yet, use default values
            console.log('Card transactions table not found, using default values');
        }

        // Get system card sales for reconciliation
        const systemCardSales = salesSummary?.cardSales || 0;
        const cardVariance = (cardReconciliation?.cardSlipsTotal || 0) - systemCardSales;

        // Get top products
        let topProducts = [];
        try {
            topProducts = await db.all(`
                SELECT
                    p.name as product_name,
                    SUM(ii.quantity) as quantity,
                    SUM(ii.price * ii.quantity) as revenue
                FROM invoice_items ii
                JOIN products p ON ii.product_id = p.id
                JOIN invoices i ON ii.invoice_id = i.id
                WHERE DATE(i.created_at) = ? AND i.status = 'paid'
                GROUP BY p.id, p.name
                ORDER BY revenue DESC
                LIMIT 10
            `, [today]);
        } catch (err) {
            console.log('Error fetching top products:', err.message);
            topProducts = [];
        }

        // Check if day end was already processed
        const dayEndClose = await db.get(`
            SELECT * FROM day_end_closes
            WHERE close_date = ?
        `, [today]);

        res.json({
            date: today,
            outlet: {
                name: outlet.name,
                currency: outlet.currency,
                address: outlet.store_address,
                logo: settingsRow?.logo || null // Assuming logo field exists in settings
            },
            cashier: {
                name: cashierInfo?.display_name || cashierInfo?.username || currentUser?.username || 'Unknown',
                id: currentUser?.staffId || null
            },
            processed: !!dayEndClose,
            processedAt: dayEndClose?.created_at,
            processedBy: dayEndClose?.closed_by,
            sales: {
                transactionCount: salesSummary?.transactionCount || 0,
                totalSales: salesSummary?.totalSales || 0,
                cashSales: salesSummary?.cashSales || 0,
                cardSales: salesSummary?.cardSales || 0
            },
            cash: {
                expectedCash: cashReconciliation?.expectedCash || 0,
                cashIn: cashReconciliation?.cashIn || 0,
                cashOut: cashReconciliation?.cashOut || 0,
                netCash: netCash,
                variance: cashVariance
            },
            inventory: {
                itemsSold: inventoryMovement?.itemsSold || 0,
                itemsAdded: inventoryMovement?.itemsAdded || 0,
                itemsRemoved: inventoryMovement?.itemsRemoved || 0
            },
            topProducts: topProducts?.reduce((acc, product) => {
                acc[product.product_name] = {
                    quantity: product.quantity,
                    revenue: product.revenue
                };
                return acc;
            }, {}) || {},
            cardReconciliation: {
                cardSlipsCount: cardReconciliation?.cardSlipsCount || 0,
                cardSlipsTotal: cardReconciliation?.cardSlipsTotal || 0,
                systemCardSales: systemCardSales,
                variance: cardVariance
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/day-end/close', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { actualCash, discrepancy, notes } = req.body;
    const today = new Date().toISOString().split('T')[0];

    try {
        // Record day end close
        const result = await db.run(`
            INSERT INTO day_end_closes (close_date, actual_cash, discrepancy, notes, closed_by)
            VALUES (?, ?, ?, ?, ?)
        `, [today, actualCash, discrepancy, notes, req.user.username]);

        // Log activity
        await logActivity('day_end_closes', result.lastID, 'created', req.user.username, `Day end close for ${today}`);

        // Broadcast day end close event
        getWebSocketService().broadcast('day-end-closed', {
            date: today,
            closedBy: req.user.username,
            timestamp: new Date().toISOString()
        });

        res.json({ message: 'Day end closed successfully', id: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Monthly Operations
app.get('/api/operations/monthly', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.query;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required (YYYY-MM)' });
    }

    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).toISOString().split('T')[0];

    try {
        // Check if month is closed
        const monthClose = await db.get(`
            SELECT * FROM monthly_closes
            WHERE month = ? AND year = ?
        `, [new Date(startDate).getMonth() + 1, new Date(startDate).getFullYear()]);

        // Financial summary - calculate revenue and expenses from general ledger
        const financial = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) as totalRevenue,
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as totalExpenses,
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as netIncome
            FROM general_ledger gl
            JOIN chart_of_accounts coa ON gl.account_id = coa.id
            WHERE DATE(gl.transaction_date) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Opening and closing balance - calculate net balance
        const openingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) < ?
        `, [startDate]);

        const closingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) <= ?
        `, [endDate]);

        // Inventory summary - calculate from inventory transactions
        const inventory = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'purchase' THEN quantity * unit_cost ELSE 0 END), 0) as purchases,
                COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity * unit_cost ELSE 0 END), 0) as sales,
                COALESCE(AVG(quantity), 0) as avgInventory
            FROM inventory_transactions
            WHERE DATE(created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Key metrics
        const metrics = await db.get(`
            SELECT
                COUNT(DISTINCT i.id) as totalTransactions,
                AVG(i.total) as avgTransactionValue,
                COUNT(DISTINCT i.customer_id) as totalCustomers
            FROM invoices i
            WHERE DATE(i.created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        res.json({
            month,
            closed: !!monthClose,
            closedAt: monthClose?.closed_at,
            financial: {
                totalRevenue: financial?.totalRevenue || 0,
                totalExpenses: financial?.totalExpenses || 0,
                netIncome: financial?.netIncome || 0,
                openingBalance: openingBalance?.balance || 0,
                closingBalance: closingBalance?.balance || 0
            },
            inventory: {
                purchases: inventory?.purchases || 0,
                sales: inventory?.sales || 0,
                openingValue: 0, // Would need more complex calculation
                closingValue: 0, // Would need more complex calculation
                turnoverRatio: inventory?.sales && inventory?.avgInventory ?
                    inventory.sales / inventory.avgInventory : 0
            },
            metrics: {
                totalTransactions: metrics?.totalTransactions || 0,
                avgTransactionValue: metrics?.avgTransactionValue || 0,
                newCustomers: 0, // Would need customer creation date tracking
                returningCustomers: metrics?.totalCustomers || 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/process', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required' });
    }

    try {
        const monthNum = new Date(month + '-01').getMonth() + 1;
        const year = new Date(month + '-01').getFullYear();

        // Record monthly close
        const result = await db.run(`
            INSERT INTO monthly_closes (month, year, closed_by)
            VALUES (?, ?, ?)
        `, [monthNum, year, req.user.username]);

        await logActivity('monthly_closes', result.lastID, 'created', req.user.username, `Monthly close for ${month}`);

        res.json({ message: 'Monthly close processed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/depreciation', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;

    try {
        // This would calculate and post depreciation entries
        // For now, just log the activity
        await logActivity('depreciation', null, 'calculated', req.user.username, `Depreciation calculated for ${month}`);

        res.json({ message: 'Depreciation calculated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Purchase Reversals
app.get('/api/purchases', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { search, limit = 50, includeReversed = true } = req.query;

    try {
        let query = `
            SELECT p.*, s.name as supplierName,
                   COUNT(pi.id) as itemCount
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.id LIKE ? OR s.name LIKE ? OR p.reference_number LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (includeReversed !== 'true') {
            query += ` AND p.reversed = 0`;
        }

        query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?`;
        params.push(parseInt(limit));

        const purchases = await db.all(query, params);

        // Get items for each purchase
        for (const purchase of purchases) {
            purchase.items = await db.all(`
                SELECT pi.*, pr.name as productName
                FROM purchase_items pi
                LEFT JOIN products pr ON pi.product_id = pr.id
                WHERE pi.purchase_id = ?
            `, [purchase.id]);
        }

        res.json({ purchases });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/purchases/:id/reverse', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {
        // Check if purchase exists and is not already reversed
        const purchase = await db.get(`
            SELECT * FROM purchases WHERE id = ? AND reversed = 0
        `, [id]);

        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found or already reversed' });
        }

        // Start transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Mark purchase as reversed
            await db.run(`
                UPDATE purchases
                SET reversed = 1, reversed_at = datetime('now'), reversed_by = ?, reversal_reason = ?
                WHERE id = ?
            `, [req.user.username, reason, id]);

            // Reverse inventory transactions
            await db.run(`
                INSERT INTO inventory_transactions (product_id, type, quantity, unit_cost, reference, created_by)
                SELECT product_id, 'adjustment', -quantity, unit_cost, 'Purchase reversal #' || ?, ?
                FROM purchase_items WHERE purchase_id = ?
            `, [id, req.user.username, id]);

            // Reverse accounting entries (if any)
            // This would depend on how purchases are accounted for

            await db.run('COMMIT');

            await logActivity('purchases', id, 'reversed', req.user.username, `Purchase reversed: ${reason}`);

            res.json({ message: 'Purchase reversed successfully' });
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Shift Management
app.get('/api/operations/shift/current', authMiddleware, requireRole(['cashier', 'manager']), async (req, res) => {
    try {
        // Get current open shift or last closed shift
        const shift = await db.get(`
            SELECT * FROM shifts
            WHERE closed_at IS NULL OR DATE(opened_at) = DATE('now')
            ORDER BY opened_at DESC LIMIT 1
        `);

        if (!shift) {
            return res.json({ isOpen: false });
        }

        // Calculate shift totals
        const totals = await db.get(`
            SELECT
                COALESCE(SUM(i.total), 0) as totalSales,
                COALESCE(SUM(CASE WHEN p.method = 'cash' THEN i.total ELSE 0 END), 0) as cashSales,
                COALESCE(SUM(CASE WHEN p.method != 'cash' THEN i.total ELSE 0 END), 0) as cardSales,
                COUNT(DISTINCT i.id) as transactionCount
            FROM invoices i
            LEFT JOIN payments p ON p.invoice_id = i.id
            WHERE DATE(i.created_at) >= DATE(?) AND i.status = 'paid'
        `, [shift.opened_at]);

        res.json({
            shiftId: shift.id,
            isOpen: !shift.closed_at,
            openedAt: shift.opened_at,
            openedBy: shift.opened_by,
            startingCash: shift.starting_cash,
            totalSales: totals?.totalSales || 0,
            cashSales: totals?.cashSales || 0,
            cardSales: totals?.cardSales || 0,
            transactionCount: totals?.transactionCount || 0,
            expectedCash: (shift.starting_cash || 0) + (totals?.cashSales || 0)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/shift/start', authMiddleware, requireRole(['cashier', 'manager']), async (req, res) => {
    const { startingCash = 0 } = req.body;

    try {
        // Close any open shifts first
        await db.run(`
            UPDATE shifts
            SET closed_at = datetime('now'),
                ended_at = datetime('now'),
                closed_by = COALESCE(closed_by, ?),
                status = 'closed',
                updated_at = datetime('now')
            WHERE closed_at IS NULL
        `, [req.user.username]);

        // Start new shift
        const outletId = req.user?.outletId || req.user?.outlet_id || null;
        const staffId = req.user?.staffId || null;
        const result = await db.run(`
            INSERT INTO shifts (opened_by, starting_cash, opened_at, started_by, starting_balance, outlet_id, status)
            VALUES (?, ?, datetime('now'), ?, ?, ?, 'active')
        `, [req.user.username, startingCash, staffId, startingCash, outletId]);

        await logActivity('shifts', result.lastID, 'opened', req.user.username, `Shift opened with $${startingCash} starting cash`);

        res.json({ message: 'Shift started successfully', shiftId: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/shift/close', authMiddleware, requireRole(['cashier', 'manager']), async (req, res) => {
    const { actualCash, cashCounts, discrepancy, notes } = req.body;

    try {
        const openShift = await db.get(`
            SELECT * FROM shifts
            WHERE closed_at IS NULL
            ORDER BY opened_at DESC
            LIMIT 1
        `);
        if (!openShift) {
            return res.status(400).json({ error: 'No open shift found' });
        }

        const totals = await db.get(`
            SELECT
                COALESCE(SUM(i.total), 0) as totalSales,
                COALESCE(SUM(CASE WHEN p.method = 'cash' THEN i.total ELSE 0 END), 0) as cashSales
            FROM invoices i
            LEFT JOIN payments p ON p.invoice_id = i.id
            WHERE DATE(i.created_at) >= DATE(?) AND i.status = 'paid'
        `, [openShift.opened_at]);

        const expectedCash = (openShift.starting_cash || 0) + (totals?.cashSales || 0);

        const normalizedActualCash = Number.isFinite(Number(actualCash)) ? Number(actualCash) : 0;
        const normalizedDiscrepancy = Number.isFinite(Number(discrepancy)) ? Number(discrepancy) : 0;
        const safeCounts = cashCounts && typeof cashCounts === 'object' ? cashCounts : {};
        const cashCountsPayload = JSON.stringify(safeCounts);
        const discrepanciesPayload = JSON.stringify({ cash: normalizedDiscrepancy });

        const countsProvided = Object.values(safeCounts)
            .map((value) => Number(value) || 0)
            .some((value) => value > 0);

        if (expectedCash > 0.01 && !countsProvided) {
            return res.status(400).json({ error: 'Enter the physical cash counts before closing the shift.' });
        }

        if (expectedCash > 0.01 && normalizedActualCash <= 0) {
            return res.status(400).json({ error: 'Actual cash amount is required before closing the shift.' });
        }

        if (Math.abs(normalizedActualCash - expectedCash) > 1 && (!notes || !notes.trim())) {
            return res.status(400).json({ error: 'Please add a note explaining the cash discrepancy before closing the shift.' });
        }

        const result = await db.run(`
            UPDATE shifts
            SET closed_at = datetime('now'),
                ended_at = datetime('now'),
                closed_by = ?,
                actual_cash = ?,
                cash_counts = ?,
                discrepancy = ?,
                discrepancies = ?,
                closing_balance = ?,
                notes = ?,
                note = ?,
                status = 'closed',
                updated_at = datetime('now')
            WHERE closed_at IS NULL
        `, [
            req.user.username,
            normalizedActualCash,
            cashCountsPayload,
            normalizedDiscrepancy,
            discrepanciesPayload,
            normalizedActualCash,
            notes,
            notes
        ]);

        if (result.changes === 0) {
            return res.status(400).json({ error: 'No open shift found' });
        }

        await logActivity('shifts', null, 'closed', req.user.username, `Shift closed with $${actualCash} actual cash`);

        res.json({ message: 'Shift closed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Monthly Operations
app.get('/api/operations/monthly', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.query;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required (YYYY-MM)' });
    }

    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).toISOString().split('T')[0];

    try {
        // Check if month is closed
        const monthClose = await db.get(`
            SELECT * FROM monthly_closes
            WHERE month = ? AND year = ?
        `, [new Date(startDate).getMonth() + 1, new Date(startDate).getFullYear()]);

        // Financial summary - calculate revenue and expenses from general ledger
        const financial = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) as totalRevenue,
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as totalExpenses,
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as netIncome
            FROM general_ledger gl
            JOIN chart_of_accounts coa ON gl.account_id = coa.id
            WHERE DATE(gl.transaction_date) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Opening and closing balance - calculate net balance
        const openingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) < ?
        `, [startDate]);

        const closingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) <= ?
        `, [endDate]);

        // Inventory summary - calculate from inventory transactions
        const inventory = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'purchase' THEN quantity * unit_cost ELSE 0 END), 0) as purchases,
                COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity * unit_cost ELSE 0 END), 0) as sales,
                COALESCE(AVG(quantity), 0) as avgInventory
            FROM inventory_transactions
            WHERE DATE(created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Key metrics
        const metrics = await db.get(`
            SELECT
                COUNT(DISTINCT i.id) as totalTransactions,
                AVG(i.total) as avgTransactionValue,
                COUNT(DISTINCT i.customer_id) as totalCustomers
            FROM invoices i
            WHERE DATE(i.created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        res.json({
            month,
            closed: !!monthClose,
            closedAt: monthClose?.closed_at,
            financial: {
                totalRevenue: financial?.totalRevenue || 0,
                totalExpenses: financial?.totalExpenses || 0,
                netIncome: financial?.netIncome || 0,
                openingBalance: openingBalance?.balance || 0,
                closingBalance: closingBalance?.balance || 0
            },
            inventory: {
                purchases: inventory?.purchases || 0,
                sales: inventory?.sales || 0,
                openingValue: 0, // Would need more complex calculation
                closingValue: 0, // Would need more complex calculation
                turnoverRatio: inventory?.sales && inventory?.avgInventory ?
                    inventory.sales / inventory.avgInventory : 0
            },
            metrics: {
                totalTransactions: metrics?.totalTransactions || 0,
                avgTransactionValue: metrics?.avgTransactionValue || 0,
                newCustomers: 0, // Would need customer creation date tracking
                returningCustomers: metrics?.totalCustomers || 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/process', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required' });
    }

    try {
        const monthNum = new Date(month + '-01').getMonth() + 1;
        const year = new Date(month + '-01').getFullYear();

        // Record monthly close
        const result = await db.run(`
            INSERT INTO monthly_closes (month, year, closed_by)
            VALUES (?, ?, ?)
        `, [monthNum, year, req.user.username]);

        await logActivity('monthly_closes', result.lastID, 'created', req.user.username, `Monthly close for ${month}`);

        res.json({ message: 'Monthly close processed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/depreciation', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;

    try {
        // This would calculate and post depreciation entries
        // For now, just log the activity
        await logActivity('depreciation', null, 'calculated', req.user.username, `Depreciation calculated for ${month}`);

        res.json({ message: 'Depreciation calculated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Purchase Reversals
app.get('/api/purchases', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { search, limit = 50, includeReversed = true } = req.query;

    try {
        let query = `
            SELECT p.*, s.name as supplierName,
                   COUNT(pi.id) as itemCount
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.id LIKE ? OR s.name LIKE ? OR p.reference_number LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (includeReversed !== 'true') {
            query += ` AND p.reversed = 0`;
        }

        query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?`;
        params.push(parseInt(limit));

        const purchases = await db.all(query, params);

        // Get items for each purchase
        for (const purchase of purchases) {
            purchase.items = await db.all(`
                SELECT pi.*, pr.name as productName
                FROM purchase_items pi
                LEFT JOIN products pr ON pi.product_id = pr.id
                WHERE pi.purchase_id = ?
            `, [purchase.id]);
        }

        res.json({ purchases });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/purchases/:id/reverse', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {
        // Check if purchase exists and is not already reversed
        const purchase = await db.get(`
            SELECT * FROM purchases WHERE id = ? AND reversed = 0
        `, [id]);

        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found or already reversed' });
        }

        // Start transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Mark purchase as reversed
            await db.run(`
                UPDATE purchases
                SET reversed = 1, reversed_at = datetime('now'), reversed_by = ?, reversal_reason = ?
                WHERE id = ?
            `, [req.user.username, reason, id]);

            // Reverse inventory transactions
            await db.run(`
                INSERT INTO inventory_transactions (product_id, type, quantity, unit_cost, reference, created_by)
                SELECT product_id, 'adjustment', -quantity, unit_cost, 'Purchase reversal #' || ?, ?
                FROM purchase_items WHERE purchase_id = ?
            `, [id, req.user.username, id]);

            // Reverse accounting entries (if any)
            // This would depend on how purchases are accounted for

            await db.run('COMMIT');

            await logActivity('purchases', id, 'reversed', req.user.username, `Purchase reversed: ${reason}`);

            res.json({ message: 'Purchase reversed successfully' });
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/operations/monthly', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.query;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required (YYYY-MM)' });
    }

    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).toISOString().split('T')[0];

    try {
        // Check if month is closed
        const monthClose = await db.get(`
            SELECT * FROM monthly_closes
            WHERE month = ? AND year = ?
        `, [new Date(startDate).getMonth() + 1, new Date(startDate).getFullYear()]);

        // Financial summary - calculate revenue and expenses from general ledger
        const financial = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) as totalRevenue,
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as totalExpenses,
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as netIncome
            FROM general_ledger gl
            JOIN chart_of_accounts coa ON gl.account_id = coa.id
            WHERE DATE(gl.transaction_date) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Opening and closing balance - calculate net balance
        const openingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) < ?
        `, [startDate]);

        const closingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) <= ?
        `, [endDate]);

        // Inventory summary - calculate from inventory transactions
        const inventory = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'purchase' THEN quantity * unit_cost ELSE 0 END), 0) as purchases,
                COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity * unit_cost ELSE 0 END), 0) as sales,
                COALESCE(AVG(quantity), 0) as avgInventory
            FROM inventory_transactions
            WHERE DATE(created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Key metrics
        const metrics = await db.get(`
            SELECT
                COUNT(DISTINCT i.id) as totalTransactions,
                AVG(i.total) as avgTransactionValue,
                COUNT(DISTINCT i.customer_id) as totalCustomers
            FROM invoices i
            WHERE DATE(i.created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        res.json({
            month,
            closed: !!monthClose,
            closedAt: monthClose?.closed_at,
            financial: {
                totalRevenue: financial?.totalRevenue || 0,
                totalExpenses: financial?.totalExpenses || 0,
                netIncome: financial?.netIncome || 0,
                openingBalance: openingBalance?.balance || 0,
                closingBalance: closingBalance?.balance || 0
            },
            inventory: {
                purchases: inventory?.purchases || 0,
                sales: inventory?.sales || 0,
                openingValue: 0, // Would need more complex calculation
                closingValue: 0, // Would need more complex calculation
                turnoverRatio: inventory?.sales && inventory?.avgInventory ?
                    inventory.sales / inventory.avgInventory : 0
            },
            metrics: {
                totalTransactions: metrics?.totalTransactions || 0,
                avgTransactionValue: metrics?.avgTransactionValue || 0,
                newCustomers: 0, // Would need customer creation date tracking
                returningCustomers: metrics?.totalCustomers || 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/process', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required' });
    }

    try {
        const monthNum = new Date(month + '-01').getMonth() + 1;
        const year = new Date(month + '-01').getFullYear();

        // Record monthly close
        const result = await db.run(`
            INSERT INTO monthly_closes (month, year, closed_by)
            VALUES (?, ?, ?)
        `, [monthNum, year, req.user.username]);

        await logActivity('monthly_closes', result.lastID, 'created', req.user.username, `Monthly close for ${month}`);

        res.json({ message: 'Monthly close processed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/depreciation', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;

    try {
        // This would calculate and post depreciation entries
        // For now, just log the activity
        await logActivity('depreciation', null, 'calculated', req.user.username, `Depreciation calculated for ${month}`);

        res.json({ message: 'Depreciation calculated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Purchase Reversals
app.get('/api/purchases', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { search, limit = 50, includeReversed = true } = req.query;

    try {
        let query = `
            SELECT p.*, s.name as supplierName,
                   COUNT(pi.id) as itemCount
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.id LIKE ? OR s.name LIKE ? OR p.reference_number LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (includeReversed !== 'true') {
            query += ` AND p.reversed = 0`;
        }

        query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?`;
        params.push(parseInt(limit));

        const purchases = await db.all(query, params);

        // Get items for each purchase
        for (const purchase of purchases) {
            purchase.items = await db.all(`
                SELECT pi.*, pr.name as productName
                FROM purchase_items pi
                LEFT JOIN products pr ON pi.product_id = pr.id
                WHERE pi.purchase_id = ?
            `, [purchase.id]);
        }

        res.json({ purchases });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/purchases/:id/reverse', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {
        // Check if purchase exists and is not already reversed
        const purchase = await db.get(`
            SELECT * FROM purchases WHERE id = ? AND reversed = 0
        `, [id]);

        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found or already reversed' });
        }

        // Start transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Mark purchase as reversed
            await db.run(`
                UPDATE purchases
                SET reversed = 1, reversed_at = datetime('now'), reversed_by = ?, reversal_reason = ?
                WHERE id = ?
            `, [req.user.username, reason, id]);

            // Reverse inventory transactions
            await db.run(`
                INSERT INTO inventory_transactions (product_id, type, quantity, unit_cost, reference, created_by)
                SELECT product_id, 'adjustment', -quantity, unit_cost, 'Purchase reversal #' || ?, ?
                FROM purchase_items WHERE purchase_id = ?
            `, [id, req.user.username, id]);

            // Reverse accounting entries (if any)
            // This would depend on how purchases are accounted for

            await db.run('COMMIT');

            await logActivity('purchases', id, 'reversed', req.user.username, `Purchase reversed: ${reason}`);

            res.json({ message: 'Purchase reversed successfully' });
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Monthly Operations
app.get('/api/operations/monthly', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.query;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required (YYYY-MM)' });
    }

    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).toISOString().split('T')[0];

    try {
        // Check if month is closed
        const monthClose = await db.get(`
            SELECT * FROM monthly_closes
            WHERE month = ? AND year = ?
        `, [new Date(startDate).getMonth() + 1, new Date(startDate).getFullYear()]);

        // Financial summary - calculate revenue and expenses from general ledger
        const financial = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) as totalRevenue,
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as totalExpenses,
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as netIncome
            FROM general_ledger gl
            JOIN chart_of_accounts coa ON gl.account_id = coa.id
            WHERE DATE(gl.transaction_date) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Opening and closing balance - calculate net balance
        const openingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) < ?
        `, [startDate]);

        const closingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) <= ?
        `, [endDate]);

        // Inventory summary - calculate from inventory transactions
        const inventory = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'purchase' THEN quantity * unit_cost ELSE 0 END), 0) as purchases,
                COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity * unit_cost ELSE 0 END), 0) as sales,
                COALESCE(AVG(quantity), 0) as avgInventory
            FROM inventory_transactions
            WHERE DATE(created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Key metrics
        const metrics = await db.get(`
            SELECT
                COUNT(DISTINCT i.id) as totalTransactions,
                AVG(i.total) as avgTransactionValue,
                COUNT(DISTINCT i.customer_id) as totalCustomers
            FROM invoices i
            WHERE DATE(i.created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        res.json({
            month,
            closed: !!monthClose,
            closedAt: monthClose?.closed_at,
            financial: {
                totalRevenue: financial?.totalRevenue || 0,
                totalExpenses: financial?.totalExpenses || 0,
                netIncome: financial?.netIncome || 0,
                openingBalance: openingBalance?.balance || 0,
                closingBalance: closingBalance?.balance || 0
            },
            inventory: {
                purchases: inventory?.purchases || 0,
                sales: inventory?.sales || 0,
                openingValue: 0, // Would need more complex calculation
                closingValue: 0, // Would need more complex calculation
                turnoverRatio: inventory?.sales && inventory?.avgInventory ?
                    inventory.sales / inventory.avgInventory : 0
            },
            metrics: {
                totalTransactions: metrics?.totalTransactions || 0,
                avgTransactionValue: metrics?.avgTransactionValue || 0,
                newCustomers: 0, // Would need customer creation date tracking
                returningCustomers: metrics?.totalCustomers || 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/process', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required' });
    }

    try {
        const monthNum = new Date(month + '-01').getMonth() + 1;
        const year = new Date(month + '-01').getFullYear();

        // Record monthly close
        const result = await db.run(`
            INSERT INTO monthly_closes (month, year, closed_by)
            VALUES (?, ?, ?)
        `, [monthNum, year, req.user.username]);

        await logActivity('monthly_closes', result.lastID, 'created', req.user.username, `Monthly close for ${month}`);

        res.json({ message: 'Monthly close processed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/depreciation', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;

    try {
        // This would calculate and post depreciation entries
        // For now, just log the activity
        await logActivity('depreciation', null, 'calculated', req.user.username, `Depreciation calculated for ${month}`);

        res.json({ message: 'Depreciation calculated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Purchase Reversals
app.get('/api/purchases', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { search, limit = 50, includeReversed = true } = req.query;

    try {
        let query = `
            SELECT p.*, s.name as supplierName,
                   COUNT(pi.id) as itemCount
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.id LIKE ? OR s.name LIKE ? OR p.reference_number LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (includeReversed !== 'true') {
            query += ` AND p.reversed = 0`;
        }

        query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?`;
        params.push(parseInt(limit));

        const purchases = await db.all(query, params);

        // Get items for each purchase
        for (const purchase of purchases) {
            purchase.items = await db.all(`
                SELECT pi.*, pr.name as productName
                FROM purchase_items pi
                LEFT JOIN products pr ON pi.product_id = pr.id
                WHERE pi.purchase_id = ?
            `, [purchase.id]);
        }

        res.json({ purchases });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/purchases/:id/reverse', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {
        // Check if purchase exists and is not already reversed
        const purchase = await db.get(`
            SELECT * FROM purchases WHERE id = ? AND reversed = 0
        `, [id]);

        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found or already reversed' });
        }

        // Start transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Mark purchase as reversed
            await db.run(`
                UPDATE purchases
                SET reversed = 1, reversed_at = datetime('now'), reversed_by = ?, reversal_reason = ?
                WHERE id = ?
            `, [req.user.username, reason, id]);

            // Reverse inventory transactions
            await db.run(`
                INSERT INTO inventory_transactions (product_id, type, quantity, unit_cost, reference, created_by)
                SELECT product_id, 'adjustment', -quantity, unit_cost, 'Purchase reversal #' || ?, ?
                FROM purchase_items WHERE purchase_id = ?
            `, [id, req.user.username, id]);

            // Reverse accounting entries (if any)
            // This would depend on how purchases are accounted for

            await db.run('COMMIT');

            await logActivity('purchases', id, 'reversed', req.user.username, `Purchase reversed: ${reason}`);

            res.json({ message: 'Purchase reversed successfully' });
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Monthly Operations
app.get('/api/operations/monthly', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.query;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required (YYYY-MM)' });
    }

    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).toISOString().split('T')[0];

    try {
        // Check if month is closed
        const monthClose = await db.get(`
            SELECT * FROM monthly_closes
            WHERE month = ? AND year = ?
        `, [new Date(startDate).getMonth() + 1, new Date(startDate).getFullYear()]);

        // Financial summary - calculate revenue and expenses from general ledger
        const financial = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) as totalRevenue,
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as totalExpenses,
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as netIncome
            FROM general_ledger gl
            JOIN chart_of_accounts coa ON gl.account_id = coa.id
            WHERE DATE(gl.transaction_date) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Opening and closing balance - calculate net balance
        const openingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) < ?
        `, [startDate]);

        const closingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) <= ?
        `, [endDate]);

        // Inventory summary - calculate from inventory transactions
        const inventory = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'purchase' THEN quantity * unit_cost ELSE 0 END), 0) as purchases,
                COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity * unit_cost ELSE 0 END), 0) as sales,
                COALESCE(AVG(quantity), 0) as avgInventory
            FROM inventory_transactions
            WHERE DATE(created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Key metrics
        const metrics = await db.get(`
            SELECT
                COUNT(DISTINCT i.id) as totalTransactions,
                AVG(i.total) as avgTransactionValue,
                COUNT(DISTINCT i.customer_id) as totalCustomers
            FROM invoices i
            WHERE DATE(i.created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        res.json({
            month,
            closed: !!monthClose,
            closedAt: monthClose?.closed_at,
            financial: {
                totalRevenue: financial?.totalRevenue || 0,
                totalExpenses: financial?.totalExpenses || 0,
                netIncome: financial?.netIncome || 0,
                openingBalance: openingBalance?.balance || 0,
                closingBalance: closingBalance?.balance || 0
            },
            inventory: {
                purchases: inventory?.purchases || 0,
                sales: inventory?.sales || 0,
                openingValue: 0, // Would need more complex calculation
                closingValue: 0, // Would need more complex calculation
                turnoverRatio: inventory?.sales && inventory?.avgInventory ?
                    inventory.sales / inventory.avgInventory : 0
            },
            metrics: {
                totalTransactions: metrics?.totalTransactions || 0,
                avgTransactionValue: metrics?.avgTransactionValue || 0,
                newCustomers: 0, // Would need customer creation date tracking
                returningCustomers: metrics?.totalCustomers || 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/process', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required' });
    }

    try {
        const monthNum = new Date(month + '-01').getMonth() + 1;
        const year = new Date(month + '-01').getFullYear();

        // Record monthly close
        const result = await db.run(`
            INSERT INTO monthly_closes (month, year, closed_by)
            VALUES (?, ?, ?)
        `, [monthNum, year, req.user.username]);

        await logActivity('monthly_closes', result.lastID, 'created', req.user.username, `Monthly close for ${month}`);

        res.json({ message: 'Monthly close processed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/depreciation', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;

    try {
        // This would calculate and post depreciation entries
        // For now, just log the activity
        await logActivity('depreciation', null, 'calculated', req.user.username, `Depreciation calculated for ${month}`);

        res.json({ message: 'Depreciation calculated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Purchase Reversals
app.get('/api/purchases', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { search, limit = 50, includeReversed = true } = req.query;

    try {
        let query = `
            SELECT p.*, s.name as supplierName,
                   COUNT(pi.id) as itemCount
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.id LIKE ? OR s.name LIKE ? OR p.reference_number LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (includeReversed !== 'true') {
            query += ` AND p.reversed = 0`;
        }

        query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?`;
        params.push(parseInt(limit));

        const purchases = await db.all(query, params);

        // Get items for each purchase
        for (const purchase of purchases) {
            purchase.items = await db.all(`
                SELECT pi.*, pr.name as productName
                FROM purchase_items pi
                LEFT JOIN products pr ON pi.product_id = pr.id
                WHERE pi.purchase_id = ?
            `, [purchase.id]);
        }

        res.json({ purchases });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/purchases/:id/reverse', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {
        // Check if purchase exists and is not already reversed
        const purchase = await db.get(`
            SELECT * FROM purchases WHERE id = ? AND reversed = 0
        `, [id]);

        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found or already reversed' });
        }

        // Start transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Mark purchase as reversed
            await db.run(`
                UPDATE purchases
                SET reversed = 1, reversed_at = datetime('now'), reversed_by = ?, reversal_reason = ?
                WHERE id = ?
            `, [req.user.username, reason, id]);

            // Reverse inventory transactions
            await db.run(`
                INSERT INTO inventory_transactions (product_id, type, quantity, unit_cost, reference, created_by)
                SELECT product_id, 'adjustment', -quantity, unit_cost, 'Purchase reversal #' || ?, ?
                FROM purchase_items WHERE purchase_id = ?
            `, [id, req.user.username, id]);

            // Reverse accounting entries (if any)
            // This would depend on how purchases are accounted for

            await db.run('COMMIT');

            await logActivity('purchases', id, 'reversed', req.user.username, `Purchase reversed: ${reason}`);

            res.json({ message: 'Purchase reversed successfully' });
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Monthly Operations
app.get('/api/operations/monthly', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.query;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required (YYYY-MM)' });
    }

    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).toISOString().split('T')[0];

    try {
        // Check if month is closed
        const monthClose = await db.get(`
            SELECT * FROM monthly_closes
            WHERE month = ? AND year = ?
        `, [new Date(startDate).getMonth() + 1, new Date(startDate).getFullYear()]);

        // Financial summary - calculate revenue and expenses from general ledger
        const financial = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) as totalRevenue,
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as totalExpenses,
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as netIncome
            FROM general_ledger gl
            JOIN chart_of_accounts coa ON gl.account_id = coa.id
            WHERE DATE(gl.transaction_date) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Opening and closing balance - calculate net balance
        const openingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) < ?
        `, [startDate]);

        const closingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) <= ?
        `, [endDate]);

        // Inventory summary - calculate from inventory transactions
        const inventory = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'purchase' THEN quantity * unit_cost ELSE 0 END), 0) as purchases,
                COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity * unit_cost ELSE 0 END), 0) as sales,
                COALESCE(AVG(quantity), 0) as avgInventory
            FROM inventory_transactions
            WHERE DATE(created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Key metrics
        const metrics = await db.get(`
            SELECT
                COUNT(DISTINCT i.id) as totalTransactions,
                AVG(i.total) as avgTransactionValue,
                COUNT(DISTINCT i.customer_id) as totalCustomers
            FROM invoices i
            WHERE DATE(i.created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        res.json({
            month,
            closed: !!monthClose,
            closedAt: monthClose?.closed_at,
            financial: {
                totalRevenue: financial?.totalRevenue || 0,
                totalExpenses: financial?.totalExpenses || 0,
                netIncome: financial?.netIncome || 0,
                openingBalance: openingBalance?.balance || 0,
                closingBalance: closingBalance?.balance || 0
            },
            inventory: {
                purchases: inventory?.purchases || 0,
                sales: inventory?.sales || 0,
                openingValue: 0, // Would need more complex calculation
                closingValue: 0, // Would need more complex calculation
                turnoverRatio: inventory?.sales && inventory?.avgInventory ?
                    inventory.sales / inventory.avgInventory : 0
            },
            metrics: {
                totalTransactions: metrics?.totalTransactions || 0,
                avgTransactionValue: metrics?.avgTransactionValue || 0,
                newCustomers: 0, // Would need customer creation date tracking
                returningCustomers: metrics?.totalCustomers || 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/process', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required' });
    }

    try {
        const monthNum = new Date(month + '-01').getMonth() + 1;
        const year = new Date(month + '-01').getFullYear();

        // Record monthly close
        const result = await db.run(`
            INSERT INTO monthly_closes (month, year, closed_by)
            VALUES (?, ?, ?)
        `, [monthNum, year, req.user.username]);

        await logActivity('monthly_closes', result.lastID, 'created', req.user.username, `Monthly close for ${month}`);

        res.json({ message: 'Monthly close processed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/depreciation', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;

    try {
        // This would calculate and post depreciation entries
        // For now, just log the activity
        await logActivity('depreciation', null, 'calculated', req.user.username, `Depreciation calculated for ${month}`);

        res.json({ message: 'Depreciation calculated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Purchase Reversals
app.get('/api/purchases', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { search, limit = 50, includeReversed = true } = req.query;

    try {
        let query = `
            SELECT p.*, s.name as supplierName,
                   COUNT(pi.id) as itemCount
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.id LIKE ? OR s.name LIKE ? OR p.reference_number LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (includeReversed !== 'true') {
            query += ` AND p.reversed = 0`;
        }

        query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?`;
        params.push(parseInt(limit));

        const purchases = await db.all(query, params);

        // Get items for each purchase
        for (const purchase of purchases) {
            purchase.items = await db.all(`
                SELECT pi.*, pr.name as productName
                FROM purchase_items pi
                LEFT JOIN products pr ON pi.product_id = pr.id
                WHERE pi.purchase_id = ?
            `, [purchase.id]);
        }

        res.json({ purchases });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/purchases/:id/reverse', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {
        // Check if purchase exists and is not already reversed
        const purchase = await db.get(`
            SELECT * FROM purchases WHERE id = ? AND reversed = 0
        `, [id]);

        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found or already reversed' });
        }

        // Start transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Mark purchase as reversed
            await db.run(`
                UPDATE purchases
                SET reversed = 1, reversed_at = datetime('now'), reversed_by = ?, reversal_reason = ?
                WHERE id = ?
            `, [req.user.username, reason, id]);

            // Reverse inventory transactions
            await db.run(`
                INSERT INTO inventory_transactions (product_id, type, quantity, unit_cost, reference, created_by)
                SELECT product_id, 'adjustment', -quantity, unit_cost, 'Purchase reversal #' || ?, ?
                FROM purchase_items WHERE purchase_id = ?
            `, [id, req.user.username, id]);

            // Reverse accounting entries (if any)
            // This would depend on how purchases are accounted for

            await db.run('COMMIT');

            await logActivity('purchases', id, 'reversed', req.user.username, `Purchase reversed: ${reason}`);

            res.json({ message: 'Purchase reversed successfully' });
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Monthly Operations
app.get('/api/operations/monthly', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.query;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required (YYYY-MM)' });
    }

    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0).toISOString().split('T')[0];

    try {
        // Check if month is closed
        const monthClose = await db.get(`
            SELECT * FROM monthly_closes
            WHERE month = ? AND year = ?
        `, [new Date(startDate).getMonth() + 1, new Date(startDate).getFullYear()]);

        // Financial summary - calculate revenue and expenses from general ledger
        const financial = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) as totalRevenue,
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as totalExpenses,
                COALESCE(SUM(CASE WHEN coa.account_type = 'revenue' THEN (gl.debit - gl.credit) ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN coa.account_type = 'expense' THEN (gl.credit - gl.debit) ELSE 0 END), 0) as netIncome
            FROM general_ledger gl
            JOIN chart_of_accounts coa ON gl.account_id = coa.id
            WHERE DATE(gl.transaction_date) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Opening and closing balance - calculate net balance
        const openingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) < ?
        `, [startDate]);

        const closingBalance = await db.get(`
            SELECT COALESCE(SUM(gl.debit - gl.credit), 0) as balance
            FROM general_ledger gl
            WHERE DATE(gl.transaction_date) <= ?
        `, [endDate]);

        // Inventory summary - calculate from inventory transactions
        const inventory = await db.get(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'purchase' THEN quantity * unit_cost ELSE 0 END), 0) as purchases,
                COALESCE(SUM(CASE WHEN type = 'sale' THEN quantity * unit_cost ELSE 0 END), 0) as sales,
                COALESCE(AVG(quantity), 0) as avgInventory
            FROM inventory_transactions
            WHERE DATE(created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        // Key metrics
        const metrics = await db.get(`
            SELECT
                COUNT(DISTINCT i.id) as totalTransactions,
                AVG(i.total) as avgTransactionValue,
                COUNT(DISTINCT i.customer_id) as totalCustomers
            FROM invoices i
            WHERE DATE(i.created_at) BETWEEN ? AND ?
        `, [startDate, endDate]);

        res.json({
            month,
            closed: !!monthClose,
            closedAt: monthClose?.closed_at,
            financial: {
                totalRevenue: financial?.totalRevenue || 0,
                totalExpenses: financial?.totalExpenses || 0,
                netIncome: financial?.netIncome || 0,
                openingBalance: openingBalance?.balance || 0,
                closingBalance: closingBalance?.balance || 0
            },
            inventory: {
                purchases: inventory?.purchases || 0,
                sales: inventory?.sales || 0,
                openingValue: 0, // Would need more complex calculation
                closingValue: 0, // Would need more complex calculation
                turnoverRatio: inventory?.sales && inventory?.avgInventory ?
                    inventory.sales / inventory.avgInventory : 0
            },
            metrics: {
                totalTransactions: metrics?.totalTransactions || 0,
                avgTransactionValue: metrics?.avgTransactionValue || 0,
                newCustomers: 0, // Would need customer creation date tracking
                returningCustomers: metrics?.totalCustomers || 0
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/process', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;
    if (!month) {
        return res.status(400).json({ error: 'Month parameter is required' });
    }

    try {
        const monthNum = new Date(month + '-01').getMonth() + 1;
        const year = new Date(month + '-01').getFullYear();

        // Record monthly close
        const result = await db.run(`
            INSERT INTO monthly_closes (month, year, closed_by)
            VALUES (?, ?, ?)
        `, [monthNum, year, req.user.username]);

        await logActivity('monthly_closes', result.lastID, 'created', req.user.username, `Monthly close for ${month}`);

        res.json({ message: 'Monthly close processed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/monthly/depreciation', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { month } = req.body;

    try {
        // This would calculate and post depreciation entries
        // For now, just log the activity
        await logActivity('depreciation', null, 'calculated', req.user.username, `Depreciation calculated for ${month}`);

        res.json({ message: 'Depreciation calculated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Purchase Reversals
app.get('/api/purchases', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { search, limit = 50, includeReversed = true } = req.query;

    try {
        let query = `
            SELECT p.*, s.name as supplierName,
                   COUNT(pi.id) as itemCount
            FROM purchases p
            LEFT JOIN suppliers s ON p.supplier_id = s.id
            LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.id LIKE ? OR s.name LIKE ? OR p.reference_number LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (includeReversed !== 'true') {
            query += ` AND p.reversed = 0`;
        }

        query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?`;
        params.push(parseInt(limit));

        const purchases = await db.all(query, params);

        // Get items for each purchase
        for (const purchase of purchases) {
            purchase.items = await db.all(`
                SELECT pi.*, pr.name as productName
                FROM purchase_items pi
                LEFT JOIN products pr ON pi.product_id = pr.id
                WHERE pi.purchase_id = ?
            `, [purchase.id]);
        }

        res.json({ purchases });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/purchases/:id/reverse', authMiddleware, requireRole(['manager', 'accounts']), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    try {
        // Check if purchase exists and is not already reversed
        const purchase = await db.get(`
            SELECT * FROM purchases WHERE id = ? AND reversed = 0
        `, [id]);

        if (!purchase) {
            return res.status(404).json({ error: 'Purchase not found or already reversed' });
        }

        // Start transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Mark purchase as reversed
            await db.run(`
                UPDATE purchases
                SET reversed = 1, reversed_at = datetime('now'), reversed_by = ?, reversal_reason = ?
                WHERE id = ?
            `, [req.user.username, reason, id]);

            // Reverse inventory transactions
            await db.run(`
                INSERT INTO inventory_transactions (product_id, type, quantity, unit_cost, reference, created_by)
                SELECT product_id, 'adjustment', -quantity, unit_cost, 'Purchase reversal #' || ?, ?
                FROM purchase_items WHERE purchase_id = ?
            `, [id, req.user.username, id]);

            // Reverse accounting entries (if any)
            // This would depend on how purchases are accounted for

            await db.run('COMMIT');

            await logActivity('purchases', id, 'reversed', req.user.username, `Purchase reversed: ${reason}`);

            res.json({ message: 'Purchase reversed successfully' });
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== MISSING ENDPOINTS ====================

// Lookup and Option Values
app.get('/api/lookups', authMiddleware, async (req, res) => {
    try {
        const cached = await cacheService.getLookups();
        if (cached) {
            console.log('Serving product lookups from cache');
            return res.json(cached);
        }

        const brands = await db.all('SELECT id, name FROM brands ORDER BY name');
        const materials = await db.all('SELECT id, name FROM materials ORDER BY name');
        const colors = await db.all('SELECT id, name, hex FROM colors ORDER BY name');
        const tags = await db.all('SELECT id, name, slug FROM tags ORDER BY name');

        const payload = {
            brands,
            materials,
            colors,
            tags,
            audiences: AUDIENCE_OPTIONS,
            deliveryTypes: DELIVERY_TYPES,
            warrantyTerms: WARRANTY_TERMS,
        };

        await cacheService.setLookups(payload, 600);

        res.json(payload);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/brands', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const result = await db.run('INSERT INTO brands (name) VALUES (?)', [name]);
        await cacheService.invalidateLookups();
        getWebSocketService().broadcast('lookups:update', { type: 'brands' });
        res.status(201).json({ id: result.lastID, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/materials', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const result = await db.run('INSERT INTO materials (name) VALUES (?)', [name]);
        await cacheService.invalidateLookups();
        getWebSocketService().broadcast('lookups:update', { type: 'materials' });
        res.status(201).json({ id: result.lastID, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/colors', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const result = await db.run('INSERT INTO colors (name) VALUES (?)', [name]);
        await cacheService.invalidateLookups();
        getWebSocketService().broadcast('lookups:update', { type: 'colors' });
        res.status(201).json({ id: result.lastID, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/tags', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const slug = slugify(name);
        const result = await db.run('INSERT INTO tags (name, slug) VALUES (?, ?)', [name, slug]);
        await cacheService.invalidateLookups();
        getWebSocketService().broadcast('lookups:update', { type: 'tags' });
        res.status(201).json({ id: result.lastID, name, slug });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name, parentId } = req.body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) return res.status(400).json({ error: 'Missing name' });

    const normalizedParentId = parentId === undefined || parentId === null || parentId === ''
        ? null
        : Number(parentId);
    if (normalizedParentId !== null && (!Number.isFinite(normalizedParentId) || !Number.isInteger(normalizedParentId))) {
        return res.status(400).json({ error: 'Invalid parentId' });
    }

    try {
        const existingByName = await db.get(
            `SELECT id, name, slug, parent_id
             FROM product_categories
             WHERE name = ?
               AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)`
            , [trimmedName, normalizedParentId, normalizedParentId]
        );
        if (existingByName) {
            return res.status(200).json(existingByName);
        }

        const slugBase = slugify(trimmedName);
        const uniqueSlug = await ensureUniqueCategorySlug(slugBase);
        const result = await db.run(
            'INSERT INTO product_categories (name, slug, parent_id) VALUES (?, ?, ?)',
            [trimmedName, uniqueSlug, normalizedParentId]
        );

        const payload = { id: result.lastID, name: trimmedName, slug: uniqueSlug, parent_id: normalizedParentId };

        await cacheService.clearCategories();
        await cacheService.clearCategoriesTree();
        getWebSocketService().broadcast('categories:update');
        res.status(201).json(payload);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/categories/:id', authMiddleware, requireRole('manager'), async (req, res) => {
    const { name, parentId } = req.body;
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedName) return res.status(400).json({ error: 'Missing name' });

    const categoryId = Number(req.params.id);
    if (!Number.isInteger(categoryId)) {
        return res.status(400).json({ error: 'Invalid category id' });
    }

    const normalizedParentId = parentId === undefined || parentId === null || parentId === ''
        ? null
        : Number(parentId);
    if (normalizedParentId !== null && (!Number.isFinite(normalizedParentId) || !Number.isInteger(normalizedParentId))) {
        return res.status(400).json({ error: 'Invalid parentId' });
    }

    try {
        const existingCategory = await db.get('SELECT id FROM product_categories WHERE id = ?', [categoryId]);
        if (!existingCategory) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const existingByName = await db.get(
            `SELECT id
             FROM product_categories
             WHERE name = ?
               AND ((parent_id IS NULL AND ? IS NULL) OR parent_id = ?)
               AND id != ?`,
            [trimmedName, normalizedParentId, normalizedParentId, categoryId]
        );
        if (existingByName) {
            return res.status(409).json({ error: 'A category with that name already exists at this level.' });
        }

        const slugBase = slugify(trimmedName);
        const uniqueSlug = await ensureUniqueCategorySlug(slugBase, categoryId);

        await db.run(
            'UPDATE product_categories SET name = ?, slug = ?, parent_id = ? WHERE id = ?',
            [trimmedName, uniqueSlug, normalizedParentId, categoryId]
        );

        const payload = { id: categoryId, name: trimmedName, slug: uniqueSlug, parent_id: normalizedParentId };

        await cacheService.clearCategories();
        await cacheService.clearCategoriesTree();
        getWebSocketService().broadcast('categories:update');
        res.status(200).json(payload);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

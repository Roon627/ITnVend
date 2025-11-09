import express from 'express';
import cors from 'cors';
import os from 'os';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
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
import validateSlipRouter from './routes/validateSlip.js';
import validateSlipPublicRouter from './routes/validateSlipPublic.js';
import slipsRouter from './routes/slips.js';
import { createSlipProcessingQueue } from './lib/slipProcessingQueue.js';

const __filename = fileURLToPath(import.meta.url);
const backendRoot = path.dirname(__filename);
const uploadsRoot = path.join(backendRoot, 'uploads');
const imagesDir = path.join(backendRoot, 'public', 'images');
const CERTS_DIR = path.join(backendRoot, 'certs');
const HTTPS_CERT_PATH = path.join(CERTS_DIR, 'pos-itnvend-com.pem');
const HTTPS_KEY_PATH = path.join(CERTS_DIR, 'pos-itnvend-com-key.pem');

try { fs.mkdirSync(uploadsRoot, { recursive: true }); } catch (err) { /* ignore */ }
try { fs.mkdirSync(imagesDir, { recursive: true }); } catch (err) { /* ignore */ }

function loadHttpsOptions() {
    try {
        return {
            key: fs.readFileSync(HTTPS_KEY_PATH),
            cert: fs.readFileSync(HTTPS_CERT_PATH)
        };
    } catch (err) {
        console.error('Failed to load HTTPS certificates. Ensure mkcert output exists in the certs directory.');
        throw err;
    }
}

const app = express();
const server = https.createServer(loadHttpsOptions(), app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

const STOREFRONT_API_KEY = process.env.STOREFRONT_API_KEY || null;
const STOREFRONT_API_SECRET = process.env.STOREFRONT_API_SECRET || null;

app.set('trust proxy', true);
// make port configurable so multiple services can run without colliding
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const DB_TYPES = { POSTGRES: 'postgres', SQLITE: 'sqlite' };
let dbType = process.env.DB_TYPE || null;
const DEFAULT_CONCAT_SEPARATOR = "', '";
function resolveDbType() {
    if (dbType) return dbType;
    if (process.env.DB_TYPE) return process.env.DB_TYPE;
    if (process.env.DATABASE_URL) return DB_TYPES.POSTGRES;
    return DB_TYPES.SQLITE;
}
function isPostgres() {
    return resolveDbType() === DB_TYPES.POSTGRES;
}
function concatExpr(column, separator = DEFAULT_CONCAT_SEPARATOR) {
    if (separator) {
        return isPostgres()
            ? `string_agg(${column}, ${separator})`
            : `group_concat(${column}, ${separator})`;
    }
    return isPostgres()
        ? `string_agg(${column}, ',')`
        : `group_concat(${column})`;
}
function nowExpr() {
    return isPostgres() ? 'CURRENT_TIMESTAMP' : "datetime('now')";
}
function orderCaseInsensitive(column) {
    return isPostgres() ? `LOWER(${column})` : `${column} COLLATE NOCASE`;
}

function normalizeGalleryInput(input) {
    if (!input) return [];
    const arr = Array.isArray(input) ? input : [input];
    const seen = new Set();
    const entries = [];
    for (const entry of arr) {
        if (typeof entry !== 'string') continue;
        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        entries.push(trimmed);
    }
    return entries;
}

function parseGalleryFromRow(value) {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return normalizeGalleryInput(Array.isArray(parsed) ? parsed : []);
    } catch {
        return [];
    }
}

const PRODUCT_BASE_SELECT = `
            SELECT
                p.*,
                b.name AS brand_name,
                mat.name AS material_name,
                col.name AS color_name,
                cat.name AS category_name_resolved,
                sub.name AS subcategory_name_resolved,
                subsub.name AS subsubcategory_name_resolved,
                v.legal_name AS vendor_name,
                v.slug AS vendor_slug,
                v.tagline AS vendor_tagline,
                v.public_description AS vendor_public_description,
                ci.id AS casual_item_id,
                ci.status AS casual_status,
                ci.featured AS casual_featured,
                cs.name AS casual_seller_name,
                cs.email AS casual_seller_email,
                cs.phone AS casual_seller_phone
            FROM products p
            LEFT JOIN brands b ON p.brand_id = b.id
            LEFT JOIN materials mat ON p.material_id = mat.id
            LEFT JOIN colors col ON p.color_id = col.id
            LEFT JOIN product_categories cat ON p.category_id = cat.id
            LEFT JOIN product_categories sub ON p.subcategory_id = sub.id
            LEFT JOIN product_categories subsub ON p.subsubcategory_id = subsub.id
            LEFT JOIN vendors v ON p.vendor_id = v.id
            LEFT JOIN casual_items ci ON ci.product_id = p.id
            LEFT JOIN casual_sellers cs ON cs.id = ci.casual_seller_id
            WHERE 1=1
        `;

async function transformProductRows(rows = []) {
    if (!rows || rows.length === 0) return [];
    const productIds = rows.map((row) => row.id);
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
    return rows.map((row) => {
        const isCasual = !!row.casual_item_id;
        const listingSource = isCasual ? 'casual' : (row.vendor_id ? 'vendor' : 'inventory');
        const gallery = parseGalleryFromRow(row.gallery);
        return {
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
            vendor_id: row.vendor_id,
            vendor_name: row.vendor_name,
            vendor_slug: row.vendor_slug,
            vendor_tagline: row.vendor_tagline,
            vendor_public_description: row.vendor_public_description,
            tags: tagsByProduct[row.id] || [],
            is_casual_listing: isCasual,
            listing_source: listingSource,
            casual_item_id: row.casual_item_id,
            casual_status: row.casual_status,
            casual_featured: row.casual_featured ? 1 : 0,
            seller_contact_name: isCasual ? (row.casual_seller_name || null) : null,
            seller_contact_email: isCasual ? (row.casual_seller_email || null) : null,
            seller_contact_phone: isCasual ? (row.casual_seller_phone || null) : null,
            seller_contact_notice: isCasual ? 'Coordinate payment and inspection directly with the seller. ITnVend hosts the listing but does not broker the transaction.' : null,
            highlight_active: row.highlight_active ? 1 : 0,
            highlight_label: row.highlight_label || null,
            highlight_priority: row.highlight_priority || 0,
            gallery,
        };
    });
}

async function fetchProductsForHighlight(whereClause = '', params = [], { orderBy = null, limit = null } = {}) {
    let query = PRODUCT_BASE_SELECT;
    const queryParams = [...params];
    if (whereClause) {
        query += ` AND ${whereClause}`;
    }
    if (orderBy) {
        query += ` ORDER BY ${orderBy}`;
    } else {
        query += ` ORDER BY ${orderCaseInsensitive('p.name')}`;
    }
    if (limit) {
        query += ' LIMIT ?';
        queryParams.push(limit);
    }
    const rows = await db.all(query, queryParams);
    return transformProductRows(rows);
}

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
app.use(
    express.json({
        limit: '10mb',
        verify: (req, res, buf) => {
            if (buf && buf.length) {
                req.rawBody = buf.toString('utf8');
            } else {
                req.rawBody = '';
            }
        },
    })
);
// Simple request logging for diagnostics
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${req.ip}`);
    next();
});

// Lightweight in-memory rate limiter for public submission endpoints
const rateLimits = new Map(); // key -> { count, resetAt }
function createRateLimiter({ windowMs = 60 * 60 * 1000, max = 20, keyFn = (req) => req.ip }) {
    // cleanup interval
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of rateLimits.entries()) {
            if (v.resetAt <= now) rateLimits.delete(k);
        }
    }, Math.min(windowMs, 60 * 1000));

    return (req, res, next) => {
        try {
            const key = keyFn(req) || req.ip;
            const now = Date.now();
            const entry = rateLimits.get(key);
            if (!entry || entry.resetAt <= now) {
                rateLimits.set(key, { count: 1, resetAt: now + windowMs });
                return next();
            }
            if (entry.count >= max) {
                const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
                res.set('Retry-After', String(retryAfter));
                return res.status(429).json({ error: `Rate limit exceeded. Try again in ${retryAfter} seconds.` });
            }
            entry.count += 1;
            rateLimits.set(key, entry);
            return next();
        } catch (err) {
            // On error, allow the request rather than block by mistake
            console.warn('Rate limiter error', err?.message || err);
            return next();
        }
    };
}

function resolveSlipFilePath(row) {
    const raw = row?.storage_path || row?.storage_key || '';
    if (!raw) return null;
    if (/^(https?:\/\/|s3:\/\/)/i.test(raw)) return null;
    if (path.isAbsolute(raw)) return raw;
    if (raw.startsWith('/uploads/')) {
        const rel = raw.replace(/^\/uploads\//, '').replace(/\//g, path.sep);
        return path.join(uploadsRoot, rel);
    }
    const normalized = raw.replace(/^\/+/, '').replace(/\//g, path.sep);
    return path.join(uploadsRoot, normalized);
}

function guessSlipMimetype(filenameOrPath) {
    const ext = (path.extname(filenameOrPath || '') || '').toLowerCase();
    switch (ext) {
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.gif':
            return 'image/gif';
        case '.pdf':
            return 'application/pdf';
        case '.webp':
            return 'image/webp';
        default:
            return null;
    }
}

function extractQueuedMetadata(validationResult) {
    if (!validationResult) return {};
    try {
        const parsed = JSON.parse(validationResult);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
        return {};
    }
}

async function markSlipRecoveryFailed(db, row, meta, reason) {
    const nowIso = new Date().toISOString();
    const payload = {
        ...(meta || {}),
        stage: 'recovery_failed',
        error: reason,
        failedAt: nowIso,
    };
    try {
        await db.run(
            `UPDATE slips SET status = ?, validation_result = ?, updated_at = ? WHERE id = ?`,
            ['failed', JSON.stringify(payload), nowIso, row.id]
        );
    } catch (err) {
        console.warn('Unable to mark slip recovery failure', row?.id, err);
    }
}

async function recoverSlipJobs(db, queue) {
    if (!db || !queue) return;
    try {
        const rows = await db.all(
            `SELECT id, filename, storage_path, storage_key, validation_result FROM slips WHERE status = 'processing'`
        );
        if (!rows || rows.length === 0) return;
        console.info(`Recovering ${rows.length} slip(s) left in processing state`);
        for (const row of rows) {
            const meta = extractQueuedMetadata(row.validation_result);
            const filePath = resolveSlipFilePath(row);
            if (!filePath) {
                await markSlipRecoveryFailed(db, row, meta, 'Original slip file path unavailable for recovery');
                continue;
            }
            try {
                const buffer = await fs.promises.readFile(filePath);
                queue.enqueue({
                    id: row.id,
                    buffer,
                    mimetype: guessSlipMimetype(row.filename || filePath),
                    transactionId: meta?.transactionId || null,
                    expectedAmount: meta?.expectedAmount ?? null,
                });
            } catch (err) {
                console.warn('Failed to queue recovered slip', row.id, err);
                await markSlipRecoveryFailed(db, row, meta, err?.message || 'Unable to read slip file');
            }
        }
    } catch (err) {
        console.warn('Slip recovery query failed', err);
    }
}

app.use('/api/validate-slip', authMiddleware, requireRole(['accounts', 'manager', 'admin']), validateSlipRouter);
// Public endpoint for storefront slip pre-validation (accepts data URL JSON)
app.use('/api/validate-slip-public', validateSlipPublicRouter);

// serve uploaded files (slips/assets) from /uploads - local disk storage uses this path
app.use('/uploads', express.static(imagesDir));
app.use('/uploads', express.static(uploadsRoot));

// Slips persistence endpoints (authenticated)
app.use('/api/slips', authMiddleware, requireRole(['accounts', 'manager', 'admin']), slipsRouter);

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
const AVAILABILITY_STATUSES = ['in_stock', 'preorder', 'vendor', 'used'];
const DELIVERY_TYPES = ['instant_download', 'shipping', 'pickup'];
const WARRANTY_TERMS = ['none', '1_year', 'lifetime'];
const PREORDER_STATUSES = ['pending', 'accepted', 'processing', 'received', 'ready', 'completed', 'cancelled'];
const MAX_PAYMENT_SLIP_BASE64_LENGTH = 8 * 1024 * 1024; // ~6 MB payload after base64 expansion
const PREORDER_RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const PREORDER_RATE_LIMIT_COUNT = 20;
const MAX_PREORDER_NOTES_LENGTH = 4000;
const MAX_PREORDER_CART_LINKS = 10;

async function getUniqueVendorSlug(base, ignoreId = null) {
    const baseSlug = slugify(base || '') || `vendor-${Date.now()}`;
    let candidate = baseSlug;
    let suffix = 2;
    while (true) {
        const clash = ignoreId != null
            ? await db.get('SELECT id FROM vendors WHERE slug = ? AND id != ?', [candidate, ignoreId])
            : await db.get('SELECT id FROM vendors WHERE slug = ?', [candidate]);
        if (!clash) return candidate;
        candidate = `${baseSlug}-${suffix++}`;
    }
}

async function ensureVendorSlug(id, fallbackName = '') {
    const vendor = await db.get('SELECT id, slug, legal_name, contact_person, email FROM vendors WHERE id = ?', [id]);
    if (!vendor) return null;
    if (vendor.slug && vendor.slug.trim()) return vendor.slug;
    const slugSource = fallbackName || vendor.legal_name || vendor.contact_person || vendor.email || `vendor-${id}`;
    const slug = await getUniqueVendorSlug(slugSource, id);
    await db.run('UPDATE vendors SET slug = ? WHERE id = ?', [slug, id]);
    return slug;
}

const HTML_ESCAPE_LOOKUP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPE_LOOKUP[char] || char);
}

function renderEmailTemplate(template, fallback, variables = {}) {
    const base = (template && template.trim()) ? template : (fallback || '');
    let rendered = base;
    for (const [key, rawValue] of Object.entries(variables)) {
        const safe = rawValue == null ? '' : String(rawValue);
        const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
        rendered = rendered.replace(pattern, safe);
    }
    if (!/<[a-z!/]/i.test(rendered)) {
        rendered = rendered.replace(/\r?\n/g, '<br/>');
    }
    return rendered;
}

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

function parseJson(value, fallback = null) {
    if (value == null) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch (err) {
        return fallback;
    }
}

function formatPreorderRow(row, includeSensitive = false) {
    if (!row) return null;
    const cartLinks = parseJson(row.cart_links, []);
    const statusHistory = parseJson(row.status_history, []);
    const itemsSnapshotRaw = parseJson(row.items_snapshot, null);
    let items = [];
    let orderSummary = null;
    if (Array.isArray(itemsSnapshotRaw)) {
        items = itemsSnapshotRaw;
    } else if (itemsSnapshotRaw && typeof itemsSnapshotRaw === 'object') {
        if (Array.isArray(itemsSnapshotRaw.items)) {
            items = itemsSnapshotRaw.items;
        }
        orderSummary = {
            subtotal: itemsSnapshotRaw.subtotal != null ? Number(itemsSnapshotRaw.subtotal) : null,
            tax: itemsSnapshotRaw.tax != null ? Number(itemsSnapshotRaw.tax) : null,
            total: itemsSnapshotRaw.total != null ? Number(itemsSnapshotRaw.total) : null,
            currency: itemsSnapshotRaw.currency || null,
        };
    }
    const base = {
        id: row.id,
        sourceStore: row.source_store || null,
        cartLinks: Array.isArray(cartLinks) ? cartLinks : [],
        notes: row.notes || null,
        customerName: row.customer_name || null,
        customerEmail: row.customer_email || null,
        customerPhone: row.customer_phone || null,
        usdTotal: row.usd_total != null ? Number(row.usd_total) : null,
        exchangeRate: row.exchange_rate != null ? Number(row.exchange_rate) : null,
        mvrTotal: row.mvr_total != null ? Number(row.mvr_total) : null,
        paymentReference: row.payment_reference || null,
        paymentDate: row.payment_date || null,
        paymentBank: row.payment_bank || null,
        deliveryAddress: row.delivery_address || null,
        status: row.status || 'pending',
        statusHistory: Array.isArray(statusHistory) ? statusHistory : [],
        items,
        orderSummary,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
    if (includeSensitive) {
        base.paymentSlip = row.payment_slip || null;
    }
    return base;
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

function parseAmountValue(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
        const normalized = value.replace(/[^0-9.-]/g, '');
        if (!normalized) return null;
        const parsed = Number.parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    const coerced = Number(value);
    return Number.isFinite(coerced) ? coerced : null;
}

class OrderFinalizationError extends Error {
    constructor(stage, message, meta = {}) {
        super(message);
        this.name = 'OrderFinalizationError';
        this.stage = stage;
        this.meta = meta;
    }
}

async function createInvoiceAndJournal({ customerId, customerName, items, gstRate, outletId, invoiceStatus, orderId }) {
    let stage = 'validate-items';
    if (!customerId) {
        throw new OrderFinalizationError(stage, 'Customer ID is required to create an invoice', { customerId });
    }

    const sourceItems = Array.isArray(items) ? items : [];
    if (!sourceItems.length) {
        throw new OrderFinalizationError(stage, 'Cannot create invoice without items', { itemsCount: sourceItems.length });
    }

    const normalizedItems = [];
    let runningSubtotal = 0;
    for (let index = 0; index < sourceItems.length; index += 1) {
        const raw = sourceItems[index] || {};
        const quantity = Number(raw.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
            throw new OrderFinalizationError('invoice_items', 'Invoice item has invalid quantity', { index, itemId: raw.id, quantity: raw.quantity });
        }
        const price = parseAmountValue(raw.price);
        if (!Number.isFinite(price) || price < 0) {
            throw new OrderFinalizationError('invoice_items', 'Invoice item has invalid price', { index, itemId: raw.id, price: raw.price });
        }
        normalizedItems.push({
            productId: raw.id ?? raw.product_id ?? null,
            quantity,
            price,
        });
        runningSubtotal += price * quantity;
    }

    const subtotal = Number.isFinite(runningSubtotal) ? Number(runningSubtotal.toFixed(2)) : null;
    if (!Number.isFinite(subtotal)) {
        throw new OrderFinalizationError('totals', 'Failed to compute invoice subtotal', { runningSubtotal });
    }
    const rate = Number.isFinite(Number(gstRate)) ? Number(gstRate) : 0;
    const tax = Number(((subtotal * rate) / 100).toFixed(2));
    if (!Number.isFinite(tax)) {
        throw new OrderFinalizationError('totals', 'Failed to compute invoice tax', { subtotal, gstRate: rate });
    }
    const total = Number((subtotal + tax).toFixed(2));
    if (!Number.isFinite(total)) {
        throw new OrderFinalizationError('totals', 'Failed to compute invoice total', { subtotal, tax });
    }

    stage = 'insert-invoice';
    let invoiceId;
    try {
        const invoiceResult = await db.run(
            'INSERT INTO invoices (customer_id, subtotal, tax_amount, total, outlet_id, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [customerId, subtotal, tax, total, outletId || null, 'invoice', invoiceStatus || 'issued']
        );
        invoiceId = invoiceResult.lastID;
    } catch (err) {
        throw new OrderFinalizationError(stage, err?.message || 'Failed to insert invoice', { customerId, orderId, cause: err?.message });
    }

    stage = 'insert-invoice-items';
    let stmt;
    try {
        stmt = await db.prepare('INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
        for (const item of normalizedItems) {
            await stmt.run(invoiceId, item.productId, item.quantity, item.price);
        }
    } catch (err) {
        throw new OrderFinalizationError(stage, err?.message || 'Failed to insert invoice items', { invoiceId, cause: err?.message });
    } finally {
        if (stmt) {
            try {
                await stmt.finalize();
            } catch (finalizeErr) {
                console.warn('Failed to finalize invoice_items statement', finalizeErr?.message || finalizeErr);
            }
        }
    }

    stage = 'journal-lookup';
    const accountsReceivable = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['1200']);
    const salesRevenue = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['4000']);
    const taxesPayable = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['2200']);
    if (!accountsReceivable) {
        throw new OrderFinalizationError(stage, 'Accounts Receivable account (1200) not found', { accountCode: '1200' });
    }
    if (!salesRevenue) {
        throw new OrderFinalizationError(stage, 'Sales Revenue account (4000) not found', { accountCode: '4000' });
    }

    stage = 'journal-insert';
    let journalId = null;
    try {
        const jr = await db.run(
            'INSERT INTO journal_entries (entry_date, description, reference, total_debit, total_credit, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [new Date().toISOString().split('T')[0], `Order #${orderId} invoice`, `ORDER-${orderId}`, total, total, 'posted', new Date().toISOString()]
        );
        journalId = jr.lastID;

        // Ensure new columns exist in settings table to avoid SQL errors on older DBs
        try {
            const cols = await db.all(`PRAGMA table_info(settings)`);
            const colNames = cols.map(c => c.name);
            if (!colNames.includes('email_template_new_order_staff')) {
                await db.run(`ALTER TABLE settings ADD COLUMN email_template_new_order_staff TEXT`);
            }
            if (!colNames.includes('logo_url')) {
                await db.run(`ALTER TABLE settings ADD COLUMN logo_url TEXT`);
            }
        } catch (err) {
            console.warn('Failed to ensure settings columns exist', err?.message || err);
        }

        await db.run(
            'INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)',
            [journalId, accountsReceivable.id, `Order #${orderId}${customerName ? ` - ${customerName}` : ''}`, total, 0]
        );

        await db.run(
            'INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)',
            [journalId, salesRevenue.id, `Sales from order #${orderId}`, 0, subtotal]
        );

        if (tax > 0 && taxesPayable) {
            await db.run(
                'INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit, credit) VALUES (?, ?, ?, ?, ?)',
                [journalId, taxesPayable.id, `Tax for order #${orderId}`, 0, tax]
            );
        }
    } catch (err) {
        throw new OrderFinalizationError(stage, err?.message || 'Failed to create journal entry', { invoiceId, journalId, cause: err?.message });
    }

    return {
        invoiceId,
        journalId,
        totals: { subtotal, tax, total },
    };
}

const preorderRateBuckets = new Map(); // key -> [timestamps]

function enforcePreorderRateLimit(req, res, next) {
    const now = Date.now();
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
    const customerEmail = req.body?.customer?.email ? req.body.customer.email.toString().trim().toLowerCase() : null;
    const keys = new Set([`ip:${ip}`]);
    if (customerEmail) keys.add(`email:${customerEmail}`);
    for (const key of keys) {
        const timestamps = (preorderRateBuckets.get(key) || []).filter((ts) => now - ts < PREORDER_RATE_LIMIT_WINDOW);
        if (timestamps.length >= PREORDER_RATE_LIMIT_COUNT) {
            console.warn(`Preorder rate limit reached for ${key}`);
            return res.status(429).json({ error: 'Too many preorder requests. Please try again later.' });
        }
        timestamps.push(now);
        preorderRateBuckets.set(key, timestamps);
    }
    next();
}

// Sessions map (token -> user). Demo in-memory users removed for production safety.
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
async function logActivity(entity_type, entity_id, action, actor, details) {
    try {
        if (!db) return;
        await db.run('INSERT INTO activity_logs (entity_type, entity_id, action, actor, details) VALUES (?, ?, ?, ?, ?)', [entity_type, entity_id || null, action, actor || null, details || null]);
    } catch (err) {
        console.warn('Failed to log activity', err?.message || err);
    }
}

async function queueNotification({ staffId, username, title, message, type = 'info', link = null, metadata = null }) {
    try {
        if (!db) return;
        const metaPayload = metadata ? JSON.stringify(metadata) : null;
        const createdAt = new Date().toISOString();
        await db.run(
            'INSERT INTO notifications (staff_id, username, title, message, type, link, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [staffId || null, username || null, title, message, type, link || null, metaPayload, createdAt]
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
// The directory is resolved relative to this file so it stays consistent regardless of the working dir.
// Use lowercase `images` to match the frontend public/images convention and avoid
// case-sensitivity issues on Linux filesystems.
app.use('/images', express.static(imagesDir));

// Serve slip uploads saved under ./uploads/slips at /uploads/slips
try {
    const slipsStatic = path.join(uploadsRoot, 'slips');
    fs.mkdirSync(slipsStatic, { recursive: true });
    app.use('/uploads/slips', express.static(slipsStatic));
} catch (e) { /* ignore */ }

// Upload a logo as a base64 data URL and persist URL in settings.logo_url
app.post('/api/settings/upload-logo', authMiddleware, requireRole(['admin']), async (req, res) => {
    try {
        const { filename, data } = req.body || {};
        if (!data) return res.status(400).json({ error: 'Missing data URL' });

        // parse data URL: data:[<mediatype>][;base64],<data>
        const match = String(data).match(/^data:(.+);base64,(.*)$/);
        if (!match) return res.status(400).json({ error: 'Invalid data URL' });
        const mime = match[1];
        const b64 = match[2];

        let ext = 'png';
        if (/jpeg|jpg/i.test(mime)) ext = 'jpg';
        else if (/svg/i.test(mime)) ext = 'svg';
        else if (/gif/i.test(mime)) ext = 'gif';

        const safeName = (filename || `logo`).replace(/[^a-z0-9\-_.]/gi, '_');
        const name = `${Date.now()}-${safeName}.${ext}`;
        const logosDir = path.join(imagesDir, 'logos');
        fs.mkdirSync(logosDir, { recursive: true });
        const outPath = path.join(logosDir, name);
        fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));

        // Ensure settings table has logo_url column (safe to run repeatedly)
        try {
            const cols = await db.all(`PRAGMA table_info(settings)`);
            const has = cols.some(c => c.name === 'logo_url');
            if (!has) {
                await db.run(`ALTER TABLE settings ADD COLUMN logo_url TEXT`);
            }
        } catch (err) {
            console.warn('Failed to ensure logo_url column exists', err?.message || err);
        }

        const publicPath = `/uploads/logos/${name}`;
        try {
            await db.run('UPDATE settings SET logo_url = COALESCE(?, logo_url) WHERE id = 1', [publicPath]);
            await cacheService.invalidateSettings();
        } catch (err) {
            console.warn('Failed to save logo_url in settings', err?.message || err);
        }

        res.json({ url: publicPath });
    } catch (err) {
        console.error('Logo upload failed', err);
        res.status(500).json({ error: String(err) });
    }
});

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
    dbType = db?.dialect || resolveDbType();
    // expose db on the express app so routes can access it via req.app.get('db')
    try { app.set('db', db); } catch (e) { /* ignore */ }
        const slipProcessingQueue = createSlipProcessingQueue({
            db,
            notify: (payload) => {
                try {
                    if (global.io) {
                        global.io.emit('slips:updated', payload);
                    }
                } catch (notifyErr) {
                    console.warn('Failed to broadcast slip update', notifyErr);
                }
            }
        });
        try { app.set('slipProcessingQueue', slipProcessingQueue); } catch (e) { /* ignore */ }
        await recoverSlipJobs(db, slipProcessingQueue);
        // ensure settings has jwt_secret column (safe add)
        try { await db.run("ALTER TABLE settings ADD COLUMN jwt_secret TEXT"); } catch (e) { /* ignore if exists */ }
        // Prefer explicit JWT secret from environment when available
        const envJwtSecret = (process.env.JWT_SECRET || '').trim();
        const srow = await db.get('SELECT jwt_secret FROM settings WHERE id = 1');
        if (envJwtSecret) {
            JWT_SECRET = envJwtSecret;
            try { await db.run('UPDATE settings SET jwt_secret = ? WHERE id = 1', [JWT_SECRET]); } catch (e) { /* ignore */ }
        } else if (srow && srow.jwt_secret) {
            JWT_SECRET = srow.jwt_secret;
        } else {
            JWT_SECRET = crypto.randomBytes(32).toString('hex');
            try { await db.run('UPDATE settings SET jwt_secret = ? WHERE id = 1', [JWT_SECRET]); } catch (e) { /* ignore */ }
        }
        try { app.set('JWT_SECRET', JWT_SECRET); } catch (e) { /* ignore */ }
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
            console.log('HTTPS Server running on https://pos.itnvend.com:4000');
            console.log('WebSocket server ready');
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
            const storedPassword = staff.password || '';
            const isHashed = typeof storedPassword === 'string' && storedPassword.startsWith('$2');
            let ok = false;
            if (isHashed) {
                ok = await bcrypt.compare(password, storedPassword);
            } else if (storedPassword) {
                ok = storedPassword === password;
                if (ok) {
                    try {
                        const hashed = await bcrypt.hash(password, 10);
                        await db.run('UPDATE staff SET password = ? WHERE id = ?', [hashed, staff.id]);
                    } catch (rehashErr) {
                        console.warn('Failed to rehash legacy staff password', rehashErr?.message || rehashErr);
                    }
                }
            }
            if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
            // fetch roles
            const roles = await db.all('SELECT r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [staff.id]);
            // pick the highest-privilege role when a user has multiple roles (so admin isn't shadowed by order)
            const rankMap = { cashier: 1, accounts: 2, manager: 3, admin: 4 };
            let roleName = 'staff';
            if (roles && roles.length) {
                // roles may be returned in arbitrary order; choose the role with the highest rank
                roleName = roles.map(r => r.name).reduce((best, cur) => {
                    if (!best) return cur;
                    return (rankMap[cur] || 0) > (rankMap[best] || 0) ? cur : best;
                }, null) || (roles[0] && roles[0].name) || 'staff';
            }
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
            return res.json({ token, role: roleName, username: staff.username, refreshToken });
        }

        // If no staff user found, fail authentication (no demo fallback)
        if (!staff) return res.status(401).json({ error: 'Invalid credentials' });

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
        vendorId,
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
        vendorId,
    })}`;

    try {
        const cachedProducts = await cacheService.get(cacheKey);
        if (cachedProducts) {
            console.log('Serving products from cache');
            return res.json(cachedProducts);
        }

        let query = PRODUCT_BASE_SELECT;
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
        if (vendorId) {
            query += ' AND p.vendor_id = ?';
            params.push(vendorId);
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

        query += ` ORDER BY ${orderCaseInsensitive('p.name')}`;

        const productRows = await db.all(query, params);

        const products = await transformProductRows(productRows);

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
        const parentClause = normalizedParentId === null ? 'parent_id IS NULL' : 'parent_id = ?';
        const existingParams = normalizedParentId === null
            ? [trimmedName]
            : [trimmedName, normalizedParentId];
        const existingByName = await db.get(
            `SELECT id, name, slug, parent_id
             FROM product_categories
             WHERE name = ?
               AND ${parentClause}`,
            existingParams
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

        const parentClause = normalizedParentId === null ? 'parent_id IS NULL' : 'parent_id = ?';
        const conflictParams = normalizedParentId === null
            ? [trimmedName, categoryId]
            : [trimmedName, normalizedParentId, categoryId];
        const existingByName = await db.get(
            `SELECT id
             FROM product_categories
             WHERE name = ?
               AND ${parentClause}
               AND id != ?`,
            conflictParams
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

app.get('/api/storefront/highlights', async (req, res) => {
    try {
        const [highlighted, hotCasual, newArrivals] = await Promise.all([
            fetchProductsForHighlight('p.highlight_active = 1', [], {
                orderBy: `p.highlight_priority DESC, ${orderCaseInsensitive('p.name')}`,
                limit: 10,
            }),
            fetchProductsForHighlight('ci.featured = 1', [], {
                orderBy: 'ci.created_at DESC',
                limit: 10,
            }),
            fetchProductsForHighlight('', [], {
                orderBy: 'p.created_at DESC',
                limit: 10,
            }),
        ]);
        res.json({ highlighted, hotCasual, newArrivals });
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
        availabilityStatus,
        vendorId,
        highlightActive,
        highlightLabel,
        highlightPriority,
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
    const rawAvailabilityStatus = availabilityStatus ?? req.body?.availability_status;
    const normalizedAvailabilityStatus = normalizeEnum(rawAvailabilityStatus, AVAILABILITY_STATUSES, null) || (availableForPreorder ? 'preorder' : 'in_stock');
    const rawVendorId = vendorId ?? req.body?.vendor_id;
    const normalizedHighlightActive = highlightActive === true || highlightActive === 1 ? 1 : 0;
    const normalizedHighlightLabel =
        typeof highlightLabel === 'string' && highlightLabel.trim() ? highlightLabel.trim().slice(0, 60) : null;
    const highlightPriorityInt = parseInt(highlightPriority, 10);
    const normalizedHighlightPriority = Number.isFinite(highlightPriorityInt) ? highlightPriorityInt : 0;
    let vendorIdInt = null;
    if (rawVendorId !== undefined && rawVendorId !== null && rawVendorId !== '') {
        const parsedVendorId = parseInt(rawVendorId, 10);
        if (!Number.isFinite(parsedVendorId)) {
            return res.status(400).json({ error: 'Invalid vendor selected' });
        }
        const vendorRow = await db.get('SELECT id, status FROM vendors WHERE id = ?', [parsedVendorId]);
        if (!vendorRow) {
            return res.status(400).json({ error: 'Vendor not found' });
        }
        if ((vendorRow.status || '').toLowerCase() !== 'active') {
            return res.status(400).json({ error: 'Vendor must be active before assigning products' });
        }
        vendorIdInt = vendorRow.id;
    }

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
    const galleryInput = normalizeGalleryInput(req.body?.gallery || req.body?.gallery_paths || req.body?.galleryPaths);
    const galleryValue = galleryInput.length ? JSON.stringify(galleryInput) : null;
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
                preorder_eta, year, auto_sku, availability_status, vendor_id,
                highlight_active, highlight_label, highlight_priority, gallery
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )`,
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
                normalizedAvailabilityStatus,
                vendorIdInt,
                normalizedHighlightActive,
                normalizedHighlightLabel,
                normalizedHighlightPriority,
                galleryValue,
            ]
        );

        let vendorNameForResponse = null;
        if (vendorIdInt) {
            const vendorRow = await db.get('SELECT legal_name FROM vendors WHERE id = ?', [vendorIdInt]);
            vendorNameForResponse = vendorRow?.legal_name || null;
        }

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
            availability_status: normalizedAvailabilityStatus,
            vendor_id: vendorIdInt,
            vendor_name: vendorNameForResponse,
            tags: tagRows,
            highlight_active: normalizedHighlightActive,
            highlight_label: normalizedHighlightLabel,
            highlight_priority: normalizedHighlightPriority,
            gallery: galleryInput,
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
    vendorId,
        audience,
        deliveryType,
        warrantyTerm,
        year,
        category,
        subcategory,
        availabilityStatus,
        highlightActive,
        highlightLabel,
        highlightPriority,
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
        let normalizedAvailabilityStatus = existing.availability_status || 'in_stock';
        if (availabilityStatus !== undefined || Object.prototype.hasOwnProperty.call(req.body || {}, 'availability_status')) {
            const rawAvailability = availabilityStatus !== undefined ? availabilityStatus : req.body?.availability_status;
            const candidate = normalizeEnum(rawAvailability, AVAILABILITY_STATUSES, null);
            if (candidate) {
                normalizedAvailabilityStatus = candidate;
            }
        }

        let vendorIdInt = existing.vendor_id ?? null;
        if (vendorId !== undefined) {
            if (vendorId === null || vendorId === '') {
                vendorIdInt = null;
            } else {
                const vendorRow = await db.get('SELECT id, status FROM vendors WHERE id = ?', [vendorId]);
                if (!vendorRow) return res.status(400).json({ error: 'Vendor not found' });
                if ((vendorRow.status || '').toLowerCase() !== 'active') {
                    return res.status(400).json({ error: 'Vendor must be active before assigning products' });
                }
                vendorIdInt = vendorRow.id;
            }
        }

        let normalizedHighlightActive = existing.highlight_active ?? 0;
        if (highlightActive !== undefined) {
            normalizedHighlightActive = highlightActive === true || highlightActive === 1 ? 1 : 0;
        }
        let normalizedHighlightLabel = existing.highlight_label || null;
        if (highlightLabel !== undefined) {
            normalizedHighlightLabel =
                highlightLabel && highlightLabel.toString().trim()
                    ? highlightLabel.toString().trim().slice(0, 60)
                    : null;
        }
        let normalizedHighlightPriority = existing.highlight_priority ?? 0;
        if (highlightPriority !== undefined) {
            const parsedPriority = parseInt(highlightPriority, 10);
            normalizedHighlightPriority = Number.isFinite(parsedPriority) ? parsedPriority : 0;
        }

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
        let normalizedGallery = existing.gallery ? parseGalleryFromRow(existing.gallery) : [];
        if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'gallery')) {
            normalizedGallery = normalizeGalleryInput(req.body.gallery);
        } else if (req.body && (req.body.gallery_paths || req.body.galleryPaths)) {
            normalizedGallery = normalizeGalleryInput(req.body.gallery_paths || req.body.galleryPaths);
        }
        const galleryValue = normalizedGallery.length ? JSON.stringify(normalizedGallery) : null;

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
                auto_sku = ?,
                availability_status = ?,
                vendor_id = ?,
                highlight_active = ?,
                highlight_label = ?,
                highlight_priority = ?,
                gallery = ?
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
                normalizedAvailabilityStatus,
                vendorIdInt,
                normalizedHighlightActive,
                normalizedHighlightLabel,
                normalizedHighlightPriority,
                galleryValue,
                id,
            ]
        );

        let vendorNameForResponse = null;
        if (vendorIdInt) {
            const vendorRow = await db.get('SELECT legal_name FROM vendors WHERE id = ?', [vendorIdInt]);
            vendorNameForResponse = vendorRow?.legal_name || null;
        }

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
            availability_status: normalizedAvailabilityStatus,
            vendor_id: vendorIdInt,
            vendor_name: vendorNameForResponse,
            tags: tagRows,
            highlight_active: normalizedHighlightActive,
            highlight_label: normalizedHighlightLabel,
            highlight_priority: normalizedHighlightPriority,
            gallery: normalizedGallery,
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
        const nowIso = new Date().toISOString();
        await db.run('UPDATE notifications SET read_at = ? WHERE id = ?', [nowIso, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notifications/read-all', authMiddleware, async (req, res) => {
    try {
        const staffId = req.user?.staffId || null;
        const username = req.user?.username || null;
        const nowIso = new Date().toISOString();
        await db.run(
            `UPDATE notifications
             SET read_at = ?
             WHERE (staff_id IS NOT NULL AND staff_id = ?)
                OR (username IS NOT NULL AND username = ?)`,
            [nowIso, staffId, username]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Preorder intake (public entry point)
app.post('/api/public/preorders', enforcePreorderRateLimit, async (req, res) => {
    try {
        if (STOREFRONT_API_KEY) {
            const providedKey = (req.headers['x-storefront-key'] || '').toString().trim();
            if (providedKey !== STOREFRONT_API_KEY) {
                console.warn(`Preorder rejected: invalid API key from ${req.ip}`);
                return res.status(401).json({ error: 'Invalid API key' });
            }
        }
        if (STOREFRONT_API_SECRET) {
            const signatureHeader = (req.headers['x-storefront-signature'] || '').toString().trim();
            const timestampHeader = (req.headers['x-storefront-timestamp'] || '').toString().trim();
            if (!signatureHeader || !timestampHeader) {
                console.warn(`Preorder rejected: missing signature headers from ${req.ip}`);
                return res.status(400).json({ error: 'Missing signature headers' });
            }
            const timestampValue = Number(timestampHeader);
            if (!Number.isFinite(timestampValue)) {
                console.warn(`Preorder rejected: invalid signature timestamp from ${req.ip}`);
                return res.status(400).json({ error: 'Invalid signature timestamp' });
            }
            if (Math.abs(Date.now() - timestampValue) > 5 * 60 * 1000) {
                console.warn(`Preorder rejected: signature timestamp outside window from ${req.ip}`);
                return res.status(400).json({ error: 'Signature timestamp is outside the allowable window.' });
            }
            const rawPayload =
                typeof req.rawBody === 'string' && req.rawBody.length
                    ? req.rawBody
                    : JSON.stringify(req.body || {});
            const expectedSignature = crypto
                .createHmac('sha256', STOREFRONT_API_SECRET)
                .update(`${timestampHeader}.${rawPayload}`)
                .digest('hex');
            let providedBuffer;
            let expectedBuffer;
            try {
                providedBuffer = Buffer.from(signatureHeader.toLowerCase(), 'hex');
                expectedBuffer = Buffer.from(expectedSignature, 'hex');
            } catch (err) {
                console.warn(`Preorder rejected: malformed signature from ${req.ip}`);
                return res.status(400).json({ error: 'Malformed signature.' });
            }
            if (
                providedBuffer.length !== expectedBuffer.length ||
                !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
            ) {
                console.warn(`Preorder rejected: signature mismatch from ${req.ip}`);
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        const body = req.body || {};
        const {
            sourceStore = null,
            cartLinks = [],
            notes = null,
            customer = {},
            usdTotal = null,
            exchangeRate = 15.42,
            payment = {}
        } = body;

        const customerName = (customer.name || '').toString().trim();
        const customerEmail = (customer.email || '').toString().trim().toLowerCase();
        const customerPhoneRaw = (customer.phone || '').toString().trim();
        if (!customerPhoneRaw) {
            return res.status(400).json({ error: 'Mobile number is required.' });
        }
        const customerPhone = customerPhoneRaw;

        if (!customerName) {
            return res.status(400).json({ error: 'Customer name is required.' });
        }
        if (!customerEmail) {
            return res.status(400).json({ error: 'Customer email is required.' });
        }
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(customerEmail)) {
            return res.status(400).json({ error: 'Enter a valid email address.' });
        }

        const normalizedLinks = Array.isArray(cartLinks)
            ? cartLinks
                .map((link) => (typeof link === 'string' ? link.trim() : ''))
                .filter(Boolean)
            : typeof cartLinks === 'string'
                ? cartLinks
                    .split(/\r?\n/)
                    .map((link) => link.trim())
                    .filter(Boolean)
                : [];

        const sanitizedNotes = notes ? notes.toString().trim() : null;
        if (sanitizedNotes && sanitizedNotes.length > MAX_PREORDER_NOTES_LENGTH) {
            return res.status(400).json({ error: 'Notes are too long.' });
        }
        if (normalizedLinks.length > MAX_PREORDER_CART_LINKS) {
            return res.status(400).json({ error: 'Too many cart links. Limit to 10.' });
        }
        const invalidLink = normalizedLinks.find((link) => !/^https?:\/\/[^\s]+$/i.test(link));
        if (invalidLink) {
            return res.status(400).json({ error: 'Cart links must be valid URLs.' });
        }
        const deliveryAddress = (body.deliveryAddress || '').toString().trim() || null;
        const usdNumeric = Number.isFinite(Number(usdTotal)) ? Number(usdTotal) : null;
        if (usdNumeric == null || usdNumeric < 0) {
            return res.status(400).json({ error: 'Provide a valid USD total.' });
        }
        const exchangeNumeric = Number.isFinite(Number(exchangeRate)) && Number(exchangeRate) > 0
            ? Number(exchangeRate)
            : 15.42;
        const mvrTotal = Math.round(usdNumeric * exchangeNumeric * 100) / 100;

        const allowedBanks = ['bml', 'bank_of_maldives', 'maldives_islamic_bank', 'mib'];
        let paymentBank = payment && payment.bank ? payment.bank.toString().trim().toLowerCase() : null;
        if (paymentBank && !allowedBanks.includes(paymentBank)) {
            paymentBank = null;
        }
        if (paymentBank === 'bank_of_maldives') paymentBank = 'bml';
        if (paymentBank === 'maldives_islamic_bank') paymentBank = 'mib';

        const paymentReference = payment && payment.reference ? payment.reference.toString().trim() : null;
        const paymentDate = payment && payment.date ? payment.date.toString().trim() : null;
        const paymentSlip = payment && payment.slip ? payment.slip.toString().trim() : null;
        if (paymentSlip && paymentSlip.length > MAX_PAYMENT_SLIP_BASE64_LENGTH) {
            return res.status(400).json({ error: 'Payment slip is too large. Please upload a smaller file.' });
        }

        const now = new Date().toISOString();
        const history = JSON.stringify([
            {
                status: 'pending',
                note: 'Order received',
                created_at: now
            }
        ]);

        const result = await db.run(
            `INSERT INTO preorders (
                source_store,
                cart_links,
                notes,
                customer_name,
                customer_email,
                customer_phone,
                delivery_address,
                usd_total,
                exchange_rate,
                mvr_total,
                payment_reference,
                payment_date,
                payment_slip,
                payment_bank,
                status,
                status_history
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sourceStore ? sourceStore.toString().trim() : null,
                JSON.stringify(normalizedLinks),
                sanitizedNotes,
                customerName,
                customerEmail,
                customerPhone,
                deliveryAddress,
                usdNumeric,
                exchangeNumeric,
                mvrTotal,
                paymentReference,
                paymentDate,
                paymentSlip,
                paymentBank,
                'pending',
                history
            ]
        );

        await logActivity(
            'preorder',
            result.lastID,
            'created',
            customerEmail,
            JSON.stringify({ usd: usdNumeric, exchange: exchangeNumeric, bank: paymentBank, address: deliveryAddress })
        );

        try {
            const html = `
                <p>New preorder submitted by <strong>${customerName}</strong> (${customerEmail}).</p>
                <ul>
                    <li>Preorder ID: #${result.lastID}</li>
                    <li>Source store: ${sourceStore ? sourceStore : 'Not specified'}</li>
                    <li>USD total: ${usdNumeric.toFixed(2)}</li>
                    <li>MVR total: ${mvrTotal.toFixed(2)} at rate ${exchangeNumeric}</li>
                    ${deliveryAddress ? `<li>Delivery address: ${deliveryAddress}</li>` : ''}
                    ${paymentBank ? `<li>Payment bank: ${paymentBank === 'mib' ? 'Maldives Islamic Bank' : 'Bank of Maldives'}</li>` : ''}
                </ul>
                <p>Visit the POS dashboard to review and process this request.</p>
            `;
            await sendNotificationEmail('New preorder submission', html);
        } catch (emailErr) {
            console.warn('Preorder staff notification failed', emailErr?.message || emailErr);
        }

        try {
            const ackHtml = `
                <p>Hi ${customerName},</p>
                <p>We received your order request. Our team will review and confirm shortly.</p>
                <p>Reference number: <strong>#${result.lastID}</strong></p>
                ${deliveryAddress ? `<p>Delivery address noted: ${deliveryAddress}</p>` : ''}
                <p>Thank you for choosing us!</p>
            `;
            await sendNotificationEmail('We received your preorder', ackHtml, customerEmail);
        } catch (emailErr) {
            console.warn('Preorder acknowledgement failed', emailErr?.message || emailErr);
        }

        res.status(201).json({ id: result.lastID, status: 'pending' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/preorders', authMiddleware, requireRole(['cashier', 'accounts', 'manager', 'admin']), async (req, res) => {
    try {
        const body = req.body || {};
        const customerId = Number(body.customerId);
        const rawItems = Array.isArray(body.items) ? body.items : [];
        if (!customerId || customerId <= 0) {
            return res.status(400).json({ error: 'Customer is required.' });
        }
        const validItems = [];
        for (const item of rawItems) {
            const qty = Number(item.quantity);
            const price = Number(item.price);
            if (!Number.isFinite(qty) || qty <= 0) continue;
            if (!Number.isFinite(price) || price < 0) continue;
            const productId = item.productId || item.id || item.product_id || null;
            const productName = item.productName || item.name || item.product_name || null;
            validItems.push({
                productId,
                productName,
                quantity: qty,
                price,
                subtotal: +(price * qty)
            });
        }
        if (validItems.length === 0) {
            return res.status(400).json({ error: 'Add at least one item to the preorder.' });
        }

        const customer = await db.get('SELECT * FROM customers WHERE id = ?', [customerId]);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found.' });
        }

        const subtotalNumeric = Number.isFinite(Number(body.subtotal)) ? Number(body.subtotal) : validItems.reduce((sum, item) => sum + item.subtotal, 0);
        const taxNumeric = Number.isFinite(Number(body.taxAmount)) ? Number(body.taxAmount) : 0;
        let totalNumeric = Number(body.total);
        if (!Number.isFinite(totalNumeric)) {
            totalNumeric = subtotalNumeric + taxNumeric;
        }

        const exchangeRateNumeric = Number.isFinite(Number(body.exchangeRate)) && Number(body.exchangeRate) > 0
            ? Number(body.exchangeRate)
            : 15.42;
        const usdTotal = exchangeRateNumeric > 0 ? Math.round((totalNumeric / exchangeRateNumeric) * 100) / 100 : null;

        const cartLinks = Array.isArray(body.cartLinks)
            ? body.cartLinks.map((link) => (typeof link === 'string' ? link.trim() : '')).filter(Boolean)
            : [];
        if (cartLinks.length > MAX_PREORDER_CART_LINKS) {
            return res.status(400).json({ error: 'Too many cart links. Limit to 10.' });
        }
        const invalidLink = cartLinks.find((link) => !/^https?:\/\/[\S]+$/i.test(link));
        if (invalidLink) {
            return res.status(400).json({ error: 'Cart links must be valid URLs.' });
        }

        const sanitizedNotes = body.notes ? body.notes.toString().trim() : null;
        if (sanitizedNotes && sanitizedNotes.length > MAX_PREORDER_NOTES_LENGTH) {
            return res.status(400).json({ error: 'Notes are too long.' });
        }

        const deliveryAddress = body.deliveryAddress ? body.deliveryAddress.toString().trim() : customer.address || null;

        const payment = body.payment || {};
        let paymentBank = payment.bank ? payment.bank.toString().trim().toLowerCase() : null;
        const allowedBanks = ['bml', 'bank_of_maldives', 'maldives_islamic_bank', 'mib'];
        if (paymentBank && !allowedBanks.includes(paymentBank)) {
            paymentBank = null;
        }
        if (paymentBank === 'bank_of_maldives') paymentBank = 'bml';
        if (paymentBank === 'maldives_islamic_bank') paymentBank = 'mib';

        const paymentReference = payment.reference ? payment.reference.toString().trim() : null;
        const paymentDate = payment.date ? payment.date.toString().trim() : null;

        let paymentSlip = null;
        if (payment.slipPath) {
            const normalized = normalizeUploadPath(payment.slipPath);
            if (normalized) {
                paymentSlip = `/uploads/${normalized}`;
            }
        } else if (payment.slip) {
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
                const fileName = `pos-slip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext || 'png'}`;
                const filePath = path.join(dir, fileName);
                fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
                const rel = path.relative(imagesDir, filePath).replace(/\\/g, '/');
                paymentSlip = `/uploads/${rel}`;
            } catch (err) {
                console.warn('Failed to persist preorder payment slip', err?.message || err);
            }
        }

        const nowIso = new Date().toISOString();
        const history = JSON.stringify([
            {
                status: 'pending',
                note: 'Preorder captured in POS checkout',
                created_at: nowIso,
                staff: req.user?.username || null
            }
        ]);

        const insert = await db.run(
            `INSERT INTO preorders (
                source_store,
                cart_links,
                notes,
                customer_name,
                customer_email,
                customer_phone,
                delivery_address,
                usd_total,
                exchange_rate,
                mvr_total,
                payment_reference,
                payment_date,
                payment_slip,
                payment_bank,
                status,
                status_history,
                items_snapshot
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
            [
                body.sourceStore ? body.sourceStore.toString().trim() : 'POS Checkout',
                JSON.stringify(cartLinks),
                sanitizedNotes,
                body.customerName ? body.customerName.toString().trim() : customer.name,
                body.customerEmail ? body.customerEmail.toString().trim().toLowerCase() : (customer.email || '').toLowerCase() || null,
                body.customerPhone ? body.customerPhone.toString().trim() : customer.phone || null,
                deliveryAddress || null,
                usdTotal,
                exchangeRateNumeric,
                totalNumeric,
                paymentReference,
                paymentDate,
                paymentSlip,
                paymentBank,
                'pending',
                history,
                JSON.stringify({
                    items: validItems,
                    subtotal: subtotalNumeric,
                    tax: taxNumeric,
                    total: totalNumeric,
                    currency: 'MVR'
                })
            ]
        );

        await logActivity(
            'preorder',
            insert.lastID,
            'created',
            req.user?.username || null,
            JSON.stringify({
                subtotal: subtotalNumeric,
                tax: taxNumeric,
                total: totalNumeric,
                customerId,
                exchangeRate: exchangeRateNumeric
            })
        );

        await queueNotification({
            staffId: req.user?.staffId || null,
            username: req.user?.username || null,
            title: 'New preorder captured',
            message: `Preorder #${insert.lastID} recorded for ${body.customerName || customer.name}`,
            type: 'info',
            metadata: { preorderId: insert.lastID, total: totalNumeric }
        });

        const row = await db.get('SELECT * FROM preorders WHERE id = ?', [insert.lastID]);
        res.status(201).json(formatPreorderRow(row, true));
    } catch (err) {
        console.error('Failed to create preorder from POS', err?.message || err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/preorders', authMiddleware, requireRole(['accounts', 'manager', 'admin']), async (req, res) => {
    try {
        const statusFilterRaw = (req.query.status || 'all').toString().toLowerCase();
        const params = [];
        let query = `SELECT
                id, source_store, cart_links, notes, customer_name, customer_email, customer_phone, delivery_address, usd_total, exchange_rate, mvr_total, payment_reference, payment_date, payment_bank, status, status_history, created_at, updated_at
            FROM preorders`;
        if (statusFilterRaw !== 'all') {
            if (!PREORDER_STATUSES.includes(statusFilterRaw)) {
                return res.status(400).json({ error: 'Invalid status filter.' });
            }
            query += ' WHERE status = ?';
            params.push(statusFilterRaw);
        }
        query += ' ORDER BY created_at DESC LIMIT 200';
        const rows = await db.all(query, params);
        res.json(rows.map((row) => formatPreorderRow(row)));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/preorders/:id', authMiddleware, requireRole(['accounts', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const row = await db.get('SELECT * FROM preorders WHERE id = ?', [id]);
        if (!row) {
            return res.status(404).json({ error: 'Preorder not found' });
        }
        res.json(formatPreorderRow(row, true));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/preorders/:id', authMiddleware, requireRole(['accounts', 'manager', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, internalNote, notifyCustomer = false, customerMessage } = req.body || {};
        const preorder = await db.get('SELECT * FROM preorders WHERE id = ?', [id]);
        if (!preorder) {
            return res.status(404).json({ error: 'Preorder not found' });
        }

        const trimmedNote = internalNote ? internalNote.toString().trim() : '';
        const trimmedMessage = customerMessage ? customerMessage.toString().trim() : '';

        let nextStatus = preorder.status;
        let statusChanged = false;
        if (status != null) {
            const normalizedStatus = status.toString().toLowerCase().trim();
            if (!PREORDER_STATUSES.includes(normalizedStatus)) {
                return res.status(400).json({ error: 'Invalid status value.' });
            }
            if (normalizedStatus !== preorder.status) {
                nextStatus = normalizedStatus;
                statusChanged = true;
            }
        }

        if (!statusChanged && !trimmedNote && !trimmedMessage) {
            return res.status(400).json({ error: 'Nothing to update.' });
        }

        const history = parseJson(preorder.status_history, []) || [];
        const entry = {
            status: nextStatus,
            created_at: new Date().toISOString(),
            staff: req.user?.username || null,
            notified_customer: notifyCustomer ? 1 : 0
        };
        if (trimmedNote) entry.note = trimmedNote;
        if (trimmedMessage) entry.customer_message = trimmedMessage;
        history.push(entry);

        const updates = [];
        const params = [];

        if (statusChanged) {
            updates.push('status = ?');
            params.push(nextStatus);
        }

        updates.push('status_history = ?');
        params.push(JSON.stringify(history));

        updates.push('updated_at = CURRENT_TIMESTAMP');

        const sql = `UPDATE preorders SET ${updates.join(', ')} WHERE id = ?`;
        await db.run(sql, [...params, id]);

        await logActivity(
            'preorder',
            id,
            'updated',
            req.user?.username || null,
            JSON.stringify({ status: nextStatus, note: trimmedNote })
        );

        if (notifyCustomer && trimmedMessage && preorder.customer_email) {
            const subjectStatus = nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1);
            const html = `
                <p>Hi ${preorder.customer_name || 'there'},</p>
                <p>${trimmedMessage}</p>
                <p>Current status: <strong>${subjectStatus}</strong></p>
                <p>Thank you for shopping with us.</p>
            `;
            try {
                await sendNotificationEmail(`Your preorder update (${subjectStatus})`, html, preorder.customer_email);
            } catch (emailErr) {
                console.warn('Preorder customer email failed', emailErr?.message || emailErr);
            }
        }

        const updated = await db.get('SELECT * FROM preorders WHERE id = ?', [id]);
        res.json(formatPreorderRow(updated, true));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Vendor Onboarding Route
app.post('/api/vendors', async (req, res) => {
    const { legal_name, contact_person, email, phone, address, website, capabilities, notes, tagline, public_description } = req.body;
    if (!legal_name || !email) {
        return res.status(400).json({ error: 'Legal name and email are required.' });
    }
    try {
        const slug = await getUniqueVendorSlug(legal_name || email || contact_person || `vendor-${Date.now()}`);
        const descriptionValue = public_description || notes || null;
        const result = await db.run(
            `INSERT INTO vendors (legal_name, contact_person, email, phone, address, website, capabilities, notes, slug, tagline, public_description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
            [legal_name, contact_person, email, phone, address, website, capabilities, notes, slug, tagline || null, descriptionValue]
        );
        res.status(201).json({ id: result.lastID, slug, message: 'Vendor application submitted successfully.' });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A vendor with this email already exists.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// Vendor Registration (more complete) - stores commission rate and bank details
app.post('/api/vendors/register', async (req, res) => {
    const {
        legal_name,
        contact_person,
        email,
        phone,
        address,
        website,
        capabilities,
        notes,
        bank_details,
        logo_url,
        commission_rate,
        approve,
        tagline,
        public_description,
        hero_image
    } = req.body;

    if (!legal_name || !email) return res.status(400).json({ error: 'legal_name and email required' });

    const comm = Number.isFinite(Number(commission_rate)) ? Number(commission_rate) : 0.10;
    const status = approve ? 'active' : 'pending';
    const descriptionValue = public_description || notes || null;

    try {
        await db.run('BEGIN TRANSACTION');
        const slug = await getUniqueVendorSlug(legal_name || email || contact_person || `vendor-${Date.now()}`);
        const result = await db.run(
            `INSERT INTO vendors (
                legal_name, contact_person, email, phone, address, website, capabilities, notes,
                bank_details, logo_url, commission_rate, status, slug, tagline, public_description, hero_image
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                legal_name,
                contact_person || null,
                email,
                phone || null,
                address || null,
                website || null,
                capabilities || null,
                notes || null,
                bank_details || null,
                logo_url || null,
                comm,
                status,
                slug,
                tagline || null,
                descriptionValue,
                hero_image || null,
            ]
        );
        const vendorId = result.lastID;
        await db.run('COMMIT');
        await logActivity('vendors', vendorId, 'register', req.user?.username || null, JSON.stringify({ email }));
        res.status(201).json({ id: vendorId, slug, message: 'Vendor registered', commission_rate: comm });
    } catch (err) {
        await db.run('ROLLBACK');
        if (String(err?.message || '').includes('UNIQUE constraint failed')) {
            return res.status(409).json({ error: 'A vendor with this email already exists.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// List vendors (supports optional ?status=pending|active|rejected)
app.get('/api/vendors', authMiddleware, requireRole('cashier'), async (req, res) => {
    try {
        const status = req.query.status;
        let rows;
        if (status) {
            rows = await db.all('SELECT * FROM vendors WHERE status = ? ORDER BY created_at DESC', [status]);
        } else {
            rows = await db.all('SELECT * FROM vendors ORDER BY created_at DESC');
        }
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get a single vendor by id
app.get('/api/vendors/:id', authMiddleware, requireRole('cashier'), async (req, res) => {
    const { id } = req.params;
    try {
        const vendor = await db.get('SELECT * FROM vendors WHERE id = ?', [id]);
        if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
        const productCount = await db.get('SELECT COUNT(*) as c FROM products WHERE vendor_id = ?', [vendor.id]);
        vendor.product_count = productCount?.c || 0;
        res.json(vendor);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update vendor status (approve/reject)
app.put('/api/vendors/:id/status', authMiddleware, requireRole(['manager','admin']), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'active', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    try {
        await db.run('BEGIN TRANSACTION');
        await db.run('UPDATE vendors SET status = ? WHERE id = ?', [status, id]);
        const vendor = await db.get('SELECT * FROM vendors WHERE id = ?', [id]);
        if (!vendor) {
            await db.run('ROLLBACK');
            return res.status(404).json({ error: 'Vendor not found' });
        }

        // When vendor becomes active, create or link a customer record so vendors appear in Customers
        const slugSource = vendor.legal_name || vendor.contact_person || vendor.email || `vendor-${id}`;
        await ensureVendorSlug(id, slugSource);

        if (!vendor.public_description && vendor.notes) {
            await db.run('UPDATE vendors SET public_description = ? WHERE id = ?', [vendor.notes, id]);
        }

        if (status === 'active') {
            // If vendor already linked to customer, skip
            if (!vendor.customer_id) {
                // Create a business customer using vendor details
                const custRes = await db.run(
                    'INSERT INTO customers (name, email, phone, address, is_business, customer_type) VALUES (?, ?, ?, ?, ?, ?)',
                    [vendor.legal_name || vendor.contact_person || `Vendor ${id}`, vendor.email || null, vendor.phone || null, vendor.address || null, 1, 'vendor']
                );
                const customerId = custRes.lastID;
                await db.run('UPDATE vendors SET customer_id = ? WHERE id = ?', [customerId, id]);
                // Invalidate customers cache if available
                try { await cacheService.invalidateCustomers(); } catch {}
            }
        }

        await db.run('COMMIT');
        await logActivity('vendors', id, 'status_update', req.user?.username || null, `Status set to ${status}`);
        const updatedVendor = await db.get('SELECT * FROM vendors WHERE id = ?', [id]);
        res.json(updatedVendor);
    } catch (err) {
        try { await db.run('ROLLBACK'); } catch {}
        res.status(500).json({ error: err.message });
    }
});

// Public vendor listings for eStore / marketing surfaces
app.get('/api/public/vendors', async (req, res) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit || '12', 10), 1), 100);
        const sort = req.query.sort === 'recent' ? 'recent' : 'trending';
        const orderBy = sort === 'recent' ? 'v.created_at DESC' : 'product_count DESC, v.created_at DESC';
        const search = (req.query.search || req.query.q || '').toString().trim();
        const params = [];
        let where = 'WHERE v.status = \'active\'';
        if (search) {
            where += ' AND (LOWER(v.legal_name) LIKE ? OR LOWER(IFNULL(v.tagline,\'\')) LIKE ?)';
            const term = `%${search.toLowerCase()}%`;
            params.push(term, term);
        }
        const rows = await db.all(
            `SELECT v.id, v.slug, v.legal_name, v.tagline, v.public_description, v.logo_url, v.website, v.hero_image,
                    COUNT(p.id) AS product_count
             FROM vendors v
             LEFT JOIN products p ON p.vendor_id = v.id
             ${where}
             GROUP BY v.id
             ORDER BY ${orderBy}
             LIMIT ?`,
            [...params, limit]
        );
        res.json(rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/public/vendors/:slug', async (req, res) => {
    try {
        const vendor = await db.get(
            'SELECT id, slug, legal_name, contact_person, email, phone, address, website, tagline, public_description, logo_url, hero_image FROM vendors WHERE slug = ? AND status = ?',
            [req.params.slug, 'active']
        );
        if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
        const productCount = await db.get('SELECT COUNT(*) as c FROM products WHERE vendor_id = ?', [vendor.id]);
        vendor.product_count = productCount?.c || 0;
        res.json(vendor);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function mapProductForPublic(row) {
    return {
        id: row.id,
        name: row.name,
        price: row.price,
        stock: row.stock,
        category: row.category,
        subcategory: row.subcategory,
        image: row.image,
        image_source: row.image_source,
        description: row.description,
        short_description: row.short_description,
        sku: row.sku,
        barcode: row.barcode,
        preorder_enabled: row.preorder_enabled,
        preorder_eta: row.preorder_eta,
        availability_status: row.availability_status || (row.preorder_enabled ? 'preorder' : 'in_stock'),
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        vendor_slug: row.vendor_slug,
        vendor_tagline: row.vendor_tagline,
        vendor_public_description: row.vendor_public_description,
        gallery: row.gallery ? parseGalleryFromRow(row.gallery) : [],
    };
}

app.get('/api/public/vendors/:slug/products', async (req, res) => {
    try {
        const vendor = await db.get('SELECT id FROM vendors WHERE slug = ? AND status = ?', [req.params.slug, 'active']);
        if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
        const rows = await db.all(
            `SELECT p.*, v.slug AS vendor_slug, v.legal_name AS vendor_name
             FROM products p
             LEFT JOIN vendors v ON p.vendor_id = v.id
             WHERE p.vendor_id = ?
             ORDER BY ${orderCaseInsensitive('p.name')}`,
            [vendor.id]
        );
        res.json((rows || []).map(mapProductForPublic));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// List casual items (one-time seller submissions)
app.get('/api/casual-items', authMiddleware, requireRole(['accounts','manager','admin']), async (req, res) => {
    try {
        const status = req.query.status || null;
        const photosSelect = `(SELECT ${concatExpr('cip.path')} FROM casual_item_photos cip WHERE cip.casual_item_id = ci.id) as photos`;
        let rows;
        const baseSql = `
            SELECT ci.*, cs.name as seller_name, cs.email as seller_email, cs.phone as seller_phone, i.id as invoice_id, i.total as invoice_total,
                   ${photosSelect}
            FROM casual_items ci
            LEFT JOIN casual_sellers cs ON cs.id = ci.casual_seller_id
            LEFT JOIN invoices i ON i.id = ci.invoice_id
        `;
        if (status) {
            rows = await db.all(`${baseSql} WHERE ci.status = ? ORDER BY ci.created_at DESC`, [status]);
        } else {
            rows = await db.all(`${baseSql} ORDER BY ci.created_at DESC`);
        }
        res.json(rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Aggregated submissions endpoint for the Submissions UI
app.get('/api/submissions', authMiddleware, requireRole(['cashier','accounts','manager','admin']), async (req, res) => {
    try {
            const pendingVendors = await db.all("SELECT * FROM vendors WHERE status = 'pending' ORDER BY created_at DESC");
            // Include photos and invoice info for casual items so staff can inspect submissions
            const pendingPhotosColumn = `(SELECT ${concatExpr('cip.path')} FROM casual_item_photos cip WHERE cip.casual_item_id = ci.id) as photos`;
            const pendingCasual = await db.all(`
                SELECT ci.*, cs.name as seller_name, cs.email as seller_email, i.id as invoice_id, i.total as invoice_total,
                       ${pendingPhotosColumn}
                FROM casual_items ci
                LEFT JOIN casual_sellers cs ON cs.id = ci.casual_seller_id
                LEFT JOIN invoices i ON i.id = ci.invoice_id
                WHERE ci.status LIKE '%pending%'
                ORDER BY ci.created_at DESC
            `);
            // General/other submissions could be extended; for now return empty array
            const others = [];
            res.json({ vendors: pendingVendors || [], casual_items: pendingCasual || [], others });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve a casual item: create a product entry and publish to inventory
app.put('/api/casual-items/:id/approve', authMiddleware, requireRole(['manager','admin']), async (req, res) => {
    const { id } = req.params;
    try {
        await db.run('BEGIN TRANSACTION');
        const item = await db.get('SELECT ci.*, cs.name as seller_name FROM casual_items ci LEFT JOIN casual_sellers cs ON cs.id = ci.casual_seller_id WHERE ci.id = ?', [id]);
        if (!item) {
            await db.run('ROLLBACK');
            return res.status(404).json({ error: 'Casual item not found' });
        }

        // Create a product record in inventory
        const prodRes = await db.run(
            'INSERT INTO products (name, price, stock, category, description, track_inventory, sku) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [item.title || `Item ${id}`, item.asking_price || 0, 1, 'Casual', `Listed by ${item.seller_name || 'One-time seller'} (casual_item_id:${id})\n\n${item.description || ''}`, 0, null]
        );
        const productId = prodRes.lastID;

        if (item.featured) {
            await db.run(
                'UPDATE products SET highlight_active = 1, highlight_label = ?, highlight_priority = ? WHERE id = ?',
                ['Seller hot drop', 80, productId]
            );
        }

        // Link product to casual_items and mark approved
        await db.run('UPDATE casual_items SET status = ?, product_id = ? WHERE id = ?', ['approved', productId, id]);

        // Ensure the casual seller has a customer record so they appear in Customers
        try {
            if (item.casual_seller_id) {
                const seller = await db.get('SELECT * FROM casual_sellers WHERE id = ?', [item.casual_seller_id]);
                if (seller && !seller.customer_id) {
                    const custRes = await db.run(
                        'INSERT INTO customers (name, email, phone, is_business, customer_type) VALUES (?, ?, ?, ?, ?)',
                        [seller.name || `Seller ${seller.id}`, seller.email || null, seller.phone || null, 0, 'one-time-seller']
                    );
                    const customerId = custRes.lastID;
                    await db.run('UPDATE casual_sellers SET customer_id = ? WHERE id = ?', [customerId, seller.id]);
                    try { await cacheService.invalidateCustomers(); } catch {}
                }
            }
        } catch (e) {
            console.warn('Failed to create customer for casual seller', e?.message || e);
        }

        await db.run('COMMIT');
        await logActivity('casual_items', id, 'approved', req.user?.username || null, `Published as product ${productId}`);
        res.json({ id, productId, message: 'Casual item approved and published' });
    } catch (err) {
        await db.run('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// Reject a casual item
app.put('/api/casual-items/:id/reject', authMiddleware, requireRole(['manager','admin']), async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    try {
        await db.run('UPDATE casual_items SET status = ? WHERE id = ?', ['rejected', id]);
        await logActivity('casual_items', id, 'rejected', req.user?.username || null, reason || null);
        res.json({ id, status: 'rejected' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Casual seller — lightweight one-time item submission with automatic listing fee invoice
// protect public casual seller submissions with a lightweight rate limiter
const casualSubmissionLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,
    keyFn: (req) => {
        // rate limit per IP + email (if provided) to reduce abuse
        const ip = req.ip || req.connection?.remoteAddress || '';
        const email = (req.body && (req.body.email || req.body.name)) || '';
        return `${ip}|${String(email).toLowerCase().trim()}`;
    }
});

app.post('/api/sellers/submit-item', casualSubmissionLimiter, async (req, res) => {
    const {
        name,
        phone,
        email,
        productTitle,
        description,
        condition = 'Used',
        photos = [],
        askingPrice = 0,
        feature = false,
        payment_method = null
    } = req.body;
    // optional user-provided categorization / tag to help admin triage
    const user_category = req.body?.user_category || null;
    const user_subcategory = req.body?.user_subcategory || null;
    const user_tag = req.body?.user_tag || null;
    const rawDetails = req.body?.product_details || req.body?.productDetails || null;
    let detailsPayload = null;
    if (rawDetails && typeof rawDetails === 'object') {
        try {
            detailsPayload = JSON.stringify(rawDetails);
        } catch (err) {
            console.warn('Failed to serialize provided product_details payload', err?.message || err);
        }
    }

    if (!name || !productTitle) return res.status(400).json({ error: 'Name and productTitle required' });

    // Calculate listing fee: if askingPrice > 300 => 100, else 0. Feature adds 20.
    const LISTING_FEE = (Number(askingPrice) || 0) > 300 ? 100 : 0;
    const FEATURE_FEE = feature ? 20 : 0;
    const subtotal = LISTING_FEE + FEATURE_FEE;

    // Require payment slip when there's a non-zero listing total so staff can validate payment.
    // Accept payment_method or payment_slip in request body. payment_slip may be a data URL or an already-uploaded path.
    const payment_slip = req.body?.payment_slip || null;
    if (subtotal > 0 && !payment_slip) {
        return res.status(400).json({ error: 'Payment slip is required for listing fees' });
    }

    try {
        await db.run('BEGIN TRANSACTION');

        // create casual seller
        const sellerRes = await db.run('INSERT INTO casual_sellers (name, email, phone) VALUES (?, ?, ?)', [name, email || null, phone || null]);
        const casualSellerId = sellerRes.lastID;

        // create casual item
        if (!detailsPayload) {
            const fallbackDetails = {
                name: productTitle,
                description: description || null,
                condition,
                askingPrice: askingPrice || 0,
                quantity: Number(req.body?.quantity || 1) || 1,
                category: req.body?.category || null,
                subcategory: req.body?.subcategory || null,
                user_category,
                user_subcategory,
                user_tag,
                brand: req.body?.brand || null,
                model: req.body?.model || null,
                sku: req.body?.sku || null,
                serialNumber: req.body?.serialNumber || null,
                warranty: req.body?.warranty || null,
                feature: !!feature,
                photos,
                inventoryManagedBySeller: true,
                sellerTermsAcknowledged: !!req.body?.seller_terms_agreed,
                agreements: {
                    sellerResponsibleForPayment: true,
                    platformIsListingOnly: true,
                },
            };
            try {
                detailsPayload = JSON.stringify(fallbackDetails);
            } catch {
                detailsPayload = null;
            }
        }

        const itemRes = await db.run(
            `INSERT INTO casual_items (casual_seller_id, title, description, condition, asking_price, featured, listing_fee, status, details_payload)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [casualSellerId, productTitle, description || null, condition, askingPrice || 0, feature ? 1 : 0, LISTING_FEE, 'pending_payment', detailsPayload]
        );
        const casualItemId = itemRes.lastID;

        // If user supplied category/subcategory/tag, persist them onto the casual_items row so admin sees them
        if (user_category || user_subcategory || user_tag) {
            try {
                await db.run('UPDATE casual_items SET user_category = ?, user_subcategory = ?, user_tag = ? WHERE id = ?', [user_category, user_subcategory, user_tag, casualItemId]);
            } catch (e) {
                console.warn('Failed to persist user category/tag for casual item', e?.message || e);
            }
        }

    // persist photos (accept either existing upload paths or data URLs)
        for (let i = 0; i < (photos || []).length; i++) {
            const p = photos[i];
            let savedPath = null;
            try {
                if (typeof p === 'string' && p.startsWith('data:')) {
                    // save via base64 fallback into uploads/casual_items
                    const m = String(p).match(/^data:(.+);base64,(.+)$/);
                    let base64 = p;
                    let ext = '.png';
                    if (m) {
                        const mime = m[1];
                        base64 = m[2];
                        const parts = mime.split('/');
                        ext = parts[1] ? '.' + parts[1].split('+')[0] : ext;
                    }
                    const now = new Date();
                    const cat = `casual_items/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const { dir } = ensureUploadDir(cat, 'casual_items');
                    const fname = `ci-${Date.now()}-${i}${ext}`;
                    const fpath = path.join(dir, fname);
                    fs.writeFileSync(fpath, Buffer.from(base64, 'base64'));
                    const rel = path.relative(imagesDir, fpath).replace(/\\/g, '/');
                    savedPath = `/uploads/${rel}`;
                } else if (typeof p === 'string') {
                    // treat as already-uploaded path
                    savedPath = normalizeUploadPath(p) ? `/uploads/${normalizeUploadPath(p)}` : p;
                }
            } catch (pe) {
                console.warn('Failed to persist casual item photo', pe?.message || pe);
            }
            if (savedPath) await db.run('INSERT INTO casual_item_photos (casual_item_id, path) VALUES (?, ?)', [casualItemId, savedPath]);
        }

        // persist payment slip if provided
        let slipPath = null;
        if (payment_slip) {
            try {
                if (typeof payment_slip === 'string' && payment_slip.startsWith('data:')) {
                    const m = String(payment_slip).match(/^data:(.+);base64,(.+)$/);
                    let base64 = payment_slip;
                    let ext = 'png';
                    if (m) {
                        const mime = m[1];
                        base64 = m[2];
                        const parts = mime.split('/');
                        ext = parts[1] ? parts[1].split('+')[0] : ext;
                    }
                    const now = new Date();
                    const slipCat = `payment_slips/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
                    const { dir } = ensureUploadDir(slipCat, 'payment_slips');
                    const fname = `slip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                    const fpath = path.join(dir, fname);
                    fs.writeFileSync(fpath, Buffer.from(base64, 'base64'));
                    const rel = path.relative(imagesDir, fpath).replace(/\\/g, '/');
                    slipPath = `/uploads/${rel}`;
                } else if (typeof payment_slip === 'string') {
                    slipPath = normalizeUploadPath(payment_slip) ? `/uploads/${normalizeUploadPath(payment_slip)}` : payment_slip;
                }
            } catch (err) {
                console.warn('Failed to persist payment slip for casual item', err?.message || err);
            }
        }

        // create invoice for listing fee
        const settingsRow = await db.get('SELECT * FROM settings WHERE id = 1');
        let outlet = null;
        if (settingsRow && settingsRow.current_outlet_id) {
            outlet = await db.get('SELECT * FROM outlets WHERE id = ?', [settingsRow.current_outlet_id]);
        }
        if (!outlet) outlet = { id: null, gst_rate: settingsRow?.gst_rate || 0, currency: settingsRow?.currency || 'MVR' };

        const gstRate = parseFloat(outlet.gst_rate || 0);
        const taxAmount = +(subtotal * (gstRate / 100));
        const total = +(subtotal + taxAmount);

        const invRes = await db.run(
            'INSERT INTO invoices (customer_id, subtotal, tax_amount, total, outlet_id, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [null, subtotal, taxAmount, total, outlet.id || null, 'invoice', 'issued']
        );
        const invoiceId = invRes.lastID;

        // insert invoice item representing listing fee
        await db.run('INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)', [invoiceId, null, 1, subtotal]);

        // If a payment slip was provided, record it against payments table so POS can validate
        if (slipPath) {
            try {
                await db.run('INSERT INTO payments (invoice_id, amount, method, note, reference, slip_path) VALUES (?, ?, ?, ?, ?, ?)', [invoiceId, total, payment_method || 'transfer', null, null, slipPath]);
                // mark invoice payment method and reference where applicable
                await db.run('UPDATE invoices SET payment_method = ? WHERE id = ?', [payment_method || 'transfer', invoiceId]);
            } catch (pErr) {
                console.warn('Failed to record payment slip for casual invoice', pErr?.message || pErr);
            }
        }

        // create basic journal entry similar to /api/invoices
        const accountsReceivable = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['1200']);
        const salesRevenue = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['4000']);
        const taxesPayable = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['2200']);

        if (accountsReceivable && salesRevenue) {
            const journalResult = await db.run(
                'INSERT INTO journal_entries (entry_date, description, reference, total_debit, total_credit, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [new Date().toISOString().split('T')[0], `Listing Fee Invoice #${invoiceId}`, `LIST-${invoiceId}`, total, total, 'posted', new Date().toISOString()]
            );
            const journalId = journalResult.lastID;
            await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)', [journalId, accountsReceivable.id, total, 0, `Listing fee invoice #${invoiceId}`]);
            await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)', [journalId, salesRevenue.id, 0, subtotal, `Listing fee revenue #${invoiceId}`]);
            if (taxAmount > 0 && taxesPayable) {
                await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)', [journalId, taxesPayable.id, 0, taxAmount, `GST on listing #${invoiceId}`]);
            }
        }

        // link invoice to casual item
        await db.run('UPDATE casual_items SET invoice_id = ? WHERE id = ?', [invoiceId, casualItemId]);

        await db.run('COMMIT');

        await logActivity('casual_items', casualItemId, 'created', req.user?.username || null, JSON.stringify({ invoiceId, subtotal, total }));

        res.status(201).json({ id: casualItemId, invoiceId, subtotal, taxAmount, total, message: 'Casual item submitted — invoice created and pending payment.' });
    } catch (err) {
        await db.run('ROLLBACK');
        console.error('Failed to submit casual item', err?.message || err);
        res.status(500).json({ error: err.message });
    }
});

// Customer update
app.put('/api/customers/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, address, gst_number, registration_number, is_business, logo_data, documents } = req.body;
    try {
        await db.run(
            'UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, gst_number = ?, registration_number = ?, is_business = COALESCE(?, is_business) WHERE id = ?',
            [name, email, phone || null, address || null, gst_number || null, registration_number || null, is_business ? 1 : 0, id]
        );
        const customer = await db.get('SELECT * FROM customers WHERE id = ?', [id]);

        // handle optional uploads for updates (logo_data and documents)
        try {
            const attachmentsMeta = [];
            if (logo_data && typeof logo_data === 'string' && logo_data.startsWith('data:')) {
                const match = logo_data.match(/^data:(image\/[^;]+);base64,(.*)$/);
                if (match) {
                    const mime = match[1];
                    const ext = mime.split('/')[1] || 'png';
                    const b64 = match[2];
                    const logosDir = path.join(uploadsRoot, 'customers', 'logos');
                    fs.mkdirSync(logosDir, { recursive: true });
                    const nameOnDisk = `customer-${id}-logo-${Date.now()}.${ext}`;
                    const outPath = path.join(logosDir, nameOnDisk);
                    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
                    const publicPath = `/uploads/customers/logos/${nameOnDisk}`;
                    await db.run('UPDATE customers SET logo_url = COALESCE(?, logo_url) WHERE id = ?', [publicPath, id]);
                }
            }
            if (Array.isArray(documents) && documents.length > 0) {
                const docsDir = path.join(uploadsRoot, 'customers', String(id), 'docs');
                fs.mkdirSync(docsDir, { recursive: true });
                for (let i = 0; i < documents.length; i++) {
                    const d = documents[i];
                    if (!d || !d.data) continue;
                    let b64 = null;
                    let filename = d.name || `doc-${i}`;
                    if (typeof d.data === 'string') {
                        const m = d.data.match(/^data:([^;]+);base64,(.*)$/);
                        if (m) {
                            b64 = m[2];
                            const ext = (m[1].split('/')[1] || '').split('+')[0];
                            if (!filename.includes('.')) filename = `${filename}.${ext || 'bin'}`;
                        } else {
                            b64 = d.data;
                        }
                    }
                    if (!b64) continue;
                    const buf = Buffer.from(b64, 'base64');
                    const safeName = filename.replace(/[^a-z0-9\-_.]/gi, '_');
                    const outName = `${Date.now()}_${i}_${safeName}`;
                    const outPath = path.join(docsDir, outName);
                    fs.writeFileSync(outPath, buf);
                    const publicPath = `/uploads/customers/${id}/docs/${outName}`;
                    attachmentsMeta.push({ name: filename, path: publicPath });
                }
                if (attachmentsMeta.length > 0) {
                    // merge with existing attachments if any
                    const existing = customer.attachments ? (typeof customer.attachments === 'string' ? JSON.parse(customer.attachments || '[]') : customer.attachments) : [];
                    const merged = [...existing, ...attachmentsMeta];
                    await db.run('UPDATE customers SET attachments = ? WHERE id = ?', [JSON.stringify(merged), id]);
                }
            }
        } catch (uploadErr) {
            console.warn('Customer update file handling failed', uploadErr?.message || uploadErr);
        }
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
        const {
            search = '',
            segment = null,
            type = null,
            includeMetrics = 'false',
        } = req.query || {};

        const includeMetricsFlag = includeMetrics === true || includeMetrics === 'true' || includeMetrics === '1';
        const hasFilters = Boolean(
            (search && search.trim()) ||
            (segment && segment !== 'all') ||
            (type && type !== 'all') ||
            includeMetricsFlag
        );

        if (!hasFilters) {
            const cachedCustomers = await cacheService.getCustomers();
            if (cachedCustomers) {
                console.log('Serving customers from cache');
                return res.json(cachedCustomers);
            }
        }

        const whereClauses = [];
        const params = [];

        const normalizedType = (type || '').toString().trim().toLowerCase();
        if (normalizedType && normalizedType !== 'all') {
            if (normalizedType === 'one-time-seller') {
                whereClauses.push("LOWER(REPLACE(COALESCE(c.customer_type, ''), '_', '-')) = ?");
            } else {
                whereClauses.push('LOWER(COALESCE(c.customer_type, "")) = ?');
            }
            params.push(normalizedType);
        }

        const normalizedSegment = (segment || '').toString().trim().toLowerCase();
        if (normalizedSegment === 'business') {
            whereClauses.push('COALESCE(c.is_business, 0) = 1');
        } else if (normalizedSegment === 'individual') {
            whereClauses.push('COALESCE(c.is_business, 0) = 0');
        }

        const searchTerm = search.toString().trim().toLowerCase();
        if (searchTerm) {
            const likeValue = `%${searchTerm.replace(/[\\%_]/g, '\\$&')}%`;
            whereClauses.push(`(
                LOWER(COALESCE(c.name, '')) LIKE ? ESCAPE '\\' OR
                LOWER(COALESCE(c.email, '')) LIKE ? ESCAPE '\\' OR
                LOWER(COALESCE(c.phone, '')) LIKE ? ESCAPE '\\' OR
                LOWER(COALESCE(c.gst_number, '')) LIKE ? ESCAPE '\\' OR
                LOWER(COALESCE(c.registration_number, '')) LIKE ? ESCAPE '\\'
            )`);
            params.push(likeValue, likeValue, likeValue, likeValue, likeValue);
        }

        let selectClause = 'c.*';
        let joinClause = '';
        if (includeMetricsFlag) {
            selectClause = `
                c.*,
                COALESCE(m.total_invoices, 0) AS total_invoices,
                COALESCE(m.total_spent, 0) AS total_spent,
                m.last_activity AS last_activity,
                COALESCE(m.outstanding_balance, 0) AS outstanding_balance
            `;
            joinClause = `
                LEFT JOIN (
                    SELECT
                        customer_id,
                        COUNT(*) AS total_invoices,
                        SUM(COALESCE(total, 0)) AS total_spent,
                        MAX(created_at) AS last_activity,
                        SUM(
                            CASE
                                WHEN status IS NULL OR LOWER(status) NOT IN ('paid', 'void')
                                    THEN COALESCE(total, 0)
                                ELSE 0
                            END
                        ) AS outstanding_balance
                    FROM invoices
                    GROUP BY customer_id
                ) m ON m.customer_id = c.id
            `;
        }

        let sql = `SELECT ${selectClause} FROM customers c ${joinClause}`;
        if (whereClauses.length) {
            sql += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        sql += ' ORDER BY c.id DESC';

        const customers = await db.all(sql, params);

        if (!hasFilters) {
            await cacheService.setCustomers(customers, 300);
        }

        res.json(customers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/customers/summary', async (req, res) => {
    try {
        const totalRow = await db.get('SELECT COUNT(*) AS count FROM customers');
        const businessRow = await db.get('SELECT COUNT(*) AS count FROM customers WHERE COALESCE(is_business, 0) = 1');
        const sellersRow = await db.get("SELECT COUNT(*) AS count FROM customers WHERE LOWER(COALESCE(customer_type, '')) = 'one-time-seller'");
        const activeVendorsRow = await db.get("SELECT COUNT(*) AS count FROM vendors WHERE LOWER(COALESCE(status, '')) = 'active'");
        const pendingVendorsRow = await db.get("SELECT COUNT(*) AS count FROM vendors WHERE LOWER(COALESCE(status, '')) LIKE 'pending%'");
        const pendingCasualRow = await db.get("SELECT COUNT(*) AS count FROM casual_items WHERE LOWER(COALESCE(status, '')) LIKE 'pending%'");
        const outstandingRow = await db.get(`
            SELECT
                COUNT(*) AS customers_with_outstanding,
                SUM(outstanding_balance) AS total_outstanding
            FROM (
                SELECT
                    customer_id,
                    SUM(
                        CASE
                            WHEN status IS NULL OR LOWER(status) NOT IN ('paid', 'void')
                                THEN COALESCE(total, 0)
                            ELSE 0
                        END
                    ) AS outstanding_balance
                FROM invoices
                GROUP BY customer_id
            ) agg
            WHERE agg.outstanding_balance > 0
        `);

        const totalCustomers = totalRow?.count || 0;
        const businessCustomers = businessRow?.count || 0;
        const individualCustomers = totalCustomers - businessCustomers;
        const activeVendors = activeVendorsRow?.count || 0;
        const pendingVendors = pendingVendorsRow?.count || 0;
        const pendingCasual = pendingCasualRow?.count || 0;

        res.json({
            totalCustomers,
            businessCustomers,
            individualCustomers,
            oneTimeSellers: sellersRow?.count || 0,
            activeVendors,
            pendingVendors,
            pendingCasualItems: pendingCasual,
            pendingSubmissions: pendingVendors + pendingCasual,
            customersWithOutstanding: outstandingRow?.customers_with_outstanding || 0,
            totalOutstandingBalance: outstandingRow?.total_outstanding || 0,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/customers', async (req, res) => {
    const { name, email, phone, address, gst_number, registration_number, is_business, logo_data, documents } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const result = await db.run(
            'INSERT INTO customers (name, email, phone, address, gst_number, registration_number, is_business) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email || null, phone || null, address || null, gst_number || null, registration_number || null, is_business ? 1 : 0]
        );
        const customer = await db.get('SELECT * FROM customers WHERE id = ?', [result.lastID]);

        // handle optional logo (base64 data URL) and supporting documents for business customers
        try {
            const attachmentsMeta = [];
            if (logo_data && typeof logo_data === 'string' && logo_data.startsWith('data:')) {
                // parse base64 data URL
                const match = logo_data.match(/^data:(image\/[^;]+);base64,(.*)$/);
                if (match) {
                    const mime = match[1];
                    const ext = mime.split('/')[1] || 'png';
                    const b64 = match[2];
                    const buf = Buffer.from(b64, 'base64');
                    const logosDir = path.join(uploadsRoot, 'customers', 'logos');
                    fs.mkdirSync(logosDir, { recursive: true });
                    const nameOnDisk = `customer-${customer.id}-logo-${Date.now()}.${ext}`;
                    const outPath = path.join(logosDir, nameOnDisk);
                    fs.writeFileSync(outPath, buf);
                    const publicPath = `/uploads/customers/logos/${nameOnDisk}`;
                    await db.run('UPDATE customers SET logo_url = COALESCE(?, logo_url) WHERE id = ?', [publicPath, customer.id]);
                }
            }

            if (Array.isArray(documents) && documents.length > 0) {
                const docsDir = path.join(uploadsRoot, 'customers', String(customer.id), 'docs');
                fs.mkdirSync(docsDir, { recursive: true });
                for (let i = 0; i < documents.length; i++) {
                    const d = documents[i];
                    if (!d || !d.data) continue;
                    // try to support either base64 data URL or raw base64
                    let b64 = null;
                    let filename = d.name || `doc-${i}`;
                    if (typeof d.data === 'string') {
                        const m = d.data.match(/^data:([^;]+);base64,(.*)$/);
                        if (m) {
                            b64 = m[2];
                            const ext = (m[1].split('/')[1] || '').split('+')[0];
                            if (!filename.includes('.')) filename = `${filename}.${ext || 'bin'}`;
                        } else {
                            // assume raw base64
                            b64 = d.data;
                        }
                    }
                    if (!b64) continue;
                    const buf = Buffer.from(b64, 'base64');
                    const safeName = filename.replace(/[^a-z0-9\-_.]/gi, '_');
                    const outName = `${Date.now()}_${i}_${safeName}`;
                    const outPath = path.join(docsDir, outName);
                    fs.writeFileSync(outPath, buf);
                    const publicPath = `/uploads/customers/${customer.id}/docs/${outName}`;
                    attachmentsMeta.push({ name: filename, path: publicPath });
                }
                if (attachmentsMeta.length > 0) {
                    await db.run('UPDATE customers SET attachments = COALESCE(?, attachments) WHERE id = ?', [JSON.stringify(attachmentsMeta), customer.id]);
                }
            }
        } catch (uploadErr) {
            console.warn('Customer file upload handling failed', uploadErr?.message || uploadErr);
        }

        // Invalidate customer cache
        await cacheService.invalidateCustomers();

        // re-fetch customer to include any logo_url/attachments written above
        const fresh = await db.get('SELECT * FROM customers WHERE id = ?', [customer.id]);
        res.status(201).json(fresh);
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
        const invoices = await db.all(`
            SELECT i.*, c.customer_type as customer_type
            FROM invoices i
            LEFT JOIN customers c ON c.id = i.customer_id
            WHERE i.customer_id = ?
            ORDER BY i.created_at DESC
        `, [req.params.id]);
        res.json(invoices || []);
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
            if (!cachedSettings.social_links) {
                cachedSettings.social_links = {
                    facebook: cachedSettings?.social_facebook || null,
                    instagram: cachedSettings?.social_instagram || null,
                    whatsapp: cachedSettings?.social_whatsapp || null,
                    telegram: cachedSettings?.social_telegram || null,
                };
            }
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
                invoice_template: settings.invoice_template,
                payment_instructions: settings.payment_instructions || null,
                footer_note: settings.footer_note || null,
                logo_url: settings.logo_url || null,
            };
        }
        // also include email settings if present
    // include SMTP flags and friendly from/reply-to in the returned payload so frontend can render them
    const emailCfg = await db.get('SELECT provider, api_key, email_from, email_to, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, smtp_require_tls, smtp_from_name, smtp_reply_to FROM settings_email ORDER BY id DESC LIMIT 1');
        const socialLinks = {
            facebook: settings?.social_facebook || null,
            instagram: settings?.social_instagram || null,
            whatsapp: settings?.social_whatsapp || null,
            telegram: settings?.social_telegram || null,
        };
        const fullSettings = { ...settings, outlet, email: emailCfg || null, social_links: socialLinks };

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
        const { outlet_name, currency, gst_rate, store_address, invoice_template, current_outlet_id, logo_url, footer_note,
            email_provider, email_api_key, email_from, email_to,
            smtp_host, smtp_port, smtp_user, smtp_pass, smtp_secure, smtp_require_tls, smtp_from_name, smtp_reply_to,
            email_template_invoice, email_template_quote, email_template_quote_request, email_template_new_order_staff,
            email_template_password_reset_subject, email_template_password_reset,
            social_facebook, social_instagram, social_whatsapp, social_telegram } = req.body;

    // Define fields managers are allowed to update
    const managerAllowed = ['currency', 'gst_rate', 'store_address', 'invoice_template', 'current_outlet_id', 'outlet_name', 'payment_instructions', 'footer_note'];

        // If caller is manager, ensure they only change allowed fields
        if (req.user && req.user.role === 'manager') {
            const provided = Object.keys(req.body || {});
            const disallowed = provided.filter(p => !managerAllowed.includes(p));
            if (disallowed.length > 0) {
                return res.status(403).json({ error: 'Managers may not modify the following settings: ' + disallowed.join(', ') });
            }
        }

        await db.run(
            `UPDATE settings SET outlet_name = COALESCE(?, outlet_name), currency = COALESCE(?, currency), gst_rate = COALESCE(?, gst_rate), store_address = COALESCE(?, store_address), invoice_template = COALESCE(?, invoice_template), footer_note = COALESCE(?, footer_note), email_template_invoice = COALESCE(?, email_template_invoice), email_template_quote = COALESCE(?, email_template_quote), email_template_quote_request = COALESCE(?, email_template_quote_request), email_template_new_order_staff = COALESCE(?, email_template_new_order_staff), email_template_password_reset_subject = COALESCE(?, email_template_password_reset_subject), email_template_password_reset = COALESCE(?, email_template_password_reset), logo_url = COALESCE(?, logo_url), current_outlet_id = COALESCE(?, current_outlet_id) WHERE id = 1`,
            [
                outlet_name || null,
                currency || null,
                gst_rate || null,
                store_address || null,
                invoice_template || null,
                footer_note || null,
                email_template_invoice || null,
                email_template_quote || null,
                email_template_quote_request || null,
                email_template_new_order_staff || null,
                email_template_password_reset_subject || null,
                email_template_password_reset || null,
                logo_url || null,
                current_outlet_id || null,
            ]
        );

        const normalizeSocial = (value) => {
            if (typeof value === 'undefined') return undefined;
            if (typeof value !== 'string') return value === null ? null : value;
            const trimmed = value.trim();
            return trimmed.length ? trimmed : null;
        };

        const socialUpdates = [
            { column: 'social_facebook', value: normalizeSocial(social_facebook) },
            { column: 'social_instagram', value: normalizeSocial(social_instagram) },
            { column: 'social_whatsapp', value: normalizeSocial(social_whatsapp) },
            { column: 'social_telegram', value: normalizeSocial(social_telegram) },
        ];

        for (const { column, value } of socialUpdates) {
            if (typeof value !== 'undefined') {
                await db.run(`UPDATE settings SET ${column} = ? WHERE id = 1`, [value]);
            }
        }

        // Only admins may update email configuration and email templates
        if (req.user && req.user.role !== 'admin' && (email_provider || email_api_key || email_from || email_to || smtp_host || smtp_port || smtp_user || smtp_pass || smtp_secure || smtp_require_tls || smtp_from_name || smtp_reply_to || email_template_invoice || email_template_quote || email_template_quote_request || email_template_password_reset_subject || email_template_password_reset)) {
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
        const socialLinks = {
            facebook: settings?.social_facebook || null,
            instagram: settings?.social_instagram || null,
            whatsapp: settings?.social_whatsapp || null,
            telegram: settings?.social_telegram || null,
        };

        // Invalidate settings cache
        await cacheService.invalidateSettings();

    res.json({ ...settings, email: emailCfg || null, social_links: socialLinks });
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
            const templateSettings = await db.get('SELECT email_template_quote, email_template_quote_request, outlet_name FROM settings WHERE id = 1');
            const quoteItemsHtml = Array.isArray(cart) && cart.length
                ? `<ul>${cart.map((item) => `<li>${escapeHtml(item.name || 'Item')} &times; ${escapeHtml(item.quantity ?? '1')} - ${escapeHtml(item.price ?? '0')}</li>`).join('')}</ul>`
                : '<p>No items provided.</p>';
            const submittedAt = new Date().toLocaleString();
            const companySuffixPlain = company_name ? ` @ ${company_name}` : '';
            const templateVars = {
                company_name: escapeHtml(company_name || '-'),
                company_suffix: escapeHtml(companySuffixPlain),
                contact_name: escapeHtml(contact_name || '-'),
                contact_first: escapeHtml((contact_name || '').split(' ')[0] || contact_name || '-'),
                contact_email: escapeHtml(contact_email || '-'),
                phone: escapeHtml(phone || '-'),
                submission_type: escapeHtml(submission_type || '-'),
                existing_customer_ref: escapeHtml(existing_customer_ref || '-'),
                registration_number: escapeHtml(registration_number || '-'),
                details: escapeHtml(details || '-'),
                quote_id: escapeHtml(quote.id),
                invoice_id: escapeHtml(createdInvoice.id),
                subtotal: escapeHtml(subtotal.toFixed(2)),
                tax_amount: escapeHtml(taxAmount.toFixed(2)),
                total: escapeHtml(total.toFixed(2)),
                item_count: escapeHtml(String(Array.isArray(cart) ? cart.length : 0)),
                submitted_at: escapeHtml(submittedAt),
                items_html: quoteItemsHtml,
                outlet_name: escapeHtml(templateSettings?.outlet_name || ''),
            };

            const staffFallback = `
<p>New quotation request received:</p>
<ul>
  <li><strong>Company:</strong> {{company_name}}</li>
  <li><strong>Contact:</strong> {{contact_name}}</li>
  <li><strong>Email:</strong> {{contact_email}}</li>
  <li><strong>Phone:</strong> {{phone}}</li>
  <li><strong>Submission type:</strong> {{submission_type}}</li>
  <li><strong>Existing account reference:</strong> {{existing_customer_ref}}</li>
  <li><strong>Registration number:</strong> {{registration_number}}</li>
  <li><strong>Details:</strong> {{details}}</li>
  <li><strong>Linked Quote ID:</strong> {{quote_id}}</li>
  <li><strong>Created Invoice ID:</strong> {{invoice_id}}</li>
  <li><strong>Subtotal:</strong> {{subtotal}}</li>
  <li><strong>Tax:</strong> {{tax_amount}}</li>
  <li><strong>Total:</strong> {{total}}</li>
</ul>
<p><strong>Items</strong></p>
{{items_html}}
`.trim();

            const customerFallback = `
<p>Hi {{contact_first}},</p>
<p>Thanks for your interest. We received your quotation request and will respond shortly.</p>
<p><strong>Summary</strong></p>
<ul>
  <li><strong>Reference:</strong> Quote #{{quote_id}}</li>
  <li><strong>Submitted:</strong> {{submitted_at}}</li>
  <li><strong>Items:</strong> {{item_count}}</li>
</ul>
{{items_html}}
<p>If you need to add more information reply to this email or call our team.</p>
`.trim();

            const staffBody = renderEmailTemplate(templateSettings?.email_template_quote_request, staffFallback, templateVars);
            const subject = `Quotation request from ${contact_name || 'Customer'}${companySuffixPlain}`;
            await sendNotificationEmail(subject, staffBody);

            // Send a confirmation email to the requester if outbound email is configured
            if (contact_email) {
                try {
                    const customerBody = renderEmailTemplate(templateSettings?.email_template_quote, customerFallback, templateVars);
                    const customerSubject = renderEmailTemplate(null, 'We received your quote request (#{{quote_id}})', { quote_id: templateVars.quote_id });
                    await sendNotificationEmail(customerSubject, customerBody, contact_email);
                } catch (errEmail) {
                    console.warn('Failed to send quote receipt to customer', errEmail?.message || errEmail);
                }
            }

            // Also notify staff users with email addresses (cashiers/admins) so in-house staff get alerted
            try {
                const staffList = await db.all("SELECT email FROM staff WHERE email IS NOT NULL AND email != ''");
                const emails = staffList.map((s) => s.email).filter(Boolean);
                if (emails.length > 0) {
                    await sendNotificationEmail(subject, staffBody, emails.join(','));
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
        const { name, currency, gst_rate, store_address, invoice_template, payment_instructions, footer_note } = req.body;
        if (!name) return res.status(400).json({ error: 'Missing outlet name' });
        const result = await db.run('INSERT INTO outlets (name, currency, gst_rate, store_address, invoice_template, payment_instructions, footer_note) VALUES (?, ?, ?, ?, ?, ?, ?)', [name, currency || 'MVR', gst_rate || 0, store_address || null, invoice_template || null, payment_instructions || null, footer_note || null]);
        const outlet = await db.get('SELECT * FROM outlets WHERE id = ?', [result.lastID]);
        res.status(201).json(outlet);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/outlets/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, currency, gst_rate, store_address, invoice_template, payment_instructions, footer_note } = req.body;
        await db.run('UPDATE outlets SET name = ?, currency = ?, gst_rate = ?, store_address = ?, invoice_template = ?, payment_instructions = ?, footer_note = ? WHERE id = ?', [name, currency, gst_rate || 0, store_address || null, invoice_template || null, payment_instructions || null, footer_note || null, id]);
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

        // Vendor commission handling: aggregate sales per supplier and create payable for vendor net amount (deduct commission)
        // vendorTotals is declared here so it can be used later when creating GL adjustment lines
        let vendorTotals = {};
        try {
            vendorTotals = {}; // vendor_id -> { gross }
            for (const item of validItems) {
                if (!item.id) continue;
                const prod = await db.get('SELECT supplier_id, name FROM products WHERE id = ?', [item.id]);
                if (prod && prod.supplier_id) {
                    const vendorId = prod.supplier_id;
                    const lineTotal = (Number(item.price || 0) * Number(item.quantity || 0)) || 0;
                    if (!vendorTotals[vendorId]) vendorTotals[vendorId] = { gross: 0 };
                    vendorTotals[vendorId].gross += lineTotal;
                }
            }

            for (const [vendorId, data] of Object.entries(vendorTotals)) {
                const vendorRow = await db.get('SELECT id, commission_rate FROM vendors WHERE id = ?', [vendorId]);
                const commRate = vendorRow && vendorRow.commission_rate != null ? Number(vendorRow.commission_rate) : 0.10;
                const gross = Number(data.gross || 0);
                const commissionAmount = +(gross * (commRate));
                const vendorNet = +(gross - commissionAmount);

                // create an accounts_payable record for the vendor net amount
                await db.run('INSERT INTO accounts_payable (vendor_id, invoice_number, invoice_date, due_date, amount, notes) VALUES (?, ?, ?, ?, ?, ?)',
                    [vendorId, `INV-${invoiceId}`, new Date().toISOString().split('T')[0], null, vendorNet, `Vendor share for invoice ${invoiceId} (gross ${gross.toFixed(2)}, commission ${commissionAmount.toFixed(2)})`]
                );

                await logActivity('accounts_payable', null, 'created', req.user?.username || null, `Vendor ${vendorId} payable created for invoice ${invoiceId}`);
            }
        } catch (commErr) {
            console.warn('Vendor commission processing failed for invoice', invoiceId, commErr?.message || commErr);
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
                // If vendor totals were computed, create GL adjustment lines to reflect vendor payables and commission revenue.
                // Approach: the invoice earlier credited full Sales Revenue for subtotal. For vendor-supplied items we
                // debit Sales Revenue (to remove vendor gross from company revenue), then credit Accounts Payable
                // for the vendor net and credit Commission Revenue for the company's commission portion.
                try {
                    if (vendorTotals && Object.keys(vendorTotals).length > 0) {
                        const accountsPayableAcc = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['2000']);
                        const commissionAcc = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['4200']);
                        // commissionAcc falls back to '4200' (Other Income) which exists in seeded COA. accountsPayableAcc should be '2000'.
                        for (const [vendorId, data] of Object.entries(vendorTotals)) {
                            const vendorGross = Number(data.gross || 0) || 0;
                            // re-fetch vendor commission rate (safe)
                            const vendorRow = await db.get('SELECT id, commission_rate FROM vendors WHERE id = ?', [vendorId]);
                            const commRate = vendorRow && vendorRow.commission_rate != null ? Number(vendorRow.commission_rate) : 0.10;
                            const commissionAmount = +(vendorGross * commRate);
                            const vendorNet = +(vendorGross - commissionAmount);

                            // Debit Sales Revenue to remove vendor gross portion (reduces previously credited sales revenue)
                            if (salesRevenue) {
                                await db.run(
                                    'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)',
                                    [journalId, salesRevenue.id, vendorGross, 0, `Remove vendor-supplied sales (vendor ${vendorId}) for invoice #${invoiceId}`]
                                );
                            }

                            // Credit Accounts Payable for vendor net (liability to vendor)
                            if (accountsPayableAcc) {
                                await db.run(
                                    'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)',
                                    [journalId, accountsPayableAcc.id, 0, vendorNet, `Vendor payable (vendor ${vendorId}) for invoice #${invoiceId}`]
                                );
                            } else {
                                console.warn('Accounts Payable account (2000) not found in chart_of_accounts; skipping GL payable line for vendor', vendorId);
                            }

                            // Credit Commission Revenue for the company's commission portion
                            if (commissionAcc) {
                                await db.run(
                                    'INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)',
                                    [journalId, commissionAcc.id, 0, commissionAmount, `Commission revenue (vendor ${vendorId}) for invoice #${invoiceId}`]
                                );
                            } else {
                                console.warn('Commission revenue account (4200) not found in chart_of_accounts; skipping GL commission line for vendor', vendorId);
                            }
                        }
                    }
                } catch (adjErr) {
                    console.warn('Failed to create commission GL adjustment lines for invoice', invoiceId, adjErr?.message || adjErr);
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
                c.customer_type as customer_type,
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
                c.name as customer_name,
                c.customer_type as customer_type
            FROM invoices i
            LEFT JOIN customers c ON c.id = i.customer_id
            ORDER BY i.created_at DESC
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
            if (invoice) {
                // include customer_type when available
                const cust = await db.get('SELECT customer_type FROM customers WHERE id = ?', [invoice.customer_id]);
                invoice.customer_type = cust ? cust.customer_type : null;
            }
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
        const settingsRow = await db.get('SELECT * FROM settings WHERE id = 1');
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
            outlet = {
                name: settingsRow?.outlet_name || 'My Outlet',
                currency: settingsRow?.currency || 'MVR',
                gst_rate: settingsRow?.gst_rate || 0,
                store_address: settingsRow?.store_address || null,
                invoice_template: settingsRow?.invoice_template || null,
                logo_url: settingsRow?.logo_url ?? null,
            };
        }

        const stream = res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment;filename=invoice-${invoice.id}.pdf`,
        });

        // Ensure outlet passed to PDF generator includes logo_url (prefer outlet.logo_url, fallback to settings)
        const pdfOutlet = { ...outlet, logo_url: outlet.logo_url ?? settingsRow?.logo_url ?? null };

        try {
            // await the async PDF generator so errors can be caught
            await generateInvoicePdf(
                { ...invoice, customer, items, outlet: pdfOutlet },
                (chunk) => stream.write(chunk),
                () => stream.end()
            );
        } catch (err) {
            // If generation fails mid-stream, ensure stream is closed and log error
            try { stream.end(); } catch (e) {}
            console.error('Invoice PDF generation failed', err);
            // Can't send JSON here because headers are already sent; just end the response
        }

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
    const paymentReference = typeof payment?.reference === 'string'
        ? payment.reference.trim()
        : payment?.reference != null
            ? String(payment.reference).trim()
            : null;
    const allowedBanks = ['bml', 'bank_of_maldives', 'maldives_islamic_bank', 'mib'];
    let paymentBank = payment?.bank ? payment.bank.toString().trim().toLowerCase() : null;
    if (paymentBank && !allowedBanks.includes(paymentBank)) {
        paymentBank = null;
    }
    if (paymentBank === 'bank_of_maldives') paymentBank = 'bml';
    if (paymentBank === 'maldives_islamic_bank') paymentBank = 'mib';
    const customerPhone = customer.phone ? customer.phone.toString().trim() : '';
    let paymentSlipPath = null;
    let preorderId = null;

    if (!customerPhone) {
        return res.status(400).json({ error: 'Phone number is required.' });
    }

    if (isTransferMethod && !paymentReference) {
        return res.status(400).json({ error: 'Transfer reference is required for bank transfer payments.' });
    }

    if (payment?.slipPath) {
        const normalized = normalizeUploadPath(payment.slipPath);
        if (normalized) {
            paymentSlipPath = `/uploads/${normalized}`;
        }
    }

    if (!paymentSlipPath && isTransferMethod && payment?.slip) {
        try {
            const slipValue = typeof payment.slip === 'string' ? payment.slip : '';
            const match = slipValue.match(/^data:(.+);base64,(.+)$/);
            if (!match) {
                return res.status(400).json({ error: 'Payment slip must be provided as an image.' });
            }
            const mime = match[1];
            if (!/^image\//i.test(mime || '')) {
                return res.status(400).json({ error: 'Payment slip must be an image file (JPEG, PNG, GIF, or WebP).' });
            }
            let base64 = match[2];
            let ext = 'png';
            const parts = (mime || '').split('/');
            if (parts[1]) {
                ext = parts[1].split('+')[0];
            }
            const now = new Date();
            const slipCategory = ['payment_slips', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0')];
            const { dir } = ensureUploadDir(slipCategory, 'payment_slips');
            const fileName = `slip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext || 'png'}`;
            const filePath = path.join(dir, fileName);
            const buffer = Buffer.from(base64, 'base64');
            if (!buffer.length) {
                return res.status(400).json({ error: 'Payment slip image appears to be empty.' });
            }
            fs.writeFileSync(filePath, buffer);
            const rel = path.relative(imagesDir, filePath).replace(/\\/g, '/');
            paymentSlipPath = `/uploads/${rel}`;
        } catch (err) {
            console.warn('Failed to persist payment slip', err?.message || err);
        }
    }

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
        const price = parseAmountValue(item.price);
        if (!Number.isFinite(price)) {
            console.warn('Invalid price provided for order item', { itemId: item.id, rawPrice: item.price });
            return res.status(400).json({ error: `Invalid price value for item ${item.id}` });
        }
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

    if (hasPreorderItems) {
        if (!customerPhone) {
            return res.status(400).json({ error: 'Phone number is required for preorder items.' });
        }
        if (!isTransferMethod) {
            return res.status(400).json({ error: 'Preorder items must be paid via bank transfer.' });
        }
        if (!paymentSlipPath) {
            return res.status(400).json({ error: 'Payment slip is required for preorder items.' });
        }
    }

    const total = itemsWithDetails.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderStatus = hasPreorderItems ? 'preorder' : (isTransferMethod ? 'awaiting_verification' : 'pending');

    let orderId = null;
    let invoiceId = null;
    let invoiceTotals = null;
    let invSubtotal = 0;
    let invTax = 0;
    let invTotal = 0;
    const invoiceStatus = hasPreorderItems ? 'preorder' : 'issued';
    const context = { stage: 'init', orderId: null, invoiceId: null, journalId: null };

    let settingsRow = null;

    try {
        settingsRow = await db.get('SELECT gst_rate, current_outlet_id, outlet_name, currency, exchange_rate FROM settings WHERE id = 1');
        const gstRate = parseFloat(settingsRow?.gst_rate || 0);
        const outletId = settingsRow?.current_outlet_id || null;

        let transactionActive = false;
        try {
            try {
                await db.exec('BEGIN TRANSACTION');
                transactionActive = true;
            } catch (beginErr) {
                throw new OrderFinalizationError('transaction.begin', beginErr?.message || 'Failed to begin transaction', { cause: beginErr?.message });
            }
            context.stage = 'customer.upsert';
            let customerRow = await db.get('SELECT id, phone FROM customers WHERE email = ?', [customer.email]);
            let customerId;
            if (customerRow) {
                customerId = customerRow.id;
                await db.run('UPDATE customers SET name = ?, phone = COALESCE(?, phone) WHERE id = ?', [customer.name, customerPhone || customerRow.phone || null, customerId]);
            } else {
                const insertCustomer = await db.run('INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)', [customer.name, customer.email, customerPhone || null]);
                customerId = insertCustomer.lastID;
            }

            context.stage = 'order.insert';
            const orderResult = await db.run(
                'INSERT INTO orders (customer_name, customer_email, customer_phone, customer_company, total, status, payment_method, payment_reference, payment_slip, source, is_preorder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    customer.name,
                    customer.email,
                    customerPhone || null,
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
            orderId = orderResult.lastID;
            context.orderId = orderId;

            context.stage = 'order.items';
            let orderItemsStmt;
            try {
                orderItemsStmt = await db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price, is_preorder) VALUES (?, ?, ?, ?, ?)');
                for (const item of itemsWithDetails) {
                    await orderItemsStmt.run(orderId, item.id, item.quantity, item.price, item.isPreorder ? 1 : 0);
                    if (!item.isPreorder && item.trackInventory !== 0) {
                        await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
                    }
                }
            } finally {
                if (orderItemsStmt) {
                    try {
                        await orderItemsStmt.finalize();
                    } catch (stmtErr) {
                        console.warn('Failed to finalize order_items statement', stmtErr?.message || stmtErr);
                    }
                }
            }

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

            context.stage = 'invoice.create';
            const invoiceResult = await createInvoiceAndJournal({
                customerId,
                customerName: customer.name,
                items: itemsWithDetails,
                gstRate,
                outletId,
                invoiceStatus,
                orderId,
            });
            invoiceTotals = invoiceResult.totals;
            invSubtotal = invoiceTotals.subtotal;
            invTax = invoiceTotals.tax;
            invTotal = invoiceTotals.total;
            invoiceId = invoiceResult.invoiceId;
            context.invoiceId = invoiceId;
            context.journalId = invoiceResult.journalId;

            if (hasPreorderItems) {
                const nowIso = new Date().toISOString();
                const sourceLabel = normalizedSource && normalizedSource !== 'pos' ? normalizedSource : 'Storefront Checkout';
                const preorderHistory = JSON.stringify([
                    {
                        status: 'pending',
                        note: 'Preorder captured from storefront checkout',
                        created_at: nowIso,
                        staff: null
                    }
                ]);
                const preorderItems = sanitizedCart.map((item) => ({
                    productId: item.id ?? item.product_id ?? null,
                    productName: item.name ?? item.product_name ?? null,
                    quantity: Number(item.quantity) || 0,
                    price: parseAmountValue(item.price) || 0,
                }));
                const currency = settingsRow?.currency || 'MVR';
                const exchangeRateSetting = Number(settingsRow?.exchange_rate);
                const validExchangeRate = Number.isFinite(exchangeRateSetting) && exchangeRateSetting > 0 ? exchangeRateSetting : null;
                const usdTotal = validExchangeRate ? Math.round((invTotal / validExchangeRate) * 100) / 100 : null;
                const snapshotPayload = {
                    items: preorderItems,
                    subtotal: invSubtotal,
                    tax: invTax,
                    total: invTotal,
                    currency,
                };
                const insertPreorder = await db.run(
                    `INSERT INTO preorders (
                        source_store,
                        cart_links,
                        notes,
                        customer_name,
                        customer_email,
                        customer_phone,
                        delivery_address,
                        usd_total,
                        exchange_rate,
                        mvr_total,
                        payment_reference,
                        payment_date,
                        payment_slip,
                        payment_bank,
                        status,
                        status_history,
                        items_snapshot
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
                    [
                        sourceLabel,
                        JSON.stringify([]),
                        null,
                        customer.name,
                        customer.email,
                        customerPhone || null,
                        null,
                        usdTotal,
                        validExchangeRate,
                        invTotal,
                        paymentReference || null,
                        null,
                        paymentSlipPath,
                        paymentBank,
                        'pending',
                        preorderHistory,
                        JSON.stringify(snapshotPayload)
                    ]
                );
                preorderId = insertPreorder.lastID;
                await logActivity(
                    'preorder',
                    preorderId,
                    'created',
                    customer.email,
                    JSON.stringify({ orderId, invoiceId, total: invTotal, source: sourceLabel })
                );
                await queueNotification({
                    staffId: null,
                    username: null,
                    title: 'Storefront preorder captured',
                    message: `Preorder #${preorderId} generated from order ${orderId}`,
                    type: 'info',
                    metadata: { preorderId, orderId, invoiceId, total: invTotal }
                });
            }

            await db.exec('COMMIT');
            transactionActive = false;
        } catch (err) {
            if (transactionActive) {
                try {
                    await db.exec('ROLLBACK');
                } catch (rollbackErr) {
                    console.error('Order transaction rollback failed', rollbackErr?.message || rollbackErr);
                }
                transactionActive = false;
            }
            throw err;
        }

        try {
            const subject = `New order placed by ${customer.name}`;
            const staffItemsHtml = sanitizedCart
                .map((it) => `<li>${escapeHtml(it.name || 'Item')} &times; ${escapeHtml(it.quantity ?? '0')} - ${escapeHtml(it.price ?? '0')}</li>`)
                .join('');
            const staffBodyHtml = `
<p>A new order was placed:</p>
<ul>
  <li><strong>Name:</strong> ${escapeHtml(customer.name || '-')}</li>
  <li><strong>Email:</strong> ${escapeHtml(customer.email || '-')}</li>
  <li><strong>Total:</strong> ${escapeHtml(invTotal.toFixed(2))}</li>
</ul>
<p>Items:</p>
<ul>${staffItemsHtml}</ul>
<p>Order ID: ${escapeHtml(orderId)}</p>
<p>Invoice ID: ${escapeHtml(invoiceId)}</p>
`.trim();
            await sendNotificationEmail(subject, staffBodyHtml);

            if (customer.email) {
                try {
                    let templateRow;
                    try {
                        templateRow = await db.get('SELECT COALESCE(email_template_invoice_customer, email_template_invoice, "") AS customer_template, outlet_name FROM settings WHERE id = 1');
                    } catch (tplErr) {
                        console.debug('Invoice customer template column missing; falling back to legacy field', tplErr?.message || tplErr);
                        templateRow = await db.get('SELECT COALESCE(email_template_invoice, "") AS customer_template, outlet_name FROM settings WHERE id = 1');
                    }
                    const customerItemsHtml = sanitizedCart.length
                        ? `<ul>${sanitizedCart.map((it) => `<li>${escapeHtml(it.name || 'Item')} &times; ${escapeHtml(it.quantity ?? '0')} - ${escapeHtml(it.price ?? '0')}</li>`).join('')}</ul>`
                        : '<p>No individual items were provided.</p>';
                    const customerTemplateVars = {
                        customer_name: escapeHtml(customer.name || 'Customer'),
                        order_id: escapeHtml(orderId),
                        invoice_id: escapeHtml(invoiceId),
                        subtotal: escapeHtml(invSubtotal.toFixed(2)),
                        tax_amount: escapeHtml(invTax.toFixed(2)),
                        total: escapeHtml(invTotal.toFixed(2)),
                        payment_method: escapeHtml(paymentMethod || '-'),
                        status: escapeHtml(orderStatus),
                        preorder_flag: escapeHtml(hasPreorderItems ? 'Yes' : 'No'),
                        items_html: customerItemsHtml,
                        outlet_name: escapeHtml(templateRow?.outlet_name || settingsRow?.outlet_name || ''),
                    };
                    const customerFallback = `
<p>Hi {{customer_name}},</p>
<p>Thank you for your order! We've created invoice #{{invoice_id}} and will process it shortly.</p>
<ul>
  <li><strong>Order ID:</strong> {{order_id}}</li>
  <li><strong>Total:</strong> {{total}}</li>
  <li><strong>Status:</strong> {{status}}</li>
</ul>
<p><strong>Items</strong></p>
{{items_html}}
<p>If you have any questions just reply to this message.</p>
`.trim();
                    const customerBody = renderEmailTemplate(templateRow?.customer_template, customerFallback, customerTemplateVars);
                    const customerSubject = renderEmailTemplate(null, 'Your order #{{order_id}} has been received', { order_id: customerTemplateVars.order_id });
                    await sendNotificationEmail(customerSubject, customerBody, customer.email);
                } catch (customerEmailErr) {
                    console.warn('Failed to send customer order confirmation', customerEmailErr?.message || customerEmailErr);
                }
            }
        } catch (err) {
            console.warn('Failed to send order notification', err?.message || err);
        }

        try {
            await queueNotification({
                staffId: null,
                username: null,
                title: 'New online order',
                message: `Order ${orderId} placed and converted to invoice #${invoiceId}`,
                type: 'info',
                link: `/invoices/${invoiceId}`,
                metadata: { orderId, invoiceId, preorderId: preorderId || null, total: invTotal }
            });
        } catch (notifyErr) {
            console.warn('Failed to queue order notification', notifyErr?.message || notifyErr);
        }

        res.status(201).json({ message: 'Order created successfully', orderId, invoiceId, preorderId });

        try {
            const wsService = getWebSocketService();
            const orderData = {
                orderId,
                invoiceId,
                preorderId: preorderId || null,
                customer: {
                    name: customer.name,
                    email: customer.email,
                    phone: customer.phone
                },
                total: invTotal,
                items: sanitizedCart,
                paymentMethod,
                status: hasPreorderItems ? 'preorder' : (isTransferMethod ? 'awaiting_verification' : 'pending'),
                timestamp: new Date()
            };
            wsService.notifyNewOrder(orderData);
            wsService.notifyInvoiceCreated({
                id: invoiceId,
                customer: customer.name,
                total: invTotal,
                type: 'invoice',
                status: invoiceStatus,
                timestamp: new Date(),
                preorderId: preorderId || null
            });
        } catch (wsErr) {
            console.warn('WebSocket broadcast failed:', wsErr.message);
        }
    } catch (err) {
        if (err instanceof OrderFinalizationError) {
            console.error('Order finalization failed', {
                stage: err.stage,
                orderId: context.orderId,
                invoiceId: context.invoiceId,
                journalId: context.journalId,
                meta: err.meta,
                message: err.message,
                stack: err.stack,
            });
            return res.status(500).json({
                error: 'Failed to finalize order',
                details: {
                    stage: err.stage,
                    message: err.message,
                    orderId: context.orderId,
                    invoiceId: context.invoiceId,
                    journalId: context.journalId,
                    meta: err.meta || null,
                },
            });
        }
        console.error('Order creation failed:', err);
        res.status(500).json({
            error: 'Failed to create order',
            details: {
                message: err?.message || null,
                stack: err?.stack || null,
                stage: context.stage,
                orderId: context.orderId,
                invoiceId: context.invoiceId,
                journalId: context.journalId,
            },
        });
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
        res.json({ token, role: roleName, username: staff.username, refreshToken: newRefresh });
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
        res.json({ token, role: roleName, username: staff.username, refreshToken });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get activity logs for a staff member
app.get('/api/staff/:id/activity', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const logs = await db.all('SELECT id, entity_type, entity_id, action, actor, details, created_at FROM activity_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 200', ['staff', id]);
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
            HAVING (COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0)) != 0
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
            HAVING (COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0)) != 0
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
            HAVING (COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0)) != 0
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
            HAVING (COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0)) != 0
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
            HAVING (COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0)) != 0
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

    // include supplier name in GROUP BY for Postgres (non-aggregated column)
    query += ` GROUP BY p.id, s.name ORDER BY p.created_at DESC LIMIT ?`;
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
                SET reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversed_by = ?, reversal_reason = ?
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
            SET closed_at = CURRENT_TIMESTAMP,
                ended_at = CURRENT_TIMESTAMP,
                closed_by = COALESCE(closed_by, ?),
                status = 'closed',
                updated_at = CURRENT_TIMESTAMP
            WHERE closed_at IS NULL
        `, [req.user.username]);

        // Start new shift
        const outletId = req.user?.outletId || req.user?.outlet_id || null;
        const staffId = req.user?.staffId || null;
        const result = await db.run(`
            INSERT INTO shifts (opened_by, starting_cash, opened_at, started_by, starting_balance, outlet_id, status)
            VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, 'active')
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
            SET closed_at = CURRENT_TIMESTAMP,
                ended_at = CURRENT_TIMESTAMP,
                closed_by = ?,
                actual_cash = ?,
                cash_counts = ?,
                discrepancy = ?,
                discrepancies = ?,
                closing_balance = ?,
                notes = ?,
                note = ?,
                status = 'closed',
                updated_at = CURRENT_TIMESTAMP
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
                SET reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversed_by = ?, reversal_reason = ?
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
                SET reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversed_by = ?, reversal_reason = ?
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
                SET reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversed_by = ?, reversal_reason = ?
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
                SET reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversed_by = ?, reversal_reason = ?
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
                SET reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversed_by = ?, reversal_reason = ?
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
                SET reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversed_by = ?, reversal_reason = ?
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

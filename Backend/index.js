import express from 'express';
import cors from 'cors';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupDatabase } from './database.js';
import { generateInvoicePdf } from './invoice-service.js';
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

async function sendNotificationEmail(subject, html, toOverride) {
    try {
        const emailCfg = await db.get('SELECT * FROM settings_email ORDER BY id DESC LIMIT 1');
        if (!emailCfg) return;
        const from = emailCfg.email_from || emailCfg.smtp_user || 'no-reply@example.com';
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
            const transporter = nodemailer.createTransport({
                host: emailCfg.smtp_host,
                port: Number(emailCfg.smtp_port) || 465,
                secure: Number(emailCfg.smtp_port) === 465,
                auth: {
                    user: emailCfg.smtp_user,
                    pass: emailCfg.smtp_pass || emailCfg.api_key
                }
            });
            await transporter.sendMail({
                from,
                to,
                subject,
                html
            });
            return;
        }
    } catch (err) {
        console.warn('Failed to send notification email', err?.message || err);
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

// Serve uploaded images from backend/public/images and organize by category
// Use process.cwd() + public path so this works whether the server is started from the repo root
// or when running inside a container with working_dir set to the backend folder.
// Use lowercase `images` to match the frontend public/images convention and avoid
// case-sensitivity issues on Linux filesystems.
const imagesDir = path.join(process.cwd(), 'public', 'images');
try { fs.mkdirSync(imagesDir, { recursive: true }); } catch (e) { /* ignore */ }
app.use('/uploads', express.static(imagesDir));

// Setup upload endpoint: prefer multer multipart handling if available, otherwise fall back to base64 JSON upload
(async function setupUploadsRoute() {
    try {
        const multerMod = await import('multer');
        const multer = multerMod.default || multerMod;
        // configure multer storage
        const storage = multer.diskStorage({
            destination: function (req, file, cb) {
                // allow category via query param or form field
                const category = (req.query && req.query.category) || (req.body && req.body.category) || 'uncategorized';
                const dir = path.join(imagesDir, category.replace(/[^a-z0-9\-_]/gi, '_'));
                try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
                cb(null, dir);
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
                const dir = path.join(imagesDir, String(cat).replace(/[^a-z0-9\-_]/gi, '_'));
                try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
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

// Product Routes
app.get('/api/products', async (req, res) => {
    const { category, subcategory, search } = req.query;

    // Create cache key based on query parameters
    const cacheKey = `products:${JSON.stringify({ category, subcategory, search })}`;

    try {
        // Try to get from cache first
        const cachedProducts = await cacheService.get(cacheKey);
        if (cachedProducts) {
            console.log('Serving products from cache');
            return res.json(cachedProducts);
        }

        // Cache miss - fetch from database
        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        if (subcategory) {
            query += ' AND subcategory = ?';
            params.push(subcategory);
        }
        if (search) {
            query += ' AND name LIKE ?';
            params.push(`%${search}%`);
        }

        const products = await db.all(query, params);

        // Cache the result for 5 minutes
        await cacheService.set(cacheKey, products, 300);

        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/products/categories', async (req, res) => {
    try {
        // Try to get from cache first
        const cachedCategories = await cacheService.getCategories();
        if (cachedCategories) {
            console.log('Serving product categories from cache');
            return res.json(cachedCategories);
        }

        // Cache miss - fetch from database
        const categories = await db.all('SELECT DISTINCT category, subcategory FROM products ORDER BY category, subcategory');
        const categoryMap = categories.reduce((acc, { category, subcategory }) => {
            if (!acc[category]) {
                acc[category] = [];
            }
            if (subcategory) {
                acc[category].push(subcategory);
            }
            return acc;
        }, {});

        // Cache the result for 10 minutes (categories change less frequently)
        await cacheService.setCategories(categoryMap, 600);

        res.json(categoryMap);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', authMiddleware, requireRole('cashier'), async (req, res) => {
    const {
        name,
        price,
        stock,
        category,
        subcategory,
        image,
        imageUrl,
        description,
        technicalDetails,
        sku,
        barcode,
        cost,
        trackInventory = true
    } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'Missing fields' });
    const normalizedStock = Number.isFinite(stock) ? stock : parseInt(stock || '0', 10) || 0;
    const normalizedPrice = parseFloat(price);
    const normalizedCost = cost != null ? parseFloat(cost) : 0;
    const normalizedTrack = trackInventory === false || trackInventory === 0 ? 0 : 1;
    const trimmedSku = sku?.trim() || null;
    const trimmedBarcode = barcode?.trim() || null;
    const storedImage = image?.trim() || null;
    const storedImageSource = imageUrl?.trim() || null;
    const technical = technicalDetails || null;
    // server-side SKU uniqueness and barcode validation
    try {
        if (trimmedSku) {
            const ex = await db.get('SELECT id FROM products WHERE sku = ?', [trimmedSku]);
            if (ex) return res.status(409).json({ error: 'SKU already in use' });
        }
        if (trimmedBarcode) {
            if (!/^[0-9]{8,13}$/.test(String(trimmedBarcode))) return res.status(400).json({ error: 'Invalid barcode format (8-13 digits expected)' });
        }
    } catch (e) {
        // continue; validation non-blocking if DB read fails
    }
    try {
        const result = await db.run(
            `INSERT INTO products (name, price, stock, category, subcategory, image, image_source, description, technical_details, sku, barcode, cost, track_inventory)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                normalizedPrice,
                normalizedStock,
                category || null,
                subcategory || null,
                storedImage,
                storedImageSource,
                description || null,
                technical,
                trimmedSku,
                trimmedBarcode,
                normalizedCost,
                normalizedTrack
            ]
        );
        const product = await db.get('SELECT * FROM products WHERE id = ?', [result.lastID]);
        await logActivity('product', result.lastID, 'create', req.user?.username, JSON.stringify(product));
        await queueNotification({
            staffId: null,
            username: null,
            title: 'New product added',
            message: `${name} is now available${normalizedStock <= 5 ? ` (low stock: ${normalizedStock})` : ''}`,
            type: normalizedStock <= 5 ? 'warning' : 'info',
            metadata: { productId: result.lastID }
        });

        // Invalidate product caches
        await cacheService.invalidateProducts();
        await cacheService.invalidateCategories();

        res.status(201).json(product);
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
        category,
        subcategory,
        image,
        imageUrl,
        description,
        technicalDetails,
        sku,
        barcode,
        cost,
        trackInventory = true
    } = req.body;
    try {
        const product = await db.get('SELECT * FROM products WHERE id = ?', [id]);
        if (!product) return res.status(404).json({ error: 'Product not found' });

        const normalizedStock = Number.isFinite(stock) ? stock : parseInt(stock ?? product.stock ?? 0, 10) || 0;
        const normalizedPrice = price != null ? parseFloat(price) : product.price;
        const normalizedCost = cost != null ? parseFloat(cost) : product.cost ?? 0;
        const normalizedTrack = trackInventory === false || trackInventory === 0 ? 0 : 1;
        const trimmedSku = sku?.trim() || null;
        const trimmedBarcode = barcode?.trim() || null;
        const storedImage = image != null ? (image.trim() || null) : (product.image ?? null);
        const storedImageSource = imageUrl != null ? (imageUrl.trim() || null) : (product.image_source ?? null);
        const technical = technicalDetails != null ? technicalDetails : product.technical_details;

        // server-side SKU uniqueness & barcode validation for updates
        if (trimmedSku) {
            const ex = await db.get('SELECT id FROM products WHERE sku = ? AND id != ?', [trimmedSku, id]);
            if (ex) return res.status(409).json({ error: 'SKU already in use by another product' });
        }
        if (trimmedBarcode) {
            if (!/^[0-9]{8,13}$/.test(String(trimmedBarcode))) return res.status(400).json({ error: 'Invalid barcode format (8-13 digits expected)' });
        }
        await db.run(
            `UPDATE products
             SET name = ?, price = ?, stock = ?, category = ?, subcategory = ?, image = ?, image_source = ?, description = ?, technical_details = ?, sku = ?, barcode = ?, cost = ?, track_inventory = ?
             WHERE id = ?`,
            [
                name ?? product.name,
                normalizedPrice,
                normalizedStock,
                category ?? product.category,
                subcategory ?? product.subcategory,
                storedImage,
                storedImageSource,
                description ?? product.description,
                technical,
                trimmedSku,
                trimmedBarcode,
                normalizedCost,
                normalizedTrack,
                id
            ]
        );
        // If stock changed as part of this update, record a stock_adjustments audit entry
        try {
            const prevStock = Number(product.stock || 0);
            if (Number(normalizedStock) !== prevStock) {
                const delta = Number(normalizedStock) - prevStock;
                await db.run(
                    'INSERT INTO stock_adjustments (product_id, staff_id, username, delta, new_stock, reason) VALUES (?, ?, ?, ?, ?, ?)',
                    [id, req.user?.staffId || null, req.user?.username || null, delta, Number(normalizedStock), 'updated via product edit']
                );
                await logActivity('product', id, 'adjust_stock', req.user?.username, JSON.stringify({ prev: prevStock, next: normalizedStock, delta }));
            }
        } catch (e) {
            console.warn('Failed to record stock adjustment during product update', e?.message || e);
        }
        const updated = await db.get('SELECT * FROM products WHERE id = ?', [id]);
        await logActivity('product', id, 'update', req.user?.username, JSON.stringify(updated));
        if (normalizedStock <= 5) {
            await queueNotification({
                staffId: null,
                username: null,
                title: 'Low stock warning',
                message: `${updated.name} is running low (${normalizedStock} left)`,
                type: 'warning',
                metadata: { productId: Number(id) }
            });
        }
        res.json(updated);

        // Invalidate product caches
        await cacheService.invalidateProducts();
        await cacheService.invalidateCategories();

        // WebSocket broadcast for real-time updates
        try {
            const wsService = getWebSocketService();
            if (normalizedStock !== Number(product.stock || 0)) {
                wsService.notifyStockChange(id, {
                    productId: id,
                    productName: updated.name,
                    previousStock: Number(product.stock || 0),
                    newStock: normalizedStock,
                    delta: normalizedStock - Number(product.stock || 0),
                    updatedBy: req.user?.username || 'system'
                });
            }
            wsService.notifyCustomerUpdate({ type: 'product_updated', product: updated });
        } catch (wsErr) {
            console.warn('WebSocket broadcast failed:', wsErr.message);
        }
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
                metadata: { productId: Number(id), newStock: next }
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
        const emailCfg = await db.get('SELECT provider, api_key, email_from, email_to, smtp_host, smtp_port, smtp_user FROM settings_email ORDER BY id DESC LIMIT 1');
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
            smtp_host, smtp_port, smtp_user, smtp_pass,
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
        if (req.user && req.user.role !== 'admin' && (email_provider || email_api_key || email_from || email_to || smtp_host || smtp_port || smtp_user || smtp_pass || email_template_invoice || email_template_quote || email_template_quote_request)) {
            return res.status(403).json({ error: 'Only administrators may modify email/SMTP settings' });
        }

        // update email config if provided (store as last row in settings_email)
        if (email_provider || email_api_key || email_from || email_to || smtp_host || smtp_port || smtp_user || smtp_pass) {
            await db.run('INSERT INTO settings_email (provider, api_key, email_from, email_to, smtp_host, smtp_port, smtp_user, smtp_pass) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
                email_provider || null,
                email_api_key || null,
                email_from || null,
                email_to || null,
                smtp_host || null,
                smtp_port || null,
                smtp_user || null,
                smtp_pass || null
            ]);
        }
        const settings = await db.get('SELECT * FROM settings WHERE id = 1');
        const emailCfg = await db.get('SELECT provider, api_key, email_from, email_to, smtp_host, smtp_port, smtp_user FROM settings_email ORDER BY id DESC LIMIT 1');

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

        await sendNotificationEmail(subject, html, to);
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

// Notifications endpoints (polling)
app.get('/api/notifications', authMiddleware, requireRole('cashier'), async (req, res) => {
    try {
        const notifications = await db.all('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/:id/read', authMiddleware, requireRole('cashier'), async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
        res.json({ id, read: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark all notifications read (for convenience)
app.put('/api/notifications/mark-read-all', authMiddleware, requireRole('cashier'), async (req, res) => {
    try {
        await db.run('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Dismiss (delete) a notification
app.delete('/api/notifications/:id', authMiddleware, requireRole('cashier'), async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('DELETE FROM notifications WHERE id = ?', [id]);
        res.status(204).end();
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
        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

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

        for (const item of items) {
            await db.run(
                'INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [invoiceId, item.id || null, item.quantity, item.price]
            );
            if (type === 'invoice' && item.id) {
                const productRow = await db.get('SELECT stock, track_inventory, name FROM products WHERE id = ?', [item.id]);
                if (productRow && (productRow.track_inventory === null || productRow.track_inventory === undefined || productRow.track_inventory)) {
                    const currentStock = parseInt(productRow.stock ?? 0, 10) || 0;
                    const qty = parseInt(item.quantity ?? 0, 10) || 0;
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

// Get single invoice with line items (for edit/view in UI)
app.get('/api/invoices/:id', authMiddleware, requireRole('manager'), async (req, res) => {
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
app.put('/api/invoices/:id', authMiddleware, requireRole('manager'), async (req, res) => {
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

app.put('/api/invoices/:id/status', authMiddleware, requireRole('manager'), async (req, res) => {
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

app.delete('/api/invoices/:id', authMiddleware, requireRole('admin'), async (req, res) => {
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
    const { customer, cart, payment } = req.body || {};
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

    const paymentMethod = payment?.method || 'cod';
    const paymentReference = payment?.reference || null;
    let paymentSlipPath = null;

    if (paymentMethod === 'transfer' && payment?.slip) {
        try {
            const slipDir = path.join(imagesDir, 'payment_slips');
            fs.mkdirSync(slipDir, { recursive: true });
            let base64 = payment.slip;
            let ext = 'png';
            const match = String(base64).match(/^data:(.+);base64,(.+)$/);
            if (match) {
                const mime = match[1];
                base64 = match[2];
                const parts = mime.split('/');
                ext = parts[1] ? parts[1].split('+')[0] : ext;
            }
            const fileName = `slip-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext || 'png'}`;
            const filePath = path.join(slipDir, fileName);
            fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
            const rel = path.relative(imagesDir, filePath).replace(/\\/g, '/');
            paymentSlipPath = `/uploads/${rel}`;
        } catch (err) {
            console.warn('Failed to persist payment slip', err?.message || err);
        }
    }

    try {
        const total = sanitizedCart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);

        const orderResult = await db.run(
            'INSERT INTO orders (customer_name, customer_email, customer_phone, customer_company, total, status, payment_method, payment_reference, payment_slip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                customer.name,
                customer.email,
                customer.phone || null,
                customer.company || null,
                total,
                paymentMethod === 'transfer' ? 'awaiting_verification' : 'pending',
                paymentMethod,
                paymentReference || null,
                paymentSlipPath
            ]
        );
        const orderId = orderResult.lastID;

        const stmt = await db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
        for (const item of sanitizedCart) {
            await stmt.run(orderId, item.id, Number(item.quantity) || 0, Number(item.price) || 0);
            // Decrement stock
            await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
        }
        await stmt.finalize();
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

            const invResult = await db.run('INSERT INTO invoices (customer_id, subtotal, tax_amount, total, outlet_id, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [null, 0, 0, 0, outletId, 'invoice', 'issued']);
            const invoiceId = invResult.lastID;

            // persist invoice_items and compute subtotal
            let invSubtotal = 0;
            const invStmt = await db.prepare('INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
            for (const item of sanitizedCart) {
                await invStmt.run(invoiceId, item.id, Number(item.quantity) || 0, Number(item.price) || 0);
                invSubtotal += (Number(item.price) || 0) * (Number(item.quantity) || 0);
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
                    status: paymentMethod === 'transfer' ? 'awaiting_verification' : 'pending',
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
        const role = await db.get('SELECT * FROM roles WHERE id = ?', [result.lastID]);
        res.status(201).json(role);
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed')) return res.status(409).json({ error: 'Role already exists' });
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
            try { await db.run('DELETE FROM refresh_tokens WHERE id = ?', [row.id]); } catch (e) {}
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
        const hasTransactions = await db.get('SELECT COUNT(*) as count FROM general_ledger WHERE account_id = ?', [id]);
        if (hasTransactions.count > 0) {
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
                id: null,
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
                COUNT(DISTINCT i.id) as transactionCount,
                COALESCE(SUM(i.total), 0) as totalSales,
                COALESCE(SUM(CASE WHEN p.method = 'cash' THEN i.total ELSE 0 END), 0) as cashSales,
                COALESCE(SUM(CASE WHEN p.method != 'cash' THEN i.total ELSE 0 END), 0) as cardSales
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
            SET closed_at = datetime('now'), closed_by = ?
            WHERE closed_at IS NULL
        `, [req.user.username]);

        // Start new shift
        const result = await db.run(`
            INSERT INTO shifts (opened_by, starting_cash)
            VALUES (?, ?)
        `, [req.user.username, startingCash]);

        await logActivity('shifts', result.lastID, 'opened', req.user.username, `Shift opened with $${startingCash} starting cash`);

        res.json({ message: 'Shift started successfully', shiftId: result.lastID });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/operations/shift/close', authMiddleware, requireRole(['cashier', 'manager']), async (req, res) => {
    const { actualCash, cashCounts, discrepancy, notes } = req.body;

    try {
        const result = await db.run(`
            UPDATE shifts
            SET closed_at = datetime('now'),
                closed_by = ?,
                actual_cash = ?,
                cash_counts = ?,
                discrepancy = ?,
                notes = ?
            WHERE closed_at IS NULL
        `, [req.user.username, actualCash, JSON.stringify(cashCounts), discrepancy, notes]);

        if (result.changes === 0) {
            return res.status(400).json({ error: 'No open shift found' });
        }

        await logActivity('shifts', null, 'closed', req.user.username, `Shift closed with $${actualCash} actual cash`);

        res.json({ message: 'Shift closed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== END OPERATIONS ENDPOINTS ====================



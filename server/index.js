import express from 'express';
import cors from 'cors';
import { setupDatabase } from './database.js';
import { generateInvoicePdf } from './invoice-service.js';
import nodemailer from 'nodemailer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const app = express();
const port = 4000;

app.use(cors());
app.use(express.json());
// Simple request logging for diagnostics
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${req.ip}`);
    next();
});

app.get('/', (req, res) => {
    res.send('IRnVend API is running...');
});

// Health endpoint
app.get('/health', async (req, res) => {
    try {
        const settings = db ? await db.get('SELECT id FROM settings WHERE id = 1') : null;
        res.json({ status: 'ok', db: !!settings, pid: process.pid });
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
        const map = { cashier: 1, manager: 2, admin: 3 };
        return map[r] || 0;
    };
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
        const userRole = req.user.role || 'staff';
        if (Array.isArray(required)) {
            if (!required.includes(userRole)) return res.status(403).json({ error: 'Forbidden' });
            return next();
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

app.use('/api', (req, res, next) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not ready' });
    }
    next();
});

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
        app.listen(port, '0.0.0.0', () => {
            console.log(`Server running at http://0.0.0.0:${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

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
            // keep session map for compatibility
            sessions.set(token, { username: staff.username, role: roleName, staffId: staff.id });
            await logActivity('staff', staff.id, 'login', staff.username, 'staff login');
            return res.json({ token, role: roleName });
        }

        // fallback to demo in-memory users for compatibility
        const user = users.find((u) => u.username === username && u.password === password);
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    // create JWT for demo users as well
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

    try {
        const products = await db.all(query, params);
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/products/categories', async (req, res) => {
    try {
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
        res.json(categoryMap);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/products', async (req, res) => {
    const { name, price, stock, category, subcategory } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'Missing fields' });
    try {
        const result = await db.run(
            'INSERT INTO products (name, price, stock, category, subcategory) VALUES (?, ?, ?, ?, ?)',
            [name, price, stock || 0, category, subcategory]
        );
        const product = await db.get('SELECT * FROM products WHERE id = ?', [result.lastID]);
        res.status(201).json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const { name, price, stock, category, subcategory } = req.body;
    try {
        await db.run(
            'UPDATE products SET name = ?, price = ?, stock = ?, category = ?, subcategory = ? WHERE id = ?',
            [name, price, stock, category, subcategory, id]
        );
        const product = await db.get('SELECT * FROM products WHERE id = ?', [id]);
        res.json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
        res.status(204).end();
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
        res.json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Customer Routes
app.get('/api/customers', async (req, res) => {
    const customers = await db.all('SELECT * FROM customers');
    res.json(customers);
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
        res.status(201).json(customer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/customers/:id', async (req, res) => {
    try {
        await db.run('DELETE FROM customers WHERE id = ?', [req.params.id]);
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
        res.json({ ...settings, outlet, email: emailCfg || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { outlet_name, currency, gst_rate, store_address, invoice_template, current_outlet_id,
            email_provider, email_api_key, email_from, email_to,
            smtp_host, smtp_port, smtp_user, smtp_pass } = req.body;
        await db.run(
            `UPDATE settings SET outlet_name = ?, currency = ?, gst_rate = ?, store_address = ?, invoice_template = ?, current_outlet_id = COALESCE(?, current_outlet_id) WHERE id = 1`,
            [outlet_name, currency, gst_rate || 0.0, store_address || null, invoice_template || null, current_outlet_id || null]
        );
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
        res.json({ ...settings, email: emailCfg || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Quote endpoints (public submit, admin list)
app.post('/api/quotes', async (req, res) => {
    try {
        const { company_name, contact_name, email: contact_email, phone, details } = req.body;
        if (!contact_name || !contact_email) return res.status(400).json({ error: 'Missing contact name or email' });
        const result = await db.run('INSERT INTO quotes (company_name, contact_name, email, phone, details) VALUES (?, ?, ?, ?, ?)', [company_name || null, contact_name, contact_email, phone || null, details || null]);
        const quote = await db.get('SELECT * FROM quotes WHERE id = ?', [result.lastID]);

        // ensure customer exists or is updated
        let customer = await db.get('SELECT * FROM customers WHERE email = ?', [contact_email]);
        if (customer) {
            await db.run('UPDATE customers SET name = ? WHERE id = ?', [contact_name, customer.id]);
        } else {
            const cRes = await db.run('INSERT INTO customers (name, email) VALUES (?, ?)', [contact_name, contact_email]);
            customer = await db.get('SELECT * FROM customers WHERE id = ?', [cRes.lastID]);
        }

        // Create a manage-able invoice record (type=quote) linked to this customer so admin can review/convert
        const invRes = await db.run('INSERT INTO invoices (customer_id, subtotal, tax_amount, total, outlet_id, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [customer.id, 0, 0, 0, null, 'quote', 'draft']);
        const createdInvoice = await db.get('SELECT * FROM invoices WHERE id = ?', [invRes.lastID]);

        // send admin notification (supports sendgrid or smtp via settings_email)
        try {
            const subject = `Quotation request from ${contact_name}${company_name ? ' @ ' + company_name : ''}`;
            const bodyHtml = `<p>New quotation request received:</p>
                <ul>
                  <li><strong>Company:</strong> ${company_name || '—'}</li>
                  <li><strong>Contact:</strong> ${contact_name}</li>
                  <li><strong>Email:</strong> ${contact_email}</li>
                  <li><strong>Phone:</strong> ${phone || '—'}</li>
                  <li><strong>Details:</strong> ${details || '—'}</li>
                  <li><strong>Linked Quote ID:</strong> ${quote.id}</li>
                  <li><strong>Created Invoice ID:</strong> ${createdInvoice.id}</li>
                </ul>`;
            await sendNotificationEmail(subject, bodyHtml);
        } catch (err) {
            console.warn('Failed to send quote notification', err?.message || err);
        }

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

        for (const item of items) {
            await db.run(
                'INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [invoiceId, item.id || null, item.quantity, item.price]
            );
            if (type === 'invoice' && item.id) {
                await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
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

app.put('/api/invoices/:id/status', authMiddleware, requireRole('admin'), async (req, res) => {
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
        res.json({ ...invoice, status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/invoices/:id/convert', authMiddleware, requireRole('admin'), async (req, res) => {
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
            const product = await db.get('SELECT stock FROM products WHERE id = ?', [item.product_id]);
            if (!product) {
                return res.status(400).json({ error: `Product ${item.product_id} no longer exists` });
            }
            if (product.stock < item.quantity) {
                return res.status(400).json({ error: `Insufficient stock for product ${item.product_id}` });
            }
        }

        for (const item of items) {
            if (!item.product_id) continue;
            await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);
        }

        await db.run(
            'UPDATE invoices SET type = ?, status = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['invoice', 'issued', id]
        );

        const updated = await db.get('SELECT * FROM invoices WHERE id = ?', [id]);
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

// Order processing for guests
app.post('/api/orders', async (req, res) => {
    const { customer, cart } = req.body;
    if (!customer || !customer.name || !customer.email || !cart || cart.length === 0) {
        return res.status(400).json({ error: 'Missing customer data or cart is empty' });
    }

    try {
        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

        const orderResult = await db.run(
            'INSERT INTO orders (customer_name, customer_email, total) VALUES (?, ?, ?)',
            [customer.name, customer.email, total]
        );
        const orderId = orderResult.lastID;

        const stmt = await db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
        for (const item of cart) {
            await stmt.run(orderId, item.id, item.quantity, item.price);
            // Decrement stock
            await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
        }
        await stmt.finalize();
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

        // send admin notification about new order
        try {
            const subject = `New order placed by ${customer.name}`;
            const itemsHtml = cart.map(it => `<li>${it.name} x ${it.quantity} — ${it.price}</li>`).join('');
            const bodyHtml = `<p>A new order was placed:</p><ul><li><strong>Name:</strong> ${customer.name}</li><li><strong>Email:</strong> ${customer.email}</li><li><strong>Total:</strong> ${total}</li></ul><p>Items:</p><ul>${itemsHtml}</ul><p>Order ID: ${orderId}</p>`;
            await sendNotificationEmail(subject, bodyHtml);
        } catch (err) {
            console.warn('Failed to send order notification', err?.message || err);
        }

        res.status(201).json({ message: 'Order created successfully', orderId });
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

// Admin: switch/impersonate staff - returns a token for the specified staff
app.post('/api/staff/:id/switch', authMiddleware, requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const staff = await db.get('SELECT * FROM staff WHERE id = ?', [id]);
        if (!staff) return res.status(404).json({ error: 'Staff not found' });
        const roles = await db.all('SELECT r.name FROM roles r JOIN staff_roles sr ON sr.role_id = r.id WHERE sr.staff_id = ?', [id]);
    const roleName = (roles && roles[0] && roles[0].name) ? roles[0].name : 'staff';
    const token = jwt.sign({ username: staff.username, role: roleName, staffId: staff.id }, JWT_SECRET, { expiresIn: '30d' });
    sessions.set(token, { username: staff.username, role: roleName, staffId: staff.id });
        await logActivity('staff', id, 'impersonated', req.user?.username, `impersonated ${staff.username}`);
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

export default app;



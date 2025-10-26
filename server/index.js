import express from 'express';
import cors from 'cors';
import { setupDatabase } from './database.js';
import { generateInvoicePdf } from './invoice-service.js';

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
    const user = sessions.get(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
        if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
        next();
    };
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

// Simple login endpoint (demo only)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find((u) => u.username === username && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = `${Date.now()}.${Math.random().toString(36).slice(2)}`;
    sessions.set(token, { username: user.username, role: user.role });
    res.json({ token, role: user.role });
});

// Product Routes
app.get('/api/products', async (req, res) => {
    const products = await db.all('SELECT * FROM products');
    res.json(products);
});

app.post('/api/products', async (req, res) => {
    const { name, price, stock } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'Missing fields' });
    try {
        const result = await db.run('INSERT INTO products (name, price, stock) VALUES (?, ?, ?)', [name, price, stock || 0]);
        const product = await db.get('SELECT * FROM products WHERE id = ?', [result.lastID]);
        res.status(201).json(product);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    const { name, price, stock } = req.body;
    try {
        await db.run('UPDATE products SET name = ?, price = ?, stock = ? WHERE id = ?', [name, price, stock, id]);
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

// Customer update
app.put('/api/customers/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email } = req.body;
    try {
        await db.run('UPDATE customers SET name = ?, email = ? WHERE id = ?', [name, email, id]);
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
    const { name, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    try {
        const result = await db.run('INSERT INTO customers (name, email) VALUES (?, ?)', [name, email || null]);
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
        res.json({ ...settings, outlet });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/settings', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { outlet_name, currency, gst_rate, store_address, invoice_template, current_outlet_id } = req.body;
        await db.run(
            `UPDATE settings SET outlet_name = ?, currency = ?, gst_rate = ?, store_address = ?, invoice_template = ?, current_outlet_id = COALESCE(?, current_outlet_id) WHERE id = 1`,
            [outlet_name, currency, gst_rate || 0.0, store_address || null, invoice_template || null, current_outlet_id || null]
        );
        const settings = await db.get('SELECT * FROM settings WHERE id = 1');
        res.json(settings);
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
    const { customerId, items } = req.body;
    if (!customerId || !items || items.length === 0) {
        return res.status(400).json({ error: 'Missing customerId or items' });
    }

    try {
        // compute subtotal
        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

        // determine outlet and gst_rate from settings.current_outlet_id or fallback to settings
        const settingsRow = await db.get('SELECT * FROM settings WHERE id = 1');
        let outlet = null;
        if (settingsRow && settingsRow.current_outlet_id) {
            outlet = await db.get('SELECT * FROM outlets WHERE id = ?', [settingsRow.current_outlet_id]);
        }
        if (!outlet) {
            // fallback to settings values
            outlet = {
                gst_rate: settingsRow?.gst_rate || 0,
                currency: settingsRow?.currency || 'MVR',
                name: settingsRow?.outlet_name || 'My Outlet'
            };
        }

        const gstRate = parseFloat(outlet.gst_rate || 0);
        const taxAmount = +(subtotal * (gstRate / 100));
        const total = +(subtotal + taxAmount);

        const result = await db.run(
            'INSERT INTO invoices (customer_id, subtotal, tax_amount, total, outlet_id) VALUES (?, ?, ?, ?, ?)',
            [customerId, subtotal, taxAmount, total, outlet.id || null]
        );
        const invoiceId = result.lastID;

        for (const item of items) {
            await db.run(
                'INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                [invoiceId, item.id, item.quantity, item.price]
            );
            await db.run('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);
        }

        res.status(201).json({ id: invoiceId, message: 'Invoice created', subtotal, taxAmount, total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/invoices', async (req, res) => {
    try {
        const invoices = await db.all(`
            SELECT 
                i.id, i.total, i.created_at,
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



import { sendMail } from '../../lib/mail.js';

function resolveSchemaFragments(db) {
  const isPostgres = (db?.dialect || '').toLowerCase() === 'postgres';
  return {
    idColumn: isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT',
    timestampType: isPostgres ? 'TIMESTAMP' : 'DATETIME'
  };
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function formatMonthKey(date) {
  return date.toISOString().slice(0, 7); // YYYY-MM
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

async function ensureVendorBillingSchema(db) {
  const { idColumn, timestampType } = resolveSchemaFragments(db);
  await db.run(`
    CREATE TABLE IF NOT EXISTS vendor_invoices (
      id ${idColumn},
      vendor_id INTEGER NOT NULL,
      invoice_number TEXT,
      fee_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'unpaid',
      issued_at ${timestampType} DEFAULT CURRENT_TIMESTAMP,
      due_date TEXT,
      paid_at ${timestampType},
      reminder_stage INTEGER DEFAULT 0,
      metadata TEXT,
      FOREIGN KEY (vendor_id) REFERENCES vendors(id)
    );
  `);
  const alterStatements = [
    `ALTER TABLE vendor_invoices ADD COLUMN void_reason TEXT`,
    `ALTER TABLE vendor_invoices ADD COLUMN voided_at ${timestampType}`,
  ];
  for (const stmt of alterStatements) {
    try {
      await db.run(stmt);
    } catch (err) {
      // likely already exists; ignore
    }
  }
}

async function fetchVendor(db, vendorId) {
  return db.get('SELECT * FROM vendors WHERE id = ?', [vendorId]);
}

function buildInvoiceNumber(vendorId, date = new Date()) {
  const monthKey = date.toISOString().slice(0, 7).replace('-', '');
  const rand = Math.floor(Math.random() * 900) + 100;
  return `VF-${vendorId}-${monthKey}-${rand}`;
}

async function sendVendorEmail(vendor, subject, html, text) {
  if (!vendor?.email) return;
  try {
    await sendMail({ to: vendor.email, subject, html, text: text || html.replace(/<[^>]+>/g, '') });
  } catch (err) {
    console.warn('Vendor billing email failed', err?.message || err);
  }
}

async function insertInvoice(db, vendor, issueDate, amount, metadata) {
  await ensureVendorBillingSchema(db);
  const invoiceNumber = buildInvoiceNumber(vendor.id, issueDate);
  const issuedOn = toISODate(issueDate);
  const dueDate = toISODate(addDays(issueDate, 5));
  const { lastID } = await db.run(
    `INSERT INTO vendor_invoices (vendor_id, invoice_number, fee_amount, status, issued_at, due_date, reminder_stage, metadata)
     VALUES (?, ?, ?, 'unpaid', ?, ?, 0, ?)` ,
    [vendor.id, invoiceNumber, amount, issuedOn, dueDate, metadata ? JSON.stringify(metadata) : null]
  );
  await db.run('UPDATE vendors SET last_invoice_date = ? WHERE id = ?', [issuedOn, vendor.id]);
  return db.get('SELECT * FROM vendor_invoices WHERE id = ?', [lastID]);
}

export async function generateVendorInvoice({ db, vendorId, amount = null, issueDate = new Date(), metadata = null }) {
  const vendor = await fetchVendor(db, vendorId);
  if (!vendor) throw new Error('Vendor not found');
  const fee = amount != null ? Number(amount) : Number(vendor.monthly_fee || 0);
  if (!fee || fee <= 0) {
    throw new Error('Vendor monthly fee is not configured');
  }
  const invoice = await insertInvoice(db, vendor, issueDate, fee, metadata);
  const html = `<p>Hello ${vendor.legal_name || ''},</p>
    <p>This is your monthly vendor fee invoice.</p>
    <ul>
      <li><strong>Invoice #:</strong> ${invoice.invoice_number}</li>
      <li><strong>Amount:</strong> ${fee}</li>
      <li><strong>Due date:</strong> ${invoice.due_date}</li>
    </ul>
    <p>Please pay within five days to keep your dashboard active.</p>`;
  await sendVendorEmail(vendor, `Vendor fee invoice ${invoice.invoice_number}`, html);
  return invoice;
}

export async function listVendorInvoices({ db, vendorId, limit = 50 }) {
  await ensureVendorBillingSchema(db);
  const rows = await db.all('SELECT * FROM vendor_invoices WHERE vendor_id = ? ORDER BY issued_at DESC LIMIT ?', [vendorId, limit]);
  return rows || [];
}

export async function markVendorInvoicePaid({ db, vendorId, invoiceId, paidAt = new Date() }) {
  await ensureVendorBillingSchema(db);
  const invoice = await db.get('SELECT * FROM vendor_invoices WHERE id = ? AND vendor_id = ?', [invoiceId, vendorId]);
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status === 'void') throw new Error('Cannot mark a void invoice as paid');
  if (invoice.status === 'paid') return invoice;
  const paid = toISODate(paidAt);
  await db.run('UPDATE vendor_invoices SET status = ?, paid_at = ?, reminder_stage = 99 WHERE id = ?', ['paid', paid, invoiceId]);
  await db.run('UPDATE vendors SET account_active = 1 WHERE id = ?', [vendorId]);
  return db.get('SELECT * FROM vendor_invoices WHERE id = ?', [invoiceId]);
}

export async function voidVendorInvoice({ db, vendorId, invoiceId, reason }) {
  await ensureVendorBillingSchema(db);
  const invoice = await db.get('SELECT * FROM vendor_invoices WHERE id = ? AND vendor_id = ?', [invoiceId, vendorId]);
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.status === 'paid') throw new Error('Cannot void a paid invoice');
  const trimmedReason = reason ? reason.toString().trim() : null;
  await db.run(
    'UPDATE vendor_invoices SET status = ?, void_reason = ?, voided_at = CURRENT_TIMESTAMP, reminder_stage = 99 WHERE id = ?',
    ['void', trimmedReason || null, invoiceId]
  );
  return db.get('SELECT * FROM vendor_invoices WHERE id = ?', [invoiceId]);
}

async function disableVendor(db, vendorId) {
  await db.run('UPDATE vendors SET account_active = 0 WHERE id = ?', [vendorId]);
}

async function sendReminder(vendor, invoice, stage) {
  let subject = `Reminder: Vendor fee invoice ${invoice.invoice_number}`;
  let intro = 'This is a reminder to pay your monthly vendor fee.';
  if (stage === 2) {
    subject = `Final reminder: vendor fee invoice ${invoice.invoice_number}`;
    intro = 'This is the final reminder before your vendor dashboard is disabled.';
  }
  const html = `<p>Hello ${vendor.legal_name || ''},</p>
    <p>${intro}</p>
    <ul>
      <li><strong>Invoice #:</strong> ${invoice.invoice_number}</li>
      <li><strong>Amount:</strong> ${invoice.fee_amount}</li>
      <li><strong>Due date:</strong> ${invoice.due_date}</li>
    </ul>`;
  await sendVendorEmail(vendor, subject, html);
}

export async function processDailyVendorBilling(db, today = new Date()) {
  await ensureVendorBillingSchema(db);
  const todayKey = toISODate(today);
  const monthKey = formatMonthKey(today);
  const firstOfMonth = today.getDate() === 1;

  if (firstOfMonth) {
    const vendors = await db.all('SELECT * FROM vendors WHERE COALESCE(monthly_fee, 0) > 0');
    for (const vendor of vendors) {
      const billingStart = vendor.billing_start_date ? new Date(vendor.billing_start_date) : null;
      if (billingStart && billingStart > today) continue;
      const lastMonth = vendor.last_invoice_date ? vendor.last_invoice_date.slice(0, 7) : null;
      if (lastMonth === monthKey) continue;
      try {
        await generateVendorInvoice({ db, vendorId: vendor.id, issueDate: today });
      } catch (err) {
        console.warn('Failed generating vendor invoice', vendor.id, err?.message || err);
      }
    }
  }

  // Handle reminders and disabling accounts
  const unpaid = await db.all(`
    SELECT vi.*, v.email AS vendor_email, v.legal_name AS vendor_legal_name, v.account_active
    FROM vendor_invoices vi
    JOIN vendors v ON v.id = vi.vendor_id
    WHERE vi.status = 'unpaid'
  `);

  for (const invoice of unpaid) {
    const issuedAt = invoice.issued_at ? new Date(invoice.issued_at) : today;
    const daysSince = Math.floor((new Date(todayKey) - new Date(toISODate(issuedAt))) / (24 * 60 * 60 * 1000));
    const vendorMeta = { id: invoice.vendor_id, email: invoice.vendor_email, legal_name: invoice.vendor_legal_name };
    if (daysSince >= 2 && invoice.reminder_stage < 1) {
      await sendReminder(vendorMeta, invoice, 1);
      await db.run('UPDATE vendor_invoices SET reminder_stage = 1 WHERE id = ?', [invoice.id]);
    } else if (daysSince >= 4 && invoice.reminder_stage < 2) {
      await sendReminder(vendorMeta, invoice, 2);
      await db.run('UPDATE vendor_invoices SET reminder_stage = 2 WHERE id = ?', [invoice.id]);
    } else if (daysSince >= 5 && invoice.reminder_stage < 3) {
      await disableVendor(db, invoice.vendor_id);
      await db.run('UPDATE vendor_invoices SET reminder_stage = 3 WHERE id = ?', [invoice.id]);
      const html = `<p>Hello ${invoice.vendor_legal_name || ''},</p>
        <p>Your vendor account has been temporarily disabled due to unpaid fees. Please contact support after settling invoice ${invoice.invoice_number}.</p>`;
      await sendVendorEmail(vendorMeta, 'Vendor account disabled', html);
    }
  }
}

export async function reactivateVendorAccount({ db, vendorId, billingStartDate = null }) {
  const vendor = await fetchVendor(db, vendorId);
  if (!vendor) throw new Error('Vendor not found');
  await db.run('UPDATE vendors SET account_active = 1, billing_start_date = COALESCE(?, billing_start_date) WHERE id = ?', [billingStartDate, vendorId]);
  return fetchVendor(db, vendorId);
}

export async function updateVendorBillingSettings({ db, vendorId, monthlyFee, billingStartDate }) {
  const updates = [];
  const params = [];
  if (monthlyFee != null) {
    updates.push('monthly_fee = ?');
    params.push(Number(monthlyFee));
  }
  if (billingStartDate) {
    updates.push('billing_start_date = ?');
    params.push(billingStartDate);
  }
  if (!updates.length) return fetchVendor(db, vendorId);
  params.push(vendorId);
  await db.run(`UPDATE vendors SET ${updates.join(', ')} WHERE id = ?`, params);
  return fetchVendor(db, vendorId);
}

export { ensureVendorBillingSchema };

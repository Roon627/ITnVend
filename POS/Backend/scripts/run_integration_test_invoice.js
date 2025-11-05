#!/usr/bin/env node
// Small integration test for invoice -> accounts_payable + GL commission posting
// This script creates a fresh sqlite DB in ./tmp_test_db/test.db, seeds minimal tables,
// runs the invoice creation logic (simplified) and asserts AP + GL lines are created.

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function run() {
  const tmpDir = path.join(process.cwd(), 'tmp_test_db');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
  const dbPath = path.join(tmpDir, 'test.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON');

  // Minimal schema pieces we need
  await db.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL, supplier_id INTEGER);
    CREATE TABLE vendors (id INTEGER PRIMARY KEY AUTOINCREMENT, commission_rate REAL);
    CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
    CREATE TABLE chart_of_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, account_code TEXT UNIQUE, account_name TEXT, account_type TEXT, category TEXT);
    CREATE TABLE invoices (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, subtotal REAL, tax_amount REAL, total REAL, outlet_id INTEGER, type TEXT, status TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE invoice_items (id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER, product_id INTEGER, quantity REAL, price REAL);
    CREATE TABLE journal_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, entry_date DATE NOT NULL, description TEXT NOT NULL, reference TEXT, total_debit REAL NOT NULL DEFAULT 0, total_credit REAL NOT NULL DEFAULT 0, status TEXT DEFAULT 'draft', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE journal_entry_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, journal_entry_id INTEGER, account_id INTEGER, description TEXT, debit REAL DEFAULT 0, credit REAL DEFAULT 0);
    CREATE TABLE accounts_payable (id INTEGER PRIMARY KEY AUTOINCREMENT, vendor_id INTEGER, invoice_number TEXT, invoice_date DATE, due_date DATE, amount REAL NOT NULL, paid_amount REAL DEFAULT 0, status TEXT DEFAULT 'pending', notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);

  // seed COA
  const coa = [
    ['1200', 'Accounts Receivable', 'Asset', 'Current Assets'],
    ['4000', 'Sales Revenue', 'Revenue', 'Revenue'],
    ['2200', 'Taxes Payable', 'Liability', 'Current Liabilities'],
    ['2000', 'Accounts Payable', 'Liability', 'Current Liabilities'],
    ['4200', 'Commission Revenue', 'Revenue', 'Revenue']
  ];
  for (const c of coa) await db.run('INSERT INTO chart_of_accounts (account_code, account_name, account_type, category) VALUES (?, ?, ?, ?)', c);

  // seed vendor, product, customer
  const v = await db.run('INSERT INTO vendors (commission_rate) VALUES (?)', [0.10]);
  const vendorId = v.lastID;
  const p = await db.run('INSERT INTO products (name, price, supplier_id) VALUES (?, ?, ?)', ['Vendor Product', 100, vendorId]);
  const productId = p.lastID;
  const cst = await db.run('INSERT INTO customers (name) VALUES (?)', ['Test Customer']);
  const customerId = cst.lastID;

  // Build an invoice with 2 units of product at price 100 => subtotal 200
  const validItems = [{ id: productId, quantity: 2, price: 100 }];
  const subtotal = validItems.reduce((s, it) => s + (it.price * it.quantity), 0);
  const gstRate = 0; // keep zero for simplicity
  const taxAmount = +(subtotal * (gstRate / 100));
  const total = subtotal + taxAmount;

  // Insert invoice
  const invRes = await db.run('INSERT INTO invoices (customer_id, subtotal, tax_amount, total, outlet_id, type, status) VALUES (?, ?, ?, ?, ?, ?, ?)', [customerId, subtotal, taxAmount, total, null, 'invoice', 'issued']);
  const invoiceId = invRes.lastID;

  for (const it of validItems) {
    await db.run('INSERT INTO invoice_items (invoice_id, product_id, quantity, price) VALUES (?, ?, ?, ?)', [invoiceId, it.id, it.quantity, it.price]);
  }

  // Simulate vendorTotals aggregation and AP creation (same logic as server)
  const vendorTotals = {};
  for (const item of validItems) {
    const prod = await db.get('SELECT supplier_id FROM products WHERE id = ?', [item.id]);
    if (prod && prod.supplier_id) {
      const vid = prod.supplier_id;
      const lineTotal = Number(item.price || 0) * Number(item.quantity || 0);
      if (!vendorTotals[vid]) vendorTotals[vid] = { gross: 0 };
      vendorTotals[vid].gross += lineTotal;
    }
  }

  for (const [vid, data] of Object.entries(vendorTotals)) {
    const vendorRow = await db.get('SELECT id, commission_rate FROM vendors WHERE id = ?', [vid]);
    const commRate = vendorRow && vendorRow.commission_rate != null ? Number(vendorRow.commission_rate) : 0.10;
    const gross = Number(data.gross || 0);
    const commissionAmount = +(gross * commRate);
    const vendorNet = +(gross - commissionAmount);
    await db.run('INSERT INTO accounts_payable (vendor_id, invoice_number, invoice_date, due_date, amount, notes) VALUES (?, ?, ?, ?, ?, ?)', [vid, `INV-${invoiceId}`, new Date().toISOString().split('T')[0], null, vendorNet, `Vendor share for invoice ${invoiceId} (gross ${gross.toFixed(2)}, commission ${commissionAmount.toFixed(2)})`]);
  }

  // Create journal entry (like server)
  const journalRes = await db.run('INSERT INTO journal_entries (entry_date, description, reference, total_debit, total_credit, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [new Date().toISOString().split('T')[0], `Sale Invoice #${invoiceId}`, `INV-${invoiceId}`, total, total, 'posted', new Date().toISOString()]);
  const journalId = journalRes.lastID;

  // Get account ids
  const accountsReceivable = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['1200']);
  const salesRevenue = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['4000']);
  const taxesPayable = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['2200']);

  // Debit AR
  if (accountsReceivable) await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)', [journalId, accountsReceivable.id, total, 0, `Invoice #${invoiceId}`]);
  // Credit Sales Revenue
  if (salesRevenue) await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)', [journalId, salesRevenue.id, 0, subtotal, `Sales revenue from invoice #${invoiceId}`]);
  // Taxes
  if (taxAmount > 0 && taxesPayable) await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)', [journalId, taxesPayable.id, 0, taxAmount, `GST on invoice #${invoiceId}`]);

  // GL adjustments per vendor
  const accountsPayableAcc = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['2000']);
  const commissionAcc = await db.get('SELECT id FROM chart_of_accounts WHERE account_code = ?', ['4200']);

  for (const [vid, data] of Object.entries(vendorTotals)) {
    const vendorGross = Number(data.gross || 0) || 0;
    const vendorRow = await db.get('SELECT commission_rate FROM vendors WHERE id = ?', [vid]);
    const commRate = vendorRow && vendorRow.commission_rate != null ? Number(vendorRow.commission_rate) : 0.10;
    const commissionAmount = +(vendorGross * commRate);
    const vendorNet = +(vendorGross - commissionAmount);

    if (salesRevenue) await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)', [journalId, salesRevenue.id, vendorGross, 0, `Remove vendor-supplied sales (vendor ${vid}) for invoice #${invoiceId}`]);
    if (accountsPayableAcc) await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)', [journalId, accountsPayableAcc.id, 0, vendorNet, `Vendor payable (vendor ${vid}) for invoice #${invoiceId}`]);
    if (commissionAcc) await db.run('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)', [journalId, commissionAcc.id, 0, commissionAmount, `Commission revenue (vendor ${vid}) for invoice #${invoiceId}`]);
  }

  // Assertions
  const apRows = await db.all('SELECT * FROM accounts_payable WHERE invoice_number = ?', [`INV-${invoiceId}`]);
  if (!apRows || apRows.length === 0) {
    console.error('FAILED: No accounts_payable rows created');
    process.exit(1);
  }
  const ap = apRows[0];
  console.log('AP created:', ap.amount, ap.notes);

  const jel = await db.all('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?', [journalId]);
  if (!jel || jel.length === 0) {
    console.error('FAILED: No journal_entry_lines created');
    process.exit(1);
  }

  // Basic balance check: sum debits == sum credits for the journal
  const sums = await db.get('SELECT SUM(debit) as d, SUM(credit) as c FROM journal_entry_lines WHERE journal_entry_id = ?', [journalId]);
  const debit = Number(sums.d || 0);
  const credit = Number(sums.c || 0);
  console.log('Journal totals - debit:', debit, 'credit:', credit);
  if (Math.abs(debit - credit) > 0.0001) {
    console.error('FAILED: Journal entry not balanced');
    process.exit(1);
  }

  console.log('Integration test PASSED');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test errored:', err?.message || err);
  process.exit(2);
});

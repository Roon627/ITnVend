import sqlite3 from 'sqlite3';
import path from 'path';
const dbPath = path.resolve(process.cwd(), 'database.db');
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbPath, sqlite.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Failed to open DB', dbPath, err);
    process.exit(1);
  }
});

const casualId = process.argv[2] || '1';

db.get('SELECT id, title, product_id, status FROM casual_items WHERE id = ?', [casualId], (err, ci) => {
  if (err) {
    console.error('Query failed', err);
    db.close();
    process.exit(1);
  }
  if (!ci) {
    console.log(`No casual_items row with id=${casualId}`);
    db.close();
    return;
  }
  console.log('Casual item:', ci);
  if (!ci.product_id) {
    console.log('This casual item has no product_id set (not published).');
    db.close();
    return;
  }
  db.get('SELECT * FROM products WHERE id = ?', [ci.product_id], (err2, p) => {
    if (err2) {
      console.error('Failed to query products', err2);
      db.close();
      return;
    }
    if (!p) {
      console.log(`No product found with id=${ci.product_id}`);
    } else {
      console.log('Published product record:');
      console.log(JSON.stringify(p, null, 2));
      console.log('You can view it in the admin Products page: /products (logged-in)', '/api/products?id=' + p.id);
    }
    db.close();
  });
});

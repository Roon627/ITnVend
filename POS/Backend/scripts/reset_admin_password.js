import bcrypt from 'bcryptjs';
import { setupDatabase } from '../database.js';

// This script updates or creates the 'admin' staff user and sets its password.
// Usage (recommended):
//   NEW_ADMIN_PASSWORD="your-secret" node scripts/reset_admin_password.js
// If NEW_ADMIN_PASSWORD is not provided, this script will default to the password
// hardcoded below (which is potentially sensitive) — only run locally.

const DEFAULT_PASSWORD = process.env.NEW_ADMIN_PASSWORD || 'P@5560rd!!627';

async function main() {
  const db = await setupDatabase();
  const password = DEFAULT_PASSWORD;
  if (!password) {
    console.error('No password provided. Set NEW_ADMIN_PASSWORD environment variable.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  try {
    const admin = await db.get('SELECT id, username FROM staff WHERE username = ?', ['admin']);
    if (admin) {
      await db.run('UPDATE staff SET password = ? WHERE id = ?', [hash, admin.id]);
      console.log('Updated password for existing admin user (username=admin)');
    } else {
      const r = await db.run('INSERT INTO staff (username, display_name, email, phone, password) VALUES (?, ?, ?, ?, ?)', ['admin', 'Administrator', null, null, hash]);
      const createdId = r.lastID;
      const adminRole = await db.get('SELECT id FROM roles WHERE name = ?', ['admin']);
      if (adminRole) {
        try { await db.run('INSERT INTO staff_roles (staff_id, role_id) VALUES (?, ?)', [createdId, adminRole.id]); } catch (e) { /* ignore */ }
      }
      console.log('Created admin user with username=admin');
    }
  } catch (err) {
    console.error('Failed to update admin password:', err);
    process.exitCode = 1;
  } finally {
    if (db && typeof db.close === 'function') {
      try { await db.close(); } catch (e) { /* ignore */ }
    }
  }
}

main();

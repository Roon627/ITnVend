Postgres-first admin password reset and creation
===============================================

Purpose
-------
Remove any ad-hoc Node scripts that change staff passwords and instead use explicit Postgres commands.

Guiding principles
- Do not overwrite an existing user record.
- Make changes to the database using Postgres (psql or a managed DB console) so changes are auditable and explicit.
- Generate password hashes locally and then apply them in SQL (or use server-side pgcrypto if available and you understand the implications).

How to generate a bcrypt hash locally (safe, offline)
--------------------------------------------------
1. From a safe machine with Node installed, run:

```pwsh
# Windows PowerShell example — replace the password string as needed
node -e "console.log(require('bcryptjs').hashSync(process.env.NEW_ADMIN_PASSWORD || 'P@5560rd!!627', 10))"
```

This will print a bcrypt hash (string starting with "$2"). Copy that hash — this is the value you will store in the `staff.password` column.

Apply the hash via psql (only create the admin if it does not already exist)
----------------------------------------------------------------------
The snippet below inserts a new admin user only when a username 'admin' does not already exist, and assigns the `admin` role if present.

Before running:
- Replace <BCRYPT_HASH_HERE> with the bcrypt hash produced above (keep the surrounding single quotes).
- Connect to your Postgres database using psql or your managed DB console. For psql:

```pwsh
# example (adjust connection string as appropriate)
# psql "postgresql://user:pass@host:5432/dbname"
```

Then run this DO block (one statement):

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff WHERE username = 'admin') THEN
    INSERT INTO staff (username, display_name, email, phone, password)
    VALUES (
      'admin',
      'Administrator',
      NULL,
      NULL,
      '<BCRYPT_HASH_HERE>'
    );

    -- assign admin role if present (safe insert)
    INSERT INTO staff_roles (staff_id, role_id)
    SELECT s.id, r.id
    FROM staff s
    JOIN roles r ON r.name = 'admin'
    WHERE s.username = 'admin'
      AND NOT EXISTS (
        SELECT 1 FROM staff_roles sr WHERE sr.staff_id = s.id AND sr.role_id = r.id
      );
  END IF;
END$$;
```

Notes
-----
- This approach will not modify an existing `admin` user; it only creates one if missing. If you need to rotate an existing admin password, do so explicitly and carefully (SELECT to confirm current user, then run a dedicated UPDATE statement after confirming intent).
- You can update the password explicitly (rotation) with:

```sql
UPDATE staff SET password = '<BCRYPT_HASH_HERE>' WHERE username = 'admin';
```

- Prefer storing generated hashes in a secure clipboard or password manager while you perform these steps. Do not commit raw passwords or hashes into repo files.

If you need a helper to generate the hash, generate it locally as described above then use the SQL snippet — do not run Node scripts inside the backend that overwrite existing users automatically.

If you'd like, I can also provide a one-line command to generate the hash and apply it with psql in a single shell line (not recommended for production without safeguards). Ask if you want that.

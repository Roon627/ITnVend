-- Replace <BCRYPT_HASH_HERE> with the bcrypt hash you generated locally.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM staff WHERE username = 'admin') THEN
    INSERT INTO staff (username, display_name, email, phone, password)
    VALUES ('admin', 'Administrator', NULL, NULL, '<BCRYPT_HASH_HERE>');

    -- safe assignment of admin role if it exists
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

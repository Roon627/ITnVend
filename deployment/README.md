Deployment folder
=================

This folder contains small helpers and verification scripts to run after you deploy the POS backend.

Files
-----
- `.env.example` — example environment variables you must configure in production. Copy to `.env` or set env vars via your process manager.
- `verify_deploy.ps1` — PowerShell smoke-test script that checks `/api/products`, attempts login, and calls `/api/token/refresh` to validate cookie-based refresh handling.
- `tests/` — archived test scripts moved from `scripts/` to keep runtime scripts small. These are safe to keep but not executed by default in production.

Notes
-----
- The verify script expects the server to support cookie-based refresh token exchange (it uses a WebSession to preserve cookies). It will skip login/refresh tests if you don't provide credentials.
- If you prefer Bash, I can add an equivalent `verify_deploy.sh`.

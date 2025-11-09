Run Postgres in Docker on the Droplet
=====================================

This document explains how to run Postgres inside a Docker container on a droplet using the provided Compose file at `deployment/docker/docker-compose.postgres.yml`.

Files created:
- `deployment/docker/docker-compose.postgres.yml` — Docker Compose stack for Postgres 15 (alpine)
- `deployment/docker/backup_pg.sh` — small helper to create gzip'd SQL dumps into `deployment/backups/`

Quick summary
-------------
- The compose file creates a named volume `itnvend_pgdata` to persist DB data.
- The compose file creates a named volume `itnvend_pgdata` to persist DB data.
- The service is configured to bind 5432 to `127.0.0.1:5432` so it is reachable only from the droplet (safer than exposing publicly).
- Use environment variables (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB) to configure credentials.

IMPORTANT: If you have an existing `POS/Backend/docker-compose.postgres.yml` or a
`POS/Backend/postgres-data/` folder in this repository, consider migrating data
and switching to the canonical `deployment/docker/docker-compose.postgres.yml`.
See `deployment/cleanup/CLEANUP_README.md` for a safe script that will stop
tracking local DB files and duplicate compose files in git.

Run (on the droplet; user must have Docker & docker-compose / Docker Compose v2):

1) Copy or symlink your repo into a folder (example: `/home/deploy/ITnVend`).

2) Export env or create an env file (example `deployment/docker/.env`):

```bash
# example file: deployment/docker/.env
POSTGRES_USER=itnvend
POSTGRES_PASSWORD=your-secret-password
POSTGRES_DB=itnvend
```

Start stack:

```bash
cd /home/deploy/ITnVend/deployment/docker
# if you created .env in this folder, docker compose will pick it up
docker compose -f docker-compose.postgres.yml up -d
```

Stop stack:

```bash
docker compose -f docker-compose.postgres.yml down
```

Check logs & status:

```bash
docker compose -f docker-compose.postgres.yml ps
docker compose -f docker-compose.postgres.yml logs -f postgres
```

Backups
-------
- The included `backup_pg.sh` runs a temporary postgres container on the `itnvend_network` to execute `pg_dump` and writes a gzipped SQL file into `deployment/backups/`.
- Make the script executable:

```bash
cd /home/deploy/ITnVend/deployment/docker
chmod +x backup_pg.sh
./backup_pg.sh
```

- Schedule this via cron or a systemd timer and copy backups to Spaces / S3 / another host.

Connection from backend
-----------------------
- With the compose file binding to `127.0.0.1:5432`, the backend (running on the same droplet) should set `DATABASE_URL` to `postgres://<user>:<pass>@127.0.0.1:5432/<db>` or use the socket `localhost`.

Security & production notes
---------------------------
- Running Postgres in Docker is convenient, but you must manage backups, monitoring, and restores yourself. DigitalOcean Managed Postgres provides automated backups, high availability, and simpler maintenance — prefer it for critical production workloads.
- Keep strong passwords and rotate them; consider adding fail2ban or other host-level protections.
- Do not expose Postgres port publicly unless strictly necessary. If you must, restrict access with firewall rules.

If you want, I can:
- Add a small systemd service to run `docker compose -f ... up -d` on reboot.
- Create a `docker/.env.example` that matches the main `deployment/.env.example`.
- Add a GitHub Actions job to deploy the Compose stack to a droplet via SSH (more advanced).

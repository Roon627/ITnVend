Repository cleanup actions and recommended commands
=================================================

This folder contains non-destructive helpers to stop tracking large, sensitive,
or duplicated files in the repository and to document the recommended cleanup
steps. Nothing in this folder removes files automatically until you run the
provided script.

What you should do next (recommended order):

1. Make a manual backup of any files you care about (certificates, database
   files, traineddata, etc). These files will be removed from git tracking.

2. Review `remove_tracked.sh` and confirm the paths match what you want to
   stop tracking.

3. Run the script from the repo root (it will stage git removals but keep
   local copies):

   ```bash
   chmod +x deployment/cleanup/remove_tracked.sh
   ./deployment/cleanup/remove_tracked.sh
   git add .gitignore
   git commit -m "chore: stop tracking local DB, docker data, certs, and large assets; update .gitignore"
   ```

4. If you need to purge sensitive files from history, use `git filter-repo` or
   the BFG tool. This is destructive and requires a force-push to the remote.
   Contact the team for coordination.

Files targeted by the script
- `POS/Backend/database.db`
- `POS/database.db`
- `POS/Backend/postgres-data/` (folder)
- `POS/Backend/eng.traineddata`
- `POS/Backend/certs/*` and `estore/Backend/certs/*`
- `POS/Backend/docker-compose.postgres.yml` (duplicate)
- node_modules folders (pattern)

If you want me to run the cleanup automatically I can, but I won't rewrite
history or force-push without explicit instructions.

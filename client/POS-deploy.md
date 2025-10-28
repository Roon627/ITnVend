POS module deployment guide

Goal

Allow shipping the POS (admin) module separately from the public storefront. By default the client serves the storefront at `/` and the admin/POS under `/admin/*`.

Options to deliver POS separately

1) Build an "admin-only" bundle (recommended)

- Set an environment variable at build-time: `VITE_ONLY_ADMIN=1`.
- Build normally with Vite. On Windows PowerShell:
 - Use the provided npm script which is cross-platform: `npm run build:admin`.

   This sets `VITE_ONLY_ADMIN=1` and builds an admin-only bundle. The build output will be written to `dist-admin/` (so it won't clobber a storefront `dist/`).

   Example (PowerShell or Unix shell):

     npm run build:admin

   After the build you'll have `dist-admin/` which contains the POS UI mounted at the root of that static site.

   Serve `dist-admin/` with any static server (nginx, caddy, serve, etc.). For example using `serve`:

     npm install -g serve
     serve -s dist-admin -l 8080

   The POS will be available at http://localhost:8080/ (or your configured host/port).

2) Reverse-proxy approach (no special build)

- Use the full app build (default) and configure your webserver to reverse-proxy requests to `/admin` to a protected internal deployment where the POS runs.
- This keeps a single codebase but separates public storefront traffic from the POS endpoints.

Notes and recommendations

- Authentication: POS assumes the server-side authentication flows used in this repository. When deploying POS to a customer, ensure they have the necessary backend services and environment variables configured (API URL, auth secret, database).
- Extracting POS into a separate repo: If you prefer to sell POS as a standalone product, consider creating a slim repo that contains only the POS routes/components. The `VITE_ONLY_ADMIN` build flag simplifies this because it makes the build output admin-only without changing source files.
- Assets and DNS: If you serve POS under a custom domain (e.g., pos.example.com), point the domain to the static server and ensure CORS/API endpoints accept that origin.

If you'd like, I can:
- Add a CI step that creates both `dist/` (storefront) and `dist-admin/` (admin-only) artifacts automatically.
- Extract a minimal POS-only starter that can be published as a separate repo or package.


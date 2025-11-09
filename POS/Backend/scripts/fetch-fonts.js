// Lightweight placeholder for fetching fonts during postinstall on dev machines.
// Some environments (CI/container) may want to actually download fonts; here we simply exit gracefully.

try {
  console.log('fetch-fonts: no-op placeholder (fonts not required for backend runtime)');
  // If you want to actually fetch fonts, implement the download logic here, e.g. using node-fetch or https.
  // For now, exit successfully so `npm install` doesn't fail on Windows shells that don't support `|| true`.
  process.exit(0);
} catch (err) {
  console.warn('fetch-fonts: encountered error (ignored):', err?.message || err);
  process.exit(0);
}

import { setupDatabase } from '../database.js';

const DEFAULT_NEW_BASE = process.env.NEW_MEDIA_BASE?.trim() || 'https://pos.itnvend.com:4000';
const RAW_OLD_BASES = process.env.OLD_MEDIA_BASES?.split(',').map((entry) => entry.trim()).filter(Boolean) || [];
const FALLBACK_OLD_BASES = [
  'http://localhost:4000',
  'https://localhost:4000',
  'http://127.0.0.1:4000',
  'https://127.0.0.1:4000',
];
const UNIQUE_OLD_BASES = Array.from(new Set([...RAW_OLD_BASES, ...FALLBACK_OLD_BASES].filter((entry) => entry && entry !== DEFAULT_NEW_BASE)));

function quoteIdentifier(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function normalizeUrls() {
  if (!UNIQUE_OLD_BASES.length) {
    console.log('No legacy URL bases configured; nothing to do.');
    return;
  }
  const db = await setupDatabase();
  try {
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    for (const { name: tableName } of tables) {
      const quotedTable = quoteIdentifier(tableName);
      const columns = await db.all(`PRAGMA table_info(${quotedTable})`);
      const textColumns = columns.filter((col) => {
        const type = (col.type || '').toUpperCase();
        return type.includes('CHAR') || type.includes('TEXT') || type === '';
      });
      if (!textColumns.length) continue;

      for (const column of textColumns) {
        const quotedColumn = quoteIdentifier(column.name);
        for (const oldBase of UNIQUE_OLD_BASES) {
          const likePattern = `%${oldBase.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
          const updateSql = `UPDATE ${quotedTable} SET ${quotedColumn} = REPLACE(${quotedColumn}, ?, ?) WHERE ${quotedColumn} LIKE ? ESCAPE '\\'`;
          const result = await db.run(updateSql, oldBase, DEFAULT_NEW_BASE, likePattern);
          if (result?.changes) {
            console.log(`Updated ${result.changes} row(s) in ${tableName}.${column.name} replacing ${oldBase} -> ${DEFAULT_NEW_BASE}`);
          }
        }
      }
    }
  } finally {
    if (typeof db.close === 'function') {
      await db.close();
    }
  }
  console.log('Media URL normalization complete.');
}

normalizeUrls().catch((err) => {
  console.error('Failed to normalize media URLs:', err);
  process.exitCode = 1;
});

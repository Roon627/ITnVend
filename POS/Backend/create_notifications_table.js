import { setupDatabase } from './database.js';

(async () => {
    try {
        const db = await setupDatabase();
        const isPostgres = (db?.dialect || '').toLowerCase() === 'postgres';
        const idColumn = isPostgres ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        const timestampType = isPostgres ? 'TIMESTAMP' : 'DATETIME';

        await db.run(`
            CREATE TABLE IF NOT EXISTS notifications (
                id ${idColumn},
                user_id INTEGER,
                type TEXT,
                message TEXT,
                link TEXT,
                is_read INTEGER DEFAULT 0,
                created_at ${timestampType} DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const row = await db.get('SELECT COUNT(*) as c FROM notifications');
        console.log('NOTIFICATIONS_TABLE_OK, count =', row ? row.c : 0);

        if (typeof db.close === 'function') {
            await db.close();
        }
        process.exit(0);
    } catch (err) {
        console.error('CREATE_NOTIFICATIONS_ERROR:', err?.message || err);
        process.exit(1);
    }
})();

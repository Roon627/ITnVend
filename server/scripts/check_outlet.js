import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function checkOutlet() {
    const db = await open({
        filename: './database.db',
        driver: sqlite3.Database
    });

    const outlet = await db.get('SELECT * FROM outlets WHERE id = 1');
    console.log('Outlet:', outlet);

    await db.close();
}

checkOutlet().catch(console.error);
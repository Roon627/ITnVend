import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function checkAccounts() {
    const db = await open({ filename: './database.db', driver: sqlite3.Database });

    const accounts = await db.all('SELECT * FROM chart_of_accounts ORDER BY account_number');
    console.log('Chart of Accounts:');
    accounts.forEach(acc => {
        console.log(`${acc.account_number} - ${acc.account_name} (${acc.account_type})`);
    });

    await db.close();
}

checkAccounts().catch(console.error);
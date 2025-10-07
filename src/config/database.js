const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../db/volunteer.db');

// Ensure the directory for the database exists.
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const options = {
    timeout: 5000 // 5 seconds
};
const db = new Database(dbPath, options);

// Enable Write-Ahead Logging (WAL) for better concurrency.
db.pragma('journal_mode = WAL');

// Function to initialize the database with the schema.
function initDatabase() {
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
}

// Close the database connection gracefully on application exit.
process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));

module.exports = { db, initDatabase };
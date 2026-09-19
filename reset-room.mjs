import Database from 'better-sqlite3';

const dbPath = 'data/database.sqlite';
const db = new Database(dbPath);

console.log('Clearing active games and sessions for a fresh start...');
db.prepare("UPDATE games SET status = 'finished' WHERE status = 'active'").run();
db.prepare("DELETE FROM sessions").run();
db.prepare("DELETE FROM matches").run();
db.prepare("DELETE FROM rounds").run();
db.prepare("DELETE FROM heartbeats").run();
db.prepare("UPDATE rooms SET reset_at = ? WHERE id = 'main'").run(Math.floor(Date.now() / 1000));

console.log('Room main has been freshly reset!');

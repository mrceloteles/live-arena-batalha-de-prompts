import { openDatabase } from './src/db/database.mjs';

const opened = openDatabase('./var/descubra-o-prompt.sqlite');
const db = opened.database;

db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
db.exec('DELETE FROM judge_attempts;');
db.exec('DELETE FROM scores;');
db.exec('DELETE FROM submissions;');
db.exec('DELETE FROM matches;');
db.exec('DELETE FROM sessions;');
db.exec('DELETE FROM events;');
db.exec('DELETE FROM client_logs;');
db.exec("UPDATE games SET active = 0, phase = 'finished' WHERE active = 1;");
db.exec('COMMIT; PRAGMA foreign_keys = ON;');

console.log('Database successfully reset! All stations are 100% unlocked.');

import { Database } from 'bun:sqlite';
const db = new Database('./.tmp/dev.db');
console.log(db.query("SELECT * FROM site").all());

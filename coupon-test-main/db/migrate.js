import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pool from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

await pool.query(sql);
console.log('Migration applied.');
await pool.end();

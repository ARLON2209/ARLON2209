import { createPool, migrate } from '../src/db.js';

const pool = createPool();
await migrate(pool);
await pool.end();
console.log('Banco atualizado.');

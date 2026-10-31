import { buildApp } from './app.js';
import { createPool, migrate } from './db.js';

const pool = createPool();
await migrate(pool);

const app = buildApp({ pool });
const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

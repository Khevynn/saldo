import { parseEnv } from 'node:util';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

async function main() {
  const config = parseEnv(await readFile('apps/api/.env', 'utf8'));
  const pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1000 });
  try {
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await pool.query('SELECT 1 FROM accounts LIMIT 1');
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('Banco não ficou pronto. Confira o processo dev:db.');
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

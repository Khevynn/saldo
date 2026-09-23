import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

async function main() {
  if (!process.env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL não configurada.');
  const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tableResult = await client.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE'
       ORDER BY table_name`,
    );
    const tables: Record<string, unknown[]> = {};
    for (const { table_name: table } of tableResult.rows) {
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`Nome de tabela inválido: ${table}`);
      tables[table] = (await client.query(`SELECT * FROM "${table}"`)).rows;
    }
    const directory = resolve('.local', 'backups');
    await mkdir(directory, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const path = resolve(directory, `finance-${stamp}.json`);
    const payload = {
      created_at: new Date().toISOString(),
      format: 2,
      tables,
    };
    const contents = JSON.stringify(payload, null, 2);
    const checksum = createHash('sha256').update(contents).digest('hex');
    await writeFile(path, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await writeFile(`${path}.sha256`, `${checksum}  ${path.split(/[\\/]/).pop()}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    await client.query('COMMIT');
    const rows = Object.values(tables).reduce((total, table) => total + table.length, 0);
    console.log(`Backup criado: ${path}`);
    console.log(`${Object.keys(tables).length} tabelas, ${rows} registros.`);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {}
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

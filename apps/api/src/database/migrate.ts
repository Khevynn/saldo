import { Pool } from 'pg';
import { migrationFiles } from './migrations';

async function main() {
  if (!process.env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL não configurada.');
  const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('finance:migrations'))");
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const migration of await migrationFiles()) {
      const existing = await client.query('SELECT hash FROM schema_migrations WHERE name=$1', [
        migration.name,
      ]);
      if (existing.rowCount) {
        if (existing.rows[0].hash !== migration.hash)
          throw new Error(`Migration alterada após aplicação: ${migration.name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(migration.text);
        await client.query('INSERT INTO schema_migrations(name,hash) VALUES($1,$2)', [
          migration.name,
          migration.hash,
        ]);
        await client.query('COMMIT');
        console.log(`Aplicada: ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('finance:migrations'))");
    client.release();
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

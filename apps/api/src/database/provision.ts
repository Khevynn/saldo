import { Pool } from 'pg';

async function main() {
  const password = process.env.APP_DB_PASSWORD;
  if (!password || password.length < 16)
    throw new Error('APP_DB_PASSWORD deve ter pelo menos 16 caracteres.');
  if (!process.env.DATABASE_ADMIN_URL) throw new Error('DATABASE_ADMIN_URL não configurada.');
  const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
  try {
    // PostgreSQL does not accept bind parameters in ALTER ROLE. quote_literal runs server-side.
    const { rows } = await pool.query('SELECT quote_literal($1) AS password', [password]);
    await pool.query(
      `ALTER ROLE finance_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ${rows[0].password}`,
    );
    console.log('Credencial da API configurada. Utilize finance_app em DATABASE_URL.');
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

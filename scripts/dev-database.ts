import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';

const exec = promisify(execFile);

async function main() {
  const setup = process.argv.includes('--setup');
  const environmentFile = resolve('.env');
  let contents: string;
  try {
    contents = await readFile(environmentFile, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !setup)
      throw new Error('Execute npm run setup:local para preparar o ambiente.');
    const adminPassword = randomBytes(24).toString('hex'),
      appPassword = randomBytes(24).toString('hex');
    contents = (await readFile('.env.example', 'utf8'))
      .replace(
        'postgresql://postgres:postgres@localhost:5432/finance',
        `postgresql://postgres:${adminPassword}@127.0.0.1:55432/finance`,
      )
      .replace(
        'postgresql://finance_app:change-local-password@localhost:5432/finance',
        `postgresql://finance_app:${appPassword}@127.0.0.1:55432/finance`,
      )
      .replace('APP_DB_PASSWORD=change-local-password', `APP_DB_PASSWORD=${appPassword}`);
    await writeFile(environmentFile, contents, { flag: 'wx', mode: 0o600 });
    console.log(
      '.env criado com credenciais locais aleatórias. As chaves Clerk permanecem vazias.',
    );
  }
  const requestedPort = process.argv.find((arg) => arg.startsWith('--port='))?.slice(7);
  if (requestedPort) {
    if (!/^\d{4,5}$/.test(requestedPort) || Number(requestedPort) > 65535)
      throw new Error('Porta local inválida.');
    const configuration = parseEnv(contents);
    for (const name of ['DATABASE_ADMIN_URL', 'DATABASE_URL']) {
      const previous = configuration[name];
      if (!previous) throw new Error(`${name} não configurada.`);
      const url = new URL(previous);
      if (!['localhost', '127.0.0.1'].includes(url.hostname))
        throw new Error('Não é permitido alterar uma URL de banco remoto neste comando.');
      url.hostname = '127.0.0.1';
      url.port = requestedPort;
      contents = contents.replace(previous, url.toString());
    }
    await writeFile(environmentFile, contents, { mode: 0o600 });
    console.log(`URLs do PostgreSQL local ajustadas para 127.0.0.1:${requestedPort}.`);
  }
  const environment = { ...process.env, ...parseEnv(contents) };
  const admin = new URL(environment.DATABASE_ADMIN_URL || '');
  if (!['127.0.0.1', 'localhost'].includes(admin.hostname) || admin.username !== 'postgres')
    throw new Error(
      'Este comando é somente para PostgreSQL local com usuário administrativo postgres.',
    );
  const databaseName = admin.pathname.slice(1);
  if (!/^[a-z][a-z0-9_]*$/.test(databaseName)) throw new Error('Nome de banco local inválido.');
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const binaries = await import(`@embedded-postgres/${platform}-${process.arch}`);
  const root = resolve('.local', 'development-postgres');
  await mkdir(root, { recursive: true });
  const data = resolve(root, 'data');
  let exists = true;
  try {
    await access(resolve(data, 'PG_VERSION'));
  } catch {
    exists = false;
  }
  if (!exists) {
    const pwfile = resolve(root, 'init-password');
    await writeFile(pwfile, decodeURIComponent(admin.password), { mode: 0o600 });
    try {
      await exec(
        binaries.initdb,
        [
          '-D',
          data,
          '-U',
          'postgres',
          '--auth=scram-sha-256',
          `--pwfile=${pwfile}`,
          '--locale=C',
          '--encoding=UTF8',
        ],
        { windowsHide: true },
      );
    } finally {
      await unlink(pwfile);
    }
  }
  const child = spawn(
    binaries.postgres,
    ['-D', data, '-h', 'localhost', '-p', admin.port || '5432'],
    { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let started = false,
    log = '';
  let pool: Pool | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Tempo de inicialização do banco esgotado.')),
        15000,
      );
      child.stderr.on('data', (chunk) => {
        log += String(chunk);
        if (log.includes('ready to accept connections')) {
          clearTimeout(timer);
          started = true;
          resolve();
        }
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('exit', (code) => {
        if (!started) {
          clearTimeout(timer);
          reject(
            new Error(`PostgreSQL não iniciou (${code}). ${log.split('\n').slice(-8).join('\n')}`),
          );
        }
      });
    });
    const clusterUrl = new URL(admin);
    clusterUrl.pathname = '/postgres';
    pool = new Pool({ connectionString: clusterUrl.toString() });
    const existing = await pool.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName]);
    if (!existing.rowCount) await pool.query(`CREATE DATABASE "${databaseName}"`);
    const migrate = await exec(
      process.execPath,
      ['--import', 'tsx', 'apps/api/src/database/migrate.ts'],
      { windowsHide: true, env: environment },
    );
    process.stdout.write(migrate.stdout);
    const provision = await exec(
      process.execPath,
      ['--import', 'tsx', 'apps/api/src/database/provision.ts'],
      { windowsHide: true, env: environment },
    );
    process.stdout.write(provision.stdout);
    await pool.end();
    pool = undefined;
    if (setup) {
      console.log(
        'Banco local preparado. Configure as chaves Clerk no .env; depois execute npm run dev:local.',
      );
    } else {
      console.log(
        `PostgreSQL local pronto em 127.0.0.1:${admin.port || '5432'}. Os dados persistem em .local/development-postgres.`,
      );
      await new Promise<void>((resolve) => {
        process.once('SIGINT', () => resolve());
        process.once('SIGTERM', () => resolve());
        child.once('exit', () => resolve());
      });
    }
  } finally {
    await pool?.end();
    if (started && child.exitCode === null)
      await exec(binaries.pg_ctl, ['-D', data, 'stop', '-m', 'fast', '-w'], { windowsHide: true });
    else if (child.exitCode === null) child.kill();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

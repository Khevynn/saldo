import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { migrationFiles } from '../apps/api/src/database/migrations';

const root = resolve(__dirname, '..');
const npmCliFromEnvironment = process.env.npm_execpath;
if (!npmCliFromEnvironment)
  throw new Error('Execute este publicador através de npm run publish:all.');
const npmCli: string = npmCliFromEnvironment;

function dockerBinary() {
  if (process.env.DOCKER_BIN) return process.env.DOCKER_BIN;
  const desktop = process.env.LOCALAPPDATA
    ? resolve(
        process.env.LOCALAPPDATA,
        'Programs',
        'Docker',
        'Docker',
        'resources',
        'bin',
        'docker.exe',
      )
    : '';
  return desktop && existsSync(desktop) ? desktop : 'docker';
}

function run(command: string, args: string[], cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function output(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
  return result.stdout.trim();
}

async function assertNoPendingMigrations(docker: string) {
  const raw = output(docker, [
    'exec',
    'saldo-local-db-1',
    'psql',
    '-U',
    'postgres',
    '-d',
    'finance',
    '-Atc',
    "SELECT name || '|' || hash FROM schema_migrations ORDER BY name",
  ]);
  const applied = new Map(
    raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf('|');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  const pending = (await migrationFiles()).filter(
    (migration) => applied.get(migration.name) !== migration.hash,
  );
  if (!pending.length) return;
  console.error('\nPublicação automática interrompida: há mudanças de banco pendentes:');
  pending.forEach((migration) => console.error(`- ${migration.name}`));
  console.error(
    '\nFaça backup, valide a migration e publique pelo fluxo seguro antes de tentar novamente.',
  );
  process.exit(2);
}

async function main() {
  const docker = dockerBinary();
  await assertNoPendingMigrations(docker);
  if (process.argv.includes('--check')) {
    console.log('Publicação automática liberada: não há migrations pendentes.');
    return;
  }

  console.log('\n1/4 Verificando o projeto...');
  run(process.execPath, [npmCli, 'run', 'typecheck']);
  run(process.execPath, [npmCli, 'test']);

  const suppliedMessage = process.argv
    .slice(2)
    .filter((argument) => argument !== '--check')
    .join(' ')
    .trim();
  const message =
    suppliedMessage || `Publicação ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  console.log('\n2/4 Publicando o mobile no EAS...');
  run(
    process.execPath,
    [
      npmCli,
      'exec',
      '--yes',
      'eas-cli@latest',
      '--',
      'update',
      '--channel',
      'production',
      '--environment',
      'production',
      '--platform',
      'android',
      '--message',
      message,
    ],
    resolve(root, 'apps', 'mobile'),
  );

  console.log('\n3/4 Atualizando o Docker local...');
  run(docker, [
    'compose',
    '--env-file',
    'apps/api/.env',
    '--env-file',
    'apps/web/.env',
    'up',
    '--build',
    '-d',
  ]);

  console.log('\n4/4 Conferindo os serviços...');
  run(docker, ['compose', '--env-file', 'apps/api/.env', '--env-file', 'apps/web/.env', 'ps']);
  console.log('\nPublicação concluída: mobile no EAS e aplicação no Docker.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

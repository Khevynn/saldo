import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function migrationFiles() {
  const directory = resolve(
    process.cwd(),
    process.cwd().replaceAll('\\', '/').endsWith('/apps/api')
      ? 'migrations'
      : 'apps/api/migrations',
  );
  return Promise.all(
    (await readdir(directory))
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map(async (name) => {
        const text = await readFile(resolve(directory, name), 'utf8');
        return { name, text, hash: createHash('sha256').update(text).digest('hex') };
      }),
  );
}

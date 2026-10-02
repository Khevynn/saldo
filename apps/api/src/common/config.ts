function integer(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error(`${name} possui um valor inválido.`);
  return value;
}

function origins(name: string, required: boolean) {
  const values = (process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (required && !values.length) throw new Error(`${name} não configurada.`);
  for (const value of values) {
    const url = new URL(value);
    if (
      url.origin !== value ||
      (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
    )
      throw new Error(`${name} deve conter origens completas e seguras.`);
  }
  return values;
}

function databaseUrl() {
  if (process.env.USE_DOCKER_DATABASE !== 'true') {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
    return process.env.DATABASE_URL;
  }

  const password = process.env.DOCKER_APP_DB_PASSWORD;
  if (!password) throw new Error('DOCKER_APP_DB_PASSWORD não configurada.');
  const database = new URL('postgresql://finance_app@127.0.0.1/finance');
  database.port = String(integer('DOCKER_DB_PORT', 55433, 1, 65535));
  database.password = password;
  return database.toString();
}

export function databaseConfig() {
  const production = process.env.NODE_ENV === 'production';
  const connectionString = databaseUrl();
  const database = new URL(connectionString);
  const tlsMode = database.searchParams.get('sslmode') || '';
  const privateDockerDatabase =
    process.env.ALLOW_PLAINTEXT_DATABASE_ON_PRIVATE_DOCKER_NETWORK === 'true' &&
    database.hostname === 'db';
  if (
    production &&
    !privateDockerDatabase &&
    !['require', 'verify-ca', 'verify-full'].includes(tlsMode)
  )
    throw new Error(
      'DATABASE_URL deve exigir TLS em produção ou usar a rede privada Docker autorizada.',
    );
  return {
    production,
    connectionString,
    poolMax: integer('DB_POOL_MAX', 10, 1, 100),
    connectionTimeout: integer('DB_CONNECTION_TIMEOUT_MS', 5000, 500, 60000),
    idleTimeout: integer('DB_IDLE_TIMEOUT_MS', 30000, 1000, 600000),
    statementTimeout: integer('DB_STATEMENT_TIMEOUT_MS', 15000, 1000, 120000),
    transactionTimeout: integer('DB_TRANSACTION_TIMEOUT_MS', 20000, 1000, 120000),
    maxConnectionLifetime: integer('DB_MAX_CONNECTION_LIFETIME_SECONDS', 300, 30, 86400),
  };
}

export function runtimeConfig() {
  const database = databaseConfig();
  if (!process.env.CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY não configurada.');
  if (database.production && !process.env.CLERK_JWT_KEY)
    throw new Error('CLERK_JWT_KEY é obrigatória em produção.');
  const authorizedParties = origins('CLERK_AUTHORIZED_PARTIES', true);
  const webOrigins = origins('WEB_ORIGIN', database.production);
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy && !/^(loopback|linklocal|uniquelocal|\d+)$/.test(trustProxy))
    throw new Error('TRUST_PROXY inválida.');
  return {
    ...database,
    authorizedParties,
    webOrigins: webOrigins.length ? webOrigins : ['http://localhost:5173'],
    host: process.env.HOST || (database.production ? '0.0.0.0' : '127.0.0.1'),
    port: integer('PORT', 3000, 1, 65535),
    trustProxy,
    rateLimit: integer('RATE_LIMIT_PER_MINUTE', 180, 10, 10000),
    clerkStatusCache: integer('CLERK_STATUS_CACHE_SECONDS', 60, 0, 300),
    idempotencyRetentionDays: integer('IDEMPOTENCY_RETENTION_DAYS', 90, 1, 365),
  };
}

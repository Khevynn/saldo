import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { Logger } from '@nestjs/common';
import { databaseConfig } from '../common/config';

export type Db = Pick<NodePgDatabase, 'execute'>;
export async function rows<T = Record<string, any>>(
  db: Db,
  query: ReturnType<typeof sql>,
): Promise<T[]> {
  return (await db.execute(query)).rows as T[];
}

@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private readonly config = databaseConfig();
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool = new Pool({
    connectionString: this.config.connectionString,
    max: this.config.poolMax,
    connectionTimeoutMillis: this.config.connectionTimeout,
    idleTimeoutMillis: this.config.idleTimeout,
    maxLifetimeSeconds: this.config.maxConnectionLifetime,
    statement_timeout: this.config.statementTimeout,
    query_timeout: this.config.statementTimeout + 1000,
    idle_in_transaction_session_timeout: this.config.transactionTimeout,
    application_name: 'saldo-api',
  });
  readonly db = drizzle(this.pool);

  constructor() {
    this.pool.on('error', (error) =>
      this.logger.error(
        `Conexão ociosa do PostgreSQL falhou (${(error as Error & { code?: string }).code || 'unknown'}).`,
      ),
    );
  }

  async onModuleInit() {
    let role: { name: string; rolsuper: boolean; rolbypassrls: boolean };
    try {
      [role] = await rows(
        this.db,
        sql`SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`,
      );
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Não foi possível conectar ao PostgreSQL: ${detail}`, { cause: error });
    }
    if (role.name !== 'finance_app' || role.rolsuper || role.rolbypassrls)
      throw new Error('A API exige o papel finance_app sem SUPERUSER/BYPASSRLS.');
  }

  async tenant<T>(userId: string, action: (db: Db) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.user_id',${userId},true)`);
      // Serialize writes/read-aggregates for a single user; negligible contention for personal use.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId},0))`);
      return action(tx);
    });
  }

  async tenantRead<T>(userId: string, action: (db: Db) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.user_id',${userId},true)`);
      return action(tx);
    });
  }

  async identity(provider: string, subject: string): Promise<string> {
    const [identity] = await rows<{ user_id: string }>(
      this.db,
      sql`SELECT resolve_identity(${provider},${subject})::text AS user_id`,
    );
    return identity.user_id;
  }

  async ping() {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}

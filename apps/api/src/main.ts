import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import helmet from 'helmet';
import { types } from 'pg';
import { AppModule } from './app.module';
import { ApiErrorFilter } from './common/errors';
import { runtimeConfig } from './common/config';

types.setTypeParser(1082, (value) => value); // Calendar dates must never cross a timezone conversion.
async function bootstrap() {
  const config = runtimeConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  if (config.trustProxy)
    express.set(
      'trust proxy',
      /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy,
    );
  app.setGlobalPrefix('api');
  app.use(helmet({ strictTransportSecurity: config.production ? undefined : false }));
  app.use((request: any, response: any, next: () => void) => {
    const supplied = request.headers['x-request-id'];
    request.requestId =
      typeof supplied === 'string' && /^[A-Za-z0-9._:]{1,64}$/.test(supplied)
        ? supplied
        : randomUUID();
    response.setHeader('X-Request-Id', request.requestId);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');
    next();
  });
  app.enableCors({
    origin: config.webOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });
  app.useGlobalFilters(new ApiErrorFilter());
  app.enableShutdownHooks();
  await app.listen(config.port, config.host);
}
bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha ao iniciar a API.');
  process.exitCode = 1;
});

import { Controller, Get, Inject, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/auth';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  @Public()
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.database.ping();
      return { status: 'ok' };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Health check do PostgreSQL falhou: ${detail}`);
      throw new ServiceUnavailableException('Banco de dados indisponível.');
    }
  }
}

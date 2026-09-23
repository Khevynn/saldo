import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard, ClerkIdentityProvider, IDENTITY_PROVIDER } from './auth/auth';
import { DatabaseService } from './database/database.service';
import { FinanceStore } from './modules/finance.store';
import { AccountsController } from './modules/accounts.controller';
import { TransactionsController } from './modules/transactions.controller';
import { PlanningController } from './modules/planning.controller';
import { PlanningService } from './modules/planning.service';
import { CardsController } from './modules/cards.controller';
import { ReportingController } from './modules/reporting.controller';
import { UserThrottlerGuard } from './common/throttling';
import { HealthController } from './health/health.controller';

@Global()
@Module({ providers: [DatabaseService, FinanceStore], exports: [DatabaseService, FinanceStore] })
export class DatabaseModule {}
@Module({ controllers: [AccountsController] })
class AccountsModule {}
@Module({ controllers: [TransactionsController] })
class TransactionsModule {}
@Module({
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
class PlanningModule {}
@Module({ controllers: [CardsController] })
class CardsModule {}
@Module({ imports: [PlanningModule], controllers: [ReportingController] })
class ReportingModule {}
@Module({ controllers: [HealthController] })
class HealthModule {}
@Module({
  imports: [
    DatabaseModule,
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE || 180) },
    ]),
    AccountsModule,
    TransactionsModule,
    PlanningModule,
    CardsModule,
    ReportingModule,
    HealthModule,
  ],
  providers: [
    { provide: IDENTITY_PROVIDER, useClass: ClerkIdentityProvider },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}

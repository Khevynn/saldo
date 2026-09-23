import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (!request.userId) return true;
    return super.canActivate(context);
  }

  protected async getTracker(request: Record<string, any>): Promise<string> {
    return `user:${request.userId}`;
  }
}

import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  ServiceUnavailableException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { DatabaseService } from '../database/database.service';

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');
export const PUBLIC_ROUTE = 'public-route';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export interface IdentityProvider {
  authenticate(token: string): Promise<{ provider: string; subject: string }>;
}

@Injectable()
export class ClerkIdentityProvider implements IdentityProvider {
  private readonly client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  private readonly statusCache = new Map<string, { allowed: boolean; expires: number }>();

  async authenticate(token: string) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    const parties = process.env.CLERK_AUTHORIZED_PARTIES?.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!secretKey || !parties?.length)
      throw new UnauthorizedException('Autenticação não configurada.');
    let subject: string;
    try {
      const claims = await verifyToken(token, {
        secretKey,
        jwtKey: process.env.CLERK_JWT_KEY || undefined,
        authorizedParties: parties,
        audience: process.env.CLERK_AUDIENCE || undefined,
      });
      if (!claims.sub || !claims.sid || !claims.azp || !parties.includes(claims.azp))
        throw new Error('Sessão inválida');
      subject = claims.sub;
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
    const cached = this.statusCache.get(subject);
    if (cached && cached.expires > Date.now()) {
      if (!cached.allowed)
        throw new ForbiddenException('Verifique seu e-mail para acessar as finanças.');
      return { provider: 'clerk', subject };
    }
    let allowed = false;
    try {
      const user = await this.client.users.getUser(subject);
      const email = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
      allowed = !user.banned && Boolean(email) && email?.verification?.status === 'verified';
    } catch (error: any) {
      if (error?.status === 404) throw new UnauthorizedException('Sessão inválida ou expirada.');
      throw new ServiceUnavailableException(
        'Serviço de autenticação temporariamente indisponível.',
      );
    }
    const seconds = Math.max(
      0,
      Math.min(300, Number(process.env.CLERK_STATUS_CACHE_SECONDS || 60)),
    );
    if (seconds > 0) {
      if (this.statusCache.size >= 10000)
        this.statusCache.delete(this.statusCache.keys().next().value!);
      this.statusCache.set(subject, { allowed, expires: Date.now() + seconds * 1000 });
    }
    if (!allowed) throw new ForbiddenException('Verifique seu e-mail para acessar as finanças.');
    return { provider: 'clerk', subject };
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(IDENTITY_PROVIDER) private readonly provider: IdentityProvider,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest();
    const match = /^Bearer (\S+)$/i.exec(request.headers.authorization || '');
    if (!match) throw new UnauthorizedException('Autenticação necessária.');
    const identity = await this.provider.authenticate(match[1]);
    request.userId = await this.db.identity(identity.provider, identity.subject);
    return true;
  }
}
export const UserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => context.switchToHttp().getRequest().userId,
);

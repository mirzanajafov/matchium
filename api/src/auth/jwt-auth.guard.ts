import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthUser } from './current-user.decorator.js';
import { ADMIN_ONLY, IS_PUBLIC } from './public.decorator.js';

interface AccessClaims {
  sub: string;
  sid?: string;
  purpose?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    let claims: AccessClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessClaims>(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (claims.purpose !== undefined || !claims.sid) throw new UnauthorizedException();

    const session = await this.prisma.session.findUnique({
      where: { id: claims.sid },
      select: { revokedAt: true, user: { select: { id: true, role: true, bannedAt: true } } },
    });
    const user = session?.user;
    if (!session || session.revokedAt || !user || user.id !== claims.sub || user.bannedAt) {
      throw new UnauthorizedException();
    }
    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, [ctx.getHandler(), ctx.getClass()]);
    if (adminOnly && user.role !== 'ADMIN') throw new ForbiddenException();
    request.user = { id: user.id, role: user.role, sessionId: claims.sid };
    return true;
  }
}

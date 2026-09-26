import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { AuthUser } from '../auth/current-user.decorator.js';
import { type LimitRule, RATE_LIMITS } from './rate-limit.decorator.js';
import { RateLimiter } from './rate-limiter.js';

function subject(rule: LimitRule, request: Request & { user?: AuthUser }): string | undefined {
  if (rule.by === 'ip') return request.ip;
  if (rule.by === 'user') return request.user?.id;
  const email: unknown = (request.body as Record<string, unknown> | undefined)?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : undefined;
}

function wait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'a minute' : `${minutes} minutes`;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rules = this.reflector.get<LimitRule[] | undefined>(RATE_LIMITS, ctx.getHandler());
    if (!rules?.length) return true;

    const http = ctx.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthUser }>();
    for (const rule of rules) {
      const who = subject(rule, request);
      if (!who) continue;
      const verdict = await this.limiter.hit(`${rule.name}:${rule.by}:${who}`, rule.limit, rule.windowSeconds);
      if (!verdict.allowed) {
        http.getResponse<Response>().setHeader('Retry-After', String(verdict.retryAfterSeconds));
        throw new HttpException(
          `Too many attempts, try again in ${wait(verdict.retryAfterSeconds)}`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }
}

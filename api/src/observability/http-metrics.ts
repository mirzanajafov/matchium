import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { httpDuration, httpRequests } from './metrics.js';

const log = new Logger('Http');

export function routeOf(request: Request): string {
  const route = (request.route as { path?: string } | undefined)?.path;
  return route ? `${request.baseUrl}${route}` : 'unmatched';
}

export function httpMetrics(request: Request, response: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  response.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - started) / 1e9;
    const route = routeOf(request);
    const status = response.statusCode;
    httpRequests.inc({ method: request.method, route, status: String(status) });
    httpDuration.observe({ method: request.method, route }, seconds);
    if (route !== '/health' && route !== '/metrics') {
      log.log({ method: request.method, route, status, ms: Math.round(seconds * 1000) });
    }
  });
  next();
}

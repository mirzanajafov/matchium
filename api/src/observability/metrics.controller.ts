import { Controller, Get, Headers, NotFoundException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator.js';
import { registry } from './metrics.js';

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@ApiExcludeController()
@Public()
@Controller('metrics')
export class MetricsController {
  private readonly token: string;

  constructor(config: ConfigService) {
    this.token = config.get<string>('METRICS_TOKEN') ?? '';
  }

  @Get()
  async metrics(@Headers('authorization') authorization: string | undefined, @Res() response: Response) {
    if (!this.token || !sameSecret(authorization ?? '', `Bearer ${this.token}`)) throw new NotFoundException();
    response.setHeader('Content-Type', registry.contentType);
    response.send(await registry.metrics());
  }
}

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { TrustProxy } from './config/env.js';
import { httpMetrics } from './observability/http-metrics.js';

export function configureApp(app: INestApplication): INestApplication {
  const trustProxy = app.get(ConfigService).getOrThrow<TrustProxy>('TRUST_PROXY');
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);
  app.use(httpMetrics);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  return app;
}

export function setupDocs(app: INestApplication): void {
  const config = new DocumentBuilder().setTitle('Matchium API').setVersion('0.1.0').addBearerAuth().build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));
}

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureApp(app: INestApplication): INestApplication {
  const trustProxy = app.get(ConfigService).get<string>('TRUST_PROXY', 'loopback');
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy === 'false' ? false : trustProxy.split(','));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  return app;
}

export function setupDocs(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Matchium API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config));
}

import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { appOptions, configureApp, setupDocs } from './app.setup.js';

const logger = new ConsoleLogger({ json: process.env.LOG_JSON === 'true' });
const app = configureApp(await NestFactory.create(AppModule, { ...appOptions, logger }));
app.enableShutdownHooks(['SIGTERM', 'SIGINT'], { useProcessExit: true });
setupDocs(app);
await app.listen(app.get(ConfigService).get<number>('PORT', 3100));

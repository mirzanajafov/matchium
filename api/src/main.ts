import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp, setupDocs } from './app.setup.js';

const logger = new ConsoleLogger({ json: process.env.LOG_JSON === 'true' });
const app = configureApp(await NestFactory.create(AppModule, { logger }));
setupDocs(app);
await app.listen(app.get(ConfigService).get<number>('PORT', 3100));

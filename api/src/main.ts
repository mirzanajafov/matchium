import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { appOptions, configureApp, setupDocs } from './app.setup.js';
import type { Env } from './config/env.js';

const app = configureApp(await NestFactory.create(AppModule, { ...appOptions, bufferLogs: true }));
const config = app.get<ConfigService<Env, true>>(ConfigService);
app.useLogger(new ConsoleLogger({ json: config.get('LOG_JSON', { infer: true }) }));
app.enableShutdownHooks(['SIGTERM', 'SIGINT'], { useProcessExit: true });
setupDocs(app);
await app.listen(config.get('PORT', { infer: true }));

// Catalog workers in a process of their own (npm run catalog:worker): used in
// local dev, where `start:dev` restarts on every code change and would cut a
// multi-hour first fill short. In production the backend runs the workers.
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CacheModule } from '../../cache/cache.module.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CatalogModule } from './catalog.module.js';
import { CatalogWorker } from './catalog.worker.js';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, CacheModule, CatalogModule] })
class WorkerModule {}

const app = await NestFactory.createApplicationContext(WorkerModule);
app.enableShutdownHooks();
// CATALOG_WORKERS=false in .env only keeps them out of the web server.
await app.get(CatalogWorker).start();

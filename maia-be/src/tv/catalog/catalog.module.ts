import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';
import { CatalogWorker } from './catalog.worker.js';

@Module({
  providers: [CatalogService, CatalogWorker],
  exports: [CatalogService],
})
export class CatalogModule {}

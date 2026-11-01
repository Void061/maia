import { Module } from '@nestjs/common';
import { ServiceSwitches } from '../providers/service-switches.js';
import { CatalogScheduler } from './catalog.scheduler.js';
import { CatalogService } from './catalog.service.js';
import { CatalogWorker } from './catalog.worker.js';

@Module({
  providers: [CatalogService, CatalogWorker, ServiceSwitches, CatalogScheduler],
  exports: [CatalogService, ServiceSwitches, CatalogScheduler],
})
export class CatalogModule {}

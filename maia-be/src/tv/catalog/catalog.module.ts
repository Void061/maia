import { Module } from '@nestjs/common';
import { ServiceSwitches } from '../providers/service-switches.js';
import { CatalogActivity } from './catalog.activity.js';
import { CatalogScheduler } from './catalog.scheduler.js';
import { CatalogService } from './catalog.service.js';
import { CatalogWorker } from './catalog.worker.js';

@Module({
  providers: [CatalogService, CatalogWorker, ServiceSwitches, CatalogScheduler, CatalogActivity],
  exports: [CatalogService, ServiceSwitches, CatalogScheduler, CatalogActivity],
})
export class CatalogModule {}

import { Module } from '@nestjs/common';
import { LiveService } from '../live/live.service.js';
import { ServiceSwitches } from '../providers/service-switches.js';
import { CatalogService } from './catalog.service.js';
import { CatalogWorker } from './catalog.worker.js';

@Module({
  providers: [CatalogService, CatalogWorker, ServiceSwitches, LiveService],
  exports: [CatalogService, ServiceSwitches, LiveService],
})
export class CatalogModule {}

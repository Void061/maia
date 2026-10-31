import { Module } from '@nestjs/common';
import { ServiceSwitches } from '../providers/service-switches.js';
import { CatalogService } from './catalog.service.js';
import { CatalogWorker } from './catalog.worker.js';

@Module({
  providers: [CatalogService, CatalogWorker, ServiceSwitches],
  exports: [CatalogService, ServiceSwitches],
})
export class CatalogModule {}

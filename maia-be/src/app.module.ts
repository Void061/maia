import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountController } from './account/account.controller.js';
import { AdminController } from './admin/admin.controller.js';
import { AdminGuard } from './admin/admin.guard.js';
import { AdminServicesController } from './admin/services.controller.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CacheModule } from './cache/cache.module.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfilesController } from './profiles/profiles.controller.js';
import { CatalogModule } from './tv/catalog/catalog.module.js';
import { TvController } from './tv/tv.controller.js';
import { StreamProxyService } from './tv/stream-proxy.js';
import { TmdbCatalogService } from './tv/tmdb-catalog.service.js';
import { TvService } from './tv/tv.service.js';
import { TvCacheWarmer } from './tv/tv.warmer.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Default limit for the whole API; auth endpoints set a stricter one.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    CacheModule,
    MailModule,
    AuthModule,
    CatalogModule,
  ],
  controllers: [AppController, AccountController, ProfilesController, AdminController, AdminServicesController, TvController],
  providers: [AppService, AdminGuard, TvService, TmdbCatalogService, StreamProxyService, TvCacheWarmer, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

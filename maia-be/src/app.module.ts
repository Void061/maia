import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountController } from './account/account.controller.js';
import { AdminController } from './admin/admin.controller.js';
import { AdminGuard } from './admin/admin.guard.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { MailModule } from './mail/mail.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfilesController } from './profiles/profiles.controller.js';
import { CatalogModule } from './tv/catalog/catalog.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Default limit for the whole API; auth endpoints set a stricter one.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    MailModule,
    AuthModule,
    CatalogModule,
  ],
  controllers: [AppController, AccountController, ProfilesController, AdminController],
  providers: [AppService, AdminGuard, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

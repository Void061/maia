import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { PairingService } from './pairing.service.js';
import { SessionCheck } from './session-check.js';
import { TwoFactorService } from './two-factor.service.js';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, SessionCheck, TwoFactorService, PairingService],
  exports: [AuthGuard, SessionCheck, TwoFactorService, JwtModule],
})
export class AuthModule {}

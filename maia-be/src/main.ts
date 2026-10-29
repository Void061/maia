import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // maia-fe proxies /api/* here: trust its X-Forwarded-For so rate limits
  // apply per client, not per proxy.
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  // OpenAPI: UI on /docs, JSON on /docs-json (maia-fe generates its types from it).
  const openapi = new DocumentBuilder()
    .setTitle('MAIA API')
    .setVersion('0.1')
    .addCookieAuth('maia_at')
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, openapi));

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { config as loadEnv } from 'dotenv';
import { json, urlencoded } from 'express';
import { setDefaultResultOrder } from 'dns';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { csrfOriginCheck } from './auth/csrf.middleware';
import { assertRequiredEnv, getWebOrigins } from './config/env';
import { SafeExceptionFilter } from './security/http-exception.filter';

loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '../.env') });
setDefaultResultOrder('ipv4first');

function securityHeaders(_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

async function bootstrap() {
  assertRequiredEnv();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(json({ limit: '200kb' }));
  app.use(urlencoded({ extended: false, limit: '200kb' }));
  app.use(cookieParser());
  app.use(securityHeaders);
  app.use(csrfOriginCheck);
  app.useGlobalFilters(new SafeExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableCors({ origin: getWebOrigins(), credentials: true });
  const expressApp = app.getHttpAdapter().getInstance();
  if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
    expressApp.set('trust proxy', 1);
  }
  expressApp.get('/api/health', (_req: unknown, res: { json: (b: unknown) => void }) => {
    res.json({ ok: true });
  });
  const port = Number(process.env.PORT || 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`API http://0.0.0.0:${port}/api`);
}
bootstrap();

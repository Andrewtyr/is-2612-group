import 'dotenv/config';
import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Увеличиваем лимит JSON для сохранения большого количества оценок
  app.useBodyParser('json', { limit: '5mb' });

  // Поддержка авторизации через cookies
  app.use(cookieParser());

  // Настройки CORS
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  // Запуск API
  await app.listen(Number(process.env.API_PORT ?? 4000), '0.0.0.0');
}

void bootstrap();
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: ['http://localhost:4200', 'https://heartwarming-superpersonal-edyth.ngrok-free.dev'],
    credentials: true,
  });

  const angularDist = join(__dirname, '..', '..', '..', 'client', 'dist', 'client');
  const indexHtml = join(angularDist, 'index.html');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express');
  app.use(express.static(angularDist));
  app.use((_req: any, res: any, next: any) => {
    if (_req.path.startsWith('/api/')) return next();
    if (_req.path.includes('.')) return next();
    res.sendFile(indexHtml);
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API + Frontend: http://localhost:${port}/api`);
}
bootstrap();

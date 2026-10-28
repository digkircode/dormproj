import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';
import { warmUpPdfConverter } from './contracts/docx-to-pdf';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(cookieParser());
  app.enableCors({
    origin: config.get('FRONTEND_URL', { infer: true }),
    credentials: true,
  });

  await warmUpPdfConverter();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://10.1.0.159:5173'];
  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: envOrigins.length ? envOrigins : defaultOrigins,
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://localhost:${port}/api`);
}

bootstrap();

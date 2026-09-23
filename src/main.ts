import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Caddy(같은 기기의 프록시) 뒤에서 실제 클라이언트 IP를 X-Forwarded-For로 받는다.
  // 쓰기 제한(ThrottlerGuard)이 모든 요청을 프록시 IP 하나로 세지 않도록. 루프백 프록시만 믿는다
  app.set('trust proxy', 'loopback');

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

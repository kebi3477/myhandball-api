import Redis from 'ioredis';
import { Provider } from '@nestjs/common';

export const REDIS = 'REDIS';

export const RedisClientProvider: Provider = {
  provide: REDIS,
  useFactory: () => new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/0'),
};

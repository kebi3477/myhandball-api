import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisClientProvider } from './providers/redis.client';

@Global()
@Module({
  providers: [RedisClientProvider, CacheService],
  exports: [CacheService],
})
export class CacheModule {}

import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from './providers/redis.client';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (e) {
      this.logger.warn(`Invalid JSON in cache: ${key}`);
      return null;
    }
  }

  async setJSON(key: string, value: unknown, ttlSec?: number) {
    const payload = JSON.stringify(value);
    if (ttlSec) return this.redis.set(key, payload, 'EX', ttlSec);
    return this.redis.set(key, payload);
  }

  async del(key: string) {
    return this.redis.del(key);
  }
}

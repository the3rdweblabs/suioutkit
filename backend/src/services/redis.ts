// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { Redis } from "ioredis";
import { getEnv } from "../config/env.js";
import logger from "../utils/logger.js";

const REDIS_URL = getEnv("REDIS_URL", "redis://localhost:6379");
const SESSION_TTL = 86400; // 24 hours in seconds

class RedisService {
  private client: Redis;

  constructor() {
    this.client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        return Math.min(times * 100, 2000);
      }
    });
    // Register lock event handlers (optional)
    this.client.on('connect', () => {
      logger.success('REDIS', 'Connected to Redis Cache successfully.');
    });
    this.client.on('error', (err: Error) => {
      logger.warn('REDIS', `Connection event alert: ${err.message}`);
    });
  }



  /**
   * Sets checkout session details in Redis with a 24-hour expiration time (TTL).
   */
  public async setSession(nonce: string, sessionData: any): Promise<void> {
    try {
      await this.client.set(
        `sok:session:${nonce}`,
        JSON.stringify(sessionData),
        "EX",
        SESSION_TTL
      );
    } catch (err: any) {
      logger.error("REDIS", `Failed to set session for ${nonce}: ${err.message}`);
    }
  }

  /**
   * Retrieves checkout session details from Redis.
   */
  public async getSession(nonce: string): Promise<any | null> {
    try {
      const data = await this.client.get(`sok:session:${nonce}`);
      return data ? JSON.parse(data) : null;
    } catch (err: any) {
      logger.error("REDIS", `Failed to get session for ${nonce}: ${err.message}`);
      return null;
    }
  }

  /**
   * Atomically updates a session's status in Redis.
   */
  public async updateSessionStatus(
    nonce: string,
    status: "PENDING" | "PROCESSING" | "SETTLED" | "EXPIRED",
    additionalData: Record<string, any> = {}
  ): Promise<void> {
    try {
      const session = await this.getSession(nonce);
      if (session) {
        const updated = {
          ...session,
          status,
          ...additionalData,
          updatedAt: new Date().toISOString()
        };
        await this.setSession(nonce, updated);
        // Publish status update for SSE listeners
        await this.client.publish(
          `payment:${nonce}`,
          JSON.stringify({
            status,
            walrusBlobId: additionalData?.walrusBlobId ?? updated.walrusBlobId,
            txDigest: additionalData?.txDigest ?? updated.txDigest,
            error: additionalData?.error ?? updated.error
          })
        );
      }
    } catch (err: any) {
      logger.error("REDIS", `Failed to update session status for ${nonce}: ${err.message}`);
    }
  }

  /**
   * Exposes the underlying ioredis client instance.
   */
  public getClient(): Redis {
    return this.client;
  }

  /**
   * Acquire a simple lock using SET NX EX. Returns true if lock was set.
   */
  public async acquireLock(key: string, ttlSeconds: number = 30): Promise<boolean> {
    const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Release a lock (delete the key).
   */
  public async releaseLock(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Disconnects the Redis connection cleanly.
   */
  public async disconnect(): Promise<void> {
    await this.client.quit();
  }
}

export const redisService = new RedisService();
export default redisService;

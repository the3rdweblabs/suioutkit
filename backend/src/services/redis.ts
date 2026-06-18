// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { Redis, RedisOptions } from "ioredis";
import crypto from "crypto";
import { getEnv } from "../config/env.js";
import logger from "../utils/logger.js";

const REDIS_MODE = getEnv("REDIS_MODE", "local");
const REDIS_URL = getEnv("REDIS_URL", "redis://localhost:6379");
const REDIS_HOST = getEnv("REDIS_HOST", "localhost");
const REDIS_PORT = parseInt(getEnv("REDIS_PORT", "6379"), 10);
const REDIS_PASSWORD = getEnv("REDIS_PASSWORD", "");
const REDIS_TLS_ENABLED = getEnv("REDIS_TLS_ENABLED", "false") !== "false";
const SESSION_TTL = parseInt(getEnv("SESSION_TTL", "86400"), 10); // 24 hours
const MAX_RETRIES = 20;

function buildOptions(): RedisOptions {
  const opts: RedisOptions = {
    maxRetriesPerRequest: MAX_RETRIES,
    retryStrategy: (times: number) => {
      if (times > MAX_RETRIES) return null;
      return Math.min(times * 200, 5000);
    },
    enableReadyCheck: false,
    lazyConnect: false,
  };

  if (REDIS_MODE === "live") {
    opts.host = REDIS_HOST;
    opts.port = REDIS_PORT;
    if (REDIS_PASSWORD) {
      opts.password = REDIS_PASSWORD;
    }
    if (REDIS_TLS_ENABLED) {
      opts.tls = {};
    }
    return opts;
  }

  if (REDIS_MODE === "demo") {
    // Use a single connection URL - either REDIS_URL or REDIS_HOST if it's a full URL
    const url = REDIS_HOST.startsWith("redis://") || REDIS_HOST.startsWith("rediss://")
      ? REDIS_HOST
      : REDIS_URL;
    if (url.startsWith("rediss://") || REDIS_TLS_ENABLED) {
      opts.tls = {};
    }
    return opts;
  }

  // local mode - uses REDIS_URL (defaults to redis://localhost:6379 for Docker)
  // TLS only from the URL scheme, never from REDIS_TLS_ENABLED (that's for live mode)
  if (REDIS_URL.startsWith("rediss://")) {
    opts.tls = {};
  }
  return opts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RedisService {
  private client: Redis;

  constructor() {
    const options = buildOptions();

    if (REDIS_MODE === "live") {
      this.client = new Redis(options);
    } else if (REDIS_MODE === "demo") {
      const url = REDIS_HOST.startsWith("redis://") || REDIS_HOST.startsWith("rediss://")
        ? REDIS_HOST
        : REDIS_URL;
      this.client = new Redis(url, options);
    } else {
      // local mode - Docker Redis on default localhost:6379
      this.client = new Redis(REDIS_URL, options);
    }

    this.client.on("connect", () => {
      logger.success("REDIS", `Connected (mode: ${REDIS_MODE})`);
    });

    this.client.on("error", (err: Error) => {
      logger.warn("REDIS", `Connection event: ${err.message}`);
    });
  }

  private async withRetry<T>(fn: () => Promise<T>, operation: string, maxRetries = 3): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          const delay = Math.min(attempt * 200, 2000);
          logger.warn("REDIS", `${operation} attempt ${attempt}/${maxRetries} failed: ${err.message}, retrying in ${delay}ms`);
          await sleep(delay);
        }
      }
    }
    throw lastError || new Error(`${operation} failed after ${maxRetries} retries`);
  }

  public async setSession(nonce: string, sessionData: any): Promise<void> {
    await this.withRetry(async () => {
      await this.client.set(
        `sok:session:${nonce}`,
        JSON.stringify(sessionData),
        "EX",
        SESSION_TTL
      );
    }, `setSession(${nonce})`);
  }

  public async getSession(nonce: string): Promise<any | null> {
    return this.withRetry(async () => {
      const data = await this.client.get(`sok:session:${nonce}`);
      return data ? JSON.parse(data) : null;
    }, `getSession(${nonce})`);
  }

  public async updateSessionStatus(
    nonce: string,
    status: "PENDING" | "PROCESSING" | "SETTLED" | "EXPIRED",
    additionalData: Record<string, any> = {}
  ): Promise<void> {
    await this.withRetry(async () => {
      const session = await this.getSession(nonce);
      if (!session) {
        logger.warn("REDIS", `Cannot update status for missing session: ${nonce}`);
        return;
      }

      const updated = {
        ...session,
        status,
        ...additionalData,
        updatedAt: new Date().toISOString()
      };

      // Use optimistic locking via WATCH/MULTI to prevent race conditions
      const watchedKey = `sok:session:${nonce}`;
      await this.client.watch(watchedKey);
      const current = await this.client.get(watchedKey);
      if (current !== JSON.stringify(session)) {
        logger.warn("REDIS", `Session ${nonce} was modified by another process; reload and retry`);
        await this.client.unwatch();
        return this.updateSessionStatus(nonce, status, additionalData);
      }

      const multi = this.client.multi();
      multi.set(watchedKey, JSON.stringify(updated), "EX", SESSION_TTL);
      multi.publish(
        `payment:${nonce}`,
        JSON.stringify({
          status,
          walrusBlobId: additionalData?.walrusBlobId ?? updated.walrusBlobId,
          txDigest: additionalData?.txDigest ?? updated.txDigest,
          error: additionalData?.error ?? updated.error
        })
      );
      const results = await multi.exec();

      if (results === null) {
        logger.warn("REDIS", `Optimistic lock failed for ${nonce}; retrying`);
        return this.updateSessionStatus(nonce, status, additionalData);
      }
    }, `updateSessionStatus(${nonce})`);
  }

  public getClient(): Redis {
    return this.client;
  }

  public async acquireLock(key: string, ttlSeconds: number = 30, owner?: string): Promise<string | null> {
    const lockOwner = owner || crypto.randomUUID();
    const result = await this.client.set(key, lockOwner, "EX", ttlSeconds, "NX");
    return result === "OK" ? lockOwner : null;
  }

  public async releaseLock(key: string, owner: string): Promise<void> {
    const currentOwner = await this.client.get(key);
    if (currentOwner === owner) {
      await this.client.del(key);
    }
  }

  public async disconnect(): Promise<void> {
    await this.client.quit();
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }
}

export const redisService = new RedisService();
export default redisService;

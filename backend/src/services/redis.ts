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
const REDIS_TLS_ENABLED = getEnv("REDIS_TLS_ENABLED", "true") !== "false";
const SESSION_TTL = parseInt(getEnv("SESSION_TTL", "86400"), 10); // 24 hours

function buildOptions(): RedisOptions {
  const opts: RedisOptions = {
    maxRetriesPerRequest: 3,
    retryStrategy: (times: number) => Math.min(times * 100, 2000),
    enableReadyCheck: true,
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

  return opts;
}

class RedisService {
  private client: Redis;

  constructor() {
    const options = buildOptions();

    if (REDIS_MODE === "live") {
      this.client = new Redis(options);
    } else {
      if (REDIS_URL.startsWith("rediss://")) {
        options.tls = {};
      }
      this.client = new Redis(REDIS_URL, options);
    }

    this.client.on("connect", () => {
      logger.success("REDIS", `Connected (mode: ${REDIS_MODE})`);
    });

    this.client.on("error", (err: Error) => {
      logger.warn("REDIS", `Connection event: ${err.message}`);
    });
  }

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

  public async getSession(nonce: string): Promise<any | null> {
    try {
      const data = await this.client.get(`sok:session:${nonce}`);
      return data ? JSON.parse(data) : null;
    } catch (err: any) {
      logger.error("REDIS", `Failed to get session for ${nonce}: ${err.message}`);
      return null;
    }
  }

  public async updateSessionStatus(
    nonce: string,
    status: "PENDING" | "PROCESSING" | "SETTLED" | "EXPIRED",
    additionalData: Record<string, any> = {}
  ): Promise<void> {
    try {
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
    } catch (err: any) {
      logger.error("REDIS", `Failed to update session status for ${nonce}: ${err.message}`);
    }
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

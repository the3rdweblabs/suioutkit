// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { Request, Response, NextFunction } from "express";
import redisService from "../services/redis.js";
import logger from "../utils/logger.js";

/**
 * IP-based rate limiter middleware using Redis.
 * Restricts checkout session generation to prevent brute-force abuse (Max 10 requests per minute).
 */
export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || "unknown_ip";
  const key = `sok:ratelimit:${ip}`;

  try {
    const client = redisService.getClient();
    const currentCountString = await client.get(key);
    const currentCount = currentCountString ? parseInt(currentCountString, 10) : 0;

    if (currentCount >= 10) {
      logger.warn("RATE_LIMITER", `Blocked spam session requests from IP: ${ip}`);
      return res.status(429).json({ error: "Too many requests. Please try again in a minute." });
    }

    // Atomically increment and set a 60-second expire TTL
    await client.multi()
      .incr(key)
      .expire(key, 60)
      .exec();

    next();
  } catch (err: any) {
    // Graceful degradation: let the request pass if Redis experiences a hiccup
    logger.warn("RATE_LIMITER", `Failed to run rate check: ${err.message}`);
    next();
  }
}

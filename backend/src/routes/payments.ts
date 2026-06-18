// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { Router } from "express";
import redisService from "../services/redis.js";
import logger from "../utils/logger.js";

const router = Router();

const MAX_SSE_SUBSCRIBERS = 50;
let activeSubscriberCount = 0;

/**
 * Stream payment status updates for a particular nonce.
 * Emits JSON payloads after each backend step (bank, walrus, settle).
 */
router.get("/stream/:nonce", async (req, res) => {
  const { nonce } = req.params;

  if (activeSubscriberCount >= MAX_SSE_SUBSCRIBERS) {
    res.status(503).json({ error: "Too many active stream connections. Try again shortly." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const session = await redisService.getSession(nonce);
  if (session) {
    res.write(
      `data: ${JSON.stringify({
        status: session.status,
        walrusBlobId: session.walrusBlobId,
        txDigest: session.txDigest,
        error: session.error
      })}\n\n`
    );
  } else {
    res.write(`data: ${JSON.stringify({ status: "EXPIRED", error: "Session expired." })}\n\n`);
  }

  // Subscribe to Redis pub/sub channel for this nonce
  const subscriber = redisService.getClient().duplicate();
  await subscriber.subscribe(`payment:${nonce}`);
  activeSubscriberCount++;

  subscriber.on("message", (_, msg) => {
    res.write(`data: ${msg}\n\n`);
  });

  // Cleanup when client disconnects
  req.on("close", () => {
    subscriber.quit();
    activeSubscriberCount = Math.max(0, activeSubscriberCount - 1);
  });
});

export default router;

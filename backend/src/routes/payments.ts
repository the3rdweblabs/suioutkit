// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { Router } from "express";
import redisService from "../services/redis.js";

const router = Router();

/**
 * Stream payment status updates for a particular nonce.
 * Emits JSON payloads after each backend step (bank, walrus, settle).
 */
router.get("/stream/:nonce", async (req, res) => {
  const { nonce } = req.params;
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

  subscriber.on("message", (_, msg) => {
    res.write(`data: ${msg}\n\n`);
  });

  // Cleanup when client disconnects
  req.on("close", () => subscriber.quit());
});

export default router;

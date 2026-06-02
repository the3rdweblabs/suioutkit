// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
/**
 * Lightweight framework-agnostic polling utility.
 * Usage:
 * const poll = createPolling(async () => { await fetchStatus() }, 5000);
 * poll.start();
 * poll.stop();
 */
export function createPolling(fn: () => Promise<void> | void, intervalMs: number) {
  let timer: number | null = null;
  let running = false;

  async function tick() {
    try {
      await fn();
    } catch (e) {
      // swallow errors — caller should handle inside fn
      // but preserve running state
    }
    if (running) {
      timer = (setTimeout(() => void tick(), intervalMs) as unknown) as number;
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      tick();
    },
    stop() {
      running = false;
      if (timer) {
        clearTimeout(timer as unknown as number);
        timer = null;
      }
    },
    isRunning() {
      return running;
    }
  } as const;
}

export default createPolling;
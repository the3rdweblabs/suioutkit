// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

export type RequestOptions = RequestInit & {
  timeout?: number; // ms
  retries?: number; // simple retry count for idempotent GETs
};

export class HttpError extends Error {
  status: number | null;
  body: any | null;
  constructor(message: string, status: number | null = null, body: any | null = null) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "HttpError";
  }
}

export async function request<T = any>(input: string, opts: RequestOptions = {}): Promise<T> {
  const { timeout = 10000, retries = 0, ...fetchOpts } = opts;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  let lastErr: any = null;

  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(input, { signal: controller.signal, ...fetchOpts } as RequestInit);
        clearTimeout(id);

        const contentType = res.headers.get("content-type") || "";
        let body: any = null;
        if (contentType.includes("application/json")) {
          body = await res.json();
        } else {
          body = await res.text();
        }

        if (!res.ok) {
          throw new HttpError(`HTTP ${res.status}: ${res.statusText}`, res.status, body);
        }

        return body as T;
      } catch (err: any) {
        lastErr = err;
        // If aborted or unrecoverable, break early
        if (err.name === "AbortError") throw new HttpError("Request timed out", null, null);
        // For non-GET methods, don't retry
        const method = (fetchOpts.method || "GET").toUpperCase();
        if (method !== "GET") throw err;
        // Otherwise loop to retry
      }
    }

    throw lastErr || new Error("Unknown fetch error");
  } finally {
    clearTimeout(id);
  }
}

export default request;

// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

/** Production SuiOutKit API origin (versioned paths under /v1/). */
//export const DEFAULT_API_ORIGIN = "https://api.suioutkit.xyz";
export const DEFAULT_API_ORIGIN = "http://localhost:5000";

/** API version prefix - all checkout and payment routes live under this path. */
export const API_V1_PREFIX = "/v1";

export function joinApiPath(origin: string, ...segments: string[]): string {
  const base = origin.replace(/\/+$/, "");
  const path = [API_V1_PREFIX, ...segments].join("/").replace(/\/+/g, "/");
  return `${base}${path}`;
}

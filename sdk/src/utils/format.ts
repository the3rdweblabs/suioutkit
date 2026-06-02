// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

/** Format a Naira amount with currency symbol and grouping. */
export function formatNgn(amount: number): string {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);
  } catch (_) {
    // Fallback
    return `₦${Math.round(amount).toLocaleString()}`;
  }
}

/** Convert base integer units into token float given decimals. */
export function toTokenUnits(baseUnits: number, decimals = 9): number {
  return baseUnits / Math.pow(10, decimals);
}

/** Format token amounts with fixed decimals and trimming. */
export function formatToken(amount: number, decimals = 9, digits = 6): string {
  const value = Number(amount);
  if (!isFinite(value)) return "0";
  return value.toFixed(digits).replace(/(?:\.0+|(?<=\.[0-9]*?)0+)$/, "");
}

export default { formatNgn, toTokenUnits, formatToken };

// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)
import { getEnv } from "./env.js";

export interface CoinConfig {
  type: string;
  coingeckoId: string;
  decimals: number;
}

const DEFAULT_COINS: Record<string, CoinConfig> = {
  SUI: {
    type: "0x2::sui::SUI",
    coingeckoId: "sui",
    decimals: 9,
  },
};

function parseSupportedCoins(): Record<string, CoinConfig> {
  const raw = getEnv("SUPPORTED_COINS", "");
  const legacyTokenType = getEnv("SETTLEMENT_TOKEN_TYPE", "");
  if (!raw) {
    if (legacyTokenType) {
      return { SUI: { type: legacyTokenType, coingeckoId: "sui", decimals: 9 } };
    }
    return { ...DEFAULT_COINS };
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, { type: string; coingeckoId?: string; decimals?: number }>;
    const result: Record<string, CoinConfig> = {};
    for (const [symbol, cfg] of Object.entries(parsed)) {
      result[symbol.toUpperCase()] = {
        type: cfg.type,
        coingeckoId: cfg.coingeckoId || symbol.toLowerCase(),
        decimals: cfg.decimals ?? 9,
      };
    }
    return Object.keys(result).length > 0 ? result : { ...DEFAULT_COINS };
  } catch {
    console.warn("Failed to parse SUPPORTED_COINS, falling back to SUI-only.");
    return { ...DEFAULT_COINS };
  }
}

let supportedCoins: Record<string, CoinConfig> | null = null;

function getCoins(): Record<string, CoinConfig> {
  if (!supportedCoins) {
    supportedCoins = parseSupportedCoins();
  }
  return supportedCoins;
}

export function getSupportedCoins(): Record<string, CoinConfig> {
  return { ...getCoins() };
}

export function getCoinConfig(typeOrSymbol: string): CoinConfig | undefined {
  const coins = getCoins();
  if (coins[typeOrSymbol.toUpperCase()]) {
    return coins[typeOrSymbol.toUpperCase()];
  }
  return Object.values(coins).find((c) => c.type === typeOrSymbol);
}

export function getDefaultCoin(): CoinConfig {
  const defaultSymbol = getEnv("DEFAULT_COIN", "SUI").toUpperCase();
  const coins = getCoins();
  return coins[defaultSymbol] || coins.SUI || Object.values(coins)[0];
}

export function getDecimals(typeOrSymbol: string): number {
  return getCoinConfig(typeOrSymbol)?.decimals ?? 9;
}

export function toBaseUnits(amount: number, coinType: string): number {
  const decimals = getDecimals(coinType);
  return Math.floor(amount * 10 ** decimals);
}

export function fromBaseUnits(amount: number, coinType: string): number {
  const decimals = getDecimals(coinType);
  return amount / 10 ** decimals;
}

export function getSupportedCoinList(): Array<{ symbol: string; type: string; decimals: number }> {
  return Object.entries(getCoins()).map(([symbol, cfg]) => ({
    symbol,
    type: cfg.type,
    decimals: cfg.decimals,
  }));
}

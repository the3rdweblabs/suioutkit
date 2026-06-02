// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import fetch from "node-fetch";

class FXService {
  private coinPriceCache: Record<string, { price: number; timestamp: number }> = {};
  private fiatRateCache: { usdToNgn: number; timestamp: number } | null = null;
  private CACHE_DURATION_MS = 30000; // 30 seconds TTL for hyper-accuracy!

  /**
   * Fetches the real-time USD price of a coin from CoinGecko.
   * @param coinType - The coin type to fetch price for
   * @param skipCache - Force fresh fetch, ignore cache
   */
  public async getCoinPriceInUSD(coinType: string, skipCache: boolean = false): Promise<number> {
    const cleanType = coinType.toLowerCase();

    // Map standard token types to CoinGecko IDs
    let coinId = "sui";
    if (cleanType.includes("usdc")) {
      coinId = "usd-coin";
    } else if (cleanType.includes("usdt")) {
      coinId = "tether";
    }

    const cached = this.coinPriceCache[coinId];
    if (!skipCache && cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
      return cached.price;
    }

    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
      if (!res.ok) throw new Error(`CoinGecko status ${res.status}`);
      const data: any = await res.json();
      const price = data[coinId]?.usd;
      if (price) {
        this.coinPriceCache[coinId] = { price, timestamp: Date.now() };
        console.log(`[FX SERVICE]: Fetched dynamic price for ${coinId}: $${price}`);
        return price;
      }
      return coinId === "sui" ? 1.5 : 1.0; // Fail-safe fallbacks
    } catch (err: any) {
      console.warn(`[FX SERVICE WARNING]: Failed to fetch CoinGecko price for ${coinId}, using default:`, err.message);
      return coinId === "sui" ? 1.5 : 1.0;
    }
  }

  /**
   * Fetches the real-time USD to NGN exchange rate from open.er-api.com.
   * @param skipCache - Force fresh fetch, ignore cache
   */
  public async getUSDToNGNRate(skipCache: boolean = false): Promise<number> {
    const cached = this.fiatRateCache;
    if (!skipCache && cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
      return cached.usdToNgn;
    }

    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!res.ok) throw new Error(`Exchange rate API status ${res.status}`);
      const data: any = await res.json();
      const rate = data.rates?.NGN;
      if (rate) {
        this.fiatRateCache = { usdToNgn: rate, timestamp: Date.now() };
        console.log(`[FX SERVICE]: Fetched dynamic USD to NGN exchange rate: ₦${rate}`);
        return rate;
      }
      return 1300; // Fail-safe interbank fallback
    } catch (err: any) {
      console.warn(`[FX SERVICE WARNING]: Failed to fetch USD/NGN fiat rate, using default 1300:`, err.message);
      return 1300;
    }
  }

  /**
   * Calculates the conversion rate from NGN to a specific settlement token.
   * Returns: Naira cost per 1 Token (e.g. 1950 NGN per 1 SUI)
   * @param coinType - The coin type to calculate rate for
   * @param skipCache - Force fresh fetch, ignore cache (used for critical payment validation)
   */
  public async getRateNGNToToken(coinType: string, skipCache: boolean = false): Promise<number> {
    const usdToNgnParallelRate = await this.getUSDToNGNRate(skipCache);
    const coinPriceInUSD = await this.getCoinPriceInUSD(coinType, skipCache);
    const calculatedRate = coinPriceInUSD * usdToNgnParallelRate;
    return calculatedRate > 0 ? calculatedRate : 1300 * coinPriceInUSD;
  }
}

export const fxService = new FXService();
export default fxService;

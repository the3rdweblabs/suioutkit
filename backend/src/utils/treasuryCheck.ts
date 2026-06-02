// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import suiService from "../services/sui.js";
import { Request, Response } from "express";
import logger from "../utils/logger.js";

/**
 * Checks treasury balance and sends appropriate error response if insufficient.
 * Returns true when balance is sufficient.
 */
export async function assertTreasurySufficient(
  settlementAmount: number,
  coinType: string,
  nonce: string,
  res: Response
): Promise<boolean> {
  try {
    const balanceCheck = await suiService.checkTreasuryBalance(settlementAmount, coinType);
    if (!balanceCheck.sufficient) {
      logger.warn(
        "CHECKOUT",
        `Treasury insufficient. Available: ${balanceCheck.available}, Required: ${balanceCheck.required}, Nonce: ${nonce}`
      );
      res.status(409).json({
        error: "Treasury insufficient for settlement",
        sufficient: false,
        availableBalance: balanceCheck.available,
        requiredAmount: balanceCheck.required
      });
      return false;
    }
    logger.info(
      "CHECKOUT",
      `Treasury sufficient for nonce ${nonce}: ${balanceCheck.available} >= ${balanceCheck.required}`
    );
    return true;
  } catch (e: any) {
    logger.error(
      "CHECKOUT",
      `Treasury balance check failed for nonce ${nonce}: ${e.message}`
    );
    res.status(409).json({ error: "Payment service unavailable. Treasury validation failed.", sufficient: false });
    return false;
  }
}

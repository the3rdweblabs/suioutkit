// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import Stripe from "stripe";
import { getEnv } from "../config/env.js";
import logger from "../utils/logger.js";

const STRIPE_SECRET_KEY = getEnv("STRIPE_SECRET_KEY", "");
const STRIPE_WEBHOOK_SECRET = getEnv("STRIPE_WEBHOOK_SECRET", "");

class StripeService {
  private stripe?: Stripe;

  constructor() {
    if (!STRIPE_SECRET_KEY) {
      logger.warn("STRIPE", "STRIPE_SECRET_KEY is not configured! Check your backend/.env file.");
      return;
    } else {
      this.stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: "2026-04-22.dahlia" as any,
      });
      logger.info(
        "STRIPE",
        `Config loaded. secretKeyLength=${STRIPE_SECRET_KEY.length}, secretKeyMode=${STRIPE_SECRET_KEY.startsWith("sk_test") ? "test" : "live"}`
      );
    }
  }

  /**
   * Creates a PaymentIntent for the given amount and currency.
   */
  public async createPaymentIntent(
    amount: number,
    currency: string,
    nonce: string,
    metadata: Record<string, string> = {}
  ): Promise<string> {
    if (!STRIPE_SECRET_KEY || !this.stripe) {
      throw new Error("Stripe is not configured on this server.");
    }

    try {
      const amountInMinorUnits = Math.max(1, Math.round(amount * 100));
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: amountInMinorUnits,
        currency: currency.toLowerCase(),
        metadata: {
          nonce,
          amountMajorUnits: String(amount),
          amountMinorUnits: String(amountInMinorUnits),
          ...metadata,
        },
      });

      if (!paymentIntent.client_secret) {
        throw new Error("Failed to generate client_secret from Stripe.");
      }

      return paymentIntent.client_secret;
    } catch (err: any) {
      logger.error("STRIPE", `Failed to create PaymentIntent: ${err.message}`);
      throw new Error(`Stripe Error: ${err.message}`);
    }
  }

  /**
   * Validates and constructs the Stripe webhook event.
   */
  public constructEvent(payload: string | Buffer, signature: string): Stripe.Event {
    if (!STRIPE_WEBHOOK_SECRET || !this.stripe) {
      throw new Error("Stripe webhook secret is not configured.");
    }

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      logger.error("STRIPE", `Webhook signature verification failed: ${err.message}`);
      throw err;
    }
  }
}

export const stripeService = new StripeService();
export default stripeService;

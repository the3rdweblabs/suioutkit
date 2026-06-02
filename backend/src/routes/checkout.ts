// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import redisService from "../services/redis.js";
import flutterwaveService from "../services/flutterwave.js";
import stripeService from "../services/stripe.js";
import walrusService from "../services/walrus.js";
import suiService from "../services/sui.js";
import fxService from "../services/fx.js";
import { getEnv } from "../config/env.js";
import logger from "../utils/logger.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { validateWebhookAuth } from "../middleware/webhookAuth.js";
import { CheckoutSession } from "../types/checkout.js";
import { assertTreasurySufficient } from "../utils/treasuryCheck.js";

const router = Router();

// Load FX and Webhook configurations
const PACKAGE_ID = getEnv("PACKAGE_ID");
const SETTLEMENT_TOKEN_TYPE = getEnv("SETTLEMENT_TOKEN_TYPE", "0x2::sui::SUI");
const CRYPTO_REGISTRY_ID = getEnv("CRYPTO_REGISTRY_ID");
const CRYPTO_REGISTRY_NAME = getEnv("CRYPTO_REGISTRY_NAME", "suioutkit-crypto-settlements");

function normalizeMerchantAddress(address: string) {
  if (!isValidSuiAddress(address)) {
    throw new Error(`Invalid merchant Sui address: ${address}`);
  }

  return normalizeSuiAddress(address);
}

/**
 * Endpoint: POST /v1/checkout/session
 * Initializes a new checkout session.
 */
router.post("/session", rateLimiter, async (req: Request, res: Response) => {
  const { amount, currency, merchantAddress, coinType, metadata } = req.body;

  if (!amount || !currency || !merchantAddress) {
    return res.status(400).json({ error: "Missing required session parameters." });
  }

  try {
    const nonce = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString("hex");
    const targetCoinType = coinType || SETTLEMENT_TOKEN_TYPE;
    const normalizedMerchantAddress = normalizeMerchantAddress(merchantAddress);

    // Calculate real-time dynamic exchange rate for checkout preview
    let estimatedRate = 1300;
    try {
      estimatedRate = await fxService.getRateNGNToToken(targetCoinType);
    } catch (e) {
      // Graceful fallback
    }

    const session: CheckoutSession = {
      token,
      nonce,
      amount,
      currency,
      merchantAddress: normalizedMerchantAddress,
      metadata: metadata || {},
      status: "PENDING",
      createdAt: new Date().toISOString(),
      packageId: PACKAGE_ID,
      cryptoRegistryId: CRYPTO_REGISTRY_ID,
      cryptoRegistryName: CRYPTO_REGISTRY_NAME,
      coinType: targetCoinType,
      estimatedRate
    };

    // Cache session in Redis for 24h
    await redisService.setSession(nonce, session);
    // Also index the token to the nonce mapping
    await redisService.setSession(`token:${token}`, { nonce });

    logger.info("CHECKOUT", `Created checkout session. Nonce: ${nonce}, Amount: ${currency} ${amount}`);
    return res.json(session);
  } catch (err: any) {
    logger.error("CHECKOUT", `Session creation failed: ${err.message}`);
    return res.status(400).json({ error: err.message || "Failed to create checkout session." });
  }
});

/**
 * Endpoint: POST /v1/checkout/charge
 * Validates treasury balance with fresh FX rate, then processes the dynamic payment charge.
 */
router.post("/charge", async (req: Request, res: Response) => {
  const { token, method, phoneNumber } = req.body;

  if (!token || !method) {
    return res.status(400).json({ error: "Missing token or charge method." });
  }

  // Resolve nonce from token
  const mapping = await redisService.getSession(`token:${token}`);
  if (!mapping) {
    logger.warn("CHECKOUT", `Invalid checkout session token verification request: ${token}`);
    return res.status(404).json({ error: "Invalid checkout session token." });
  }

  const session = await redisService.getSession(mapping.nonce);
  if (!session) {
    return res.status(404).json({ error: "Checkout session expired or not found." });
  }

  try {
    session.merchantAddress = normalizeMerchantAddress(session.merchantAddress);
  } catch (err: any) {
    logger.error("CHECKOUT", `Crypto intent rejected for nonce ${session.nonce}: ${err.message}`);
    return res.status(400).json({ error: err.message || "Invalid merchant address." });
  }

  try {
    // STEP 1: Fetch FRESH FX rate (skip cache for accuracy at payment confirmation)
    const sessionCoinType = session.coinType || SETTLEMENT_TOKEN_TYPE;
    let currentRate = 1300;
    try {
      currentRate = await fxService.getRateNGNToToken(sessionCoinType, true); // skipCache=true
      logger.info("CHECKOUT", `Fresh FX rate fetched for ${method} charge on nonce ${session.nonce}: ₦${currentRate} per token`);
    } catch (e: any) {
      logger.warn("CHECKOUT", `Failed to fetch fresh FX rate, using session estimated rate: ${e.message}`);
      currentRate = session.estimatedRate || 1300;
    }

    // STEP 2: Calculate settlement amount with fresh rate
    const settlementAmount = Math.floor((session.amount / currentRate) * 1_000_000_000); // 9 decimal places (SUI/USDC)
    logger.info("CHECKOUT", `Calculated settlement: ₦${session.amount} @ ₦${currentRate}/token = ${settlementAmount / 1_000_000_000} token(s) for nonce ${session.nonce}`);

    // STEP 3: Pre‑flight treasury balance verification
    if (!(await assertTreasurySufficient(settlementAmount, sessionCoinType, session.nonce, res))) {
      return; // response already sent by helper
    }

    // STEP 4: Update session with validated fresh rate & settlement amount
    await redisService.updateSessionStatus(session.nonce, "PENDING", {
      validatedRate: currentRate,
      settlementAmount,
      chargeMethod: method,
      chargeApproved: true
    });

    // STEP 5: Proceed with bank charge or OPay based on method
    if (method === "bank_transfer") {
      // Allocate virtual account via Flutterwave V3
      const va = await flutterwaveService.chargeBankTransfer({
        txRef: session.nonce,
        amount: session.amount,
        email: `payer-${session.nonce.substring(0, 8)}@suioutkit.com`,
        phoneNumber
      });

      // Save billing details in Redis session
      await redisService.updateSessionStatus(session.nonce, "PENDING", {
        method: "bank_transfer",
        virtualAccount: va
      });

      logger.info("CHECKOUT", `Allocated dynamic virtual account for session ${session.nonce}: ${va.bankName} ${va.accountNumber} | Rate: ₦${currentRate}`);
      return res.json({ status: "success", virtualAccount: va, validatedRate: currentRate });
    } else if (method === "opay") {
      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required for OPay payments." });
      }

      const instruction = await flutterwaveService.chargeOPay({
        txRef: session.nonce,
        amount: session.amount,
        email: `payer-${session.nonce.substring(0, 8)}@suioutkit.com`,
        phoneNumber
      });

      await redisService.updateSessionStatus(session.nonce, "PROCESSING", {
        method: "opay",
        phoneNumber
      });

      logger.info("CHECKOUT", `Dispatched OPay payment push prompt to ${phoneNumber} for session ${session.nonce} | Rate: ₦${currentRate}`);
      return res.json({ status: "success", opayPrompt: instruction, validatedRate: currentRate });
    } else if (method === "stripe") {
          if (session.currency === "NGN") {
            let usdToNgnRate = 1300;
            try {
              usdToNgnRate = await fxService.getUSDToNGNRate(true);
            } catch (e: any) {
              logger.warn("CHECKOUT", `Stripe minimum preflight using fallback FX rate: ${e.message}`);
            }

            const minimumNgnAmount = Math.ceil(0.5 * usdToNgnRate);
            if (session.amount < minimumNgnAmount) {
              return res.status(400).json({
                status: "error",
                message: `Card payments need at least ₦${minimumNgnAmount.toLocaleString()} right now. Please use bank transfer for smaller amounts.`
              });
            }
          }

      const clientSecret = await stripeService.createPaymentIntent(
        session.amount,
        session.currency,
        session.nonce,
        { merchantAddress: session.merchantAddress }
      );

      await redisService.updateSessionStatus(session.nonce, "PENDING", {
        method: "stripe",
        clientSecret
      });

      const stripePublicKey = process.env.STRIPE_PUBLIC_KEY || "pk_test_TYooMQauvdEDq54NiTphI7jx";

      logger.info("CHECKOUT", `Created Stripe PaymentIntent for session ${session.nonce} | Rate: ₦${currentRate}`);
      return res.json({ status: "success", clientSecret, stripePublicKey, validatedRate: currentRate });
    } else {
      return res.status(400).json({ error: "Unsupported charge method." });
    }
  } catch (err: any) {
    const providerCode = err.code || "UNKNOWN";
    const providerHttpStatus = err.providerHttpStatus ?? "n/a";
    const responseStatus = providerCode.startsWith("FLW_") ? 502 : 500;

    logger.error(
      "CHECKOUT",
      `Failed to register payment charge. code=${providerCode}, providerHttpStatus=${providerHttpStatus}, message=${err.message}`
    );

    return res.status(responseStatus).json({
      status: "error",
      message: err.message || "Unable to initialize payment charge."
    });
  }
});

/**
 * Endpoint: GET /v1/checkout/status/:nonce
 * SDK polling endpoint to check order completion state.
 */
router.get("/status/:nonce", async (req: Request, res: Response) => {
  const { nonce } = req.params;
  const session = await redisService.getSession(nonce);

  if (!session) {
    return res.status(404).json({ status: "EXPIRED", message: "Session expired." });
  }

  return res.json({
    status: session.status,
    txDigest: session.txDigest,
    walrusBlobId: session.walrusBlobId,
    error: session.error
  });
});

/**
 * Endpoint: POST /v1/checkout/crypto/intent
 * Prepares crypto payment intent for wallet connect or outPay QR.
 */
router.post("/crypto/intent", async (req: Request, res: Response) => {
  const { token, method } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Missing token." });
  }

  const mapping = await redisService.getSession(`token:${token}`);
  if (!mapping) {
    logger.warn("CHECKOUT", `Invalid crypto intent token: ${token}`);
    return res.status(404).json({ error: "Invalid checkout session token." });
  }

  const session = await redisService.getSession(mapping.nonce);
  if (!session) {
    return res.status(404).json({ error: "Checkout session expired or not found." });
  }

  try {
    const sessionCoinType = session.coinType || SETTLEMENT_TOKEN_TYPE;
    let rate = 1;
    if (session.currency === "NGN") {
      try {
        rate = await fxService.getRateNGNToToken(sessionCoinType, true);
      } catch (e: any) {
        logger.warn("CHECKOUT", `Crypto intent FX fetch failed, using estimated rate: ${e.message}`);
        rate = session.estimatedRate || 1300;
      }
    }

    const amountBaseUnits = Math.floor(
      session.currency === "NGN"
        ? (session.amount / rate) * 1_000_000_000
        : session.amount * 1_000_000_000
    );

    const invoiceMetadata = {
      nonce: session.nonce,
      amountNaira: session.currency === "NGN" ? session.amount : 0,
      exchangeRate: rate,
      amountSettled: amountBaseUnits / 1_000_000_000,
      settlementToken: sessionCoinType,
      merchantAddress: session.merchantAddress,
      fiatMethod: method || "sui_wallet",
      timestamp: new Date().toISOString()
    };

    const preparedInvoice = await walrusService.prepareInvoice(invoiceMetadata);

    await redisService.updateSessionStatus(session.nonce, "PENDING", {
      cryptoAmountBaseUnits: amountBaseUnits,
      cryptoRate: rate,
      cryptoMethod: method || "sui_wallet",
      cryptoWalrusBlobId: preparedInvoice.blobId,
      cryptoWalrusInvoice: invoiceMetadata,
      cryptoWalrusPreparedAt: new Date().toISOString(),
    });

    return res.json({
      nonce: session.nonce,
      receiverAddress: session.merchantAddress,
      amountBaseUnits,
      coinType: sessionCoinType,
      packageId: PACKAGE_ID,
      registryName: session.cryptoRegistryName || CRYPTO_REGISTRY_NAME,
      walrusBlobId: preparedInvoice.blobId,
      rate
    });
  } catch (err: any) {
    logger.error("CHECKOUT", `Crypto intent failed for nonce ${session.nonce}: ${err.message}`);
    return res.status(500).json({ error: err.message || "Failed to prepare crypto intent." });
  }
});

/**
 * Endpoint: POST /v1/checkout/crypto/confirm
 * Confirms a direct crypto payment and stores Walrus receipt.
 */
router.post("/crypto/confirm", async (req: Request, res: Response) => {
  const { nonce, txDigest, method } = req.body;

  if (!nonce || !txDigest) {
    return res.status(400).json({ error: "Missing nonce or txDigest." });
  }

  const session = await redisService.getSession(nonce);
  if (!session) {
    return res.status(404).json({ error: "Checkout session expired or not found." });
  }

  let merchantAddress: string;
  try {
    merchantAddress = normalizeMerchantAddress(session.merchantAddress);
  } catch (err: any) {
    logger.error("CHECKOUT", `Crypto confirm rejected for nonce ${nonce}: ${err.message}`);
    return res.status(400).json({ error: err.message || "Invalid merchant address." });
  }

  if (session.status === "SETTLED") {
    return res.json({ status: "success", txDigest: session.txDigest, walrusBlobId: session.walrusBlobId });
  }

  try {
    const sessionCoinType = session.coinType || SETTLEMENT_TOKEN_TYPE;
    const amountBaseUnits = session.cryptoAmountBaseUnits || 0;
    const verification = await suiService.verifyCryptoPaymentTx(txDigest, nonce);

    if (!verification.verified) {
      return res.status(409).json({ error: "Unable to verify crypto payment on-chain." });
    }

    const confirmedTxDigest = txDigest;

    const amountTokens = amountBaseUnits / 1_000_000_000;
    const invoiceMetadata = session.cryptoWalrusInvoice || {
      nonce: session.nonce,
      amountNaira: session.currency === "NGN" ? session.amount : 0,
      exchangeRate: session.cryptoRate || 0,
      amountSettled: amountTokens,
      settlementToken: sessionCoinType,
      merchantAddress: session.merchantAddress,
      fiatMethod: method || session.cryptoMethod || "sui_wallet",
      timestamp: new Date().toISOString()
    };

    let walrusBlobId = session.cryptoWalrusBlobId || session.walrusBlobId;

    if (!session.cryptoWalrusUploadedAt) {
      walrusBlobId = await walrusService.uploadInvoice(invoiceMetadata);
    }

    await redisService.updateSessionStatus(session.nonce, "SETTLED", {
      txDigest: confirmedTxDigest,
      walrusBlobId,
      cryptoWalrusUploadedAt: new Date().toISOString(),
      cryptoConfirmedAt: new Date().toISOString()
    });

    return res.json({ status: "success", txDigest: confirmedTxDigest, walrusBlobId });
  } catch (err: any) {
    logger.error("CHECKOUT", `Crypto confirm failed for nonce ${nonce}: ${err.message}`);
    return res.status(500).json({ error: err.message || "Failed to confirm crypto payment." });
  }
});

/**
 * Endpoint: GET /v1/checkout/validate/:nonce
 * Pre-flight validation: checks if treasury has sufficient balance for the requested payment.
 * SDK calls this before showing "Confirm Payment" button.
 */
router.get("/validate/:nonce", async (req: Request, res: Response) => {
  const { nonce } = req.params;

  try {
    const session = await redisService.getSession(nonce);
    if (!session) {
      return res.status(404).json({ error: "Checkout session expired or not found." });
    }

    // Calculate settlement amount in base units (9 decimals for SUI/USDC)
    let estimatedRate = session.estimatedRate || 1300;
    try {
      estimatedRate = await fxService.getRateNGNToToken(session.coinType);
    } catch (e) {
      // Fallback to cached rate
    }

    const settlementAmount = Math.floor((session.amount / estimatedRate) * 1_000_000_000);
    const coinType = session.coinType || SETTLEMENT_TOKEN_TYPE;

    logger.info(
      "CHECKOUT",
      `Validate request for nonce ${nonce}: required settlement amount=${settlementAmount}, rate=${estimatedRate}`
    );

    return res.json({
      coinType,
      exchangeRate: estimatedRate,
      settlementAmount,
      message: "Settlement amount calculated. Confirm at /charge endpoint."
    });
  } catch (err: any) {
    logger.error("CHECKOUT", `Validation check failed for nonce ${nonce}: ${err.message}`);
    return res.status(500).json({
      error: err.message || "Failed to validate treasury balance.",
      sufficient: false
    });
  }
});

/**
 * Endpoint: POST /v1/checkout/webhook
 * Dynamic bank transfer credit webhook receiver (PCI-DSS safe).
 * Validated by validateWebhookAuth middleware interceptor.
 */
router.post("/webhook", validateWebhookAuth, async (req: Request, res: Response) => {
  const payload = req.body;
  const { tx_ref, amount, currency, status } = payload.data || payload;

  if (status !== "successful") {
    logger.info("WEBHOOK", `Transaction ${tx_ref} not completed yet. Status: ${status}`);
    return res.sendStatus(200); // Acknowledge to prevent retries
  }

  // Load session from Redis cache
  const session = await redisService.getSession(tx_ref);
  if (!session) {
    logger.warn("WEBHOOK", `Received successful webhook for expired or unknown session: ${tx_ref}`);
    return res.sendStatus(200);
  }

  if (session.status === "SETTLED") {
    logger.info("WEBHOOK", `Webhook duplicate ignore for settled transaction: ${tx_ref}`);
    return res.sendStatus(200);
  }

  if (!session.chargeApproved) {
    logger.warn("WEBHOOK", `Ignoring webhook for unapproved charge: ${tx_ref}`);
    return res.sendStatus(200);
  }

  try {
    logger.info("WEBHOOK", `Processing bank credit alert. Nonce: ${tx_ref}, Amount: ₦${amount}`);

    // Update status to PROCESSING to prevent concurrent webhook execution collisions
    await redisService.updateSessionStatus(session.nonce, "PROCESSING");

    // 1. Use validated rate from /charge endpoint (stored in session during payment confirmation)
    // If not present (legacy sessions), fall back to fresh fetch with safe default
    let currentRate = session.validatedRate || 1300;
    const sessionCoinType = session.coinType || SETTLEMENT_TOKEN_TYPE;

    if (!session.validatedRate) {
      try {
        currentRate = await fxService.getRateNGNToToken(sessionCoinType);
        logger.warn("WEBHOOK", `Using fallback fresh FX rate (no validated rate in session): ₦${currentRate}`);
      } catch (e: any) {
        logger.warn("WEBHOOK", `Failed to fetch FX rate, using default 1300: ${e.message}`);
        currentRate = 1300;
      }
    } else {
      logger.info("WEBHOOK", `Using pre-validated FX rate from /charge: ₦${currentRate}`);
    }

    const settlementAmount = Math.floor((amount / currentRate) * 1_000_000_000); // 9 decimal places precision (SUI/USDC)
    // Variable to hold the Walrus blob ID (may be reused across retries)
    let walrusBlobId: string;
    logger.info("WEBHOOK", `Settlement calculation: ₦${amount} @ ₦${currentRate}/token = ${settlementAmount / 1_000_000_000} token(s)`);

    // 2. Upload proof-of-payment invoice metadata anonymously to Walrus (idempotent) with Redis lock
    const lockKey = `uploadLock:${session.nonce}`;
    let lockAcquired = false;
    try {
      lockAcquired = await redisService.acquireLock(lockKey, 30);
      if (!lockAcquired) {
        console.warn(`Upload lock not acquired for ${session.nonce}; assuming another worker is handling it.`);
        // If another worker is already handling, reuse any existing blob ID if present
        if (session.walrusBlobId) {
          walrusBlobId = session.walrusBlobId;
        } else {
          // Wait briefly for the other worker to finish and then fetch from session
          await new Promise(res => setTimeout(res, 2000));
          const refreshed = await redisService.getSession(session.nonce);
          walrusBlobId = refreshed?.walrusBlobId;
        }
      } else {
        // We own the lock – perform upload (or reuse if already stored)
        if (session.walrusBlobId) {
          walrusBlobId = session.walrusBlobId;
          console.log('Reusing existing Walrus blob ID:', walrusBlobId);
        } else {
          const invoiceMetadata = {
            nonce: session.nonce,
            amountNaira: amount,
            exchangeRate: currentRate,
            amountSettled: settlementAmount / 1_000_000_000,
            settlementToken: sessionCoinType,
            merchantAddress: session.merchantAddress,
            fiatMethod: session.method || "bank_transfer",
            timestamp: new Date().toISOString()
          };
          walrusBlobId = await walrusService.uploadInvoice(invoiceMetadata);
        }
      }
    } finally {
      if (lockAcquired) {
        await redisService.releaseLock(lockKey);
      }
    }
    // 3. Execute settle_fiat PTB on Sui via gRPC operator signer
    const onChainResult = await suiService.executeSettleFiat(
      settlementAmount,
      session.merchantAddress,
      session.nonce,
      walrusBlobId,
      sessionCoinType
    );

    // 4. Update session inside Redis as fully SETTLED
    await redisService.updateSessionStatus(session.nonce, "SETTLED", {
      txDigest: onChainResult.txDigest,
      walrusBlobId
    });

    logger.success("WEBHOOK", `Fully settled transaction ${session.nonce}. Merchant ${session.merchantAddress} paid.`);
    return res.sendStatus(200);
  } catch (err: any) {
    logger.error("WEBHOOK", `Webhook Processing Failure: ${err.message}`, err.stack);
    await redisService.updateSessionStatus(session.nonce, "PENDING", { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint: POST /v1/checkout/stripe-webhook
 * Stripe webhook receiver.
 */
router.post("/stripe-webhook", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  let event;

  try {
    event = stripeService.constructEvent((req as any).rawBody, sig);
  } catch (err: any) {
    logger.error("STRIPE-WEBHOOK", `Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== "payment_intent.succeeded") {
    return res.json({ received: true });
  }

  const paymentIntent = event.data.object as any;
  const nonce = paymentIntent.metadata.nonce;
  const amount = paymentIntent.amount;

  if (!nonce) {
    logger.warn("STRIPE-WEBHOOK", `Missing nonce in PaymentIntent metadata: ${paymentIntent.id}`);
    return res.json({ received: true });
  }

  const session = await redisService.getSession(nonce);
  if (!session) {
    logger.warn("STRIPE-WEBHOOK", `Received successful webhook for expired or unknown session: ${nonce}`);
    return res.json({ received: true });
  }

  if (session.status === "SETTLED") {
    logger.info("STRIPE-WEBHOOK", `Webhook duplicate ignore for settled transaction: ${nonce}`);
    return res.json({ received: true });
  }

  try {
    logger.info("STRIPE-WEBHOOK", `Processing Stripe credit alert. Nonce: ${nonce}, Amount: ${paymentIntent.currency} ${amount}`);

    await redisService.updateSessionStatus(session.nonce, "PROCESSING");

    let currentRate = session.validatedRate || 1300;
    const sessionCoinType = session.coinType || SETTLEMENT_TOKEN_TYPE;

    const settlementAmount = Math.floor((session.amount / currentRate) * 1_000_000_000);
    logger.info("STRIPE-WEBHOOK", `Settlement calculation: ${session.amount} @ ${currentRate}/token = ${settlementAmount / 1_000_000_000} token(s)`);

    const invoiceMetadata = {
      nonce: session.nonce,
      amountNaira: session.amount,
      exchangeRate: currentRate,
      amountSettled: settlementAmount / 1_000_000_000,
      settlementToken: sessionCoinType,
      merchantAddress: session.merchantAddress,
      fiatMethod: "stripe",
      timestamp: new Date().toISOString()
    };

    const walrusBlobId = await walrusService.uploadInvoice(invoiceMetadata);

    const onChainResult = await suiService.executeSettleFiat(
      settlementAmount,
      session.merchantAddress,
      session.nonce,
      walrusBlobId,
      sessionCoinType
    );

    await redisService.updateSessionStatus(session.nonce, "SETTLED", {
      txDigest: onChainResult.txDigest,
      walrusBlobId
    });

    logger.success("STRIPE-WEBHOOK", `Fully settled transaction ${session.nonce}. Merchant ${session.merchantAddress} paid.`);
    return res.json({ received: true });
  } catch (err: any) {
    logger.error("STRIPE-WEBHOOK", `Webhook Processing Failure: ${err.message}`, err.stack);
    await redisService.updateSessionStatus(session.nonce, "PENDING", { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

export default router;

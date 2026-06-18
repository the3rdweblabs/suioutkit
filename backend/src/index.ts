// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 The3rdWebLabs (https://github.com/the3rdweblabs)
// Author: @CYBWithFlourish (https://github.com/CYBWithFlourish)

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { getEnv } from "./config/env.js";
import checkoutRouter from "./routes/checkout.js";
import suiService from "./services/sui.js";
import paymentsRouter from "./routes/payments.js";
import redisService from "./services/redis.js";
import walrusService from "./services/walrus.js";
import logger from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = getEnv("PORT", "5000");

// Enable CORS securely to allow seamless cross-origin SDK integrations
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "verif-hash"]
}));

// Express parsers
app.use(express.json({
  verify: (req, res, buf) => {
    (req as any).rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// Serve the premium stylesheet statically
// This allows the client SDK to inject standard styles dynamically on the fly
const sdkStylesPath = path.join(__dirname, "../../sdk/src/components");
app.use(express.static(sdkStylesPath));

// Serve the built SDK so the demo can import it over HTTP
const sdkDistPath = path.join(__dirname, "../../sdk");
app.use("/sdk", express.static(sdkDistPath));

// Serve the assets directory for payment icons
const sdkAssetsPath = path.join(__dirname, "../../sdk/assets");
app.use("/assets", express.static(sdkAssetsPath));

// Also support serving from public or local dist if deployed in package
app.use("/demo", express.static(path.join(__dirname, "../../demo")));

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(sdkStylesPath, "style.css"), (err) => {
    if (err) {
      // Fallback relative to running dist location
      res.sendFile(path.join(__dirname, "../src/components/style.css"), (err2) => {
        if (err2) {
          res.status(404).send("Stylesheet not found");
        }
      });
    }
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "SuiOutKit Universal Checkout Backend" });
});

// Versioned API (SDK + webhooks)
app.use("/v1/checkout", checkoutRouter);
app.use("/v1/payments", paymentsRouter);

interface IndexerEvent {
  transactionDigest?: string;
  event?: {
    id?: { txDigest?: string };
    parsedJson?: any;
    type?: string;
  };
  id?: { txDigest?: string };
  parsedJson?: any;
  type?: string;
}

function extractTxDigest(event: IndexerEvent): string | null {
  return (
    event.transactionDigest ||
    event.event?.id?.txDigest ||
    event.id?.txDigest ||
    null
  );
}

function extractParsedJson(event: IndexerEvent): any {
  return event.event?.parsedJson || event.parsedJson || null;
}

function extractEventType(event: IndexerEvent): string {
  return event.event?.type || event.type || "";
}

// Start high-speed Sui background indexer stream
suiService.startIndexer(async (event) => {
  const txDigest = extractTxDigest(event);
  const parsedJson = extractParsedJson(event);
  const eventType = extractEventType(event);
  const nonce = parsedJson?.nonce || parsedJson?.nonce_str || parsedJson?.nonceString;

  if (!nonce || !txDigest) return; // Not a payment event or missing data

  try {
    const session = await redisService.getSession(nonce);
    if (!session) return;

    const isCryptoPayment = session.cryptoAmountBaseUnits || session.cryptoWalrusInvoice;
    if (!isCryptoPayment || session.status === "SETTLED") return;

    logger.info("INDEXER", `Auto-settling crypto payment for nonce ${nonce}`);

    let walrusBlobId = session.cryptoWalrusBlobId || session.walrusBlobId;
    let walrusAlreadyStored = !!walrusBlobId;

    if (!walrusBlobId && session.cryptoWalrusInvoice) {
      // Resolve blob ID (prepare in SDK mode, upload in publisher mode)
      const resolved = await walrusService.resolveBlobId(session.cryptoWalrusInvoice);
      walrusBlobId = resolved.blobId;
      walrusAlreadyStored = resolved.alreadyStored;
    }

    // On-chain event confirmed — commit Walrus blob if only prepared (SDK mode)
    if (!walrusAlreadyStored && walrusBlobId && session.cryptoWalrusInvoice) {
      try {
        await walrusService.uploadInvoice(session.cryptoWalrusInvoice);
        logger.success("INDEXER", `Walrus receipt committed after on-chain event: ${walrusBlobId}`);
      } catch (walrusErr: any) {
        logger.error("INDEXER", `Walrus post-event commit failed for ${nonce}: ${walrusErr.message}`);
      }
    }

    await redisService.updateSessionStatus(nonce, "SETTLED", {
      txDigest,
      walrusBlobId,
      cryptoWalrusUploadedAt: new Date().toISOString(),
      cryptoConfirmedAt: new Date().toISOString(),
    });

    logger.success("INDEXER", `Crypto payment ${nonce} settled on-chain: ${txDigest}`);
  } catch (err: any) {
    logger.error("INDEXER", `Failed to settle crypto payment ${nonce}: ${err.message}`);
  }
});

// Launch server
const server = app.listen(PORT, () => {
  console.log(`==================================================================`);
  console.log(`SUIOUTKIT PAYMENT GATEWAY RUNNING ON PORT ${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`Stylesheet Asset: http://localhost:${PORT}/style.css`);
  console.log(`==================================================================`);
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed.");
  });
  await redisService.disconnect();
  console.log("Redis disconnected.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

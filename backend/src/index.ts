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

// Start high-speed Sui background indexer stream
suiService.startIndexer((event) => {
  console.log("SuiOutKit Core Indexer: Captured on-chain payment registration:", event);
  // We can process direct crypto payment settlements or dynamic triggers here
});

// Launch server
app.listen(PORT, () => {
  console.log(`==================================================================`);
  console.log(`SUIOUTKIT PAYMENT GATEWAY GATEWAY RUNNING ON PORT ${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`Stylesheet Asset: http://localhost:${PORT}/style.css`);
  console.log(`==================================================================`);
});

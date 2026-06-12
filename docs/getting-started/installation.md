---
title: Installation
description: Add SuiOutKit to your storefront - no backend to deploy.
---

## Overview


SuiOutKit is a **drop-in checkout SDK** for Sui merchants. Install the npm package, pass your merchant address, and open the modal - fiat (bank transfer, OPay, cards) and crypto payments in one integration.

Stop stitching payment providers together. SuiOutKit is a single SDK that brings checkout, settlement, and receipts into one integration.

No server setup required: merchants only install the SDK - the hosted API handles sessions, webhooks, and settlement. Currently running on testnet (`https://api.staging.suioutkit.xyz`, routes `/v1/`), with mainnet planned for production go-live (`https://api.suioutkit.xyz`, routes `/v1/`).

## Prerequisites

- **Node.js 18+** for your storefront or app build
- A **merchant Sui address** to receive settlement
- HTTPS on your production site (recommended)

## Install the SDK

```bash
npm install suioutkit
```

## Configure

```ts
import { SuiOutKit } from "suioutkit";

const sdk = new SuiOutKit({
  merchantAddress: "0xYOUR_MERCHANT_SUI_ADDRESS",
});
```

The SDK handles API calls for you. For endpoint details see [How It Works](/docs/getting-started/how-it-works) and the [SDK Reference](/docs/guides/sdk).

## Running your own API (not required)

Merchant integration does not include running the SuiOutKit backend. Platform operators and contributors should see [Hosted API](/docs/hosted-api) and [Developer Guide](/docs/developer-guide) - separate from adding checkout to your site.

## Next steps

- [Quick Start](/docs/getting-started/quick-start)
- [SDK Reference](/docs/guides/sdk)
- [How It Works](/docs/getting-started/how-it-works)

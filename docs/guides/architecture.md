---
title: Architecture
description: How SuiOutKit fits together when you integrate the SDK.
---

## What you integrate
As a developer, you only ship the **`suioutkit` npm package** in your site or app:

1. **`initCheckout`** - start a payment for an amount and currency.
2. **`openModal`** or **`wrapButton`** - show the checkout UI.
3. Optionally **`confirmCryptoPayment`** - if you build a custom wallet flow.

Settlement, payment providers, FX, and on-chain receipts are handled by SuiOutKit’s hosted service. You pass a **merchant Sui address**; customers use the modal; you receive payout on-chain when checkout succeeds.

## End-to-end flow
![SuiOutKit flow diagram](../assets/sok-flow.svg)

<small style="display:block; margin-top:6px;">Diagram: end-to-end checkout flow (SDK → hosted API → providers → on-chain settlement).</small>

See [How It Works](/docs/getting-started/how-it-works) for the step-by-step checkout path.

## Why one SDK
Everything merchants need to accept money and settle on Sui, without building a payment stack from scratch.

Stop stitching payment providers together. SuiOutKit is one SDK that brings checkout, settlement, and receipts into a single integration.

## Platform reference (optional)
This [project](https://github.com/the3rdweblabs/suioutkit) contains the server and smart‑contract code used by the hosted SuiOutKit platform. If you’re a merchant integrating checkout, you only install the SDK - you don’t need to run any server or manage contracts.

| Component | Role |
|-----------|------|
| SDK | What you install and embed |
| Hosted API | Sessions, charges, webhooks, settlement (default) |
| Contracts | On-chain treasury and receipts |

Operators: see [Hosted API](/docs/hosted-api) and [Developer Guide](/docs/developer-guide).

## Related
- [SDK Reference](/docs/guides/sdk)
- [How It Works](/docs/getting-started/how-it-works)
- [Security](/docs/guides/security)

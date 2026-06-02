<h1 align="center">
<div align="center">
  <h1>SuiOutKit SDK</h1>
  <p>
    <a href="https://www.npmjs.com/package/suioutkit"><img src="https://img.shields.io/npm/v/suioutkit.svg" alt="npm version"/></a> 
    <a href="/LICENSE"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="License: GPL v3"/></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-typed-3178c6.svg" alt="TypeScript"/></a>
  </p>
</h1>

Browser SDK for SuiOutKit checkout: create sessions, open a ready-made payment modal, or build a custom UI with helpers.

Uses the **hosted SuiOutKit API** at `https://api.suioutkit.xyz` by default (all routes under `/v1/`). The SDK does not perform settlement, treasury checks, or provider calls itself.

| Resource | Link |
|----------|------|
| Monorepo overview | [/README.md](/README.md) |
| Documentation | [/docs/README.md](/docs/README.md) |
| Live demo | [/demo/demo.html](/demo/demo.html) |
| Backend & operator setup | [/docs/developer-guide.md](/docs/developer-guide.md) |

## Table of contents
- [Install](#install)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Payment methods](#payment-methods)
- [Custom UI (no modal)](#custom-ui-no-modal)
- [Load from your backend](#load-from-your-backend)
- [Backend endpoints used by the SDK](#backend-endpoints-used-by-the-sdk)
- [Troubleshooting](#troubleshooting)
- [Publishing](#publishing)
- [License](#license)

## Install
```bash
npm install suioutkit
# or
yarn add suioutkit
```

**Peer environment:** Node 18+ to build; in the browser, any modern ESM-capable environment.

## Quick start
### React or bundler (recommended)
```tsx
import { SuiOutKit } from "suioutkit";

const sdk = new SuiOutKit({
  merchantAddress: "0xYOUR_MERCHANT_SUI_ADDRESS",
  // backendUrl optional - defaults to https://api.suioutkit.xyz
});

export function PayButton() {
  async function handlePay() {
    const session = await sdk.initCheckout({
      amount: 45000,
      currency: "NGN",
      metadata: { orderId: "ORDER-123" },
    });
    sdk.openModal(session, () => {
      console.log("Modal closed");
    });
  }

  return <button type="button" onClick={handlePay}>Pay now</button>;
}
```

### One-line button binding
```ts
sdk.wrapButton("#pay-btn", {
  amount: 45000,
  currency: "NGN",
  metadata: { sku: "PRO-PLAN" },
});
```

Updates the button label (e.g. `Pay ₦45,000`) and opens the modal on click.

### Vanilla HTML (serve SDK bundle)
For simple demos you can serve the built SDK bundle from any static host. Build the SDK with `npm run build` in `sdk/` and serve `sdk/dist/index.js` from your server. See the Developer Guide for recommended local and production setups: [/docs/developer-guide.md](/docs/developer-guide.md).

## Configuration
### `new SuiOutKit(config)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `merchantAddress` | `string` | Yes | Sui address that receives settlement |
| `backendUrl` | `string` | No | API origin (no trailing slash). Default: `https://api.suioutkit.xyz`. Use `http://localhost:5000` only for local development. |

### Network (crypto flows)
The modal reads `window.SuiOutKitNetwork` - set to `"mainnet"` or `"testnet"` before opening the modal if you need a specific network for wallet / outPay flows.

```html
<script>window.SuiOutKitNetwork = "testnet";</script>
```

## API reference
### `initCheckout(options)`
Creates a checkout session on the backend.

```ts
const session = await sdk.initCheckout({
  amount: 45000,       // integer in major units (e.g. 45000 NGN)
  currency: "NGN",     // e.g. "NGN"
  metadata?: { orderId: "ORDER-123" },
});
```

**Returns** `CheckoutSession` (includes at least):

| Field | Description |
|-------|-------------|
| `token` | Opaque session token for charge/crypto calls |
| `nonce` | Public session id for status polling |
| `amount`, `currency` | Checkout totals |
| `merchantAddress` | Normalized Sui address |
| `coinType` | Settlement coin type (from backend config) |
| `estimatedRate` | FX preview (NGN → token) when applicable |
| `packageId`, `cryptoRegistryId`, `cryptoRegistryName` | On-chain config for crypto paths |

Throws if the backend returns a non-OK response.

---

### `openModal(session, onClose?)`
Opens the built-in checkout modal (bank transfer, OPay, Stripe, Sui wallet, outPay).

```ts
const modal = sdk.openModal(session, () => {
  // Called when the user closes the overlay
});
```

**Returns** `SuiOutKitModal` (internal handle). The modal loads styles from `{backendUrl}/style.css` automatically.

> **Note:** Theme, logo, and `allowedMethods` customization are not exposed on `openModal` today. Use [custom UI](#custom-ui-no-modal) or extend the modal in source if you need that.

---

### `wrapButton(selector, options)`
Binds checkout to a DOM button.

| Argument | Type | Description |
|----------|------|-------------|
| `selector` | `string` | CSS selector (e.g. `"#pay-btn"`) |
| `options.amount` | `number` | Checkout amount |
| `options.currency` | `string` | e.g. `"NGN"` |
| `options.metadata` | `object` | Optional passthrough to `initCheckout` |

---

### `confirmCryptoPayment(nonce, txDigest, method?)`
After the user pays via wallet/outPay in a **custom** flow, submit the transaction digest for backend verification and Walrus receipt handling.

```ts
const result = await sdk.confirmCryptoPayment(
  session.nonce,
  txDigest,
  "sui_wallet" // or "outpay"
);

if (result.status === "success") {
  console.log(result.txDigest, result.walrusBlobId);
}
```

The built-in modal calls this internally for crypto paths.

---

### Helper exports
For custom UIs without the modal:

```ts
import {
  SuiOutKit,
  request,
  formatNgn,
  toTokenUnits,
  formatToken,
  createPolling,
} from "suioutkit";
```

| Export | Description |
|--------|-------------|
| `request(url, options?)` | `fetch` wrapper with timeout and JSON parsing |
| `formatNgn(amount)` | Format NGN with locale / `₦` fallback |
| `toTokenUnits(baseUnits, decimals?)` | Convert base units to float (default 9 decimals) |
| `formatToken(amount, decimals?, digits?)` | Display-friendly token amount string |
| `createPolling(fn, intervalMs)` | `{ start(), stop() }` interval helper |

**Example - poll settlement status:**

```ts
import { createPolling, request } from "suioutkit";

const poll = createPolling(async () => {
  const status = await request(`${backendUrl}/v1/checkout/status/${nonce}`);
  if (status.status === "SETTLED") {
    poll.stop();
    console.log(status.txDigest, status.walrusBlobId);
  }
}, 3000);

poll.start();
```

**Example - Server-Sent Events** (React hook in repo, not published from package entry today):

The backend exposes `GET /v1/payments/stream/:nonce`. You can use `EventSource` directly or copy [`usePaymentStatus.ts`](src/hooks/usePaymentStatus.ts) into your app.

## Payment methods
The modal orchestrates these **charge** methods against the backend:

| Method | Provider | Notes |
|--------|----------|--------|
| `bank_transfer` | Flutterwave | Virtual account details shown in modal |
| `opay` | Flutterwave | Requires `phoneNumber` at charge time |
| `stripe` | Stripe | Card element; NGN minimum enforced server-side |
| `sui_wallet` | Sui + Payment Kit | Wallet connect via dApp Kit |
| `outpay` | Payment Kit QR | outPay flow |

Fiat methods depend on backend env configuration (Flutterwave / Stripe keys). Crypto methods require registry IDs on the backend.

## Custom UI (no modal)
1. `initCheckout` → keep `session.token` and `session.nonce`.
2. Optional: `GET /v1/checkout/validate/:nonce` for FX/settlement preview.
3. `POST /v1/checkout/charge` with `{ token, method, phoneNumber? }`.
4. Poll `GET /v1/checkout/status/:nonce` or use SSE `/v1/payments/stream/:nonce`.
5. For crypto: `POST /v1/checkout/crypto/intent` → wallet PTB → `confirmCryptoPayment`.

Charge and crypto endpoints are documented in [Backend API](/docs/guides/backend-api.md).

## Load from your backend
In production, either bundle the SDK with your app (`npm install suioutkit`) or serve the built `sdk/dist` statically from your web host. See the Developer Guide for recommended deployment patterns and backend integration: [/docs/developer-guide.md](/docs/developer-guide.md).

## Backend endpoints used by the SDK
All paths are relative to `backendUrl`.

| Method | Path | Used by |
|--------|------|---------|
| `POST` | `/v1/checkout/session` | `initCheckout` |
| `POST` | `/v1/checkout/charge` | Modal (fiat) |
| `GET` | `/v1/checkout/status/:nonce` | Modal polling |
| `GET` | `/v1/checkout/validate/:nonce` | Modal pre-flight |
| `POST` | `/v1/checkout/crypto/intent` | Modal (crypto) |
| `POST` | `/v1/checkout/crypto/confirm` | Modal / `confirmCryptoPayment` |
| `GET` | `/v1/payments/stream/:nonce` | Optional SSE (custom UI) |

Webhooks (`/v1/checkout/webhook`, `/v1/checkout/stripe-webhook`) are server-to-provider only.

## Troubleshooting
| Symptom | Likely cause |
|---------|----------------|
| `Failed to initialize checkout session` | Backend down, CORS, or missing `merchantAddress` |
| `409 Treasury insufficient` | Operator vault underfunded for FX settlement amount |
| Modal stuck on “waiting for settlement” | Webhook not reaching backend (Flutterwave hash, Stripe CLI, or ngrok) |
| Stripe card errors on small NGN amounts | Backend enforces ~$0.50 USD equivalent minimum |
| Crypto connect fails | Wrong `window.SuiOutKitNetwork` or registry env on backend |
| Styles missing | Backend not serving `/style.css` or wrong `backendUrl` |

See also [Developer Guide - Troubleshooting](/docs/developer-guide.md#troubleshooting).



## Security
- Only `merchantAddress` and `backendUrl` belong in browser code.
- Never embed operator keys, Flutterwave secrets, or Stripe secret keys in the client.
- Use **HTTPS** for `backendUrl` in production.

Report vulnerabilities through your project’s private security channel (do not file public issues with key material).

## License
[GPL-3.0](/LICENSE) - Copyright (c) 2026 [The3rdWebLabs](https://github.com/the3rdweblabs) / [@CYBWithFlourish](https://github.com/CYBWithFlourish/)

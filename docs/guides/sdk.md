---
title: SDK Reference
description: SuiOutKit browser SDK API for merchants.
---

## Install

```bash
npm install suioutkit
```

Drop-in checkout for your site - no backend to deploy. See [Installation](/docs/getting-started/installation).
The SDK defaults to `mode: "live"` (hosted API at `https://api.suioutkit.xyz`, mainnet when live). Currently operating on testnet - use `mode: "test"` for staging or `mode: "local"` for local development.

## Constructor

```ts
const sdk = new SuiOutKit({
  merchantAddress: "0x...",                     // required
  // mode: "local",                             // localhost:5000, testnet
  // mode: "test",                              // staging, testnet
  // mode: "live",                              // production, mainnet (default)
});
```

## Methods

### `initCheckout(options)`

```ts
const session = await sdk.initCheckout({
  amount: 45000,
  currency: "NGN",
  coinType?: "0x2::sui::SUI",   // optional: override settlement coin
  metadata?: { orderId: "ORDER-123" },
});
```

Returns `CheckoutSession` with `token`, `nonce`, `coinType`, `supportedCoins`, `estimatedRate`, etc.

### `openModal(session, options?)`

Opens the built-in modal (bank transfer, OPay, Stripe, Sui wallet, outPay). Loads styles from `{backendUrl}/style.css`.

```ts
const modal = sdk.openModal(session, {
  onClose: () => console.log("Modal closed"),
  onPaymentComplete: (result) => console.log("Paid", result.txDigest),
  redirectUrl: "/thank-you",
  autoCloseOnSuccess: true,
});
```

Options (`SuiOutKitModalOptions`):

| Option | Type | Description |
|--------|------|-------------|
| `onClose` | `() => void` | Fired when the user dismisses the overlay |
| `onPaymentComplete` | `(result: PaymentResult) => void` | Fired after on-chain settlement with `{ nonce, txDigest, walrusBlobId }` |
| `redirectUrl` | `string` | Redirect the browser here after successful payment |
| `autoCloseOnSuccess` | `boolean` | Auto-close the modal after settlement instead of showing success panel |

### `wrapButton(selector, options)`

Binds checkout to a DOM button by CSS selector.

```ts
sdk.wrapButton("#pay-btn", {
  amount: 45000,
  currency: "NGN",
  coinType: "0x2::sui::SUI",   // optional
});
```

### `confirmCryptoPayment(nonce, txDigest, method?)`

Submit a wallet/outPay transaction digest after a custom crypto flow. Methods: `"sui_wallet"` | `"outpay"`.

## Helper exports

```ts
import {
  request,
  formatNgn,
  toTokenUnits,
  formatToken,
  createPolling,
} from "suioutkit";
```

| Export | Purpose |
|--------|---------|
| `request` | Fetch with timeout + JSON |
| `formatNgn` | Format NGN amounts |
| `toTokenUnits` | Base units → float |
| `formatToken` | Display token amounts |
| `createPolling` | `{ start(), stop() }` interval helper |

Notes:

- `request` is the SDK's fetch helper (default export from `utils/http`).
- The SDK also re-exports `DEFAULT_API_ORIGIN` and `API_V1_PREFIX` from its config for advanced integrations.

## Custom UI

Without the modal:

1. `initCheckout`
2. `POST /v1/checkout/charge` with `{ token, method, phoneNumber? }`
3. Poll `GET /v1/checkout/status/:nonce`

Crypto: `POST /v1/checkout/crypto/intent` → wallet PTB → `confirmCryptoPayment`.

## Network

The SDK sets the Sui network automatically based on `mode`. No manual script tag is needed (like in previous versions).

## Full npm readme

See [`sdk/README.md`](/sdk/README.md) in the repository.

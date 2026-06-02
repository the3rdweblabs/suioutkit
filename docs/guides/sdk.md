---
title: SDK Reference
description: SuiOutKit browser SDK API for merchants.
---

## Install

```bash
npm install suioutkit
```

Drop-in checkout for your site - no backend to deploy. See [Installation](/docs/getting-started/installation).
Note: the published npm package uses the hosted API by default (`https://api.suioutkit.xyz`). When running the SDK from source the default origin may point to `http://localhost:5000` for local development - you can always override with the `backendUrl` constructor option.

## Constructor

```ts
const sdk = new SuiOutKit({
  merchantAddress: "0x...", // required
  // backendUrl optional - defaults to the hosted API in production
  // override with "http://localhost:5000" for local backend during development
});
```

## Methods

### `initCheckout(options)`

```ts
const session = await sdk.initCheckout({
  amount: 45000,
  currency: "NGN",
  metadata?: { orderId: "ORDER-123" },
});
```

Returns `CheckoutSession` with `token`, `nonce`, `coinType`, `estimatedRate`, etc.

### `openModal(session, onClose?)`

Opens the built-in modal (bank transfer, OPay, Stripe, Sui wallet, outPay). Loads styles from `{backendUrl}/style.css`.

### `wrapButton(selector, options)`

Binds checkout to a DOM button by CSS selector.

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

Set before opening the modal for crypto flows:

```html
<script>window.SuiOutKitNetwork = "testnet";</script>
```

## Full npm readme

See [`sdk/README.md`](/sdk/README.md) in the repository.

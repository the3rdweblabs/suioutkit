---
title: Quick Start
description: First checkout with the SuiOutKit SDK and hosted API.
---

## 1. Install

```bash
npm install suioutkit
```

## 2. Open checkout

```tsx
import { SuiOutKit } from "suioutkit";

const sdk = new SuiOutKit({
  merchantAddress: "0xYOUR_MERCHANT_SUI_ADDRESS",
});

export function PayButton() {
  async function handlePay() {
    const session = await sdk.initCheckout({
      amount: 45000,
      currency: "NGN",
      metadata: { orderId: "ORDER-123" },
    });
    sdk.openModal(session);
  }

  return <button type="button" onClick={handlePay}>Pay now</button>;
}
```

No server setup is required on your side - the SDK uses the hosted SuiOutKit API by default.
For local development you can point the SDK at a local backend instance:

```ts
const sdk = new SuiOutKit({
  merchantAddress: "0xYOUR_MERCHANT_SUI_ADDRESS",
  backendUrl: "http://localhost:5000",
});
```

Ensure `merchantAddress` is your merchant Sui address (required).

## 3. One-line button

```ts
sdk.wrapButton("#pay-btn", {
  amount: 45000,
  currency: "NGN",
});
```

## What happens

1. You call `initCheckout` - the SDK creates a session.
2. The customer pays in the modal (bank, OPay, card, or wallet).
3. SuiOutKit completes settlement on Sui; the modal polls until done.

## Next

[How It Works](/docs/getting-started/how-it-works) · [SDK Reference](/docs/guides/sdk)

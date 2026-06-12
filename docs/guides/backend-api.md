---
title: Backend API
description: HTTP endpoints used by the SDK and payment providers.
---

**Host (production, planned):** `https://api.suioutkit.xyz`  
**Host (current):** `https://api.staging.suioutkit.xyz`  
**Base path:** `/v1/checkout` (unless noted). Note: a few endpoints live under `/v1/payments` (SSE) or the root (`/health`).

These routes are called by the SDK during checkout. Merchants integrating the SDK do not need to implement these endpoints - use `initCheckout`, `openModal`, and related SDK methods. The API reference below is useful when building a custom UI or integrating directly with the hosted service.

## Session

### `POST /v1/checkout/session`

Create a checkout session.

```json
{
  "amount": 45000,
  "currency": "NGN",
  "merchantAddress": "0x...",
  "coinType": "0x2::sui::SUI",
  "metadata": {}
}
```

Returns session with `token`, `nonce`, `estimatedRate`, `coinType`, `supportedCoins`, `status`.

## Charge

### `POST /v1/checkout/charge`

Start a payment flow. Body:

```json
{
  "token": "session-token-from-create",
  "method": "bank_transfer",
  "phoneNumber": "+234..."
}
```

Methods: `bank_transfer` | `opay` | `stripe`

Returns a provider-specific payload: virtual account details, validated FX rate for `bank_transfer`, an OPay instruction for `opay`, or a Stripe `clientSecret` and public key for `stripe`.

Common response codes for this endpoint:

- `200` - success with provider payload
- `400` - bad request (missing token or method)
- `404` - session token/nonce not found or expired
- `409` - treasury insufficient for the validated settlement amount

## Status

### `GET /v1/checkout/status/:nonce`

```json
{
  "status": "PENDING" | "PROCESSING" | "SETTLED" | "EXPIRED",
  "txDigest": "...",
  "walrusBlobId": "...",
  "error": "..."
}
```

### `GET /v1/checkout/validate/:nonce`

Pre-flight FX and settlement amount preview.

## Crypto

### `POST /v1/checkout/crypto/intent`

Body: `{ "token", "method?", "coinType?" }` - prepares wallet/outPay intent for the specified (or default) coin.

### `POST /v1/checkout/crypto/confirm`

Body: `{ "nonce", "txDigest", "method?" }` - verifies on-chain payment.

## Webhooks (server only)

| Endpoint | Provider |
|----------|----------|
| `POST /v1/checkout/webhook` | Flutterwave |
| `POST /v1/checkout/stripe-webhook` | Stripe |

Webhooks are server-to-server callbacks and must be handled on a secure backend (not in-browser). Important notes:

- Flutterwave: `POST /v1/checkout/webhook` - validated by the `verif-hash` header (see `backend/.env` `FLW_HASH`).
- Stripe: `POST /v1/checkout/stripe-webhook` - requires the raw request body and the `stripe-signature` header for `stripe.webhooks.constructEvent()` verification.

Keep signing secrets and provider keys on your server; do not expose them to client-side code.

## SSE

### `GET /v1/payments/stream/:nonce`

Server-Sent Events for live status updates. Note this route lives under `/v1/payments` rather than `/v1/checkout`.

## Health

### `GET /health`

```json
{ "status": "healthy", "service": "..." }
```

See the SDK docs (`/docs/guides/sdk`) for examples showing how the client uses these routes (including SSE and polling). If you plan to run a local backend, see `backend/.env.example` for operator environment variables and required credentials.

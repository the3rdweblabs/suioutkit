---
title: Developer Guide
description: Platform architecture, API contract, environment variables, and CI for contributors and operators.
---

This guide explains how the SuiOutKit platform is structured and how the SDK communicates with the backend during checkout and settlement.

**Merchants** use the hosted API at `https://api.suioutkit.xyz` with routes under `/v1/` (SDK default). See [Hosted API](/docs/hosted-api) for the deploy checklist and route map.

## Overview
SuiOutKit is a settlement system for payment methods that eventually resolve into Sui-based settlement. Developers integrate the browser SDK published as [`suioutkit`](https://www.npmjs.com/package//suioutkit), while the backend handles payment provider calls, treasury validation, receipt storage, and on-chain settlement.

The architecture is intentionally split:

- **SDK**: browser-side checkout and merchant integration
- **Backend**: payment orchestration, FX validation, treasury checks, Walrus uploads, and Sui settlement
- **Contracts**: Move package that enforces treasury release and receipt minting

## Repository Layout
- [`sdk/`](/sdk/) - NPM package for merchants
- [`backend/`](/backend/) - Express + TypeScript backend
- [`contracts/`](/contracts/) - Move contracts and tests
- [`demo/demo.html`](/demo/demo.html) and [`demo/demo-e2e.html`](/demo/demo-e2e.html) - browser demos

## Checkout Flow
### 1. Create Session

The merchant site initializes a checkout session through the SDK.

```ts
const session = await sdk.initCheckout({
  amount: 45000,
  currency: "NGN",
  metadata: { orderId: "ORDER-123" }
});
```

The SDK sends the request to:

- `POST /v1/checkout/session`

The backend returns a session object containing a nonce, token, estimated FX rate, settlement coin type, and status.

### 2. User Confirms Payment
When the user clicks the payment action, the SDK calls:

- `POST /v1/checkout/charge`

The backend does the following:

1. Loads the session from Redis.
2. Fetches a fresh FX rate.
3. Calculates the settlement amount.
4. Checks treasury balance on-chain.
5. If the treasury is insufficient, returns `409` and blocks the payment.
6. If the treasury is sufficient, it starts the payment method flow.

### 3. Payment Provider Webhook
After the payment provider confirms success, it sends a webhook to the backend:

- `POST /v1/checkout/webhook`

The backend validates the webhook, uploads the receipt metadata to Walrus, and executes the Sui settlement PTB.

### 4. Settlement Status
The SDK or merchant UI can poll:

- `GET /v1/checkout/status/:nonce`

This is how the frontend learns whether a session is pending, processing, or settled.

## SDK API
### `SuiOutKit`
Main class exported from the package.

```ts
import { SuiOutKit } from "suioutkit";
```

Methods:

- `initCheckout(options)` - creates a session
- `openModal(session, options?)` - opens the checkout UI (accepts `SuiOutKitModalOptions` with `onClose`, `onPaymentComplete`, `redirectUrl`, `autoCloseOnSuccess`)
- `wrapButton(selector, options)` - binds checkout to a button

### Helper Exports
The package also exposes small helpers for custom integrations:

- `request(url, opts)` - fetch helper with timeout and JSON parsing
- `formatNgn(amount)` - NGN formatting helper
- `toTokenUnits(baseUnits, decimals)` - convert from base units to token value
- `formatToken(amount, decimals, digits)` - format token amounts for display
- `createPolling(fn, intervalMs)` - lightweight polling helper

## Backend API Contract
These routes are required by the SDK and should remain stable.

### `POST /v1/checkout/session`
Creates a checkout session.

Request body:

```json
{
  "amount": 45000,
  "currency": "NGN",
  "merchantAddress": "0x...",
  "metadata": {}
}
```

### `POST /v1/checkout/charge`
Starts a payment provider flow.

Request body:

```json
{
  "token": "checkout-session-token",
  "method": "bank_transfer",
  "phoneNumber": "+234..."
}
```

### `GET /v1/checkout/status/:nonce`
Returns settlement state and on-chain receipt data.

### `GET /v1/checkout/validate/:nonce`
Performs a treasury pre-flight check using the current rate before the user proceeds.

## Environment Variables
The backend uses the following variables from [`backend/.env`](/backend/.env):

- `PORT`
- `REDIS_MODE` - `local` (standalone Redis) or `live` (Upstash/REST)
- `REDIS_URL` - connection string (used in `local` mode)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_TLS_ENABLED` - Redis config for `local` mode
- `SESSION_TTL` - checkout session expiry in seconds
- `FLW_API_BASE`
- `FLW_PUBLIC_KEY`
- `FLW_SECRET_KEY`
- `FLW_HASH`
- `WALRUS_UPLOAD_MODE`
- `WALRUS_EPOCHS`
- `WALRUS_DELETABLE`
- `WALRUS_USE_UPLOAD_RELAY`
- `WALRUS_UPLOAD_RELAY_URL`
- `WALRUS_UPLOAD_RELAY_MAX_TIP`
- `WALRUS_PUBLISHER_URL`
- `SUI_RPC_ENDPOINT`
- `SUI_NETWORK`
- `PACKAGE_ID`
- `PAYMENT_KIT_PACKAGE_ID_testnet` / `PAYMENT_KIT_PACKAGE_ID_mainnet` - Payment Kit registry package (outPay flow)
- `TREASURY_ID`
- `FIAT_REGISTRY_ID`
- `FIAT_REGISTRY_ADMIN_CAP_ID`
- `CRYPTO_REGISTRY_ID`
- `CRYPTO_REGISTRY_NAME`
- `CRYPTO_REGISTRY_ADMIN_CAP_ID`
- `SUI_OPERATOR_PRIVATE_KEY`
- `WALRUS_OPERATOR_PRIVATE_KEY`
- `SETTLEMENT_TOKEN_TYPE`

## Treasury and FX Policy
A payment confirmation is only allowed if the backend can validate two things:

1. The current FX rate is available.
2. The treasury holds enough of the settlement token to cover the payment amount.

The backend fetches a fresh rate at charge time so the amount used for settlement is the current value, not a stale cached estimate.

## On-Chain Flow
The Move contract provides two settlement paths:

- `checkout::settle_fiat<T>` - used for fiat payment completion after treasury release
- `checkout::mint_suioutkit_receipt` - used for wallet/native settlement flows where the payment receipt is already available in the same PTB

The treasury release is atomic. If the treasury balance is insufficient, the transaction aborts and no partial settlement is finalized.

## Security Notes
- Never expose operator private keys in the browser.
- Treat the backend as the source of truth for settlement state.
- Keep webhook verification enabled in production.
- Restrict CORS to trusted merchant origins in production.
- Bind merchant identity server-side instead of trusting only a client-supplied address.

## Development Commands
Backend:

```bash
cd backend
npm install
cp .env.example .env
npm run build
npm start
```

SDK:

```bash
cd sdk
npm install
npm run build
```

Contracts:

```bash
cd contracts/suioutkit
sui move test
```

## Troubleshooting
### Treasury aborts with code 4
The treasury does not hold enough of the requested coin type. Verify the operator deposit and the settlement amount derived from the current FX rate.

### FX falls back to 1300
The FX service failed to fetch the current rate from its upstream APIs. Check the network, upstream availability, and backend logs.

### Walrus upload fails
Try enabling the upload relay or switching to publisher mode in the backend environment.

## CI, Docker Compose & Testing
CI goals:

- Build and typecheck the backend and SDK.
- Optionally run Move tests when the `sui` toolchain is available on the runner.

The repository includes a GitHub Actions workflow at [`.github/workflows/ci.yml`](/.github/workflows/ci.yml) that:

- Checks out the repo.
- Sets up Node.js and installs dependencies for `backend` and `sdk`.
- Builds the backend and SDK (runs `tsc` via `npm run build`).
- Runs Move tests with `sui move test` only if `sui` is present on the runner (non-fatal if absent).

## Security & CI
- See the repository `SECURITY.md` for vulnerability reporting, disclosure guidance, and the preferred private contact. The `SECURITY.md` includes a placeholder contact: `security@suioutkit.xyz` - replace this with your real security alias.
- This repository includes CI and security checks:
  - Primary CI: [`.github/workflows/ci.yml`](/.github/workflows/ci.yml) - builds, typechecks, and optionally runs Move tests.
  - Security scans: [`.github/workflows/security.yml`](/.github/workflows/security.yml) - `npm audit` across `backend`, `sdk`, and `website`.
  - Dependabot: [`.github/dependabot.yml`](/.github/dependabot.yml) - scheduled dependency update PRs for npm packages and GitHub Actions.

Ensure the security contact is a monitored mailbox or team alias so vulnerability reports are acknowledged promptly.

## License
[GPL-3.0](../LICENSE)

## Authors
- [@The3rdWebLabs](https://github.com/the3rdweblabs)
- [@CYBWithFlourish](https://github.com/CYBWithFlourish/)

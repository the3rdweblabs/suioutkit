---
title: Environment
description: Backend environment variables (SuiOutKit operators only).
---

<div class="caution"><strong>Not required for SDK integration.</strong> This page is for teams operating or running the SuiOutKit backend. Merchants only need `merchantAddress` in the SDK - see <a href="/docs/getting-started/installation">Installation</a>.</div>

Configure these values in `backend/.env` (see [`backend/.env.example`](/backend/.env.example)). The table below separates core operator values from optional provider and storage settings. Keep operator private keys and provider secrets out of client-side code.

## Core

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `5000`) |
| `REDIS_MODE` | `local` (standalone Redis via `ioredis`) or `live` (Upstash REST) |
| `REDIS_URL` | Redis connection string (used when `REDIS_MODE=local`) |
| `REDIS_HOST`, `REDIS_PORT` | Redis host/port override (optional, default `localhost:6379`) |
| `REDIS_PASSWORD` | Redis password / Upstash token |
| `REDIS_TLS_ENABLED` | Set `true` to enable TLS (Upstash) |
| `SESSION_TTL` | Checkout session expiry in seconds (default `1800`) |

### Minimum for local development

For a quick local run you typically need at least:

```text
PORT=5000
REDIS_MODE=local
REDIS_URL=redis://localhost:6379
SETTLEMENT_TOKEN_TYPE=0x2::sui::SUI
SUI_NETWORK=testnet
```

Operator-only values (Sui keys, WALRUS keys, provider secrets) are required for a production deployment. See [`backend/.env.example`](/backend/.env.example) for full list and example values.

## Payment providers

| Variable | Description |
|----------|-------------|
| `FLW_API_BASE` | Flutterwave API base URL |
| `FLW_PUBLIC_KEY` | Flutterwave public key |
| `FLW_SECRET_KEY` | Flutterwave secret |
| `FLW_HASH` | Webhook verification hash |
| `STRIPE_PUBLIC_KEY` | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Stripe secret |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

Notes:

- Use Stripe test keys for development and `sk_live...` keys in production. Keep `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` server-side only.
- For Flutterwave, `FLW_SECRET_KEY` should start with `FLWSECK` (Test or Live). `FLW_HASH` is used to validate incoming webhooks.

## Sui

| Variable | Description |
|----------|-------------|
| `SUI_RPC_ENDPOINT` | JSON-RPC endpoint (used by indexer for `suix_queryEvents` polling) |
| `SUI_NETWORK` | `testnet` or `mainnet` |
| `PACKAGE_ID` | Published suioutkit Move package |
| `PAYMENT_KIT_PACKAGE_ID_testnet` / `PAYMENT_KIT_PACKAGE_ID_mainnet` | Payment Kit registry package (required for outPay flow) |
| `TREASURY_ID` | Treasury shared object |
| `FIAT_REGISTRY_ID` | Payment Kit registry (fiat) |
| `FIAT_REGISTRY_ADMIN_CAP_ID` | Registry admin cap |
| `FIAT_REGISTRY_NAME` | Registry name string (e.g. `suioutkit-fiat-settlements`) |
| `CRYPTO_REGISTRY_ID` | Registry (crypto flows) |
| `CRYPTO_REGISTRY_NAME` | Registry name string |
| `CRYPTO_REGISTRY_ADMIN_CAP_ID` | Crypto admin cap |
| `SETTLEMENT_TOKEN_TYPE` | e.g. `0x2::sui::SUI` |
| `SUI_OPERATOR_PRIVATE_KEY` | Signs settlement PTBs |

Notes:

- `SUI_OPERATOR_PRIVATE_KEY` must be kept secret. The backend accepts either bech32 (`suiprivkey1...`) or hex-prefixed (`0x...`) formats; ensure your operator wallet has SUI for gas.
- `PACKAGE_ID`, `TREASURY_ID`, and registry IDs are populated when you deploy the Move package and bootstrap registries - see [`contracts/suioutkit/`](/contracts/suioutkit/) and the Developer Guide for deploy steps.

## Walrus

| Variable | Description |
|----------|-------------|
| `WALRUS_UPLOAD_MODE` | `publisher` or `sdk` |
| `WALRUS_EPOCHS` | Storage epochs |
| `WALRUS_PUBLISHER_URL` | Publisher URL (testnet/mainnet) |
| `WALRUS_OPERATOR_PRIVATE_KEY` | Required when `WALRUS_UPLOAD_MODE=sdk` |

Notes:

- `WALRUS_UPLOAD_MODE=publisher` lets you use the public Walrus publisher endpoint (no operator key needed). `sdk` mode requires `WALRUS_OPERATOR_PRIVATE_KEY` and SUI/WAL funds for registering blobs.

## Troubleshooting

| Issue | Check |
|-------|--------|
| Treasury abort code 4 | Fund treasury for `SETTLEMENT_TOKEN_TYPE` |
| FX falls back to ~1300 | FX upstream unreachable |
| Walrus upload fails | Try upload relay or publisher mode |

If you are operating the backend in production, follow the Developer Guide ([`/docs/developer-guide`](/docs/developer-guide.md)) for deployment checklists (keys, secure env, and Sui object IDs). Always rotate and protect private keys.

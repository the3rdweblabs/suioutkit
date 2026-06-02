---
title: Security
description: Production security practices for SuiOutKit operators and merchants.
---

## Keys and secrets

- **Never** expose `SUI_OPERATOR_PRIVATE_KEY` or `WALRUS_OPERATOR_PRIVATE_KEY` in the browser or git.
- Use a secret manager in production.
- Rotate provider keys (Flutterwave, Stripe) on a schedule.
## Keys and secrets

- **Never** expose operator private keys or provider secrets in client-side code or in git. This includes `SUI_OPERATOR_PRIVATE_KEY`, `WALRUS_OPERATOR_PRIVATE_KEY`, `STRIPE_SECRET_KEY`, and `FLW_SECRET_KEY`.
- Store secrets in a dedicated secret manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault) or use Docker/Kubernetes secrets.
- Use short-lived credentials where possible and rotate keys regularly. Record rotation procedures and owners.
- Limit access with least privilege: only the services and CI jobs that need a secret should be able to read it.
- Do not log secret values or include them in crash dumps; redact sensitive fields in logs.

## Backend

- Serve the API over **HTTPS** only in production.
- Restrict **CORS** to trusted merchant origins (dev defaults are permissive).
- Keep **webhook verification** enabled (`FLW_HASH`, `STRIPE_WEBHOOK_SECRET`).
- Preserve **raw request body** for Stripe signature checks.
## Backend & network

- Serve the API over **HTTPS** with strong TLS settings in production (disable TLSv1/1.1, use modern cipher suites).
- Restrict **CORS** to trusted merchant origins. Do not enable permissive `*` in production.
- Use Content Security Policy (CSP) and HSTS headers to reduce web attack surface for any hosted UI.
- Enforce authentication and authorization on operator endpoints (admin, treasury scripts).
- Keep webhook verification enabled (`FLW_HASH`, `STRIPE_WEBHOOK_SECRET`) and validate incoming headers.
- Preserve the raw request body for Stripe signature verification and use `stripe.webhooks.constructEvent()` server-side.
- Apply rate limiting (middleware) to public endpoints to reduce abuse.

## Treasury

- Monitor treasury balance vs expected settlement volume.
- Charges are blocked server-side when the vault is insufficient - still fund proactively.
## Treasury & on-chain safety

- Monitor treasury balances and set alerts for low thresholds per token (`SETTLEMENT_TOKEN_TYPE`).
- Implement safeguards and auditing for `treasury` admin operations (deposits/withdrawals). Require multi-step approval in production if possible.
- Treat on-chain operator keys and registry admin caps as high-value secrets; rotate and store them in HSM/secure vaults when available.

## Merchants

- Pass only `merchantAddress` and `backendUrl` to the SDK.
- Treat backend `status` as source of truth - do not assume payment success from UI alone.
- Bind merchant identity server-side when possible; do not trust client-supplied addresses without validation.
## Merchant integration guidance

- Pass only `merchantAddress` and `backendUrl` to the SDK; never embed operator or provider secrets in the client.
- The backend `status` (or SSE) is the source of truth. Do not treat client-side payment UI events as definitive confirmation.
- Validate `merchantAddress` server-side where you accept or persist it; reject malformed or unauthorized addresses.
- For custom UIs, use the `validate` endpoint to pre-flight treasury checks and present clear guidance to customers.

## Webhooks

- Use HTTPS endpoints with valid TLS.
- Acknowledge duplicate webhooks safely (sessions move to `SETTLED` once).
- Use ngrok or Stripe CLI for local webhook testing - never forward production secrets to dev machines.
## Webhooks and provider callbacks

- Webhooks must be delivered to HTTPS endpoints with valid certificates.
- Verify webhook authenticity:
	- Flutterwave: check `verif-hash` (configure `FLW_HASH`).
	- Stripe: use the `stripe-signature` header and `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`.
- Design webhook handlers to be idempotent: use Redis locks or idempotency keys to avoid double-processing.
- Acknowledge non-fatal errors with appropriate HTTP status codes to avoid repeated retries when needed.
- For local testing use `ngrok` or the Stripe CLI; never share production signing secrets with local tunnels.


## Logging, monitoring & incident response

- Log security-relevant events (failed webhook verification, treasury low-balance alerts, suspicious admin activity) to a centralized system.
- Mask sensitive fields in logs; never write private keys or full provider secrets to logs.
- Monitor health (`/health`), SSE delivery failures, and webhook rate anomalies.
- Create an incident response playbook: who to contact, revoke keys, rotate secrets, and perform forensic review.

## CI/CD & dependencies

- Scan dependencies for vulnerabilities (Snyk, Dependabot, GitHub Dependabot alerts) and pin versions for reproducible builds.
- Run linters and security checks in CI; fail the build on dangerous changes to deployment manifests that might expose secrets.

## Reporting

Report security issues to the SuiOutKit maintainers using a private channel. Preferred options:

- Open a private GitHub Security Advisory for this repository (recommended), or
- Contact the maintainers via the project's designated security email or private security channel.

Do not open public issues that include sensitive information (private keys, provider secrets, or signing material). If you must share sensitive data during triage, use an encrypted channel or a private advisory so secrets are not exposed.

See the repository `SECURITY.md` for full reporting instructions, or contact the maintainers at `security@suioutkit.xyz` (replace with the project's real security contact) for private disclosure.

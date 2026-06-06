---
title: Security
description: Production security practices for SuiOutKit operators and merchants.
---

## Keys and secrets

- **Never** expose `SUI_OPERATOR_PRIVATE_KEY` or `WALRUS_OPERATOR_PRIVATE_KEY` in the browser or git.
- Store secrets in a dedicated secret manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault) or use Docker/Kubernetes secrets.
- Use short-lived credentials where possible and rotate keys regularly. Record rotation procedures and owners.
- Limit access with least privilege: only the services and CI jobs that need a secret should be able to read it.
- Do not log secret values or include them in crash dumps; redact sensitive fields in logs.

## Backend & network

- Serve the API over **HTTPS** with strong TLS settings in production (disable TLSv1/1.1, use modern cipher suites).
- Restrict **CORS** to trusted merchant origins. Do not enable permissive `*` in production.
- Keep webhook verification enabled (`FLW_HASH`, `STRIPE_WEBHOOK_SECRET`) and validate incoming headers.
- Preserve the raw request body for Stripe signature verification and use `stripe.webhooks.constructEvent()` server-side.
- Rate limiting is applied to session creation (`POST /session`, 10 req/min per IP). Add additional rate limiting for production deployments.

## Treasury & on-chain safety

- Monitor treasury balances and set alerts for low thresholds per token.
- The backend blocks charges server-side when the treasury is insufficient - still fund proactively.
- Treat on-chain operator keys and registry admin caps as high-value secrets; rotate and store them in secure vaults when available.

## Merchant integration guidance

- Pass only `merchantAddress` and `mode` (or `backendUrl`) to the SDK; never embed operator or provider secrets in the client.
- The backend `status` (or SSE) is the source of truth. Do not treat client-side payment UI events as definitive confirmation.
- Validate `merchantAddress` server-side where you accept or persist it; reject malformed or unauthorized addresses.
- For custom UIs, use the `validate` endpoint to pre-flight treasury checks and present clear guidance to customers.

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

See the repository `SECURITY.md` for full reporting instructions, or contact the maintainers at [the3rdweblabs@gmail.com](mailto:the3rdweblabs@gmail.com).

---
name: wiva-security-saas
description: Use when implementing WIVA admin auth, Neon Auth, Google login, activation, subscriptions, entitlements, audit logs, CORS, sessions, secrets, and paid-install security.
---

# WIVA Security And SaaS Skill

## Security Baseline

- No usable default admin credentials.
- No plaintext admin passwords.
- No secrets or provider credentials in the repo.
- New paid installs must fail closed without valid activation/entitlements.
- Viewer messages must not expose subscription internals or private stream URLs.

## Auth And Entitlements

- Use Neon Auth/Google login for owner registration when configured.
- Feature access should be controlled by signed/platform-backed entitlements.
- Local settings alone must not unlock paid features.
- Support active, trial, pending, expired, suspended, unregistered, and grace states explicitly.

## Admin API Rules

- Require admin session/auth for admin APIs.
- Avoid wildcard CORS for admin APIs.
- Protect mutation routes from cross-site abuse.
- Rate limit login and sensitive mutations.
- Audit important admin actions without logging secrets.

## Validation

- Test fresh install, upgraded install, expired subscription, suspended subscription, offline/grace, and tampered local settings.

# WIVA Security Notes

## Implemented Protections

- Admin passwords are hashed with Node `crypto.scryptSync` for new and migrated local settings.
- Admin web login issues opaque server-side session tokens instead of storing `username:password` in cookies.
- Admin session cookies are `HttpOnly` and `SameSite=Lax`.
- Admin login attempts are rate limited per client IP.
- Protected admin APIs verify authorization on the server.
- The setup save endpoint requires admin authorization after first setup is complete.
- The public settings payload removes admin password hashes, plaintext passwords, license keys, and Neon database URLs.
- HTTP responses include baseline hardening headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy` denying camera, microphone, and geolocation by default
- IPTV source URLs remain behind the local proxy for LAN clients.
- Admin upload sanitizes filenames and stores files under the local WIVA data area.
- Cloud database URL editing is ignored from customer-side settings.

## Operational Responsibilities

- Do not expose WIVA LAN ports directly to the public internet.
- Use strong admin passwords during setup.
- Keep the Windows host and router firmware updated.
- Configure firewall rules so only trusted LAN devices can reach WIVA.
- Configure `SENTRY_DSN` only through trusted build/runtime secrets.
- Configure Neon database credentials only through release secrets or secure local environment files.
- Use a code-signing certificate for production Windows distribution when available.

## Remaining Security Work

- Full Neon Auth email/password and Google OAuth integration.
- Password reset and email verification.
- Role-based access control for platform and network users.
- Multi-tenant isolation tests against Neon.
- CSRF tokens for state-changing admin form actions.
- Signed entitlement tokens and stronger offline entitlement validation.
- Production-grade upload content inspection and optional malware scanning.
- Dependency vulnerability remediation after compatibility testing.
- Formal penetration testing before public SaaS launch.

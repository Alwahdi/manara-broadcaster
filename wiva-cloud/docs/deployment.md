# Deploying WIVA Cloud

## Vercel project

Create a Vercel project with the repository root directory set to
`wiva-cloud`. The build command is `npm run build`; no custom output directory
is required.

Set every variable from `.env.example` in Vercel. Production should use:

```text
NEXT_PUBLIC_WIVA_DEMO_MODE=false
WIVA_ALLOW_PUBLIC_DEMO_PLAYBACK=false
```

Generate secrets outside the repository. Never paste provider credentials into
Vercel logs, build arguments, browser code, or Git.

## Neon

Apply `db/schema.sql`, create the tenant row referenced by `WIVA_TENANT_ID`,
then set `DATABASE_URL` in Vercel. Keep Neon and the Vercel function region near
each other; `vercel.json` currently uses Frankfurt (`fra1`).

## Admin

Generate the password hash locally:

```bash
npm run hash-password -- "your-long-random-password"
```

Set the result as `WIVA_ADMIN_PASSWORD_HASH`. There is intentionally no default
admin login.

## Media data plane

Deploy the media gateway on persistent container/VM infrastructure and put a
CDN in front of it. The gateway must implement the contract in
`docs/media-gateway-contract.md`. Set the public CDN/gateway entry point as
`WIVA_MEDIA_GATEWAY_URL` and share the same playback signing secret with the
gateway through its secret manager.

Do not proxy video bytes through Next.js Route Handlers. Keep those handlers for
authorization, catalog APIs, and short-lived playback grants.

### VPS service

The included `deploy/wiva-media-gateway.service` runs the gateway as the
unprivileged `wiva-media` user and binds it to `127.0.0.1:5290` through the
environment file. `deploy/nginx-wiva-media.conf` is a separate virtual host, so
an existing default Nginx site remains untouched. Replace
`__WIVA_MEDIA_HOST__`, enable the site, and terminate TLS with a valid
certificate before exposing playback to the web portal.

Install the operating system's current FFmpeg package before enabling the
service. The unit deliberately uses `/usr/bin/ffmpeg`; older binaries bundled
for local development can fail against modern IPTV origins even when the same
provider works with a current FFmpeg release.

The reverse proxy must forward `X-Forwarded-Proto` and `X-Forwarded-Host`.
Otherwise generated HLS segment URLs can be downgraded to HTTP and blocked as
mixed content by mobile browsers.

The gateway's current health endpoint is `GET /health`.

## Go-live gate

- Provider contract explicitly grants internet redistribution.
- Provider HTTPS origin tested from the gateway region.
- CDN cache rules validated for live manifests and segments.
- Viewer concurrency and account limits enforced at the gateway.
- Upstream and downstream bytes reported separately.
- 100, 500, and 1,000 viewer load tests completed.
- Slow clients and idle ingest cleanup verified.
- Demo mode disabled and sample catalog removed.

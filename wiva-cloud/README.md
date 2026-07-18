# WIVA Cloud

WIVA Cloud is the internet-facing control plane and viewer portal for licensed
live TV and media distribution. It is intentionally separate from the local
Electron Agent UI because that UI is exported as static files for Windows/LAN.

## Architecture

- **Vercel / Next.js:** viewer accounts, catalog, admin, permissions, audit log,
  and short-lived playback grants.
- **Neon Postgres:** tenant, providers, catalog, viewers, and sessions.
- **Media Gateway (persistent infrastructure):** one licensed upstream ingest
  per active channel/quality, bounded HLS cache/coalescing, and origin shielding.
- **CDN:** distributes HLS manifests and segments to internet viewers. The
  gateway must not fan out 100,000 direct sockets itself.

The portal includes a signed three-minute anonymous preview, self-service
three-day trial accounts, and manual transfer requests that an administrator
must review before access is extended. It does not perform an automatic charge.

Single ingest saves upstream provider bandwidth; it does not remove downstream
capacity requirements. One thousand simultaneous LAN viewers still require a
properly sized LAN, and large internet audiences require a CDN in front of the
gateway.

Vercel Functions are not used as the video byte proxy. They are request-bound,
have duration/payload limits, and do not provide the persistent process needed
for shared ingest state.

## Safety boundary

Provider credentials are encrypted server-side and never returned to viewers.
Every provider requires a rights reference and an explicit redistribution
attestation. The app does not contain Hydra, Gold Club, private playlists, or
any other provider credentials. Use only origins for which the tenant has
commercial redistribution rights.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Demo mode renders a safe catalog and may play only the public Apple HLS sample.
Admin mutations and real playback fail closed until the database, secrets, and
media gateway are configured.

## Production setup

1. Apply `db/schema.sql` to Neon.
2. Generate the admin password hash with `npm run hash-password -- "..."`.
3. Create random session/playback secrets (at least 32 bytes).
4. Create a 32-byte base64 provider-credential key.
5. Set all environment variables in Vercel; disable demo mode.
6. Deploy the separately operated media gateway and CDN.
7. Add only licensed providers with a written rights reference.

## Media gateway contract

See `docs/media-gateway-contract.md`. The contract deliberately separates
control-plane authorization from the persistent data plane.

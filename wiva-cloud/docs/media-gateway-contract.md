# WIVA Media Gateway contract

The gateway is a persistent service deployed on a VM/container platform close
to the licensed upstream and behind a CDN. It is not a Vercel Function.

## Playback grant

The portal sends the viewer to:

```text
GET {WIVA_MEDIA_GATEWAY_URL}/v1/play/{assetId}?tenant={tenantId}&exp={unix}&nonce={id}&sig={hmac}
```

`sig` is HMAC-SHA256 over:

```text
tenantId.assetId.viewerId.exp.nonce
```

The gateway must reject expired grants, unknown tenants/assets, replayed nonce
where required, and disabled viewer/asset entitlements.

## Live pipeline

1. Resolve the encrypted provider reference on the gateway/control backend.
2. Start upstream only on the first viewer request.
3. Reuse one ingest for the same channel and quality.
4. Coalesce identical HLS segment fetches and keep a byte-bounded cache.
5. Put a CDN in front of the gateway; use short cache TTLs appropriate to live.
6. Stop ingest after the last viewer and an idle grace period.
7. Track upstream bytes separately from CDN/LAN downstream bytes.

Different channels or qualities require separate ingests. A provider contract
must explicitly allow redistribution; a consumer connection count is not a
redistribution license.

## Required gateway endpoints

- `GET /health` (the bundled gateway; external implementations may also alias `/healthz`)
- `GET /v1/play/:assetId` — signed playback entry point
- `GET /v1/hls/:session/master.m3u8`
- `GET /v1/hls/:session/segment/:opaqueToken`
- `POST /internal/assets/sync` — authenticated catalog/provider-reference sync
- `GET /internal/metrics` — protected operational metrics

Never return upstream URLs, provider usernames, passwords, or private headers
to the viewer. Error messages must map to safe states: unavailable, expired,
blocked, no content, transfer limit, or retry later.

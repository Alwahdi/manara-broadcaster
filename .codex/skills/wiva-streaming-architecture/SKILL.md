---
name: wiva-streaming-architecture
description: Use when working on WIVA IPTV/live streaming, HLS proxying, segment cache, TS fan-out, bandwidth optimization, provider errors, transfer limits, and load testing.
---

# WIVA Streaming Architecture Skill

## Core Rule

For one channel at one quality, WIVA should ingest from the upstream/source once and redistribute to many LAN viewers whenever technically possible.

## Requirements

- IPTV is on demand only.
- HLS segment requests should coalesce.
- Cache must be bounded by bytes or safe limits, not unlimited growth.
- Slow clients must not create unbounded memory pressure.
- Track upstream bytes separately from downstream LAN bytes.
- If viewers choose different qualities, expect one ingest per active quality.

## Workflow

1. Inspect `electron-broadcaster/library/iptv.cjs` and related server routes.
2. Preserve provider error mapping and transfer limit behavior.
3. Add metrics for cache hits, upstream bytes, downstream bytes, active viewers, and errors.
4. Validate with targeted stream tests and load scripts.
5. Document realistic LAN bandwidth limits for high viewer counts.

## Do Not

- Do not open provider streams before a viewer requests them.
- Do not leak upstream URLs to viewers.
- Do not make every viewer create a separate upstream request for the same segment/stream.

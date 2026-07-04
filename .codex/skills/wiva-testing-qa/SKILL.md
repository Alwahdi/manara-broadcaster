---
name: wiva-testing-qa
description: Use when adding or running WIVA tests, smoke checks, Playwright visual tests, mobile screenshots, stream/load tests, CI checks, and release validation.
---

# WIVA Testing And QA Skill

## Test Pyramid

- Runtime smoke tests for server/admin/setup basics.
- Entitlement/auth tests for subscription behavior.
- Web UI typecheck/build tests.
- Playwright visual tests for public/admin/setup/player states.
- Stream/load tests for IPTV/live performance.

## Required UI Coverage

- `/`
- `/library`
- `/admin`
- `/setup`
- Mobile 320px/390px widths
- Desktop width
- Player loading, playing, error, no content, blocked, reconnect states

## Required Streaming Coverage

- One upstream fetch for shared HLS segment requests.
- Bounded memory under repeated segment requests.
- Slow-client cleanup.
- Upstream vs downstream byte accounting.
- 100, 500, and 1000 viewer simulations where feasible.

## Release Gate

Run `npm --prefix electron-broadcaster run ci` for release-facing changes. Add targeted tests when fixing regressions so they stay fixed.

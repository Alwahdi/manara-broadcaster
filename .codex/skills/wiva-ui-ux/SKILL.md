---
name: wiva-ui-ux
description: Use when improving WIVA admin, setup, library, viewer, or player UI/UX, especially Arabic/RTL, Cairo typography, mobile responsiveness, media-library visuals, and professional dashboard polish.
---

# WIVA UI/UX Skill

## Principles

- Treat `electron-broadcaster/webui/` as the official UI source.
- Arabic/RTL and Cairo font are required.
- Public pages should not expose admin controls.
- Admin pages should be operational, organized, and mobile-friendly.
- Avoid wide tables on mobile. Replace with cards, detail sheets, or drill-in views.
- Include loading, empty, error, offline, blocked, and permission states when relevant.

## Workflow

1. Identify the route/component in `electron-broadcaster/webui/`.
2. Check the same flow on mobile and desktop.
3. Improve information architecture before decoration.
4. Use existing design tokens/components first.
5. Keep copy short, clear, and user-facing.
6. Validate with typecheck/build and visual/browser checks when possible.

## Quality Bar

- No text overlap.
- No cramped mobile controls.
- No public admin button in viewer/library surfaces.
- No provider/internal technical leakage in user-facing messages.
- Desktop remains dense enough for repeated admin work.

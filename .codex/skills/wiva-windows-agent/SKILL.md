---
name: wiva-windows-agent
description: Use when working on WIVA Windows startup, tray behavior, before-login service mode, installer behavior, taskbar icon, ports, local settings persistence, and SQLite/native module behavior.
---

# WIVA Windows Agent Skill

## Agent Model

WIVA should run as a local network agent. The desktop window is not the main admin surface; the web admin is.

## Startup Modes

- Tray/start minimized after login.
- Auto-start after login.
- Before-login startup using service or scheduled task, when implemented.
- Avoid duplicate server instances when UI opens after service startup.

## Persistence

- Settings must survive restart.
- Use atomic writes or transactional storage.
- Preserve migrations from old portable/Manara settings.
- Handle native SQLite ABI problems gracefully in development, but packaged builds should use the correct native module.

## Windows UX

- Taskbar/tray icon must be included in packaged builds.
- Closing the window should not stop the agent unless the user explicitly quits from tray/admin.
- Port changes must persist and restart services cleanly.

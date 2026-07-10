# Mobile (Capacitor) build

The web app (`apps/web`) is wrapped as native iOS + Android apps with
[Capacitor](https://capacitorjs.com). Native projects live in `apps/web/ios`
and `apps/web/android`; config is `apps/web/capacitor.config.ts`.

- **App ID:** `com.alphawolf.app`  **Name:** Alpha Wolf
- **webDir:** `dist` (Vite build output at `apps/web/dist`)

## One-time: point the app at a hosted API

A packaged app has **no `/api` dev proxy** — relative calls won't reach the
backend. Before building for a device:

```bash
cp apps/web/.env.production.example apps/web/.env.production
# edit apps/web/.env.production → VITE_API_BASE=https://your-api-host/api
```

`.env.production` is gitignored. An empty `VITE_API_BASE` breaks fetches
(api.ts uses `?? "/api"`, so "" counts as set) — use a real URL or delete the line.

## Everyday workflow (run from `apps/web/`)

```bash
npm run cap:sync        # vite build + copy web assets into native projects
npm run cap:ios         # sync, then open Xcode
npm run cap:android     # sync, then open Android Studio
```

Then Run/▶ from Xcode or Android Studio to a simulator/device.

## Live-reload against the dev server (optional)

```bash
# apps/web/, with `npm run dev` already running on your LAN:
CAP_SERVER_URL=http://<your-lan-ip>:4200 npm run cap:sync
```

Unset `CAP_SERVER_URL` and re-sync to go back to the bundled build.

## Regenerating native projects

`apps/web/ios` and `apps/web/android` are committed. Heavy build artifacts
(Pods, `.gradle`, synced `public/`) are gitignored. To recreate from scratch:
`npm run cap:add:ios` / `npm run cap:add:android`.

## Requirements

- **iOS:** Xcode (Capacitor 8 uses Swift Package Manager — no CocoaPods).
- **Android:** Android Studio + SDK.

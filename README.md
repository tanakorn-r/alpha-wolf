# Alpha Wolf

Alpha Wolf is an investment strategy platform with:

- A dashboard for interesting stocks, price movement, and portfolio performance
- A radar page for matching stocks to strategies like capitalized, stable DCA, yield, and momentum
- A FastAPI backend backed by SQLite for local-first caching

## Frontend

The web app lives in `apps/web` and is set up for Nx + Vite + React + Zustand with a shadcn-style component layer.

## Backend

The API lives in `apps/api` and uses FastAPI + `yfinance` with SQLite cache snapshots for live quotes.

Install the backend dependencies with `python3 -m pip install -r apps/api/requirements.txt`, then run `npm run dev` to start both the API and the web app.

For AI summaries, set `OPENAI_API_KEY` and optionally `OPENAI_MODEL=gpt-5.5` in your environment before starting the API. Signals, Today's Move, and Buy Timing default to the lower-latency `gpt-5.4-mini` with reasoning effort `none`; override those with `OPENAI_FAST_MODEL` and `OPENAI_FAST_REASONING_EFFORT`. If you pasted a key into chat, rotate it and move it into a local env file instead of committing it.

Yahoo Finance history, modules, news, dividends, financial statements, and sector/industry research are persisted in the configured SQLite/libSQL database. Five-year history is seeded in full, refreshed from the latest month each hour, and fully rebuilt weekly. Expired data remains available as a fallback during Yahoo outages.

Google account connection uses Google Identity Services with server-side ID-token verification and an HttpOnly session cookie. Configure `GOOGLE_CLIENT_ID` with a Google OAuth Web client ID and add each frontend URL to that client's Authorized JavaScript origins. Local dev uses `http://localhost:4200`; if you open the app by IP, also add `http://127.0.0.1:4200`. Production should add its exact HTTPS origin, for example `https://alpha-wolf.lufas2603.workers.dev` with no trailing slash. For a separately hosted frontend/API, set `CORS_ORIGINS` to the exact frontend origins; `AUTH_COOKIE_SECURE` and `AUTH_COOKIE_SAMESITE` can override automatic cookie settings when required by the deployment topology.

Stripe AI-credit checkout uses hosted Checkout Sessions. Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `APP_URL` on the API only; never expose the secret or webhook key through `VITE_*`. The webhook secret is the endpoint signing secret beginning with `whsec_`, not another API key. Register `POST /api/auth/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Credit fulfillment is idempotent by Checkout Session ID.

For a complete local Stripe sandbox, install the Stripe CLI and run `npm run dev:stripe`. The script reads the test API key from `apps/api/.env`, obtains the local CLI signing secret without printing or saving it, forwards Checkout events to the API, and starts both the API and web app. Optional Dashboard Price IDs can be configured as `STRIPE_PRICE_25`, `STRIPE_PRICE_75`, and `STRIPE_PRICE_200`; without them, Checkout creates the same one-time USD prices inline.

Operational telemetry is first-party and aggregate-only. The browser reports allowlisted page categories, workflow outcomes, request status groups, and durations without cookies, referrers, account/session IDs, tickers, or content; the API immediately folds reports into `operational_telemetry_daily` instead of retaining raw events. Set the server-only `TELEMETRY_ADMIN_TOKEN` to enable `GET /api/telemetry/summary?days=30`, then read it with the `X-Telemetry-Admin-Token` header. Never expose this token through a `VITE_*` variable.

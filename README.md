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

For AI summaries, set `OPENAI_API_KEY` and optionally `OPENAI_MODEL=gpt-5.4-mini` in your environment before starting the API. If you pasted a key into chat, rotate it and move it into a local env file instead of committing it.

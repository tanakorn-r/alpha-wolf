# Alpha Wolf Go API POC

Small Gin-based proof of concept for:

- listing Thailand stocks from FinFeed metadata
- fetching a live stock price by symbol
- serving the existing Alpha Wolf `/api/...` contract from Go
- exposing Swagger / OpenAPI docs

## Run

1. Copy `.env.example` to `.env`
2. Set `FINFEED_API_KEY`
3. Optionally set `FINFEED_US_EXCHANGE_IDS` and `FINFEED_TH_EXCHANGE_IDS` if you already know the exchange ids
4. Start the server:

```bash
cd apps/go-api
go mod tidy
go run .
```

## Endpoints

- `GET /health`
- `GET /api/catalog`
- `GET /api/presets`
- `GET /api/stocks`
- `GET /api/dashboard`
- `GET /api/radar`
- `GET /api/discover`
- `GET /api/details/:symbol`
- `GET /api/portfolio`
- `POST /api/analysis/:symbol`
- `GET /api/v1/th/stocks`
- `GET /api/v1/th/stocks/:symbol/price`
- `GET /swagger`
- `GET /swagger/openapi.yaml`

## Notes

- The FinFeed upstream path templates are configurable because vendors sometimes revise path naming.
- If regional discovery fails, set `FINFEED_US_EXCHANGE_IDS` or `FINFEED_TH_EXCHANGE_IDS` explicitly from the FinFeed metadata tables.

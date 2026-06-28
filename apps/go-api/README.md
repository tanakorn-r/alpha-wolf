# Alpha Wolf Go API POC

Small Gin-based proof of concept for:

- listing Thailand stocks from FinFeed metadata
- fetching a live stock price by symbol
- exposing Swagger / OpenAPI docs

## Run

1. Copy `.env.example` to `.env`
2. Set `FINFEED_API_KEY`
3. Optionally set `FINFEED_TH_EXCHANGE_ID` if you already know the Thailand exchange id
4. Start the server:

```bash
cd apps/go-api
go mod tidy
go run .
```

## Endpoints

- `GET /health`
- `GET /api/v1/th/stocks`
- `GET /api/v1/th/stocks/:symbol/price`
- `GET /swagger`
- `GET /swagger/openapi.yaml`

## Notes

- The FinFeed upstream path templates are configurable because vendors sometimes revise path naming.
- If Thailand stock discovery fails, set `FINFEED_TH_EXCHANGE_ID` explicitly from the FinFeed metadata tables.

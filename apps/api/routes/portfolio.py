from fastapi import APIRouter, Body, HTTPException, Query, Request, Response, status

from internal.auth_context import require_user_id
from internal.fx import fx_payload
from internal.market.portfolio import build_portfolio_dashboard, build_portfolio_quotes
from internal.store.portfolio import add_watchlist_symbols, create_dca_order, delete_dca_order, delete_watchlist_symbol, list_transactions, list_watchlist, record_buy, record_sale, update_dca_order_amount, upsert_holding
from internal.store.settings import load_user_settings
from models import BuyHoldingInput, DcaOrder, DcaOrderInput, Holding, HoldingInput, PortfolioDashboard, PortfolioTransaction, SellHoldingInput, SellHoldingResult

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioDashboard)
def portfolio(request: Request) -> PortfolioDashboard:
    return build_portfolio_dashboard(require_user_id(request))


@router.get("/quotes")
def portfolio_quotes(request: Request) -> dict:
    return build_portfolio_quotes(require_user_id(request))


@router.get("/fx")
def portfolio_fx(request: Request) -> dict:
    user_id = require_user_id(request)
    settings = load_user_settings(user_id)
    return fx_payload([str((settings or {}).get("baseCurrency") or "THB")])


@router.put("/holdings", response_model=Holding)
def save_holding(value: HoldingInput, request: Request) -> Holding:
    try:
        return upsert_holding(value, require_user_id(request))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/holdings/buy", response_model=Holding, status_code=status.HTTP_201_CREATED)
def buy_holding(value: BuyHoldingInput, request: Request) -> Holding:
    try:
        return record_buy(value, require_user_id(request))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/holdings/{symbol}/sell", response_model=SellHoldingResult)
def sell_holding(symbol: str, value: SellHoldingInput, request: Request) -> SellHoldingResult:
    try:
        return record_sale(symbol, value, require_user_id(request))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/holdings/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
def remove_holding(symbol: str, request: Request) -> Response:
    require_user_id(request)
    raise HTTPException(status_code=409, detail="Use the sell flow so execution price, fees, and realized P/L are recorded")


@router.get("/transactions", response_model=list[PortfolioTransaction])
def transactions(request: Request, symbol: str | None = Query(default=None)) -> list[PortfolioTransaction]:
    return list_transactions(require_user_id(request), symbol)


@router.post("/dca-orders", response_model=DcaOrder, status_code=status.HTTP_201_CREATED)
def save_dca_order(value: DcaOrderInput, request: Request) -> DcaOrder:
    return create_dca_order(value, require_user_id(request))


@router.delete("/dca-orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_dca_order(order_id: int, request: Request) -> Response:
    delete_dca_order(order_id, require_user_id(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/dca-orders/{order_id}", response_model=DcaOrder)
def patch_dca_order(order_id: int, request: Request, payload: dict[str, float] = Body(...)) -> DcaOrder:
    return update_dca_order_amount(order_id, payload["amount"], payload.get("shares"), require_user_id(request))


@router.get("/watchlist")
def watchlist(request: Request) -> dict[str, list[str]]:
    return {"symbols": list_watchlist(require_user_id(request))}


@router.post("/watchlist")
def save_watchlist_symbols(request: Request, payload: dict[str, list[str]] = Body(...)) -> dict[str, list[str]]:
    return {"symbols": add_watchlist_symbols(payload.get("symbols") or [], require_user_id(request))}


@router.delete("/watchlist/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
def remove_watchlist_symbol(symbol: str, request: Request) -> Response:
    delete_watchlist_symbol(symbol, require_user_id(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)

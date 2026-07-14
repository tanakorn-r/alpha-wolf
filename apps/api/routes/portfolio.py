from fastapi import APIRouter, Body, Request, Response, status

from internal.auth_context import user_id_from_request
from internal.market.portfolio import build_portfolio_dashboard, build_portfolio_quotes
from internal.store.portfolio import add_watchlist_symbols, create_dca_order, delete_dca_order, delete_holding, delete_watchlist_symbol, list_watchlist, update_dca_order_amount, upsert_holding
from models import DcaOrder, DcaOrderInput, Holding, HoldingInput, PortfolioDashboard

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioDashboard)
def portfolio(request: Request) -> PortfolioDashboard:
    return build_portfolio_dashboard(user_id_from_request(request))


@router.get("/quotes")
def portfolio_quotes(request: Request) -> dict:
    return build_portfolio_quotes(user_id_from_request(request))


@router.put("/holdings", response_model=Holding)
def save_holding(value: HoldingInput, request: Request) -> Holding:
    return upsert_holding(value, user_id_from_request(request))


@router.delete("/holdings/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
def remove_holding(symbol: str, request: Request) -> Response:
    delete_holding(symbol, user_id_from_request(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/dca-orders", response_model=DcaOrder, status_code=status.HTTP_201_CREATED)
def save_dca_order(value: DcaOrderInput, request: Request) -> DcaOrder:
    return create_dca_order(value, user_id_from_request(request))


@router.delete("/dca-orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_dca_order(order_id: int, request: Request) -> Response:
    delete_dca_order(order_id, user_id_from_request(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/dca-orders/{order_id}", response_model=DcaOrder)
def patch_dca_order(order_id: int, request: Request, payload: dict[str, float] = Body(...)) -> DcaOrder:
    return update_dca_order_amount(order_id, payload["amount"], payload.get("shares"), user_id_from_request(request))


@router.get("/watchlist")
def watchlist(request: Request) -> dict[str, list[str]]:
    return {"symbols": list_watchlist(user_id_from_request(request))}


@router.post("/watchlist")
def save_watchlist_symbols(request: Request, payload: dict[str, list[str]] = Body(...)) -> dict[str, list[str]]:
    return {"symbols": add_watchlist_symbols(payload.get("symbols") or [], user_id_from_request(request))}


@router.delete("/watchlist/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
def remove_watchlist_symbol(symbol: str, request: Request) -> Response:
    delete_watchlist_symbol(symbol, user_id_from_request(request))
    return Response(status_code=status.HTTP_204_NO_CONTENT)

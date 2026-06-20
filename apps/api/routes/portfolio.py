from fastapi import APIRouter, Body, Response, status

from internal.market.portfolio import build_portfolio_dashboard
from internal.store.portfolio import create_dca_order, delete_dca_order, delete_holding, update_dca_order_amount, upsert_holding
from models import DcaOrder, DcaOrderInput, Holding, HoldingInput, PortfolioDashboard

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioDashboard)
def portfolio() -> PortfolioDashboard:
    return build_portfolio_dashboard()


@router.put("/holdings", response_model=Holding)
def save_holding(value: HoldingInput) -> Holding:
    return upsert_holding(value)


@router.delete("/holdings/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
def remove_holding(symbol: str) -> Response:
    delete_holding(symbol)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/dca-orders", response_model=DcaOrder, status_code=status.HTTP_201_CREATED)
def save_dca_order(value: DcaOrderInput) -> DcaOrder:
    return create_dca_order(value)


@router.delete("/dca-orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_dca_order(order_id: int) -> Response:
    delete_dca_order(order_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/dca-orders/{order_id}", response_model=DcaOrder)
def patch_dca_order(order_id: int, payload: dict[str, float] = Body(...)) -> DcaOrder:
    return update_dca_order_amount(order_id, payload["amount"])

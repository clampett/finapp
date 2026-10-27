from fastapi import APIRouter, HTTPException

from app.price_cache import UnsupportedCurrency

from app.stocks import (
    POPULAR_STOCKS,
    InvalidSymbol,
    SymbolNotFound,
    TooManySymbols,
    lookup_stock,
)

router = APIRouter()


@router.get("/api/stocks")
def popular_stocks():
    return [{"symbol": symbol, "name": name} for symbol, name in POPULAR_STOCKS.items()]


@router.get("/api/stocks/{symbol}")
def stock(symbol: str):
    try:
        return lookup_stock(symbol)
    except InvalidSymbol as e:
        raise HTTPException(status_code=400, detail=str(e))
    except UnsupportedCurrency as e:
        raise HTTPException(status_code=400, detail=str(e))
    except SymbolNotFound as e:
        raise HTTPException(status_code=404, detail=str(e))
    except TooManySymbols as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception:
        raise HTTPException(status_code=503, detail="Market data is temporarily unavailable")

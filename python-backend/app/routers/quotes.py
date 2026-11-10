from fastapi import APIRouter, HTTPException

from app.quotes import (
    QuoteUnavailable,
    UnknownSymbol,
    all_crypto,
    all_currencies,
    crypto_quote,
    currency_quote,
)

router = APIRouter()


def _call(function, *args):
    try:
        return function(*args)
    except UnknownSymbol as e:
        raise HTTPException(status_code=404, detail=str(e))
    except QuoteUnavailable as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        raise HTTPException(status_code=503, detail="Market data is temporarily unavailable")


@router.get("/api/crypto")
def crypto_list():
    return _call(all_crypto)


@router.get("/api/crypto/{symbol}")
def crypto(symbol: str):
    return _call(crypto_quote, symbol)


@router.get("/api/currencies")
def currency_list():
    return _call(all_currencies)


@router.get("/api/currencies/{code}")
def currency(code: str):
    return _call(currency_quote, code)

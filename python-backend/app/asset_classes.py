"""Maps FinApp asset classes to the specific tickers we pull market data for.

US_STOCKS (VOO) and BONDS (AGG) are the two named in the design document.
"""

ASSET_CLASS_TICKERS = {
    "US_STOCKS": "VOO",     # Vanguard S&P 500 ETF
    "BONDS": "AGG",         # iShares Core U.S. Aggregate Bond ETF
    "INTL_STOCKS": "VXUS",  # Vanguard Total International Stock ETF
    "REAL_ESTATE": "VNQ",   # Vanguard Real Estate ETF
}

DEFAULT_ASSET_CLASS = "US_STOCKS"


def ticker_for(asset_class: str) -> str:
    try:
        return ASSET_CLASS_TICKERS[asset_class.upper()]
    except KeyError:
        known = ", ".join(ASSET_CLASS_TICKERS)
        raise ValueError(f"Unknown asset class '{asset_class}'. Known: {known}")

"""Non-blocking, no-key market calibration using the existing price cache."""

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
import threading
import time

import numpy as np
import pandas as pd

from app.price_cache import cached_prices, cache_timestamp, get_prices

# Selected older investable proxies explicitly rather than inventing pre-inception
# VOO prices or treating a price-only stock index as a dividend-reinvested fund.
BENCHMARKS = {"US_STOCKS": "SPY", "BONDS": "AGG", "INTL_STOCKS": "EFA", "REAL_ESTATE": "VNQ"}
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="finapp-market")
_lock = threading.RLock()
_models = {}
_jobs = {}
_attempts = {}


@dataclass(frozen=True)
class MarketModel:
    log_mean: float
    log_volatility: float
    returns: np.ndarray | None
    metadata: dict
    regime_returns: np.ndarray | None = None


def assumed_model(annual_return=0.07, annual_volatility=0.15):
    return MarketModel(
        (np.log1p(annual_return) - annual_volatility**2 / 2) / 12,
        annual_volatility / np.sqrt(12),
        None,
        dict(
            status="manual",
            source="Editable assumptions",
            annual_return=annual_return,
            annual_volatility=annual_volatility,
            method="Lognormal monthly Monte Carlo",
            observations=0,
            pending=False,
        ),
    )


def calibrate_prices(prices, asset_class="US_STOCKS", fetched_at=None):
    series = pd.to_numeric(prices, errors="coerce").dropna().sort_index()
    series = series[(series > 0) & np.isfinite(series)]
    if series.index.tz is not None:
        series.index = series.index.tz_localize(None)
    monthly = series.resample("ME").last()
    # Excluded the unfinished current month and used adjusted month-end prices;
    # partial months and daily annualization were not mixed into monthly draws.
    current_month = pd.Timestamp.now(tz="UTC").tz_localize(None).to_period("M").start_time
    monthly = monthly[monthly.index < current_month]
    observed = monthly.pct_change(fill_method=None).dropna()
    if len(observed) < 24:
        raise ValueError("At least 24 completed monthly returns are required")
    logs = np.log1p(observed.to_numpy())
    mean, volatility = float(logs.mean()), float(logs.std(ddof=1))
    metadata = dict(
        status="historical",
        source="Yahoo Finance adjusted history via yfinance",
        ticker=BENCHMARKS[asset_class],
        asset_class=asset_class,
        start=monthly.first_valid_index().date().isoformat(),
        end=observed.index[-1].date().isoformat(),
        years=round((observed.index[-1] - monthly.first_valid_index()).days / 365.25, 1),
        observations=len(observed),
        annual_return=float(np.expm1(12 * mean + 6 * volatility**2)),
        annual_cagr=float(np.expm1(12 * mean)),
        annual_volatility=volatility * np.sqrt(12),
        method="12-month historical block-bootstrap Monte Carlo",
        fetched_at=fetched_at,
        pending=False,
    )
    return MarketModel(mean, volatility, observed.to_numpy(), metadata)


def _refresh(asset_class):
    ticker = BENCHMARKS[asset_class]
    try:
        model = calibrate_prices(get_prices(ticker), asset_class, cache_timestamp(ticker))
        with _lock:
            _models[asset_class] = model
    except Exception:
        # Preserved offline operation after a free provider failure; the response
        # identified fallback assumptions instead of claiming a successful download.
        pass


def warm_market(asset_class="US_STOCKS"):
    with _lock:
        job = _jobs.get(asset_class)
        if job and not job.done():
            return
        if time.monotonic() - _attempts.get(asset_class, -100000) < 300:
            return
        _attempts[asset_class] = time.monotonic()
        _jobs[asset_class] = _executor.submit(_refresh, asset_class)


def get_market_model(asset_class, source, annual_return, annual_volatility, return_mode="observed"):
    if source == "manual":
        return assumed_model(annual_return, annual_volatility)
    with _lock:
        model = _models.get(asset_class)
    if model is None:
        prices = cached_prices(BENCHMARKS[asset_class])
        if not prices.empty:
            try:
                model = calibrate_prices(
                    prices, asset_class, cache_timestamp(BENCHMARKS[asset_class])
                )
                with _lock:
                    _models[asset_class] = model
            except ValueError:
                pass
    warm_market(asset_class)
    pending = not _jobs[asset_class].done() if asset_class in _jobs else False
    if model is None:
        fallback = assumed_model(annual_return, annual_volatility)
        return MarketModel(
            fallback.log_mean,
            fallback.log_volatility,
            None,
            {
                **fallback.metadata,
                "status": "fallback",
                "ticker": BENCHMARKS[asset_class],
                "source": "Fallback assumptions; historical data not available yet",
                "pending": pending,
            },
        )
    metadata = {**model.metadata, "pending": pending}
    stamp = metadata.get("fetched_at")
    if (
        stamp
        and (datetime.now(timezone.utc) - datetime.fromisoformat(stamp)).total_seconds() > 86400
    ):
        metadata["status"] = "stale_history"
    if return_mode == "forward":
        # Preserved historical volatility, crash shapes, and regime dates while
        # separating an editable forward return from an unusually strong past average.
        target_mean = (np.log1p(annual_return) - 12 * model.log_volatility**2 / 2) / 12
        shifted = np.expm1(np.log1p(model.returns) + target_mean - model.log_mean)
        metadata = {
            **metadata,
            "observed_annual_return": metadata["annual_return"],
            "observed_cagr": metadata["annual_cagr"],
            "annual_return": annual_return,
            "annual_cagr": float(np.expm1(12 * target_mean)),
            "return_mode": "forward",
            "method": "Forward-centered 12-month historical block bootstrap",
        }
        return MarketModel(target_mean, model.log_volatility, shifted, metadata, model.returns)
    return MarketModel(model.log_mean, model.log_volatility, model.returns, metadata)

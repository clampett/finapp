import pytest

from app import names


@pytest.fixture(autouse=True)
def no_yahoo_names(monkeypatch):
    # No test asks Yahoo for a name, and each one starts with an empty name cache.
    monkeypatch.setattr(names, "_fetch_name", lambda ticker: None)
    monkeypatch.setattr(names, "_names", {})
    monkeypatch.setattr(names, "_retry_at", {})

"""Offline snapshot of the current ISO 4217 list published by SIX."""
import json
from pathlib import Path

REGISTRY = json.loads((Path(__file__).resolve().parents[1] / "data" / "currencies.json").read_text())
CURRENCIES = REGISTRY["currencies"]
CURRENCY_CODES = frozenset(row["code"] for row in CURRENCIES)


def supported_currency(value: str) -> str:
    if value not in CURRENCY_CODES:
        raise ValueError("Unsupported ISO currency code")
    return value

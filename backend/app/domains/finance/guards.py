"""
OxenGL Double-Entry Financial Invariance Protection Guards.
Enforces strict mathematical equality: sum(Debits) == sum(Credits) at the transactional layer.
"""

import functools
import inspect
from decimal import Decimal
from typing import Any, Callable, Dict, Iterable, List, Optional, Union
from fastapi import HTTPException, status


def extract_lines_from_args(args: tuple, kwargs: dict) -> Optional[List[Any]]:
    """Inspects function arguments to find journal lines payload."""
    # Check kwargs first
    for key, val in kwargs.items():
        if val is None:
            continue
        # Direct lines list
        if key in ("lines", "journal_lines") and isinstance(val, (list, tuple)):
            return list(val)
        # Pydantic or dict payload
        if hasattr(val, "lines") and isinstance(val.lines, (list, tuple)):
            return list(val.lines)
        if isinstance(val, dict) and "lines" in val and isinstance(val["lines"], (list, tuple)):
            return list(val["lines"])

    # Check positional args
    for arg in args:
        if arg is None:
            continue
        if hasattr(arg, "lines") and isinstance(arg.lines, (list, tuple)):
            return list(arg.lines)
        if isinstance(arg, dict) and "lines" in arg and isinstance(arg["lines"], (list, tuple)):
            return list(arg["lines"])
        if isinstance(arg, (list, tuple)) and len(arg) > 0:
            first = arg[0]
            if hasattr(first, "debit") or (isinstance(first, dict) and "debit" in first):
                return list(arg)

    return None


def validate_double_entry_invariance(lines: List[Any]) -> tuple[Decimal, Decimal]:
    """
    Validates that a list of journal line items satisfies the mathematical double-entry identity:
    sum(Debits) == sum(Credits).
    Raises HTTPException(400) on any imbalance, negativity, or emptiness.
    """
    if not lines or len(lines) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ledger isolation error: Journal entry must contain at least two transaction lines.",
        )

    total_debit = Decimal("0.0000")
    total_credit = Decimal("0.0000")

    for idx, line in enumerate(lines, start=1):
        if hasattr(line, "debit"):
            raw_dr = getattr(line, "debit", 0.0)
            raw_cr = getattr(line, "credit", 0.0)
        elif isinstance(line, dict):
            raw_dr = line.get("debit", 0.0)
            raw_cr = line.get("credit", 0.0)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ledger isolation error: Invalid line format at position {idx}.",
            )

        try:
            dr = Decimal(str(raw_dr if raw_dr is not None else "0.0000"))
            cr = Decimal(str(raw_cr if raw_cr is not None else "0.0000"))
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ledger isolation error: Numeric parsing failure at line {idx}.",
            )

        if dr < Decimal("0.0000") or cr < Decimal("0.0000"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ledger isolation error: Line {idx} contains negative amount (debit={dr}, credit={cr}).",
            )

        if dr > Decimal("0.0000") and cr > Decimal("0.0000"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ledger isolation error: Line {idx} cannot contain both debit and credit amounts simultaneously.",
            )

        total_debit += dr
        total_credit += cr

    if total_debit <= Decimal("0.0000"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ledger isolation error: Journal entry total value must be greater than zero.",
        )

    discrepancy = abs(total_debit - total_credit)
    if discrepancy != Decimal("0.0000") and discrepancy > Decimal("0.0001"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Ledger isolation error: Unbalanced transaction. "
                f"Sum of debits ({total_debit:.4f}) must strictly equal sum of credits ({total_credit:.4f}). "
                f"Discrepancy: {discrepancy:.4f}"
            ),
        )

    return total_debit, total_credit


def enforce_double_entry_balance(func: Callable) -> Callable:
    """
    Strict validation decorator that intercepts ledger entry posts.
    Enforces the mathematical constraint: sum(Debits) == sum(Credits).
    If unbalanced, aborts execution and returns 400 Bad Request ledger isolation error.
    Works seamlessly on both synchronous and asynchronous endpoints/functions.
    """
    if inspect.iscoroutinefunction(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            lines = extract_lines_from_args(args, kwargs)
            if lines is not None:
                validate_double_entry_invariance(lines)
            return await func(*args, **kwargs)
        return async_wrapper
    else:
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            lines = extract_lines_from_args(args, kwargs)
            if lines is not None:
                validate_double_entry_invariance(lines)
            return func(*args, **kwargs)
        return sync_wrapper

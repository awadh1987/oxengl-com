"""
Core two-tier authentication module re-exporting two_tier_auth.
"""
from backend.two_tier_auth import *

get_password_hash = hash_password

__all__ = [name for name in dir() if not name.startswith("_")]

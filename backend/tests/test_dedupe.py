from datetime import datetime
from decimal import Decimal
from app.services.dedupe import fingerprint, normalize_text

def test_normalize_text():
    assert normalize_text("UPI-SWIGGY-123") == "SWIGGY 123"

def test_fingerprint_is_stable():
    args=(1,datetime(2026,9,22),Decimal("428.00"),"debit","UPI SWIGGY 123")
    assert fingerprint(*args)==fingerprint(*args)

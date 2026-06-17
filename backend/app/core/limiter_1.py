from slowapi import Limiter
from slowapi.util import get_remote_address
import os

# Disable rate limiter in development/test environment to allow seamless script executions
is_disabled = os.getenv("DISABLE_RATE_LIMITER", "true").lower() == "true"
limiter = Limiter(key_func=get_remote_address, enabled=not is_disabled)


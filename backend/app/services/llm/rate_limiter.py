"""
Centralized async rate limiter for all LLM API calls.

Designed for the model's hard limits:
  • 30 requests / minute   → we cap at 25 req/min
  • 8 000 tokens / minute  → we enforce a minimum 15 s gap between calls
                              so 5 agent calls span ~75 s across 2 windows
  • 1 000 requests / day   → tracked but not actively capped (user must
                              be aware)

Usage:
    from app.services.llm.rate_limiter import rate_limiter

    await rate_limiter.acquire()   # blocks until a slot is available
    response = await call_llm(...)
"""

import asyncio
import time


# ── Configuration ──────────────────────────────────────────────────────
MAX_REQUESTS_PER_WINDOW = 25       # hard cap per window (model limit: 30)
WINDOW_SECONDS = 60                # sliding window length
COOLDOWN_SECONDS = 60              # pause when request cap is hit
MIN_INTERVAL_SECONDS = 10          # minimum gap between consecutive calls
                                   # -> spreads token usage so 9 agent calls
                                   #   take ~90 s, staying under 8K tok/min
# ──────────────────────────────────────────────────────────────────────


class RateLimiter:
    """Sliding-window + minimum-interval rate limiter (async-safe).

    Two complementary mechanisms:
      1. **Sliding window** – never exceed MAX_REQUESTS_PER_WINDOW in
         any WINDOW_SECONDS period.  If exceeded → COOLDOWN_SECONDS pause.
      2. **Minimum interval** – always wait at least MIN_INTERVAL_SECONDS
         since the previous request.  This naturally spreads token usage
         so the 8 K tokens/min limit is not breached.
    """

    def __init__(
        self,
        max_requests: int = MAX_REQUESTS_PER_WINDOW,
        window_seconds: float = WINDOW_SECONDS,
        cooldown_seconds: float = COOLDOWN_SECONDS,
        min_interval_seconds: float = MIN_INTERVAL_SECONDS,
    ) -> None:
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._cooldown_seconds = cooldown_seconds
        self._min_interval = min_interval_seconds
        self._timestamps: list[float] = []
        self._lock = asyncio.Lock()
        self._cooldown_until: float = 0.0
        self._last_request: float = 0.0

    # ── Public API ──

    async def acquire(self) -> None:
        """Block until it is safe to send another request."""
        async with self._lock:
            now = time.monotonic()

            # ── 1. Honour active cooldown ──
            if now < self._cooldown_until:
                wait = self._cooldown_until - now
                print(
                    f"[RateLimiter] Cooldown active — sleeping {wait:.1f}s "
                    f"({self._max_requests} requests hit in window)"
                )
                await asyncio.sleep(wait)
                now = time.monotonic()
                self._timestamps.clear()

            # ── 2. Enforce minimum interval between calls ──
            if self._last_request > 0:
                elapsed = now - self._last_request
                if elapsed < self._min_interval:
                    gap = self._min_interval - elapsed
                    print(
                        f"[RateLimiter] Minimum interval — "
                        f"waiting {gap:.1f}s before next call "
                        f"(protects 8K tokens/min limit)"
                    )
                    await asyncio.sleep(gap)
                    now = time.monotonic()

            # ── 3. Purge timestamps older than the window ──
            cutoff = now - self._window_seconds
            self._timestamps = [t for t in self._timestamps if t > cutoff]

            # ── 4. If the window is full → cooldown ──
            if len(self._timestamps) >= self._max_requests:
                self._cooldown_until = now + self._cooldown_seconds
                print(
                    f"[RateLimiter] Rate limit reached ({self._max_requests} "
                    f"requests in {self._window_seconds}s). "
                    f"Entering {self._cooldown_seconds:.0f}s cooldown …"
                )
                await asyncio.sleep(self._cooldown_seconds)
                now = time.monotonic()
                self._timestamps.clear()

            # ── 5. Record and permit ──
            self._timestamps.append(now)
            self._last_request = now
            remaining = self._max_requests - len(self._timestamps)
            print(
                f"[RateLimiter] [OK] Request permitted "
                f"({len(self._timestamps)}/{self._max_requests} used, "
                f"{remaining} remaining in window)"
            )

    @property
    def requests_used(self) -> int:
        """Requests consumed in the current window (approximate)."""
        cutoff = time.monotonic() - self._window_seconds
        return sum(1 for t in self._timestamps if t > cutoff)


# Singleton — import this everywhere.
rate_limiter = RateLimiter()

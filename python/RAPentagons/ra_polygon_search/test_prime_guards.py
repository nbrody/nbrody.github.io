"""Regression tests for invalid prime inputs that previously hung searches."""
from __future__ import annotations

import signal
import unittest

from .core import SearchConfig, generate_s_unit_norms, is_s_unit


class _Timeout(Exception):
    pass


def _call_with_timeout(seconds: float, fn, *args):
    def _handler(signum, frame):
        raise _Timeout()

    old = signal.signal(signal.SIGALRM, _handler)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        return fn(*args)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old)


class PrimeGuardTests(unittest.TestCase):
    def test_search_config_rejects_non_primes(self):
        with self.assertRaises(ValueError):
            SearchConfig(primes=(1, 2))
        with self.assertRaises(ValueError):
            SearchConfig(primes=(-2,))

    def test_is_s_unit_does_not_hang_on_one(self):
        self.assertFalse(_call_with_timeout(1.0, is_s_unit, 8, (1,)))
        self.assertFalse(_call_with_timeout(1.0, is_s_unit, 8, (1, 2)))

    def test_generate_s_unit_norms_skips_invalid_primes(self):
        self.assertEqual(_call_with_timeout(1.0, generate_s_unit_norms, (1,), 100), [1])
        self.assertEqual(
            _call_with_timeout(1.0, generate_s_unit_norms, (2,), 8),
            [1, 2, 4, 8],
        )


if __name__ == "__main__":
    unittest.main()

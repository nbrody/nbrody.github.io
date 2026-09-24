"""Regression: Mu algebraic specs must reject RCE payloads before sympy parse.

Run: python3 python/flashBeam/test_mu_safe_parse.py
"""
import sys
import types
import unittest

# algmu imports flint at module load; stub it so this guard test runs without
# a full python-flint install.
sys.modules.setdefault(
    "flint", types.SimpleNamespace(fmpz=object, fmpz_mat=object)
)

from algmu import Mu, _SAFE_ALG_SPEC  # noqa: E402


class MuSafeParseTests(unittest.TestCase):
    def test_reject_import_payload(self):
        payload = '__import__("os").system("touch /tmp/flashbeam_rce") or 1'
        self.assertIsNone(_SAFE_ALG_SPEC.fullmatch(payload))
        with self.assertRaises(ValueError) as ctx:
            Mu(payload)
        self.assertIn("unsupported algebraic mu spec", str(ctx.exception))

    def test_reject_builtins_attr(self):
        payload = '(1).__class__.__mro__[1].__subclasses__()'
        self.assertIsNone(_SAFE_ALG_SPEC.fullmatch(payload))
        with self.assertRaises(ValueError):
            Mu(payload)

    def test_rational_still_works(self):
        mu = Mu("3/2")
        self.assertEqual(mu.pretty, "3/2")
        self.assertEqual(mu.m, 2)

    def test_allowlist_accepts_documented_shapes(self):
        for spec in ("sqrt(2)", "sqrt(3)/2", "(1+sqrt(5))/2",
                     "x^3+x^2-2x-1", "x**2-2"):
            self.assertIsNotNone(
                _SAFE_ALG_SPEC.fullmatch(spec), f"should allow {spec!r}"
            )


if __name__ == "__main__":
    unittest.main()

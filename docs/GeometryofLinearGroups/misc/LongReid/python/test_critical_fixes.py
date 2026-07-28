#!/usr/bin/env python3
"""Regression tests for LongReid critical correctness fixes."""
from __future__ import annotations

import json
import os
import tempfile
import threading
import time
import unittest
from unittest import mock

import magnusCore as mc
from magnusCore import NumberField, magnus_generators, parse_poly


class MagnusGeneratorGuards(unittest.TestCase):
    def test_t_zero_raises_clear_error(self):
        for s in ('t', '0,1'):
            K = NumberField(parse_poly(s))
            with self.assertRaisesRegex(ValueError, r't = 0'):
                magnus_generators(K)

    def test_t_one_raises_clear_error(self):
        for s in ('t-1', '-1,1'):
            K = NumberField(parse_poly(s))
            with self.assertRaisesRegex(ValueError, r't = 1'):
                magnus_generators(K)

    def test_inv_zero_raises_value_error_not_stopiteration(self):
        K = NumberField([-1, -1, 1])
        with self.assertRaises(ValueError):
            K.inv(K.zero)


class ConcurrentDbUpdate(unittest.TestCase):
    def test_update_db_merges_concurrent_writers(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = tmp
            db_path = os.path.join(data_dir, 'integer_matrix_db.json')
            lock_path = os.path.join(data_dir, 'integer_matrix_db.lock')
            with mock.patch.object(mc, 'DATA_DIR', data_dir), \
                 mock.patch.object(mc, 'DB_PATH', db_path), \
                 mock.patch.object(mc, '_LOCK_PATH', lock_path):
                # Seed empty DB on disk.
                mc._write_db(mc.load_db(), 'seed')

                barrier = threading.Barrier(2)
                errors = []

                def writer(key, delay):
                    try:
                        def apply(db):
                            barrier.wait(timeout=5)
                            time.sleep(delay)  # force overlapping mutate windows
                            db['fields'][key] = {
                                'minpoly': [0, 1],
                                'label': key,
                                'matrices': [],
                                'search': {},
                                'status': 'found',
                            }

                        mc.update_db(apply, key)
                    except Exception as exc:  # pragma: no cover - surface in assert
                        errors.append(exc)

                t1 = threading.Thread(target=writer, args=('field-A', 0.05))
                t2 = threading.Thread(target=writer, args=('field-B', 0.05))
                t1.start(); t2.start()
                t1.join(timeout=10); t2.join(timeout=10)

                self.assertEqual(errors, [])
                with open(db_path) as fh:
                    final = json.load(fh)
                self.assertIn('field-A', final['fields'])
                self.assertIn('field-B', final['fields'])


if __name__ == '__main__':
    unittest.main()

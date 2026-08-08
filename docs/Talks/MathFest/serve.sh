#!/bin/bash
# Serve the MathFest talk locally — works with NO internet connection.
# Run this script, then open:  http://localhost:8764/Talks/MathFest/
cd "$(dirname "$0")/../.." && exec python3 -m http.server 8764

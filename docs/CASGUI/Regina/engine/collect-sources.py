#!/usr/bin/env python3
"""Print the engine source files Regina's CMake would compile.

Follows ADD_SUBDIRECTORY from engine/CMakeLists.txt and reads each
directory's `SET ( FILES ... )` list. Usage: collect-sources.py <regina>/engine
"""
import re
import sys
from pathlib import Path

SKIP = {"testsuite", "doxygen", "data", "swift", "checkdocs"}


def walk(d: Path, out: list):
    cm = d / "CMakeLists.txt"
    if not cm.exists():
        return
    text = re.sub(r"#.*", "", cm.read_text())
    m = re.search(r"SET\s*\(\s*FILES\s+(.*?)\)", text, re.S | re.I)
    if m:
        for name in m.group(1).split():
            if name.startswith("$"):
                continue
            p = d / name
            if not p.suffix:
                p = p.with_suffix(".cpp")
            out.append(p)
    for sub in re.findall(r"ADD_SUBDIRECTORY\s*\(\s*\"?([\w\-]+)\"?\s*\)", text, re.I):
        if sub not in SKIP:
            walk(d / sub, out)


files = []
walk(Path(sys.argv[1]).resolve(), files)
for f in files:
    print(f)

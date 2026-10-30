"""alphaPy's kernel inside Pyodide (webdemo/pykernel/worker.js runs this once
Python, numpy, matplotlib and python-flint are loaded). The same messages as
python/kernel/kernel_main.py, which this follows: requests arrive as JSON
strings through handle(); replies go to the page with postMessage."""
import json
import math
import os
import sys

sys.path.insert(0, '/kernel')
os.environ['MPLBACKEND'] = 'module://alphapy.mpl_backend'

from js import postMessage  # noqa: E402
from alphapy.runtime import Runtime  # noqa: E402


def _clean(x):
    if isinstance(x, float) and not math.isfinite(x):
        return str(x)
    if isinstance(x, dict):
        return {k: _clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_clean(v) for v in x]
    return x


def emit(msg):
    try:
        line = json.dumps(msg, allow_nan=False, default=str)
    except ValueError:
        line = json.dumps(_clean(msg), default=str)
    postMessage(line)


runtime = Runtime(emit)
try:
    import flint
    _flint = flint.__version__
except Exception:
    _flint = None
emit({'type': 'ready', 'python': sys.version.split()[0], 'flint': _flint})


def handle(raw):
    try:
        msg = json.loads(raw)
        kind = msg.get('type')
        if kind == 'sync':
            runtime.sync([{'id': str(c['id']), 'code': str(c.get('code', ''))} for c in msg.get('cells', [])])
        elif kind == 'run':
            runtime.run([str(i) for i in msg.get('ids', [])])
        elif kind == 'run_all':
            runtime.run_all()
        elif kind == 'ui':
            runtime.set_widget(str(msg.get('element')), msg.get('value'))
    except Exception as e:  # a bad request shouldn't end the kernel
        print(f'alphaPy kernel: {type(e).__name__}: {e}', file=sys.stderr, flush=True)
        emit({'type': 'idle'})

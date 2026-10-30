"""Running a whole notebook file without the page: `python notebook.py` (the
file's `app.run()`), and recorded runs in alphaCentaur's worker.

Cells run in dependency order with the same runtime as the live kernel. The
report prints each cell's console output and a text form of its result;
figures are saved as cell-N.png, and alphapy-outputs.json holds every cell's
status and output for the page.
"""
import base64
import json
import os
import re
import sys

from . import notebook
from .runtime import Runtime


def _text(output, index, saved):
    """A text form of an Output for the run log (figures are saved beside it)."""
    if output is None:
        return ''
    mime, data = output['mime'], output.get('data')
    if mime == 'image/png':
        name = f'cell-{index}' + (f'-{len(saved) + 1}' if saved else '') + '.png'
        saved.append(name)
        try:
            with open(name, 'wb') as f:
                f.write(base64.b64decode(data))
            return f'[figure saved as {name}]'
        except OSError:
            return '[figure]'
    if mime == 'application/vnd.alphapy.stack+json':
        return '\n'.join(filter(None, (_text(o, index, saved) for o in data.get('items', []))))
    if mime == 'application/vnd.alphapy.ui+json':
        return f"[{data.get('kind')} {data.get('label')!r} = {data.get('value')!r}]"
    if mime in ('text/html', 'image/svg+xml'):
        return f'[{mime} output, {len(data)} characters]'
    if mime == 'text/markdown' and output.get('callout'):
        return '\n'.join('> ' + line for line in _text({**output, 'callout': None}, index, saved).split('\n'))
    if mime == 'text/markdown' and output.get('elements'):
        # Widgets inside Markdown: their markers become the widgets' text form.
        elements = output['elements']
        return re.sub('ui:(ui\\d+)', lambda m: _text({'mime': 'application/vnd.alphapy.ui+json', 'data': elements[m[1]]}, index, saved)
                      if m[1] in elements else m[0], str(data))
    return str(data)


def run_file(path, report=True):
    """Run every cell of the notebook at path. Returns the number of cells that failed."""
    with open(path, encoding='utf-8') as f:
        source = f.read()
    cells = [{'id': f'cell{i + 1}', 'code': code, 'name': name} for i, (name, code) in enumerate(notebook.cells(source))]
    results, order = {}, {c['id']: i + 1 for i, c in enumerate(cells)}

    def emit(msg):
        if msg['type'] == 'console' and report:
            stream = sys.__stdout__ if msg['stream'] == 'stdout' else sys.__stderr__
            stream.write(msg['text'])
            stream.flush()
        elif msg['type'] == 'cell' and msg['status'] == 'running' and report:
            c = cells[order[msg['id']] - 1]
            label = f" ({c['name']})" if c['name'] != '_' else ''
            print(f"── cell {order[msg['id']]}{label} " + '─' * 40, file=sys.__stdout__, flush=True)
        elif msg['type'] == 'cell' and msg['status'] != 'running':
            results[msg['id']] = msg
            if not report:
                return
            text = _text(msg.get('output'), order[msg['id']], [])
            if text:
                print(text, file=sys.__stdout__, flush=True)
            if msg['status'] == 'error':
                err = msg['error'] or {}
                print(err.get('traceback') or f"{err.get('name')}: {err.get('message')}", file=sys.__stderr__, flush=True)
            elif msg['status'] in ('skipped', 'stopped', 'interrupted'):
                print(f"[{msg['status']}]", file=sys.__stdout__, flush=True)

    runtime = Runtime(emit)
    runtime.sync(cells)
    runtime.run_all()
    # A skipped cell isn't a failure itself: it follows an error (which counts)
    # or a deliberate mo.stop (which doesn't).
    failed = sum(1 for r in results.values() if r['status'] in ('error', 'interrupted'))
    skipped = sum(1 for r in results.values() if r['status'] == 'skipped')
    if report:
        try:
            with open('alphapy-outputs.json', 'w', encoding='utf-8') as f:
                json.dump({'cells': [{'name': c['name'], 'code': c['code'], **{k: results.get(c['id'], {}).get(k) for k in ('status', 'output', 'error', 'elapsed')}} for c in cells]},
                          f, default=str)
        except OSError:
            pass
        print(f"── {len(cells)} cells, {failed} failed{f', {skipped} skipped' if skipped else ''} " + '─' * 40, file=sys.__stdout__, flush=True)
    return failed


def run_app(app):
    """app.run() at the bottom of a notebook file: run the file it lives in."""
    main = sys.modules.get('__main__')
    path = getattr(main, '__file__', None)
    if not path or not os.path.exists(path):
        raise RuntimeError('app.run() runs a notebook file; this App was not started from one.')
    sys.exit(1 if run_file(path) else 0)

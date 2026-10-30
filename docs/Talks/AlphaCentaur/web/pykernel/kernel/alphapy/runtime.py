"""Running a notebook's cells, marimo-style.

The notebook's globals live in one namespace. Running a cell first removes
what it (and every cell that depends on it) defined, then runs them in
dependency order, so the namespace always matches running the notebook top to
bottom in that order: no hidden state from deleted or edited cells. A cell's
output is the value of its last expression; print() goes to its console.
A cell whose ancestor failed is skipped rather than run against stale values.
"""
import ast
import builtins
import linecache
import sys
import time
import traceback

from . import display, ui
from .graph import Graph


class _Console:
    """sys.stdout / sys.stderr while a cell runs: forwards text to the page in chunks."""

    def __init__(self, emit, cell, stream):
        self.emit, self.cell, self.stream = emit, cell, stream
        self.buffer, self.sent, self.last = [], 0, time.monotonic()

    def write(self, text):
        if not isinstance(text, str):
            text = str(text)
        self.buffer.append(text)
        if '\n' in text and time.monotonic() - self.last > 0.05 or sum(map(len, self.buffer)) > 4096:
            self.flush()
        return len(text)

    def flush(self):
        if not self.buffer:
            return
        text = ''.join(self.buffer)
        self.buffer = []
        self.last = time.monotonic()
        if self.sent > 1_000_000:
            return
        if self.sent + len(text) > 1_000_000:
            text = text[: 1_000_000 - self.sent] + '\n(console output truncated)\n'
        self.sent += len(text)
        self.emit({'type': 'console', 'id': self.cell, 'stream': self.stream, 'text': text})

    def isatty(self):
        return False

    @property
    def encoding(self):
        return 'utf-8'


class Runtime:
    def __init__(self, emit):
        self.emit = emit
        self.globals = {'__name__': '__main__', '__builtins__': builtins, '__doc__': None}
        self.codes = {}     # id -> code
        self.order = []
        self.graph = Graph([])
        self.status = {}    # id -> 'never' | 'done' | 'error' | 'skipped' | 'stopped' | 'interrupted'
        self.ran_code = {}  # id -> the code it last ran
        self.defined = {}   # id -> names it put into the namespace when it last ran
        self.widgets = {}   # id -> widgets the cell made when it last ran
        self.bindings = {}  # widget id -> (global name, defining cell)
        self.serial = 0

    # ------------------------------------------------------------ cells
    def sync(self, cells):
        """The notebook's cells, in order: [{id, code}]."""
        new_ids = [c['id'] for c in cells]
        for cid in list(self.codes):
            if cid not in new_ids:   # a deleted cell takes its names with it
                self._forget(cid)
                self.status.pop(cid, None)
                self.ran_code.pop(cid, None)
        self.codes = {c['id']: c['code'] for c in cells}
        self.order = new_ids
        for cid in new_ids:
            self.status.setdefault(cid, 'never')
        self.graph = Graph(cells)
        self.emit({'type': 'graph', 'cells': self.graph.summary()})

    def _forget(self, cid):
        for name in self.defined.pop(cid, ()):
            self.globals.pop(name, None)
        for w in self.widgets.pop(cid, ()):
            ui.registry.pop(w._id, None)
            self.bindings.pop(w._id, None)

    # ------------------------------------------------------------ running
    def run(self, ids, descendants=True):
        """Run ids, the cells that depend on them, and any ancestor that hasn't run."""
        ids = [i for i in ids if i in self.codes]
        targets = set(ids)
        if descendants:
            targets |= self.graph.descendants(ids)
        for cid in list(targets):
            for a in self.graph.ancestors(cid):
                if self.status.get(a) in ('never', 'interrupted') or self.ran_code.get(a) != self.codes.get(a):
                    targets.add(a)
        order = self.graph.topological(targets)
        self.emit({'type': 'queued', 'ids': order})
        failed = set()
        for i, cid in enumerate(order):
            if any(p in failed or self.status.get(p) in ('error', 'skipped', 'stopped') for p in self.graph.parents[cid]):
                self._forget(cid)
                self.status[cid] = 'skipped'
                failed.add(cid)
                self.emit({'type': 'cell', 'id': cid, 'status': 'skipped', 'output': None, 'error': None, 'elapsed': 0})
                continue
            state = self._run_cell(cid)
            if state == 'interrupted':
                for rest in order[i + 1:]:
                    self.status[rest] = 'interrupted'
                    self.emit({'type': 'cell', 'id': rest, 'status': 'interrupted', 'output': None, 'error': None, 'elapsed': 0})
                break
            if state != 'done':
                failed.add(cid)
        self.emit({'type': 'idle'})

    def run_all(self):
        self.run(list(self.order))

    def set_widget(self, element, value):
        """A widget moved: update it, then rerun the cells that use its variable."""
        w = ui.registry.get(element)
        if w is None:
            self.emit({'type': 'idle'})
            return
        try:
            w._update(value)
        except Exception:
            self.emit({'type': 'idle'})
            return
        name, owner = self.bindings.get(element, (None, None))
        users = [c for c in self.graph.children.get(owner, []) if name in self.graph.info[c]['refs']] if name else []
        if users:
            self.run(users)
        else:
            self.emit({'type': 'idle'})

    def _run_cell(self, cid):
        code = self.codes[cid]
        info = self.graph.info[cid]
        self._forget(cid)
        self.emit({'type': 'cell', 'id': cid, 'status': 'running'})
        if info['error']:
            self.status[cid] = 'error'
            self.ran_code[cid] = code
            err = info['error']
            self.emit({'type': 'cell', 'id': cid, 'status': 'error', 'output': None, 'elapsed': 0,
                       'error': {'name': {'syntax': 'SyntaxError', 'multiple-definitions': 'MultipleDefinitionError', 'cycle': 'CycleError'}[err['kind']],
                                 'message': err['message'], 'traceback': ''}})
            return 'error'
        self.serial += 1
        filename = f'<cell {self.order.index(cid) + 1}>'
        linecache.cache[filename] = (len(code), None, code.splitlines(True), filename)
        before = set(self.globals)
        ui.created.clear()
        out_stream, err_stream = _Console(self.emit, cid, 'stdout'), _Console(self.emit, cid, 'stderr')
        saved = sys.stdout, sys.stderr
        figures = _Figures()
        start = time.monotonic()
        output, error, state = None, None, 'done'
        try:
            sys.stdout, sys.stderr = out_stream, err_stream
            body, last = _split(code, filename)
            if body is not None:
                exec(body, self.globals)
            value = eval(last, self.globals) if last is not None else None
            output = _combine(figures.shown(), display.format_value(value) if value is not None else figures.leftover())
        except display.MarimoStopError as stop:
            state = 'stopped'
            output = display.format_value(stop.output)
        except KeyboardInterrupt:
            state = 'interrupted'
        except BaseException as e:  # SystemExit included: a cell can't end the kernel
            state = 'error'
            error = {'name': type(e).__name__, 'message': str(e), 'traceback': _traceback(e)}
        finally:
            sys.stdout, sys.stderr = saved
            out_stream.flush()
            err_stream.flush()
            figures.close()
        elapsed = time.monotonic() - start
        # What the cell defined (its analysis says which names; keep the ones that exist).
        self.defined[cid] = [n for n in info['defs'] if n in self.globals] + [n for n in set(self.globals) - before if n.startswith('_') and not n.startswith('__')]
        self.widgets[cid] = list(ui.created)
        for name in info['defs']:
            v = self.globals.get(name)
            if isinstance(v, ui.UIElement):
                self.bindings[v._id] = (name, cid)
        self.status[cid] = state
        self.ran_code[cid] = code
        if state == 'error':
            for name in self.defined[cid]:   # a failed cell defines nothing
                self.globals.pop(name, None)
        self.emit({'type': 'cell', 'id': cid, 'status': state, 'output': output, 'error': error, 'elapsed': round(elapsed, 3)})
        return state


def _split(code, filename):
    """(code to exec, last expression to eval): the last expression is the cell's output."""
    tree = ast.parse(code, filename, 'exec')
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        last = ast.Expression(tree.body.pop().value)
        body = compile(tree, filename, 'exec') if tree.body else None
        return body, compile(last, filename, 'eval')
    return compile(tree, filename, 'exec'), None


def _traceback(e):
    """The traceback from the cell's own code on (the runtime's frames left out)."""
    tb = traceback.TracebackException.from_exception(e)
    frames = [f for f in tb.stack if not f.filename.endswith(('alphapy/runtime.py', 'alphapy\\runtime.py'))]
    tb.stack = traceback.StackSummary.from_list(frames)
    return ''.join(tb.format())


_shown = None  # figures plt.show() captured for the running cell


def capture_figures():
    """plt.show(): the open figures become the running cell's output."""
    plt = sys.modules.get('matplotlib.pyplot')
    if plt is None or _shown is None:
        return
    for n in plt.get_fignums():
        _shown.append(display._figure_png(plt.figure(n)))
        plt.close(n)


class _Figures:
    """Figures a cell shows: what plt.show() captured, or else the last one it made."""

    def __init__(self):
        global _shown
        _shown = []
        plt = sys.modules.get('matplotlib.pyplot')
        self.before = set(plt.get_fignums()) if plt else set()

    def shown(self):
        return list(_shown or [])

    def leftover(self):
        plt = sys.modules.get('matplotlib.pyplot')
        if plt is None or _shown:
            return None
        new = [n for n in plt.get_fignums() if n not in self.before]
        return display._figure_png(plt.figure(new[-1])) if new else None

    def close(self):
        global _shown
        _shown = None
        plt = sys.modules.get('matplotlib.pyplot')
        if plt is not None:
            for n in plt.get_fignums():
                if n not in self.before:
                    plt.close(n)


def _combine(shown, value_output):
    items = [o for o in shown if o] + ([value_output] if value_output else [])
    if not items:
        return None
    if len(items) == 1:
        return items[0]
    return {'mime': 'application/vnd.alphapy.stack+json', 'data': {'direction': 'v', 'gap': 0.5, 'align': None, 'justify': None, 'items': items}}

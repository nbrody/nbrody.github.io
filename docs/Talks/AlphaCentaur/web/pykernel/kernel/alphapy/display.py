"""How a cell's result is shown: a value becomes an Output, {mime, data}.

The page draws text/plain, text/markdown (alphaMarkdown's renderer, with the
project's macros), text/html (in a sandboxed frame), image/png, image/svg+xml,
text/latex (KaTeX), widgets and stacks. Objects choose how they look the usual
ways: marimo's _mime_(), or IPython's _repr_html_/_repr_markdown_/
_repr_latex_/_repr_svg_/_repr_png_. matplotlib figures become PNGs.
"""
import base64
import io
import re

from . import ui

LIMIT = 4_000_000  # characters of output data per cell


class Html:
    """mo.Html(text): show HTML (in a sandboxed frame on the page)."""

    def __init__(self, text):
        self.text = str(text)

    def _mime_(self):
        return 'text/html', self.text

    def __repr__(self):
        return f'Html({self.text[:60]!r})'


class Markdown(Html):
    """mo.md(text): Markdown with math, rendered as alphaMarkdown renders notes."""

    def _mime_(self):
        return 'text/markdown', self.text

    def __format__(self, spec):
        return self.text

    def __str__(self):
        return self.text


def md(text):
    return Markdown(_dedent(str(text)))


def _dedent(text):
    """Markdown written inside an indented triple-quoted string."""
    lines = text.split('\n')
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    indents = [len(l) - len(l.lstrip()) for l in lines if l.strip()]
    cut = min(indents) if indents else 0
    return '\n'.join(l[cut:] for l in lines)


class Stack:
    def __init__(self, items, direction, gap=0.5, align=None, justify=None):
        self.items, self.direction, self.gap, self.align, self.justify = list(items), direction, gap, align, justify

    def _output(self):
        return {'mime': 'application/vnd.alphapy.stack+json', 'data': {
            'direction': self.direction, 'gap': self.gap, 'align': self.align, 'justify': self.justify,
            'items': [format_value(x) or {'mime': 'text/plain', 'data': ''} for x in self.items]}}


def hstack(items, gap=0.5, align=None, justify='start', **_):
    return Stack(items, 'h', gap, align, justify)


def vstack(items, gap=0.5, align=None, justify='start', **_):
    return Stack(items, 'v', gap, align, justify)


def as_html(value):
    """mo.as_html(value): a value shown the way a cell would show it."""
    out = format_value(value)
    return _Shown(out)


class _Shown:
    def __init__(self, output):
        self.output = output

    def _output(self):
        return self.output


class MarimoStopError(Exception):
    """mo.stop(...): end the cell here, showing `output` (and skip the cells that use it)."""

    def __init__(self, output=None):
        super().__init__('mo.stop')
        self.output = output


def stop(predicate, output=None):
    if predicate:
        raise MarimoStopError(output)


CALLOUT_KINDS = ('neutral', 'info', 'success', 'warn', 'danger')


class Callout(Markdown):
    """A highlighted note: Markdown drawn in a box tinted for its kind."""

    def __init__(self, text, kind):
        super().__init__(text)
        self.kind = kind if kind in CALLOUT_KINDS else 'neutral'

    def _output(self):
        return {**_markdown_with_widgets(self.text), 'callout': self.kind}


def callout(value, kind='neutral'):
    """mo.callout(value, kind): kind is neutral, info, success, warn or danger."""
    out = format_value(value)
    body = out['data'] if out and out['mime'] in ('text/markdown', 'text/plain') else str(value)
    return Callout(str(body), kind)


# ------------------------------------------------------------ formatting
def _figure_png(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=110, bbox_inches='tight')
    return {'mime': 'image/png', 'data': base64.b64encode(buf.getvalue()).decode('ascii')}


def _matplotlib_figure(value):
    """The figure behind a Figure, Axes, Artist, or a list of artists (e.g. plt.plot's result)."""
    import sys
    if 'matplotlib' not in sys.modules:
        return None
    try:
        from matplotlib.figure import Figure
        from matplotlib.artist import Artist
    except Exception:
        return None
    if isinstance(value, Figure):
        return value
    if isinstance(value, Artist):
        return value.get_figure()
    if isinstance(value, (list, tuple)) and value and all(isinstance(v, Artist) for v in value):
        return value[0].get_figure()
    return None


def _markdown_with_widgets(text):
    out = {'mime': 'text/markdown', 'data': text}
    ids = re.findall('ui:(ui\\d+)', text)
    if ids:
        out['elements'] = {i: ui.registry[i]._spec_json() for i in ids if i in ui.registry}
    return out


def format_value(value):
    """An Output for a value, or None for nothing to show."""
    if value is None:
        return None
    out = None
    if hasattr(value, '_output') and callable(value._output):
        out = value._output()
    elif hasattr(value, '_mime_') and callable(value._mime_):
        mime, data = value._mime_()
        out = _markdown_with_widgets(data) if mime == 'text/markdown' else {'mime': mime, 'data': data}
    else:
        fig = _matplotlib_figure(value)
        if fig is not None:
            out = _figure_png(fig)
    if out is None:
        out = _ipython_repr(value)
    if out is None:
        try:
            text = repr(value)
        except Exception as e:  # a broken __repr__ shouldn't sink the cell
            text = f'<{type(value).__name__} object: repr failed ({e})>'
        out = {'mime': 'text/plain', 'data': text}
    data = out.get('data')
    if isinstance(data, str) and len(data) > LIMIT:
        out = {'mime': 'text/plain', 'data': f'(output too large to show: {len(data):,} characters)'}
    return out


def _ipython_repr(value):
    for method, mime in (('_repr_html_', 'text/html'), ('_repr_markdown_', 'text/markdown'),
                         ('_repr_latex_', 'text/latex'), ('_repr_svg_', 'image/svg+xml'), ('_repr_png_', 'image/png')):
        fn = getattr(value, method, None)
        if not callable(fn):
            continue
        try:
            data = fn()
        except Exception:
            continue
        if data is None:
            continue
        if isinstance(data, tuple):  # (data, metadata)
            data = data[0]
        if mime == 'image/png' and isinstance(data, bytes):
            data = base64.b64encode(data).decode('ascii')
        if isinstance(data, bytes):
            data = data.decode('utf-8', 'replace')
        if mime == 'text/markdown':
            return _markdown_with_widgets(data)
        return {'mime': mime, 'data': data}
    return None

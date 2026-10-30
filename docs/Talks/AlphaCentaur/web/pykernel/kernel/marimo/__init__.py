"""alphaPy's `marimo`: the part of marimo's API alphaPy notebooks use.

Notebooks are marimo files (`app = marimo.App()`, `@app.cell` functions), so
they also open in marimo itself. Inside alphaPy this small module stands in
for marimo; nothing else needs installing. Supported: App (cell, run), md,
Html, as_html, hstack, vstack, stop, callout, and ui.slider / number /
checkbox / switch / dropdown / text / text_area / button.
"""
from alphapy import ui
from alphapy.display import Html, as_html, callout, hstack, md, stop, vstack
from alphapy.display import MarimoStopError  # noqa: F401

__version__ = 'alphaPy'
__all__ = ['App', 'Html', 'as_html', 'callout', 'hstack', 'md', 'stop', 'ui', 'vstack']


class App:
    """The notebook object. Cells register with @app.cell; app.run() runs the file."""

    def __init__(self, **config):
        self._config = config
        self._cells = []

    def cell(self, fn=None, **config):
        if fn is None:
            return lambda f: self.cell(f, **config)
        self._cells.append(fn)
        return fn

    def run(self):
        from alphapy.script import run_app
        return run_app(self)

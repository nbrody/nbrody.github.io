"""matplotlib backend for alphaPy (MPLBACKEND=module://alphapy.mpl_backend).

Figures draw with Agg; plt.show() hands them to the cell that is running, which
shows them above its own result (the way IPython's inline backend works).
"""
from matplotlib.backend_bases import FigureManagerBase as FigureManager  # noqa: F401
from matplotlib.backends.backend_agg import FigureCanvasAgg as FigureCanvas  # noqa: F401


def show(*args, **kwargs):
    from . import runtime
    runtime.capture_figures()

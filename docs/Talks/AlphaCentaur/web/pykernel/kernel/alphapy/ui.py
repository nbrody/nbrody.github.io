"""Interactive widgets: mo.ui.slider, number, checkbox, switch, dropdown, text,
text_area and button.

As in marimo, a widget assigned to a global variable is live: when someone moves
it, its value changes and the cells that use that variable run again. A widget
shows itself as a cell's output, or inside mo.md(f"... {widget} ...").
"""
import itertools
import math

_ids = itertools.count(1)
registry = {}      # widget id -> widget
created = []       # widgets made by the cell that is running (the runtime collects them)

MIME = 'application/vnd.alphapy.ui+json'
# Inside Markdown a widget is a private-use marker the page replaces.
def marker(element_id):
    return f'ui:{element_id}'


class UIElement:
    kind = 'element'

    def __init__(self, value, label='', **spec):
        self._id = f'ui{next(_ids)}'
        self._value = value
        self.label = str(label or '')
        self._spec = spec
        registry[self._id] = self
        created.append(self)

    @property
    def value(self):
        return self._value

    def _update(self, raw):
        """A new value from the page."""
        self._value = raw

    def _spec_json(self):
        return {'id': self._id, 'kind': self.kind, 'label': self.label, 'value': self._json_value(), **self._spec}

    def _json_value(self):
        return self._value

    def _mime_(self):
        return MIME, self._spec_json()

    def __format__(self, spec):
        return marker(self._id)

    def __str__(self):
        return marker(self._id)

    def __repr__(self):
        return f'<mo.ui.{self.kind} {self.label!r}: {self.value!r}>'


def _number(x, integer):
    x = float(x)
    if math.isnan(x):
        raise ValueError('not a number')
    return int(round(x)) if integer else x


class slider(UIElement):
    kind = 'slider'

    def __init__(self, start=0, stop=100, step=None, value=None, label='', show_value=True, full_width=False):
        integer = all(isinstance(v, int) and not isinstance(v, bool) for v in (start, stop, step if step is not None else 1))
        step = step if step is not None else (1 if integer else (stop - start) / 100)
        self._integer = integer
        value = start if value is None else value
        super().__init__(value, label, start=start, stop=stop, step=step, show_value=bool(show_value), full_width=bool(full_width))

    def _update(self, raw):
        v = _number(raw, self._integer)
        self._value = min(max(v, self._spec['start']), self._spec['stop'])


class number(UIElement):
    kind = 'number'

    def __init__(self, start=None, stop=None, step=1, value=None, label='', full_width=False):
        self._integer = all(v is None or (isinstance(v, int) and not isinstance(v, bool)) for v in (start, stop, step, value))
        value = (start if start is not None else 0) if value is None else value
        super().__init__(value, label, start=start, stop=stop, step=step, full_width=bool(full_width))

    def _update(self, raw):
        v = _number(raw, self._integer)
        if self._spec['start'] is not None:
            v = max(v, self._spec['start'])
        if self._spec['stop'] is not None:
            v = min(v, self._spec['stop'])
        self._value = v


class checkbox(UIElement):
    kind = 'checkbox'

    def __init__(self, value=False, label=''):
        super().__init__(bool(value), label)

    def _update(self, raw):
        self._value = bool(raw)


class switch(checkbox):
    kind = 'switch'


class dropdown(UIElement):
    """options: a list of strings, or a dict from shown text to value."""
    kind = 'dropdown'

    def __init__(self, options, value=None, label='', full_width=False):
        self._map = dict(options) if isinstance(options, dict) else {str(o): o for o in options}
        labels = list(self._map)
        if value is not None and value not in self._map:
            # A value given as one of the options' values.
            value = next((k for k, v in self._map.items() if v == value), None)
        super().__init__(value, label, options=labels, full_width=bool(full_width))

    @property
    def value(self):
        return None if self._value is None else self._map.get(self._value)

    @property
    def selected_key(self):
        return self._value

    def _update(self, raw):
        self._value = raw if raw in self._map else None


class text(UIElement):
    kind = 'text'

    def __init__(self, value='', label='', placeholder='', full_width=False):
        super().__init__(str(value), label, placeholder=str(placeholder), full_width=bool(full_width))

    def _update(self, raw):
        self._value = '' if raw is None else str(raw)


class text_area(text):
    kind = 'text_area'


class button(UIElement):
    """value starts at `value` (0); each click sets it to on_click(value), or value + 1."""
    kind = 'button'

    def __init__(self, label='Click', value=0, on_click=None, kind='neutral'):
        self._on_click = on_click
        super().__init__(value, label, tone=str(kind))

    def _update(self, raw):
        self._value = self._on_click(self._value) if self._on_click else (self._value or 0) + 1

    def _json_value(self):
        v = self._value
        return v if isinstance(v, (int, float, str, bool)) or v is None else repr(v)

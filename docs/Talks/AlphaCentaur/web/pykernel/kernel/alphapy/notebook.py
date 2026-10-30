"""Reading a marimo-format notebook file: its @app.cell functions as cells.

Each cell is the body of an `@app.cell` function, without its final `return`
(marimo writes the cell's definitions there; they're recomputed from the code).
The page splits files itself (python/js/format.js); this is for running a file
as a script and for recorded runs.
"""
import ast
import io
import textwrap
import tokenize


def _is_cell(decorator):
    target = decorator.func if isinstance(decorator, ast.Call) else decorator
    return isinstance(target, ast.Attribute) and target.attr == 'cell' and isinstance(target.value, ast.Name) and target.value.id == 'app'


def cells(source):
    """[(name, code)] for each @app.cell in the file, in order."""
    tree = ast.parse(source)
    lines = source.splitlines(True)
    # Where each function's `def ...:` header ends (it may span lines).
    tokens = list(tokenize.generate_tokens(io.StringIO(source).readline))
    header_end = {node: _header_end(tokens, node.lineno) for node in tree.body
                  if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and any(_is_cell(d) for d in node.decorator_list)}
    out = []
    for node in tree.body:
        if node not in header_end:
            continue
        body = list(node.body)
        if body and isinstance(body[-1], ast.Return):
            body.pop()
        code = ''
        if body:
            start, end = header_end[node], body[-1].end_lineno
            code = textwrap.dedent(''.join(lines[start:end])).strip('\n')
        out.append((node.name, code))
    return out


def _header_end(tokens, lineno):
    """The line of the `:` that ends the `def` starting at lineno."""
    depth, seen_def = 0, False
    for tok in tokens:
        if tok.start[0] < lineno:
            continue
        if not seen_def:
            seen_def = tok.type == tokenize.NAME and tok.string == 'def'
            continue
        if tok.type == tokenize.OP:
            if tok.string in '([{':
                depth += 1
            elif tok.string in ')]}':
                depth -= 1
            elif tok.string == ':' and depth == 0:
                return tok.start[0]
    return lineno

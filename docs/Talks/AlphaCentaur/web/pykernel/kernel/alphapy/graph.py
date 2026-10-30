"""Which names each cell defines and uses, and the dependency graph they make.

As in marimo, a cell *defines* the names it binds at its top level (assignments,
imports, def and class, for/with targets, walrus) and *uses* the names it reads
that it doesn't define itself. A cell that uses a name depends on the one cell
that defines it. Names starting with one underscore are private to their cell.

Top-level bindings come from walking the syntax tree (so a comprehension's loop
variable, which Python 3.12+ reports as a module-level symbol, stays local);
names read inside nested functions, lambdas and classes come from symtable,
which already knows which of them are global.
"""
import ast
import symtable


def private(name):
    return name.startswith('_')


class _TopLevel(ast.NodeVisitor):
    """Bindings and reads at a cell's top level (comprehensions included)."""

    def __init__(self):
        self.defs = []
        self.loads = []
        self.local = []  # comprehension scopes: their loop targets

    def bind(self, name):
        if self.local:
            return
        if name not in self.defs:
            self.defs.append(name)

    def read(self, name):
        if any(name in scope for scope in self.local):
            return
        self.loads.append(name)

    def target(self, node):
        if isinstance(node, ast.Name):
            self.bind(node.id)
        elif isinstance(node, (ast.Tuple, ast.List)):
            for elt in node.elts:
                self.target(elt)
        elif isinstance(node, ast.Starred):
            self.target(node.value)
        else:  # attribute or subscript: reads its base
            self.visit(node)

    # -- bindings
    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Store):
            self.bind(node.id)
        else:
            self.read(node.id)

    def visit_Assign(self, node):
        self.visit(node.value)
        for t in node.targets:
            self.target(t)

    def visit_AugAssign(self, node):
        self.visit(node.value)
        if isinstance(node.target, ast.Name):
            self.read(node.target.id)
            self.bind(node.target.id)
        else:
            self.visit(node.target)

    def visit_AnnAssign(self, node):
        if node.value is not None:
            self.visit(node.value)
            self.target(node.target)
        self.visit(node.annotation)

    def visit_For(self, node):
        self.visit(node.iter)
        self.target(node.target)
        for stmt in node.body + node.orelse:
            self.visit(stmt)

    visit_AsyncFor = visit_For

    def visit_With(self, node):
        for item in node.items:
            self.visit(item.context_expr)
            if item.optional_vars is not None:
                self.target(item.optional_vars)
        for stmt in node.body:
            self.visit(stmt)

    visit_AsyncWith = visit_With

    def visit_Import(self, node):
        for alias in node.names:
            self.bind(alias.asname or alias.name.split('.')[0])

    def visit_ImportFrom(self, node):
        for alias in node.names:
            if alias.name != '*':
                self.bind(alias.asname or alias.name)

    def visit_NamedExpr(self, node):
        self.visit(node.value)
        # A walrus inside a comprehension binds in the enclosing scope.
        saved, self.local = self.local, []
        self.target(node.target)
        self.local = saved

    def visit_ExceptHandler(self, node):
        if node.type is not None:
            self.visit(node.type)
        if node.name:
            self.bind(node.name)
        for stmt in node.body:
            self.visit(stmt)

    def visit_MatchAs(self, node):
        if node.pattern is not None:
            self.visit(node.pattern)
        if node.name:
            self.bind(node.name)

    def visit_MatchStar(self, node):
        if node.name:
            self.bind(node.name)

    def visit_MatchMapping(self, node):
        self.generic_visit(node)
        if node.rest:
            self.bind(node.rest)

    def visit_Delete(self, node):
        for t in node.targets:
            if isinstance(t, ast.Name):
                self.read(t.id)
            else:
                self.visit(t)

    # -- nested scopes: only what runs at the top level is visited here
    def visit_FunctionDef(self, node):
        for d in node.decorator_list:
            self.visit(d)
        for d in node.args.defaults + [d for d in node.args.kw_defaults if d is not None]:
            self.visit(d)
        self.bind(node.name)

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        for d in node.decorator_list + node.bases + [k.value for k in node.keywords]:
            self.visit(d)
        self.bind(node.name)

    def visit_Lambda(self, node):
        for d in node.args.defaults + [d for d in node.args.kw_defaults if d is not None]:
            self.visit(d)

    def _comprehension(self, node, elements):
        scope = set()
        self.local.append(scope)
        for i, gen in enumerate(node.generators):
            # The first iterable is evaluated outside the comprehension.
            if i == 0:
                saved, self.local = self.local, self.local[:-1]
                self.visit(gen.iter)
                self.local = saved
            else:
                self.visit(gen.iter)
            for name in _names(gen.target):
                scope.add(name)
            for cond in gen.ifs:
                self.visit(cond)
        for e in elements:
            self.visit(e)
        self.local.pop()

    def visit_ListComp(self, node):
        self._comprehension(node, [node.elt])

    visit_SetComp = visit_ListComp
    visit_GeneratorExp = visit_ListComp

    def visit_DictComp(self, node):
        self._comprehension(node, [node.key, node.value])


def _names(target):
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, (ast.Tuple, ast.List)):
        return [n for e in target.elts for n in _names(e)]
    if isinstance(target, ast.Starred):
        return _names(target.value)
    return []


def _nested_globals(table, defs, refs):
    """Names read (refs) or declared global and assigned (defs) inside nested scopes."""
    for child in table.get_children():
        for sym in child.get_symbols():
            name = sym.get_name()
            if not sym.is_global():
                continue
            if sym.is_declared_global() and sym.is_assigned():
                defs.append(name)
            elif sym.is_referenced():
                refs.append(name)
        _nested_globals(child, defs, refs)


def analyze(code):
    """(defs, refs) of one cell's code, each a sorted list. Raises SyntaxError."""
    tree = ast.parse(code, '<cell>', 'exec')
    top = _TopLevel()
    for stmt in tree.body:
        top.visit(stmt)
    defs, refs = list(top.defs), []
    _nested_globals(symtable.symtable(code, '<cell>', 'exec'), defs, refs)
    defined = set(defs)
    refs += [n for n in top.loads if n not in defined]
    keep = lambda n: not private(n)
    return sorted({n for n in defs if keep(n)}), sorted({n for n in refs if keep(n) and n not in defined})


class Graph:
    """The notebook's cells (in notebook order) with their dependencies.

    cells: {id: {'defs', 'refs', 'error'}}, order: [id]. parents[id] are the
    cells defining something id uses; children is the reverse.
    """

    def __init__(self, cells):
        self.order = [c['id'] for c in cells]
        self.info = {}
        for c in cells:
            try:
                defs, refs = analyze(c['code'])
                self.info[c['id']] = {'defs': defs, 'refs': refs, 'error': None}
            except SyntaxError as e:
                self.info[c['id']] = {'defs': [], 'refs': [], 'error': {
                    'kind': 'syntax', 'message': f'{e.msg}', 'line': e.lineno}}
        # Each name may be defined by one cell only.
        owners = {}
        for cid in self.order:
            for name in self.info[cid]['defs']:
                owners.setdefault(name, []).append(cid)
        for name, ids in owners.items():
            if len(ids) > 1:
                for cid in ids:
                    if not self.info[cid]['error']:
                        self.info[cid]['error'] = {'kind': 'multiple-definitions', 'message':
                            f'“{name}” is defined in more than one cell. Each name may be defined in one cell only; rename it or move the definitions together.'}
        self.owner = {name: ids[0] for name, ids in owners.items() if len(ids) == 1}
        self.parents = {cid: sorted({self.owner[r] for r in self.info[cid]['refs'] if r in self.owner and self.owner[r] != cid},
                                    key=self.order.index) for cid in self.order}
        self.children = {cid: [] for cid in self.order}
        for cid, ps in self.parents.items():
            for p in ps:
                self.children[p].append(cid)
        for cid in self._cycles():
            if not self.info[cid]['error']:
                self.info[cid]['error'] = {'kind': 'cycle', 'message':
                    'This cell is part of a cycle: it uses a name from a cell that, directly or indirectly, uses a name from it.'}

    def _cycles(self):
        """Cells on a dependency cycle (Tarjan's strongly connected components)."""
        index, low, stack, on, out, counter = {}, {}, [], set(), set(), [0]

        def strong(v):
            index[v] = low[v] = counter[0]
            counter[0] += 1
            stack.append(v)
            on.add(v)
            for w in self.children[v]:
                if w not in index:
                    strong(w)
                    low[v] = min(low[v], low[w])
                elif w in on:
                    low[v] = min(low[v], index[w])
            if low[v] == index[v]:
                comp = []
                while True:
                    w = stack.pop()
                    on.discard(w)
                    comp.append(w)
                    if w == v:
                        break
                if len(comp) > 1:
                    out.update(comp)

        for v in self.order:
            if v not in index:
                strong(v)
        return out

    def descendants(self, ids):
        seen, todo = set(), list(ids)
        while todo:
            for c in self.children.get(todo.pop(), []):
                if c not in seen:
                    seen.add(c)
                    todo.append(c)
        return seen

    def ancestors(self, cid):
        seen, todo = set(), [cid]
        while todo:
            for p in self.parents.get(todo.pop(), []):
                if p not in seen:
                    seen.add(p)
                    todo.append(p)
        return seen

    def topological(self, ids):
        """ids in an order where every cell comes after the cells it uses:
        at each step the earliest cell (in notebook order) whose inputs are ready."""
        ids = set(ids)
        done, out = set(), []
        pending = [c for c in self.order if c in ids]
        while pending:
            ready = next((c for c in pending if all(p in done or p not in ids for p in self.parents[c])), None)
            if ready is None:  # a cycle: the rest in notebook order (they will report it)
                out += pending
                break
            out.append(ready)
            done.add(ready)
            pending.remove(ready)
        return out

    def summary(self):
        return [{'id': cid, **self.info[cid], 'parents': self.parents[cid], 'children': self.children[cid]} for cid in self.order]

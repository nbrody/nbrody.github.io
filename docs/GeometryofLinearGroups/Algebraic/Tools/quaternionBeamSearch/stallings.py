"""
Stallings folding for finitely generated subgroups of the free group F_3 = <x,y,z>.

Alphabet convention (matches quaternions.LETTER):
    0:x  1:X(=x^-1)   2:y  3:Y   4:z  5:Z
with INV = {0<->1, 2<->3, 4<->5}.

Given generator words (lists of letter indices), we build the Stallings core
graph (an immersion of a wedge of circles into the rose) by adding each word as
a loop at the base vertex and folding.  The subgroup has finite index in F_3 iff
the folded graph is *complete*: every vertex has an outgoing edge for each of the
three positive generators (equivalently all 6 directed labels).  The index is
then the number of vertices.
"""

INV = {0: 1, 1: 0, 2: 3, 3: 2, 4: 5, 5: 4}
POS = (0, 2, 4)  # x, y, z


class Stallings:
    def __init__(self):
        # vertices are ints; edges[v][label] = neighbor (label in 0..5)
        self.edges = [dict()]      # vertex 0 is the basepoint
        self.parent = [0]          # union-find

    # --- union-find ------------------------------------------------------
    def find(self, v):
        while self.parent[v] != v:
            self.parent[v] = self.parent[self.parent[v]]
            v = self.parent[v]
        return v

    def _new_vertex(self):
        self.edges.append(dict())
        self.parent.append(len(self.parent))
        return len(self.parent) - 1

    # --- graph construction ---------------------------------------------
    def _set_edge(self, u, lab, w, pending):
        """Add directed edge u --lab--> w (and reverse), queue folds."""
        u, w = self.find(u), self.find(w)
        if lab in self.edges[u]:
            other = self.find(self.edges[u][lab])
            if other != w:
                pending.append((other, w))
        else:
            self.edges[u][lab] = w
        rl = INV[lab]
        if rl in self.edges[w]:
            other = self.find(self.edges[w][rl])
            if other != u:
                pending.append((other, u))
        else:
            self.edges[w][rl] = u

    def _merge(self, a, b, pending):
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        # merge rb into ra
        self.parent[rb] = ra
        for lab, w in list(self.edges[rb].items()):
            self._set_edge(ra, lab, self.find(w), pending)
        self.edges[rb] = dict()

    def add_word(self, word):
        cur = 0
        pending = []
        for lab in word:
            nxt = self._new_vertex()
            self._set_edge(cur, lab, nxt, pending)
            while pending:
                a, b = pending.pop()
                self._merge(a, b, pending)
            cur = self.find(nxt)
        # close the loop back to base
        self._merge(cur, 0, pending)
        while pending:
            a, b = pending.pop()
            self._merge(a, b, pending)

    # --- analysis --------------------------------------------------------
    def vertices(self):
        return sorted({self.find(v) for v in range(len(self.parent))})

    def is_complete(self):
        for v in self.vertices():
            e = self.edges[v]
            for lab in range(6):
                if lab not in e:
                    return False
        return True

    def index(self):
        """Return finite index, or None if incomplete (infinite index)."""
        verts = self.vertices()
        for v in verts:
            e = self.edges[v]
            if any(lab not in e for lab in range(6)):
                return None
        return len(verts)

    def stats(self):
        verts = self.vertices()
        n = len(verts)
        # number of edges (undirected): count positive-label edges
        edgecount = 0
        missing = 0
        for v in verts:
            e = self.edges[v]
            for lab in POS:
                if lab in e:
                    edgecount += 1
            for lab in range(6):
                if lab not in e:
                    missing += 1
        rank = edgecount - n + 1  # rank of free subgroup = E - V + 1
        return {"vertices": n, "edges": edgecount, "rank": rank,
                "missing_labels": missing}


def subgroup_index(words):
    """Build the Stallings graph for <words> and return (index_or_None, stats)."""
    S = Stallings()
    for w in words:
        S.add_word(list(w))
    return S.index(), S.stats(), S

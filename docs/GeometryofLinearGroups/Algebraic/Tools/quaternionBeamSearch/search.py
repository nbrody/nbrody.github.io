"""
Beam search exploring the group  G = <a, b>  with  a = 1+2i  (norm 5),
b = 3+2j  (norm 13),  inside the projective integer quaternions.

Strategy (see README):
  * G acts on the Bruhat-Tits tree T_13 of PGL_2(Q_13).  Here a is elliptic
    (norm 5 is a unit at 13, so a fixes the base vertex v0), while b is
    hyperbolic (it translates v0).
  * H5 := G n PH(Z[1/5]) is exactly the stabiliser Stab_G(v0): the elements of
    G whose reduced norm is (projectively) a power of 5.
  * We run a best-first / beam search over the orbit of v0 (ordered by tree
    distance n = v_13(norm), so we stay near v0).  Every "fold" -- a group
    element that maps an already-seen vertex onto another already-seen vertex --
    is a Schreier generator of H5.  We translate each one, via the LPS unique
    factorisation, into a reduced word in F_3 = PH(Z[1/5]) = <x,y,z>.
  * We feed those words into a Stallings graph.  When the graph becomes complete
    (every vertex saturated) the subgroup <found gens> has FINITE INDEX in F_3,
    which proves G contains a finite-index subgroup of PH(Z[1/5]).
"""

import heapq
from quaternions import Quat, ONE, lps_factor, word_str
from tree import PrimeTree
from stallings import Stallings

A = Quat(1, 2, 0, 0)
Ai = Quat(1, -2, 0, 0)
B = Quat(3, 0, 2, 0)
Bi = Quat(3, 0, -2, 0)
GENS = {"a": A, "A": Ai, "b": B, "B": Bi}


def is_pow5(q):
    n = int(q.primitive().norm())
    while n % 5 == 0:
        n //= 5
    return n == 1


class BeamSearch:
    def __init__(self, prime=13, precision=45, node_budget=200_000,
                 beam_width=None, verbose=True):
        self.T = PrimeTree(prime, precision)
        self.node_budget = node_budget
        self.beam_width = beam_width          # max frontier size (None = unbounded)
        self.verbose = verbose
        self.S = Stallings()
        self.h5_words = []                    # discovered F_3 words (reduced)
        self._seen_h5 = set()                 # dedup by canonical quaternion key

    def _add_h5(self, h):
        k = h.key()
        if k in self._seen_h5 or h.canonical() == ONE:
            return False
        self._seen_h5.add(k)
        _, word = lps_factor(h.primitive())
        if not word:
            return False
        self.h5_words.append(word)
        self.S.add_word(list(word))
        return True

    def run(self, report_every=10_000, confirm_nodes=8_000):
        """Run the beam search.

        Stops `confirm_nodes` after the Stallings graph first becomes complete,
        to confirm the index is stable (adding more H5 generators never lowers
        it -> the found subgroup really is finite index, not an artefact).
        """
        T = self.T
        v0 = T.vertex(ONE)
        trans = {v0: ONE}
        # priority queue keyed on tree distance n (explore shells near v0 first)
        heap = [(0, 0, v0)]
        counter = 1
        visited = 0
        first_complete = None
        while heap and visited < self.node_budget:
            if self.beam_width and len(heap) > self.beam_width:
                heap = heapq.nsmallest(self.beam_width, heap)
                heapq.heapify(heap)
            dist, _, v = heapq.heappop(heap)
            W = trans[v]
            visited += 1
            for L, g in GENS.items():
                gW = (g * W).primitive()
                v2 = T.vertex(gW)
                if v2 not in trans:
                    trans[v2] = gW.canonical()
                    heapq.heappush(heap, (dist if L in "aA" else dist + 1,
                                          counter, v2))
                    counter += 1
                else:
                    h = (trans[v2].conj() * gW).primitive()
                    if is_pow5(h):
                        self._add_h5(h)
            idx = self.S.index() if self.h5_words else None
            if idx is not None and first_complete is None:
                first_complete = (visited, idx)
                if self.verbose:
                    print(f"  >>> Stallings graph COMPLETE at visited={visited}: "
                          f"index = {idx}  (now confirming stability...)")
            if self.verbose and visited % report_every == 0:
                st = self.S.stats()
                print(f"  visited {visited:>8}  orbit {len(trans):>8}  "
                      f"H5 gens {len(self.h5_words):>6}  index={idx}  "
                      f"V={st['vertices']} miss={st['missing_labels']}")
            if first_complete and visited >= first_complete[0] + confirm_nodes:
                break
        res = self.report(visited, len(trans))
        res["first_complete_at"] = first_complete
        return res

    def report(self, visited, orbit):
        idx = self.S.index()
        st = self.S.stats()
        return {
            "visited": visited,
            "orbit_nodes": orbit,
            "h5_generators": len(self.h5_words),
            "stallings": st,
            "finite_index": idx,
        }


if __name__ == "__main__":
    import sys
    budget = int(sys.argv[1]) if len(sys.argv) > 1 else 200_000
    bs = BeamSearch(node_budget=budget)
    print(f"Beam search over <a,b>, a=1+2i (N=5), b=3+2j (N=13)")
    print(f"Target: finite-index subgroup of PH(Z[1/5]) = F_3 = <x,y,z>\n")
    res = bs.run()
    print("\n=== RESULT ===")
    for k, v in res.items():
        print(f"  {k}: {v}")
    if res["finite_index"]:
        print(f"\nPROVEN: <a,b> contains a subgroup of index {res['finite_index']} "
              f"in PH(Z[1/5]).")
    else:
        print("\nNot yet complete -- increase node_budget.")

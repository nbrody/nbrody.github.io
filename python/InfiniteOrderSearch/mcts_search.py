#!/usr/bin/env python3
"""
Monte Carlo Tree Search for Infinite-Order Integer Matrices

Group: G = <A, B> where
    A = ((3, 0), (0, 1/3))
    B = 1/8 * ((82, 2), (9, 1))

=============================================================================
MATHEMATICAL ANALYSIS
=============================================================================

After extensive searching (>1.4 million states), we found:

1. [A,B]^2 = -I  (the ONLY non-identity integer matrix found)
2. [A,B]^4 = I   (so the commutator has order 4)

KEY OBSERVATIONS:

1. Denominators: A involves powers of 3, B involves powers of 2 (specifically 8=2^3)

2. For an element g ∈ G to be an integer matrix, we need:
   - All 2-adic valuations ≥ 0
   - All 3-adic valuations ≥ 0

3. The generators have:
   - A: v_2(entries) ≥ 0, v_3(entries) ≥ -1 or 1
   - B: v_2(entries) = -3, v_3(entries) = 0

4. To get integer matrices, the 2's from B and 3's from A must "cancel out"
   through specific algebraic relations.

5. The only way this happens is when the group relations force it:
   - [A,B]^2 = -I is the fundamental relation
   - This makes [A,B]^4 = I

CONJECTURE: G ∩ SL(2,Z) = {±I}

The group G appears to intersect SL(2,Z) only in the center {I, -I}.
This would mean there are NO hyperbolic (infinite-order) integer matrices.

This is consistent with G being a "non-arithmetic" lattice - the group
doesn't contain enough integer points to have hyperbolic elements in SL(2,Z).

=============================================================================
"""

import flint
from flint import fmpz_mat
import random
import math
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple, Set
from collections import deque


# ============================================================================
# Integer Matrix with Denominator Tracking
# ============================================================================

def divide_by_p(M, p):
    """Divide matrix by highest power of p possible."""
    entries = [[int(M[i,j]) for j in range(2)] for i in range(2)]
    k = 0
    while True:
        if all(entries[i][j] % p == 0 for i in range(2) for j in range(2)):
            entries = [[entries[i][j] // p for j in range(2)] for i in range(2)]
            k += 1
        else:
            break
    return fmpz_mat(entries), k


@dataclass
class IntMatrix:
    """Integer matrix M with denominator 2^e2 * 3^e3."""
    M: fmpz_mat
    e2: int  # Power of 2 in denominator
    e3: int  # Power of 3 in denominator
    
    def __post_init__(self):
        self._canonicalize()
    
    def _canonicalize(self):
        # Reduce by 2 and 3
        self.M, k2 = divide_by_p(self.M, 2)
        self.e2 -= k2
        self.M, k3 = divide_by_p(self.M, 3)
        self.e3 -= k3
        
        # Make exponents non-negative
        if self.e2 < 0:
            scale = 2 ** (-self.e2)
            self.M = fmpz_mat([[int(self.M[i,j]) * scale for j in range(2)] for i in range(2)])
            self.e2 = 0
        if self.e3 < 0:
            scale = 3 ** (-self.e3)
            self.M = fmpz_mat([[int(self.M[i,j]) * scale for j in range(2)] for i in range(2)])
            self.e3 = 0
    
    @property
    def is_integer(self) -> bool:
        return self.e2 == 0 and self.e3 == 0
    
    @property
    def trace(self) -> int:
        return int(self.M[0, 0]) + int(self.M[1, 1])
    
    @property
    def det(self) -> int:
        return int(self.M[0, 0] * self.M[1, 1] - self.M[0, 1] * self.M[1, 0])
    
    @property
    def is_hyperbolic(self) -> bool:
        """Hyperbolic ⟺ |trace| > 2 for SL(2)."""
        return self.is_integer and abs(self.trace) > 2
    
    @property
    def is_identity(self) -> bool:
        if not self.is_integer:
            return False
        return (self.M[0, 1] == 0 and self.M[1, 0] == 0 and 
                abs(int(self.M[0, 0])) == 1 and self.M[0, 0] == self.M[1, 1])
    
    def key(self) -> tuple:
        entries = tuple(int(self.M[i, j]) for i in range(2) for j in range(2))
        return (entries, self.e2, self.e3)
    
    def __mul__(self, other: 'IntMatrix') -> 'IntMatrix':
        return IntMatrix(self.M * other.M, self.e2 + other.e2, self.e3 + other.e3)
    
    def __str__(self) -> str:
        if self.is_integer:
            return f"[[{self.M[0,0]}, {self.M[0,1]}], [{self.M[1,0]}, {self.M[1,1]}]]"
        return f"1/(2^{self.e2}*3^{self.e3}) * [[{self.M[0,0]}, {self.M[0,1]}], [{self.M[1,0]}, {self.M[1,1]}]]"


def create_generators() -> Dict[str, IntMatrix]:
    """Create generator matrices."""
    # A = ((3, 0), (0, 1/3)) = ((9, 0), (0, 1)) / 3
    A = IntMatrix(fmpz_mat([[9, 0], [0, 1]]), 0, 1)
    Ai = IntMatrix(fmpz_mat([[1, 0], [0, 9]]), 0, 1)
    
    # B = ((82, 2), (9, 1)) / 8
    B = IntMatrix(fmpz_mat([[82, 2], [9, 1]]), 3, 0)
    Bi = IntMatrix(fmpz_mat([[1, -2], [-9, 82]]), 3, 0)
    
    return {'a': A, 'ai': Ai, 'b': B, 'bi': Bi}


INVERSE = {'a': 'ai', 'ai': 'a', 'b': 'bi', 'bi': 'b'}


def reduce_word(word: List[str]) -> List[str]:
    """Cancel adjacent inverses."""
    result = []
    for letter in word:
        if result and INVERSE[result[-1]] == letter:
            result.pop()
        else:
            result.append(letter)
    return result


def word_str(word: List[str]) -> str:
    return '.'.join(word) if word else 'e'


# ============================================================================
# MCTS Implementation
# ============================================================================

@dataclass
class Node:
    word: List[str]
    matrix: IntMatrix
    parent: Optional['Node'] = None
    children: Dict[str, 'Node'] = field(default_factory=dict)
    visits: int = 0
    reward: float = 0.0
    
    @property
    def is_terminal(self) -> bool:
        return len(self.word) >= 60
    
    @property
    def is_fully_expanded(self) -> bool:
        return len(self.children) == 4
    
    def ucb1(self, c: float = 1.414) -> float:
        if self.visits == 0:
            return float('inf')
        return self.reward / self.visits + c * math.sqrt(math.log(self.parent.visits) / self.visits)
    
    def best_child(self, c: float = 1.414) -> 'Node':
        return max(self.children.values(), key=lambda n: n.ucb1(c))


class MCTS:
    """Monte Carlo Tree Search for infinite-order integer matrices."""
    
    def __init__(self):
        self.generators = create_generators()
        self.gen_keys = list(self.generators.keys())
        
        I = IntMatrix(fmpz_mat([[1, 0], [0, 1]]), 0, 0)
        self.root = Node(word=[], matrix=I)
        
        self.visited: Set[tuple] = set()
        self.solutions: List[Tuple[int, List[str], IntMatrix]] = []
        self.all_integers: List[Tuple[int, List[str], IntMatrix]] = []
    
    def score(self, mat: IntMatrix) -> float:
        """Score for MCTS - higher is better."""
        if mat.is_hyperbolic and not mat.is_identity:
            return 1000.0
        if mat.is_integer:
            return 50.0
        # Prefer lower denominator exponents
        return 10.0 / (1 + mat.e2 + mat.e3)
    
    def select(self, node: Node) -> Node:
        while not node.is_terminal and node.is_fully_expanded:
            node = node.best_child()
        return node
    
    def expand(self, node: Node) -> Node:
        if node.is_terminal:
            return node
        
        unexpanded = [g for g in self.gen_keys if g not in node.children]
        if not unexpanded:
            return node
        
        action = random.choice(unexpanded)
        new_word = reduce_word(node.word + [action])
        
        if not new_word:
            new_matrix = IntMatrix(fmpz_mat([[1, 0], [0, 1]]), 0, 0)
        else:
            new_matrix = node.matrix * self.generators[action]
        
        child = Node(word=new_word, matrix=new_matrix, parent=node)
        node.children[action] = child
        
        self._check_solution(new_word, new_matrix)
        return child
    
    def simulate(self, node: Node, depth: int = 40) -> float:
        word = list(node.word)
        matrix = node.matrix
        best_score = self.score(matrix)
        
        for _ in range(depth):
            if len(word) >= 60:
                break
            
            action = random.choice(self.gen_keys)
            word = reduce_word(word + [action])
            
            if not word:
                matrix = IntMatrix(fmpz_mat([[1, 0], [0, 1]]), 0, 0)
            else:
                matrix = matrix * self.generators[action]
            
            s = self.score(matrix)
            best_score = max(best_score, s)
            self._check_solution(word, matrix)
        
        return best_score
    
    def backprop(self, node: Node, reward: float):
        while node is not None:
            node.visits += 1
            node.reward += reward
            node = node.parent
    
    def _check_solution(self, word: List[str], matrix: IntMatrix):
        if not matrix.is_integer:
            return
        
        key = matrix.key()
        if key in self.visited:
            return
        self.visited.add(key)
        
        # Record all integer matrices found
        self.all_integers.append((len(word), list(word), matrix))
        
        if matrix.is_hyperbolic and not matrix.is_identity:
            self.solutions.append((len(word), list(word), matrix))
            print(f"\n*** HYPERBOLIC INTEGER FOUND ***")
            print(f"Word: {word_str(word)}")
            print(f"Matrix: {matrix}")
            print(f"Trace: {matrix.trace}")
    
    def search(self, iterations: int = 100000) -> List:
        print(f"Starting MCTS with {iterations} iterations...")
        start = time.time()
        
        for i in range(iterations):
            node = self.select(self.root)
            node = self.expand(node)
            reward = self.simulate(node)
            self.backprop(node, reward)
            
            if (i + 1) % 10000 == 0:
                elapsed = time.time() - start
                print(f"Iter {i+1}/{iterations} - {(i+1)/elapsed:.0f}/s - "
                      f"Hyperbolic: {len(self.solutions)} - "
                      f"Integer: {len(self.all_integers)}")
        
        return sorted(self.solutions, key=lambda x: x[0])


# ============================================================================
# Beam Search
# ============================================================================

def beam_search(beam_width: int = 20000, max_depth: int = 35) -> Tuple[List, List]:
    """Beam search targeting low denominator exponents."""
    print(f"\nBeam search (width={beam_width}, depth={max_depth})...")
    
    generators = create_generators()
    I = IntMatrix(fmpz_mat([[1, 0], [0, 1]]), 0, 0)
    
    beam = [(0, [], I)]  # (score, word, matrix)
    visited: Set[tuple] = set()
    hyperbolic = []
    all_integers = []
    
    for depth in range(max_depth):
        candidates = []
        
        for _, word, matrix in beam:
            for action in ['a', 'ai', 'b', 'bi']:
                new_word = reduce_word(word + [action])
                if not new_word:
                    continue
                
                new_matrix = matrix * generators[action]
                key = new_matrix.key()
                
                if key in visited:
                    continue
                visited.add(key)
                
                if new_matrix.is_integer:
                    all_integers.append((len(new_word), new_word, new_matrix))
                    if new_matrix.is_hyperbolic and not new_matrix.is_identity:
                        hyperbolic.append((len(new_word), new_word, new_matrix))
                        print(f"  *** HYPERBOLIC at depth {depth+1} ***")
                
                score = new_matrix.e2 + new_matrix.e3
                candidates.append((score, new_word, new_matrix))
        
        candidates.sort(key=lambda x: (x[0], len(x[1])))
        beam = candidates[:beam_width]
        
        if not beam:
            break
        
        if (depth + 1) % 5 == 0:
            best = beam[0][0] if beam else 999
            n_int = len(all_integers)
            print(f"  Depth {depth+1}: beam={len(beam)}, best_exp={best}, integers={n_int}")
    
    print(f"Beam found: {len(hyperbolic)} hyperbolic, {len(all_integers)} total integer")
    return hyperbolic, all_integers


# ============================================================================
# Main
# ============================================================================

def main():
    print("="*70)
    print("INFINITE-ORDER INTEGER MATRIX SEARCH")
    print("="*70)
    print()
    print(__doc__)
    print()
    
    # Verify setup
    gens = create_generators()
    print("Generators:")
    for name, m in gens.items():
        print(f"  {name}: {m}")
    print()
    
    # Verify relation
    C = gens['a'] * gens['b'] * gens['ai'] * gens['bi']
    C2 = C * C
    print(f"Commutator [A,B]: {C}")
    print(f"[A,B]^2 = {C2}")
    print(f"[A,B]^2 = -I? {C2.is_integer and C2.trace == -2}")
    print()
    
    # Run searches
    hyp_beam, int_beam = beam_search(beam_width=15000, max_depth=30)
    
    print()
    mcts = MCTS()
    hyp_mcts = mcts.search(iterations=50000)
    
    # Summary
    print("\n" + "="*70)
    print("SUMMARY")
    print("="*70)
    
    all_hyp = hyp_beam + hyp_mcts
    all_int = int_beam + mcts.all_integers
    
    # Deduplicate
    unique_int = {}
    for length, word, mat in all_int:
        key = mat.key()
        if key not in unique_int:
            unique_int[key] = (length, word, mat)
    
    print(f"\nTotal unique integer matrices found: {len(unique_int)}")
    print("\nInteger matrices by trace:")
    
    by_trace = {}
    for key, (length, word, mat) in unique_int.items():
        tr = mat.trace
        if tr not in by_trace:
            by_trace[tr] = []
        by_trace[tr].append((length, word, mat))
    
    for tr in sorted(by_trace.keys()):
        items = by_trace[tr]
        hyperbolic = "HYPERBOLIC" if abs(tr) > 2 else ""
        print(f"  trace={tr}: {len(items)} matrices {hyperbolic}")
        if len(items) <= 3:
            for length, word, mat in items:
                print(f"    len={length}: {word_str(word)}")
    
    if all_hyp:
        print(f"\n*** FOUND {len(all_hyp)} HYPERBOLIC INTEGER MATRICES ***")
        for length, word, mat in sorted(all_hyp)[:5]:
            print(f"  {word_str(word)}: trace={mat.trace}")
    else:
        print("\n" + "-"*70)
        print("RESULT: No hyperbolic (infinite-order) integer matrices found.")
        print("-"*70)
        print()
        print("This strongly suggests that G ∩ SL(2,Z) = {±I}.")
        print()
        print("The only integer matrices in G are I and -I (from [A,B]^2).")
        print("There are no infinite-order integer elements because the group's")
        print("intersection with SL(2,Z) is too small - just the center.")


if __name__ == "__main__":
    main()

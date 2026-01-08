import heapq
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Tuple, Any, Set

@dataclass
class Node:
    """
    Generic node for the FlashBeam search.
    state: The mathematical object (e.g., matrix).
    identifier: Human readable label (e.g., word string).
    score: Lower is better.
    """
    state: Any
    identifier: str
    score: float

    def __hash__(self):
        # We assume the generic solver shouldn't hash the node directly
        # but rather ask the problem definition for a hash key.
        return hash(self.identifier)

class SearchProblem(ABC):
    """
    Abstract Base Class defining the interface for a domain-specific problem.
    """
    
    @abstractmethod
    def get_initial_node(self) -> Node:
        pass

    @abstractmethod
    def get_generators(self) -> List[Node]:
        pass

    @abstractmethod
    def combine(self, node_a: Node, node_b: Node) -> Node:
        """Combine two nodes (e.g., matrix multiplication)."""
        pass

    @abstractmethod
    def get_hash_key(self, node: Node) -> Tuple:
        """Return a hashable tuple representing the unique state of the node."""
        pass

    @abstractmethod
    def is_solution(self, node: Node) -> bool:
        """Return True if this node meets the target criteria."""
        pass
    
    @abstractmethod
    def is_nontrivial(self, node: Node) -> bool:
        """Filter out trivial identities or short cycles."""
        pass

    @abstractmethod
    def format_score(self, node: Node) -> str:
        """Return a string representation of the score for logging."""
        pass

class FlashBeam:
    def __init__(self, 
                 problem: SearchProblem, 
                 beam_width: int = 5000, 
                 flash_size: int = 50, 
                 max_iterations: int = 1000, 
                 max_solutions: int = 1):
        self.problem = problem
        self.beam_width = beam_width
        self.flash_size = flash_size
        self.max_iterations = max_iterations
        self.max_solutions = max_solutions

    def solve(self):
        # Initialization
        root = self.problem.get_initial_node()
        generators = self.problem.get_generators()
        
        # Current Beam: Starts with Root + Generators
        current_beam = [root] + generators
        
        # Visited set: based on problem-specific hash key
        visited = {self.problem.get_hash_key(root)}
        for n in generators:
            visited.add(self.problem.get_hash_key(n))
        
        # Persistent Flash: Initialize with generators
        persistent_flash = list(generators)
        
        found_solutions = []
        
        print(f"Starting Persistent FlashBeam (Beam: {self.beam_width}, Global Flash: {self.flash_size})")
        start_time = time.monotonic()

        for i in range(self.max_iterations):
            # 1. Create Expansion Pool (Flash + Generators)
            expansion_pool = []
            seen_uids = set()
            
            # We combine persistent flash and generators, prioritizing flash, but ensuring uniqueness
            source_pool = persistent_flash + generators
            for n in source_pool:
                uid = self.problem.get_hash_key(n)
                if uid not in seen_uids:
                    expansion_pool.append(n)
                    seen_uids.add(uid)

            # Logging
            top_flash_words = [n.identifier for n in expansion_pool[:5]]
            top_flash_scores = [self.problem.format_score(n) for n in expansion_pool[:5]]
            print(f"Flash Words (top 5): {top_flash_words} ...")
            print(f"Flash Scores: {top_flash_scores}")

            avg_len = sum(len(n.identifier.replace(' ', '').split('.')) for n in current_beam if n.identifier) / max(1, len(current_beam))
            print(f"\nIteration {i}: Frontier {len(current_beam)} (Avg Len {avg_len:.1f}), Expansion Pool {len(expansion_pool)}")

            next_candidates = []
            
            # 2. Expand: Beam x Pool
            for b_idx, b_node in enumerate(current_beam):
                if b_idx % 1000 == 0 and b_idx > 0:
                    print(f"  ... {b_idx}/{len(current_beam)} frontier nodes expanded")
                for f_node in expansion_pool:
                    
                    # Domain specific combination
                    child = self.problem.combine(b_node, f_node)
                    
                    # Uniqueness Check
                    uid = self.problem.get_hash_key(child)
                    if uid in visited:
                        continue
                    visited.add(uid)
                    
                    # Solution Check
                    if self.problem.is_solution(child):
                        if self.problem.is_nontrivial(child):
                             # Calculate word length for reporting
                            word_len = len(child.identifier.split(' . ')) if child.identifier else 0
                            if word_len > 1:
                                print(f"\nSOLUTION FOUND (Length {word_len})")
                            
                            found_solutions.append(child)
                            
                            if len(found_solutions) >= self.max_solutions:
                                print(f"\nReached MAX_SOLUTIONS ({self.max_solutions}). Stopping.")
                                return found_solutions

                    next_candidates.append(child)

            if not next_candidates:
                print(f"Iteration {i}: No new points found.")
                break

            # 3. Update Beam: Keep top N best scores
            if len(next_candidates) > self.beam_width:
                current_beam = heapq.nsmallest(self.beam_width, next_candidates, key=lambda x: x.score)
            else:
                next_candidates.sort(key=lambda x: x.score)
                current_beam = next_candidates

            # 4. Update Persistent Flash: Best N globally seen nodes that are NOT solutions
            # (Excluding score 0 prevents flash from being filled with trivial identities)
            full_history = persistent_flash + current_beam
            full_history.sort(key=lambda x: x.score)
            
            persistent_flash = []
            seen_persistent = set()
            for n in full_history:
                if n.score < 1e-10:
                    continue
                uid = self.problem.get_hash_key(n)
                if uid not in seen_persistent:
                    persistent_flash.append(n)
                    seen_persistent.add(uid)
                    if len(persistent_flash) >= self.flash_size:
                        break
            
            best_node = current_beam[0]
            elapsed = time.monotonic() - start_time
            print(f"Iter {i} Complete: Best Score {self.problem.format_score(best_node)} | Total Visited {len(visited)} | Time {elapsed:.1f}s")

        print("\nSearch complete.")
        return found_solutions
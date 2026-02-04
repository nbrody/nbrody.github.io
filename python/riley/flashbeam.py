import heapq
import time
from typing import List, Tuple, Any, Set

class FlashBeam:
    def __init__(self, 
                 problem, 
                 beam_width: int = 200, 
                 flash_size: int = 20, 
                 max_iterations: int = 100):
        self.problem = problem
        self.beam_width = beam_width
        self.flash_size = flash_size
        self.max_iterations = max_iterations

    def solve(self, callback=None):
        root = self.problem.get_initial_node()
        generators = self.problem.get_generator_nodes()
        
        current_beam = [root] + generators
        visited = {self.problem.get_hash_key(root)}
        for n in generators:
            visited.add(self.problem.get_hash_key(n))
        
        persistent_flash = list(generators)
        found_solutions = []
        
        for i in range(self.max_iterations):
            expansion_pool = []
            seen_uids = set()
            source_pool = persistent_flash + generators
            for n in source_pool:
                uid = self.problem.get_hash_key(n)
                if uid not in seen_uids:
                    expansion_pool.append(n)
                    seen_uids.add(uid)

            if callback:
                callback({'iteration': i, 'beam_size': len(current_beam), 'best_score': current_beam[0].score if current_beam else 0})

            next_candidates = []
            for b_node in current_beam:
                for f_node in expansion_pool:
                    # Avoid trivial backtracking if possible
                    # (Simplified: just rely on visited set)
                    child = self.problem.combine(b_node, f_node)
                    
                    uid = self.problem.get_hash_key(child)
                    if uid in visited:
                        continue
                    visited.add(uid)
                    
                    if self.problem.is_solution(child):
                        if self.problem.is_nontrivial(child):
                            found_solutions.append(child)
                            if callback:
                                callback({
                                    'node': child,
                                    'found_solution': {
                                        'word': child.identifier,
                                        'score': child.score,
                                        'rel_poly': str(self.problem.get_relation_polynomial(child))
                                    }
                                })
                            # We keep going to find more solutions
                    
                    next_candidates.append(child)

            if not next_candidates:
                break

            if len(next_candidates) > self.beam_width:
                current_beam = heapq.nsmallest(self.beam_width, next_candidates, key=lambda x: x.score)
            else:
                next_candidates.sort(key=lambda x: x.score)
                current_beam = next_candidates

            # Update Flash
            full_history = persistent_flash + current_beam
            full_history.sort(key=lambda x: x.score)
            persistent_flash = []
            seen_p = set()
            for n in full_history:
                if n.score < 1e-10: continue
                uid = self.problem.get_hash_key(n)
                if uid not in seen_p:
                    persistent_flash.append(n)
                    seen_p.add(uid)
                    if len(persistent_flash) >= self.flash_size: break
        
        return found_solutions

from hurwitz import HurwitzQuaternion
import argparse
import sys
# Try to import Beam Search utils if available or implement simple one
import time

def invert_word(word):
    if not word: return ""
    tokens = word.split('.')
    inverted = []
    for t in reversed(tokens):
        if t.endswith("^{-1}"):
            inverted.append(t[:-5]) # Remove ^{-1}
        else:
            inverted.append(t + "^{-1}")
    return ".".join(inverted)

def is_inverse(t1, t2):
    return t1 == t2 + "^{-1}" or t2 == t1 + "^{-1}"

def find_relations(quats, beam_width=100, depth=20, filter_commutator=False):
    gens = []
    # Projective mode: Always add likely inverses (conjugates) and primitize
    for i, q in enumerate(quats):
        q = q.primitize()
        label = chr(ord('a') + i)
        gens.append((q, label))
        
        n = q.norm()
        if n != 0:
            q_inv = q.conjugate().primitize()
            gens.append((q_inv, label + "^{-1}"))
    
    start_q = HurwitzQuaternion(2,0,0,0)
    # State: (quaternion, last_label_token, full_word_string)
    beam = [(start_q, None, "")] 
    # Store word used to reach q
    seen = {start_q: ""}
    
    for d in range(1, depth + 1):
        candidates = []
        for curr_q, last_tok, curr_word in beam:
            for gen_q, gen_label in gens:
                # Robust backtracking check
                is_trivial = False
                if last_tok:
                    if is_inverse(last_tok, gen_label):
                        is_trivial = True
                if is_trivial:
                    continue
                
                # Filter Commutator [a,b] pattern logic
                if filter_commutator and curr_word:
                    tokens = curr_word.split('.')
                    if len(tokens) >= 3:
                        u, v, w = tokens[-3], tokens[-2], tokens[-1]
                        if is_inverse(u, w) and is_inverse(v, gen_label):
                            continue
                     
                prod = curr_q * gen_q
                if prod.norm() == 0: continue 
                
                new_q = prod.primitize()
                new_word = f"{curr_word}.{gen_label}" if curr_word else gen_label
                
                # Check for -Identity explicitly to report -1
                if new_q.a == -2 and new_q.b == 0 and new_q.c == 0 and new_q.d == 0:
                     # This is a collision with Identity conceptually but value is -1
                     # Identity is in seen as "". invert("") is "".
                     # So new_word = -1.
                     yield (new_word, "-1")
                
                if new_q in seen:
                    # Collision detected!
                    old_word = seen[new_q]
                    inv_old = invert_word(old_word)
                    
                    # Relation: new_word * old_word^-1 = 1
                    # Handle empty strings carefully
                    if inv_old:
                        rel = f"{new_word}.{inv_old}"
                    else:
                        rel = new_word
                        
                    yield (rel, "1")
                else:
                    # Not seen, add to candidates
                    dist = (new_q.a - 2)**2 + new_q.b**2 + new_q.c**2 + new_q.d**2
                    candidates.append((int(dist), new_q, gen_label, new_word))
                    seen[new_q] = new_word
        
        if not candidates: break
        
        candidates.sort(key=lambda x: x[0])
        
        # Yield progress
        if candidates:
            best = candidates[0]
            # best is (dist, new_q, gen_label, new_word)
            yield ("progress", {
                'depth': d, 
                'best_word': best[3], 
                'dist': best[0],
                'best_quat': str(best[1])
            })
            
        # Only keep `beam_width` BEST candidates to continue expanding
        beam = [(c[1], c[2], c[3]) for c in candidates[:beam_width]]
        if not beam: break

def solve(quats, beam_width=100, depth=20, filter_commutator=False):
    for res, val in find_relations(quats, beam_width, depth, filter_commutator):
        if res == "progress":
            continue
        if res is None:
            print(val)
        else:
            print(f"FOUND RELATION: {res} = {val}")

def main():
    print("Enter quaternions (one per line). Empty line to start search.")
    qs = []
    while True:
        try:
            line = input("> ").strip()
            if not line: break
            q = HurwitzQuaternion.from_string(line)
            qs.append(q)
            print(f"Added {q}")
        except Exception as e:
            print(f"Error: {e}")
            
    if not qs:
        print("No quaternions entered.")
        return
        
    solve(qs)

if __name__ == "__main__":
    main()

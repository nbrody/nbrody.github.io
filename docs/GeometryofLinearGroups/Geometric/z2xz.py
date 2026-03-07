import flint
from flint import fmpq_mat, fmpq

def matrix_distance(M, I):
    """
    Heuristic scoring function: computes the L1-norm distance 
    from the current matrix M to the Identity matrix I.
    """
    score = 0.0
    for i in range(3):
        for j in range(3):
            val = M[i, j]
            
            # Safely convert fmpq to a Python float
            try:
                # Extract numerator (.p) and denominator (.q) as integers
                num = int(val.p)
                den = int(val.q)
                val_float = num / den
            except AttributeError:
                # Fallback just in case your flint version hides .p and .q
                s = str(val)
                if '/' in s:
                    n, d = s.split('/')
                    val_float = int(n) / int(d)
                else:
                    val_float = float(s)
            
            # Target is 1.0 on the diagonal, 0.0 elsewhere
            target = 1.0 if i == j else 0.0
            score += abs(val_float - target)
            
    return score

def is_valid_extension(word, new_char):
    """
    Prunes trivial cancellations and enforces a canonical order 
    for the commuting generators 'a' and 'b'.
    """
    if not word:
        return True
        
    last_char = word[-1]
    
    if last_char.lower() == new_char.lower() and last_char != new_char:
        return False
        
    if last_char in ['b', 'B'] and new_char in ['a', 'A']:
        return False
        
    return True

def format_word(word):
    """
    Formats a generator word for display:
    - Lowercase letters (generators) stay as-is: a, b, t
    - Uppercase letters (inverses) become lowercase + 'i': A -> ai, B -> bi, T -> ti
    - Letters are joined with dots
    e.g. 'abtB' -> 'a.b.t.bi'
    """
    parts = []
    for ch in word:
        if ch.isupper():
            parts.append(ch.lower() + 'i')
        else:
            parts.append(ch)
    return '.'.join(parts)

def beam_search_relation(k=1, max_depth=15, beam_width=100):
    # 1. Define generators using FLINT's exact rational matrix type
    a = fmpq_mat([[2, 0, 0], 
                  [0, fmpq(1, 4), 0], 
                  [0, 0, 2]])
    b = fmpq_mat([[fmpq(1, 4), 0, 0], 
                  [0, 2, 0], 
                  [0, 0, 2]])
    
    M = fmpq_mat([[6, 3, 2], 
                  [3, 2, 1], 
                  [2, 1, 1]])
    t = M**k
    
    # 3x3 Identity matrix in fmpq format
    I = fmpq_mat([[1, 0, 0], 
                  [0, 1, 0], 
                  [0, 0, 1]])
    
    # Pre-compute inverses natively in FLINT
    alphabet = {
        'a': a, 'A': a.inv(),
        'b': b, 'B': b.inv(),
        't': t, 'T': t.inv()
    }
    
    beam = [(0.0, "", I)]
    
    print(f"Starting FLINT beam search for k={k} (max depth: {max_depth}, beam width: {beam_width})...")
    
    for depth in range(1, max_depth + 1):
        next_beam = []
        
        for _, word, current_matrix in beam:
            for char, matrix in alphabet.items():
                if is_valid_extension(word, char):
                    new_word = word + char
                    # Exact rational matrix multiplication via FLINT C-backend
                    new_matrix = current_matrix * matrix
                    
                    if new_matrix == I:
                        if 't' in new_word.lower():
                            print(f"\nSUCCESS! Found alternating relation at depth {depth}:")
                            print(f"Word: {format_word(new_word)}")
                            return new_word
                    
                    score = matrix_distance(new_matrix, I)
                    next_beam.append((score, new_word, new_matrix))
        
        next_beam.sort(key=lambda x: x[0])
        beam = next_beam[:beam_width]
        
        best_score = beam[0][0]
        print(f"Depth {depth} complete. Best heuristic score: {best_score:.4f} (Word: {format_word(beam[0][1])})")
        
    print(f"\nNo relations found up to depth {max_depth}.")
    return None

if __name__ == "__main__":
    beam_search_relation(k=2, max_depth=300, beam_width=50000)
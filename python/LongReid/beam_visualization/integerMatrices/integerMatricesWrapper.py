import json
import time
from flint import fmpz
from integerMatrices import IntegerMatrixSearch

# Configuration
T_VALUES = range(2, 51)  # Search T from 2 to 50
OUTPUT_FILE = "integer_matrices.jsonl"
MAX_ITERATIONS = 150   # User requested limit
BEAM_WIDTH = 10000     # User requested beam width

def run_wrapper():
    print(f"Starting wrapper for T values: {list(T_VALUES)}")
    print(f"Saving results incrementally to {OUTPUT_FILE}")
    
    # clear file
    with open(OUTPUT_FILE, 'w') as f:
        pass

    for t_val in T_VALUES:
        print(f"\n--- Running for T = {t_val} ---")
        
        count = 0
        def save_result(word):
            nonlocal count
            if count >= 100:
                return

            result = {
                "t_param": int(t_val),
                "word": word
            }
            with open(OUTPUT_FILE, 'a') as f:
                f.write(json.dumps(result) + "\n")
            count += 1

        solver = IntegerMatrixSearch(t_val, beam_width=BEAM_WIDTH, max_iterations=MAX_ITERATIONS)
        found_words = solver.search(callback=save_result)
        
        print(f"Finished T={t_val}. Found {len(found_words)} words.")

    print(f"\nSearch complete.")

if __name__ == "__main__":
    run_wrapper()

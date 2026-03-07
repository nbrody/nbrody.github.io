import json

with open("relation_db.json", "r") as f:
    db = json.load(f)

db["t=2"] = {
    "description": "t = 2 (Unipotent Specialization causing Solvable Baumslag-Solitar artifact)",
    "min_poly": [2, -1],
    "degree": 1,
    "matrix_size": 3,
    "is_unit": False,
    "relations": [
        {
            "word": "y X y x X y x y y X X y x x X y x Y x Y X Y X X Y X X X Y X Y X Y X Y x y x X X Y X X X Y x X y x y x y x y X X Y X Y X Y Y",
            "length": 62,
            "iteration": 1,
            "time": 0.0,
            "note": "Numerical BAUMSLAG-SOLITAR artifact relation for t=2. Solves U^-1 (W U^-1) U = (W U^-1)^64 identically due to float collapse."
        }
    ],
    "search_params": {
        "beam_width": 2500,
        "flash_size": 10,
        "max_iters": 500
    }
}

db["t=1+i"] = {
    "description": "t = 1+i (Specialization folding complex coefficients to exactly 0+0i roots)",
    "min_poly": [2, -2, 1],
    "degree": 2,
    "matrix_size": 6,
    "is_unit": False,
    "relations": [
        {
            "word": "x x x Y x Y X X Y X Y X Y X X Y X Y X X Y x Y x x x Y x",
            "length": 28,
            "iteration": 1,
            "time": 0.0,
            "note": "Exact upper-triangular matrix specifically when evaluated at t=1+i. The Laurent polynomials identically sum to 0+0i at this complex root, though they are large and non-zero generally."
        }
    ],
    "search_params": {
        "beam_width": 20000,
        "flash_size": 0,
        "max_iters": 150
    }
}

with open("relation_db.json", "w") as f:
    json.dump(db, f, indent=2)

print("Updated relation_db.json with t=2 and t=1+i specializations.")

import time
from dataclasses import dataclass
from typing import List, Tuple

import torch

P = 5

# -----------------------------
# CPU: Laurent / matrix constructors (dense window [-E..E])
# poly is int32 vec length K=2E+1, index (e+E) is coeff of t^e
# -----------------------------

def modp(x: torch.Tensor, p: int = P) -> torch.Tensor:
    return ((x % p) + p) % p

def laurent_zero(E: int) -> torch.Tensor:
    return torch.zeros((2 * E + 1,), dtype=torch.int32)

def laurent_one(E: int) -> torch.Tensor:
    v = laurent_zero(E)
    v[E] = 1
    return v

def laurent_monomial(E: int, exp: int, coeff: int) -> torch.Tensor:
    v = laurent_zero(E)
    idx = exp + E
    if 0 <= idx < v.numel():
        v[idx] = coeff % P
    return v

def laurent_neg(a: torch.Tensor) -> torch.Tensor:
    return modp(-a)

def mat_poly_mul_cpu(E: int, A: torch.Tensor, B: torch.Tensor) -> torch.Tensor:
    # A,B: (d,d,K), dense convolution in window [-E..E]
    d = A.shape[0]
    K = A.shape[2]
    C = torch.zeros((d, d, K), dtype=torch.int32)
    for i in range(d):
        for j in range(d):
            acc = torch.zeros((K,), dtype=torch.int32)
            for k in range(d):
                a = A[i, k]
                b = B[k, j]
                out = torch.zeros((K,), dtype=torch.int32)
                for ii in range(K):
                    ai = int(a[ii].item())
                    if ai == 0:
                        continue
                    jj0 = -ii + E  # so jj = m + jj0
                    if jj0 >= 0:
                        out[:K-jj0] += ai * b[jj0:K]
                    else:
                        out[-jj0:K] += ai * b[:K+jj0]
                acc += out
            C[i, j] = modp(acc)
    return C

def mat_poly_eye(E: int, d: int) -> torch.Tensor:
    K = 2 * E + 1
    I = torch.zeros((d, d, K), dtype=torch.int32)
    one = laurent_one(E)
    for i in range(d):
        I[i, i] = one
    return I

def burau_B4_reduced_sigma_poly(E: int):
    K = 2 * E + 1
    one = laurent_one(E)
    t = laurent_monomial(E, 1, 1)
    tm1 = laurent_monomial(E, -1, 1)

    minus_t = laurent_neg(t)
    minus_tm1 = laurent_neg(tm1)

    s1 = torch.zeros((3, 3, K), dtype=torch.int32)
    s1[0, 0] = minus_t
    s1[0, 1] = t
    s1[1, 1] = one
    s1[2, 2] = one

    s1i = torch.zeros((3, 3, K), dtype=torch.int32)
    s1i[0, 0] = minus_tm1
    s1i[0, 1] = one
    s1i[1, 1] = one
    s1i[2, 2] = one

    s2 = torch.zeros((3, 3, K), dtype=torch.int32)
    s2[0, 0] = one
    s2[1, 0] = one
    s2[1, 1] = minus_t
    s2[1, 2] = t
    s2[2, 2] = one

    s2i = torch.zeros((3, 3, K), dtype=torch.int32)
    s2i[0, 0] = one
    s2i[1, 0] = tm1
    s2i[1, 1] = minus_tm1
    s2i[1, 2] = one
    s2i[2, 2] = one

    s3 = torch.zeros((3, 3, K), dtype=torch.int32)
    s3[0, 0] = one
    s3[1, 1] = one
    s3[2, 1] = one
    s3[2, 2] = minus_t

    s3i = torch.zeros((3, 3, K), dtype=torch.int32)
    s3i[0, 0] = one
    s3i[1, 1] = one
    s3i[2, 1] = tm1
    s3i[2, 2] = minus_tm1

    return s1, s2, s3, s1i, s2i, s3i

def birman_F2_generators_burau(E: int) -> torch.Tensor:
    s1, s2, s3, s1i, s2i, s3i = burau_B4_reduced_sigma_poly(E)
    X = mat_poly_mul_cpu(E, s3, s1i)
    Y = mat_poly_mul_cpu(E, mat_poly_mul_cpu(E, mat_poly_mul_cpu(E, s2, s3), s1i), s2i)
    Xi = mat_poly_mul_cpu(E, s1, s3i)
    Yi = mat_poly_mul_cpu(E, mat_poly_mul_cpu(E, mat_poly_mul_cpu(E, s2, s1), s3i), s2i)
    gens = torch.stack([X, Y, Xi, Yi], dim=0)
    return modp(gens).contiguous()

# -----------------------------
# PyTorch Native: expand beam (CPU / MPS / CUDA)
# -----------------------------

def beam_expand_pytorch(states: torch.Tensor, gens: torch.Tensor, E: int):
    # states: (B, 3, 3, K)
    # gens: (G, 3, 3, K)
    B = states.shape[0]
    G = gens.shape[0]
    K = 2 * E + 1
    d = 3
    
    device = states.device

    C = torch.zeros((B, G, 3, 3, K), dtype=torch.int32, device=device)

    S = states.view(B, 1, 3, 3, K)
    G_mat = gens.view(1, G, 3, 3, K)

    # Compute Convolution
    for ii in range(K):
        shift = E - ii
        
        shifted_G = torch.zeros_like(G_mat)
        if shift > 0:
            shifted_G[..., :-shift] = G_mat[..., shift:]
        elif shift < 0:
            shifted_G[..., -shift:] = G_mat[..., :shift]
        else:
            shifted_G = G_mat

        shifted_G = shifted_G.unsqueeze(2) # (1, G, 1, k=3, j=3, K)
        
        S_ii = S[..., ii].view(B, 1, 3, 3, 1, 1) # (B, 1, i=3, k=3, 1, 1)
        G_b = shifted_G.view(1, G, 1, 3, 3, K)   # (1, G, 1, k=3, j=3, K)
        
        C_part = S_ii * G_b
        C += C_part.sum(dim=3)

    C = modp(C)

    # Compute Scores
    # score count bad nonzeros
    nz = (C != 0)
    scores = torch.zeros((B, G), dtype=torch.int32, device=device)
    
    # Off-diagonal: i != j
    # We can use mask
    i_idx = torch.arange(3, device=device).view(1, 1, 3, 1, 1)
    j_idx = torch.arange(3, device=device).view(1, 1, 1, 3, 1)
    off_diag = (i_idx != j_idx)
    diag = (i_idx == j_idx)
    
    m_idx = torch.arange(K, device=device).view(1, 1, 1, 1, K)
    bad_deg = (m_idx != E) & nz
    
    # Add off-diagonal bad elements
    # sum over i, j, m
    off_diag_bad = (nz & off_diag).sum(dim=(2, 3, 4))
    scores += off_diag_bad.to(torch.int32)
    
    # Add diagonal bad degrees
    diag_bad_deg = (bad_deg & diag).sum(dim=(2, 3, 4))
    scores += diag_bad_deg.to(torch.int32)
    
    # Diagonal term at E check
    c0 = C[..., E] # (B, G, 3, 3)
    c0_bad = (c0 != 1) & diag.squeeze(-1) # -> true if diag and not 1
    scores += (c0_bad.sum(dim=(2, 3)) * 5).to(torch.int32)
    
    return C.view(B * G, -1), scores.view(-1)


# -----------------------------
# Beam search driver
# -----------------------------

@dataclass
class BeamConfig:
    max_depth: int = 18
    beam_size: int = 2048
    forbid_backtrack: bool = True
    # use mps if on mac, cpu otherwise (or cuda)
    device: str = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")
    report_every: int = 1

ALPHABET = ["X", "Y", "X^-1", "Y^-1"]
INV = {0: 2, 2: 0, 1: 3, 3: 1}

def decode_word(letters: List[int]) -> str:
    return " ".join(ALPHABET[a] for a in letters)

def is_identity_laurent(mat: torch.Tensor, E: int) -> bool:
    d = mat.shape[0]
    K = mat.shape[2]
    if K != 2 * E + 1:
        return False
    for i in range(d):
        for j in range(d):
            v = mat[i, j]
            if i == j:
                if int(v[E].item()) % P != 1:
                    return False
                if torch.count_nonzero(modp(v.clone()).scatter_(0, torch.tensor([E]), torch.tensor([0]))).item() != 0:
                    return False
            else:
                if torch.count_nonzero(v).item() != 0:
                    return False
    return True

def beam_search_birman_F2_laurent(cfg: BeamConfig):
    device = cfg.device
    d = 3
    G = 4
    E = cfg.max_depth
    K = 2 * E + 1

    gens = birman_F2_generators_burau(E)  # (4,3,3,K) CPU
    gens_gpu = gens.to(device=device, dtype=torch.int32).contiguous()

    B = cfg.beam_size
    stride = d * d * K

    I = mat_poly_eye(E, d).view(-1).to(torch.int32)
    states = I.repeat(B, 1).to(device)
    scores = torch.full((B,), 10**9, device=device, dtype=torch.int32)
    scores[0] = 0

    parents: List[torch.Tensor] = []
    last_letter: List[torch.Tensor] = []
    last_move = torch.full((B,), -1, device=device, dtype=torch.int32)

    print(f"[info] Ring: F_5[t,t^-1], window [-E..E], E={E}, K={K}")
    print(f"[info] Beam search via PyTorch ({device.upper()} native).")
    print(f"[info] max_depth={cfg.max_depth}, beam_size={B}, forbid_backtrack={cfg.forbid_backtrack}")

    for depth in range(1, cfg.max_depth + 1):
        # Format states for pytorch execution
        states_reshaped = states.view(B, 3, 3, K)
        
        cand, cand_scores = beam_expand_pytorch(states_reshaped, gens_gpu, E)

        if cfg.forbid_backtrack:
            parent_idx = torch.arange(B * G, device=device, dtype=torch.int32) // G
            move = torch.arange(B * G, device=device, dtype=torch.int32) % G
            bad = (last_move[parent_idx] >= 0) & (move == torch.tensor([INV[int(x)] for x in range(G)],
                                                                      device=device, dtype=torch.int32)[last_move[parent_idx]])
            cand_scores = torch.where(bad, torch.full_like(cand_scores, 10**9), cand_scores)

        # Select top B
        top_scores, top_idx = torch.topk(-cand_scores, k=B)
        top_idx = top_idx.to(torch.int64)
        new_states = cand.index_select(0, top_idx)
        new_scores = cand_scores.index_select(0, top_idx)

        parent = (top_idx // G).to(torch.int32)
        move = (top_idx % G).to(torch.int32)

        parents.append(parent.detach().cpu())
        last_letter.append(move.detach().cpu())

        states = new_states
        scores = new_scores
        last_move = move.to(device)

        hit_positions = (scores == 0).nonzero(as_tuple=False).flatten()
        if hit_positions.numel() > 0:
            bpos = int(hit_positions[0].item())
            mat_cpu = states[bpos].detach().cpu().view(d, d, K)
            if is_identity_laurent(mat_cpu, E):
                letters = []
                cur = bpos
                for lvl in range(depth - 1, -1, -1):
                    mv = int(last_letter[lvl][cur].item())
                    letters.append(mv)
                    cur = int(parents[lvl][cur].item())
                letters.reverse()
                print(f"[HIT] depth={depth}  word = {decode_word(letters)}")
                return

        if (depth % cfg.report_every) == 0:
            best = int(scores.min().item())
            print(f"[progress] depth={depth} best_score={best}")

    print("[done] no identity found up to max_depth")

if __name__ == "__main__":
    beam_search_birman_F2_laurent(BeamConfig(max_depth=100, beam_size=2048))

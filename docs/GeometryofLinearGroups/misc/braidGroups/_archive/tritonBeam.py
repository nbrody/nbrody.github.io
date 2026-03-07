# beam_burau_B4_birmanF2_laurent_mod5_triton.py
# pip install torch triton

import time
from dataclasses import dataclass
from typing import List, Tuple

import torch
import triton
import triton.language as tl

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
                # convolution with window: out[k] += sum_i a[i] b[k-i+E]
                out = torch.zeros((K,), dtype=torch.int32)
                for ii in range(K):
                    ai = int(a[ii].item())
                    if ai == 0:
                        continue
                    jj0 = -ii + E  # so jj = m + jj0
                    # jj = m - ii + E; implement via slicing
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

# -----------------------------
# Reduced Burau B4 over F5[t,t^-1], plus inverses (hardcoded, exact)
# -----------------------------

def burau_B4_reduced_sigma_poly(E: int):
    K = 2 * E + 1
    one = laurent_one(E)
    t = laurent_monomial(E, 1, 1)
    tm1 = laurent_monomial(E, -1, 1)

    minus_t = laurent_neg(t)
    minus_tm1 = laurent_neg(tm1)

    # s1, s1^{-1}
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

    # s2, s2^{-1}
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

    # s3, s3^{-1}
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

    # X = s3 * s1^{-1}
    X = mat_poly_mul_cpu(E, s3, s1i)

    # Y = s2 * s3 * s1^{-1} * s2^{-1}
    Y = mat_poly_mul_cpu(E, mat_poly_mul_cpu(E, mat_poly_mul_cpu(E, s2, s3), s1i), s2i)

    # Inverses via group inverse formulas:
    # X^{-1} = s1 * s3^{-1}
    Xi = mat_poly_mul_cpu(E, s1, s3i)

    # Y^{-1} = (s2 s3 s1^{-1} s2^{-1})^{-1} = s2 * s1 * s3^{-1} * s2^{-1}
    Yi = mat_poly_mul_cpu(E, mat_poly_mul_cpu(E, mat_poly_mul_cpu(E, s2, s1), s3i), s2i)

    gens = torch.stack([X, Y, Xi, Yi], dim=0)
    return modp(gens).contiguous()  # (4,3,3,K), int32 CPU

# -----------------------------
# Triton: expand beam by multiplying each state by each generator (Laurent mod 5)
# and compute a score = number of "bad" nonzero coefficients (lower is better).
# "bad" = off-diagonal coeffs (any degree) + diagonal coeffs except the constant term at degree 0.
# -----------------------------

@triton.jit
def beam_expand_laurent_mod5_kernel(
    states_ptr,   # int32*, (B, d*d*K)
    gens_ptr,     # int32*, (G, d*d*K)
    cand_ptr,     # int32*, (B*G, d*d*K)
    score_ptr,    # int32*, (B*G,)
    B: tl.constexpr,
    G: tl.constexpr,
    d: tl.constexpr,
    K: tl.constexpr,
    E: tl.constexpr,
    stride_s0: tl.constexpr,   # d*d*K
    stride_g0: tl.constexpr,   # d*d*K
    stride_c0: tl.constexpr,   # d*d*K
):
    pid = tl.program_id(0)  # candidate id in [0, B*G)
    if pid >= B * G:
        return

    b = pid // G
    g_id = pid - b * G

    m = tl.arange(0, K)  # coeff index vector

    def mod5_vec(x):
        xf = x.to(tl.float32)
        q = tl.math.floor(xf * 0.2)
        y = x - q.to(tl.int32) * 5
        y = tl.where(y >= 5, y - 5, y)
        y = tl.where(y < 0, y + 5, y)
        return y

    # helper: load Laurent poly (entry_id, vector length K)
    def load_state(entry_id):
        base = b * stride_s0 + entry_id * K
        return tl.load(states_ptr + base + m).to(tl.int32)

    def load_gen(entry_id, jj):  # jj is vector indices into K
        base = g_id * stride_g0 + entry_id * K
        mask = (jj >= 0) & (jj < K)
        return tl.load(gens_ptr + base + jj, mask=mask, other=0).to(tl.int32)

    # Compute C = S @ G
    # Layout entry_id = i*d + j
    # For each (i,j), cij[m] = sum_k sum_ii s_ik[ii] * g_kj[m-ii+E]
    score_acc = tl.zeros((), tl.int32)

    for i in tl.static_range(0, d):
        for j in tl.static_range(0, d):
            cij = tl.zeros([K], tl.int32)
            for k in tl.static_range(0, d):
                s_ik = load_state(i * d + k)  # vector length K
                g_kj_entry = k * d + j
                for ii in tl.static_range(0, K):
                    ai = s_ik[ii]
                    jj = m - ii + E
                    gij = load_gen(g_kj_entry, jj)
                    cij += ai * gij
            cij = mod5_vec(cij)

            # store candidate entry
            out_entry = i * d + j
            out_base = pid * stride_c0 + out_entry * K
            tl.store(cand_ptr + out_base + m, cij)

            # score contribution: count "bad" nonzeros
            # - off-diagonal: all degrees are bad
            # - diagonal: only degree 0 (index E) should be 1, others should be 0
            nz = (cij != 0)
            if i != j:
                score_acc += tl.sum(nz.to(tl.int32))
            else:
                # diagonal: degrees != 0 are bad if nonzero
                bad_deg = (m != E) & nz
                score_acc += tl.sum(bad_deg.to(tl.int32))
                # also penalize if constant term isn't 1
                c0 = cij[E]
                score_acc += tl.where(c0 == 1, 0, 5).to(tl.int32)

    tl.store(score_ptr + pid, score_acc)

# -----------------------------
# Beam search driver
# -----------------------------

@dataclass
class BeamConfig:
    max_depth: int = 18
    beam_size: int = 2048
    # optional: disallow immediate backtracking (g followed by g^{-1})
    forbid_backtrack: bool = True
    device: str = "cuda"
    # print hits
    report_every: int = 1

ALPHABET = ["X", "Y", "X^-1", "Y^-1"]
INV = {0: 2, 2: 0, 1: 3, 3: 1}

def decode_word(letters: List[int]) -> str:
    return " ".join(ALPHABET[a] for a in letters)

def is_identity_laurent(mat: torch.Tensor, E: int) -> bool:
    # mat: (d,d,K) on CPU
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
    gens_gpu = gens.to(device=device, dtype=torch.int32).contiguous().view(-1)

    # Beam states: (B, d*d*K)
    B = cfg.beam_size
    stride = d * d * K

    # Initialize with identity only; fill rest with identity (cheap) and score with big number
    I = mat_poly_eye(E, d).view(-1).to(torch.int32)
    states = I.repeat(B, 1).to(device)
    scores = torch.full((B,), 10**9, device=device, dtype=torch.int32)
    scores[0] = 0

    # For reconstruction, store parent pointers and last letter per depth for the *selected* beam
    parents: List[torch.Tensor] = []
    last_letter: List[torch.Tensor] = []

    # Track last move for backtrack pruning
    last_move = torch.full((B,), -1, device=device, dtype=torch.int32)

    cand = torch.empty((B * G, stride), device=device, dtype=torch.int32)
    cand_scores = torch.empty((B * G,), device=device, dtype=torch.int32)

    print(f"[info] Ring: F_5[t,t^-1], window [-E..E], E={E}, K={K}")
    print(f"[info] Beam search in Birman F2 (X,Y) via reduced Burau(B4).")
    print(f"[info] max_depth={cfg.max_depth}, beam_size={B}, forbid_backtrack={cfg.forbid_backtrack}")

    for depth in range(1, cfg.max_depth + 1):
        # Expand all beam states by all generators
        grid = (B * G,)
        beam_expand_laurent_mod5_kernel[grid](
            states, gens_gpu, cand, cand_scores,
            B=B, G=G, d=d, K=K, E=E,
            stride_s0=stride,
            stride_g0=stride,
            stride_c0=stride,
            num_warps=1,
        )

        # Optional: prune immediate backtracks (g then g^{-1}) by setting score huge
        if cfg.forbid_backtrack:
            # candidate pid corresponds to parent b=pid//G and move g=pid%G
            parent_idx = torch.arange(B * G, device=device, dtype=torch.int32) // G
            move = torch.arange(B * G, device=device, dtype=torch.int32) % G
            bad = (last_move[parent_idx] >= 0) & (move == torch.tensor([INV[int(x)] for x in range(G)],
                                                                      device=device, dtype=torch.int32)[last_move[parent_idx]])
            cand_scores = torch.where(bad, torch.full_like(cand_scores, 10**9), cand_scores)

        # Select top B
        top_scores, top_idx = torch.topk(-cand_scores, k=B)  # maximize -score
        top_idx = top_idx.to(torch.int64)  # indexing
        new_states = cand.index_select(0, top_idx)
        new_scores = cand_scores.index_select(0, top_idx)

        # Parent and move for reconstruction
        parent = (top_idx // G).to(torch.int32)
        move = (top_idx % G).to(torch.int32)

        parents.append(parent.detach().cpu())
        last_letter.append(move.detach().cpu())

        states = new_states
        scores = new_scores

        last_move = move.to(device)

        # Check for any exact identities in the beam (score==0 is a strong hint, but not sufficient;
        # however with our scoring, true identity gives score 0.)
        hit_positions = (scores == 0).nonzero(as_tuple=False).flatten()
        if hit_positions.numel() > 0:
            # reconstruct first hit
            bpos = int(hit_positions[0].item())
            # pull matrix to CPU for verification
            mat_cpu = states[bpos].detach().cpu().view(d, d, K)
            if is_identity_laurent(mat_cpu, E):
                # reconstruct word
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
    beam_search_birman_F2_laurent(BeamConfig(max_depth=16, beam_size=2048))
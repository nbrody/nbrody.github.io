# Khet Self-Play Training

AlphaZero-style training for the Khet laser-chess web game. Self-play with
neural-network-guided MCTS produces `(board, policy, value)` samples; the
network is trained on them; the result is exported to the compact JSON the
browser AI loads.

**The web AI uses the *small* network** (`model_small.py` / `KhetNetSmall`):
its policy head is convolutional (12 actions per cell), which is exactly what
`js/nn.js` runs. Train and export with `train_small.py`. (`model.py` is a larger
FC-policy variant that is **not** compatible with the web inference engine.)

## Setup

```bash
python3 -m venv .venv
.venv/bin/python -m pip install torch numpy
```

## Train

```bash
# Fast end-to-end smoke test (parallel self-play, train, arena, export)
.venv/bin/python train_small.py --quick

# Real run — parallel self-play across CPU cores
.venv/bin/python train_small.py --iterations 40 --games 60 --sims 96 --workers 12

# Resume (restores optimizer state too)
.venv/bin/python train_small.py --resume checkpoints/small_final.pt

# Re-export a checkpoint to the web JSON without training
.venv/bin/python train_small.py --export --checkpoint checkpoints/small_best.pt
```

Weights export to `../data/khet_weights.json` — the path `js/nn.js` fetches.
Training also writes `checkpoints/small_final.pt` (latest, with optimizer) and
`checkpoints/small_best.pt` (best arena winrate vs the uniform-MCTS baseline).

## Verify strength

`compare.py` runs a head-to-head arena between any two nets (`.pt`, `.json`, or
the literal `uniform`):

```bash
# Did the new net beat the previously shipped one?
.venv/bin/python compare.py khet_weights.original.json ../data/khet_weights.json --games 40 --sims 120

# Sanity vs a uniform-policy MCTS baseline
.venv/bin/python compare.py ../data/khet_weights.json uniform --games 30
```

## How it works

Each iteration:
1. **Self-play** — `--workers` processes each play a share of `--games`, every
   move chosen by MCTS (`--sims` simulations) over the current network, with
   Dirichlet root noise + a temperature schedule for exploration.
2. **Train** — sample minibatches from the replay buffer; loss = value MSE +
   policy cross-entropy. The Adam optimizer **persists across iterations**
   (the original code rebuilt it each time, wiping momentum).
3. **Arena** (every few iters) — greedy MCTS vs a uniform baseline to confirm
   the net is actually learning; the best net is exported.

### Network (small)
- **Input**: 16-channel 8×10 board tensor (current/opponent pieces ×5,
  facing one-hot ×4, side-to-move, move-count).
- **Trunk**: `--hidden` channels (default 32) × `--blocks` residual blocks (4).
- **Value head** → tanh ∈ [-1, 1]. **Policy head** → 960 logits
  (80 cells × 12 actions), log-softmax.

### Files
| File | Description |
|------|-------------|
| `khet_engine.py` | Python port of `js/engine.js` (rules must match exactly) |
| `model_small.py` | Web-compatible dual-head net + `export_to_json` |
| `mcts.py` | NN-guided MCTS (clean negamax value backup) |
| `train_small.py` | Parallel self-play training pipeline |
| `compare.py` | Head-to-head arena between two nets |
| `model.py` / `train.py` | Larger FC-policy variant — not used by the web AI |

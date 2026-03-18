# Khet Self-Play Training

AlphaZero-style training system for the Khet laser chess game.

## Requirements

```bash
pip install torch numpy
```

## Quick Start

```bash
# Quick test run (3 iterations, tiny network)
python train.py --quick

# Full training
python train.py --iterations 100 --games 50 --sims 200

# Resume from checkpoint
python train.py --resume checkpoints/khet_iter_50.pt

# Export trained weights to JSON (for the web frontend)
python train.py --resume checkpoints/khet_final.pt --export ../weights.json
```

## Architecture

### Files

| File | Description |
|------|-------------|
| `khet_engine.py` | Python port of the Khet game engine |
| `model.py` | AlphaZero-style dual-head neural network |
| `mcts.py` | Neural-network-guided MCTS |
| `train.py` | Self-play training pipeline |

### Network

- **Input**: 16-channel board tensor (8×10)
  - Channels 0-4: Current player's pieces (pharaoh, sphinx, pyramid, scarab, anubis)
  - Channels 5-9: Opponent's pieces
  - Channels 10-13: Facing direction (one-hot)
  - Channel 14: Current player indicator
  - Channel 15: Move count (temporal)
- **Trunk**: Residual tower (8 blocks × 128 channels)
- **Value head** → win probability ∈ [-1, 1]
- **Policy head** → log-probabilities over 960 possible moves

### Training Loop

Each iteration:
1. **Self-play**: Generate games using MCTS + current network
2. **Collect**: Store (board, MCTS policy, game outcome) in replay buffer
3. **Train**: Update network on buffered samples
4. **Checkpoint**: Save model weights periodically

## CLI Options

```
--iterations N     Training iterations (default: 100)
--games N          Self-play games per iteration (default: 50)
--sims N           MCTS simulations per move (default: 200)
--hidden N         Network hidden channels (default: 128)
--blocks N         Number of residual blocks (default: 8)
--lr F             Learning rate (default: 0.001)
--batch-size N     Training batch size (default: 64)
--epochs N         Training epochs per iteration (default: 10)
--buffer N         Replay buffer size (default: 100000)
--resume PATH      Resume from checkpoint
--export PATH      Export weights to JSON
--device STR       Device: auto/cuda/mps/cpu (default: auto)
--quick            Quick test run with minimal settings
```

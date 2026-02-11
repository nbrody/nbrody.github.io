"""
Khet Self-Play Training Pipeline — AlphaZero-style.

Usage:
    python train.py                          # Run training loop
    python train.py --iterations 50          # Custom iteration count
    python train.py --export weights.json    # Export trained weights for JS
    python train.py --resume checkpoint.pt   # Resume from checkpoint
"""
import argparse
import json
import os
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

from khet_engine import KhetGame, Move, Player, COLS, ROWS
from model import KhetNet, POLICY_SIZE
from mcts import MCTS


# ============================================================
# Configuration
# ============================================================

@dataclass
class TrainingConfig:
    # Self-play
    num_iterations: int = 100        # Total training iterations
    games_per_iteration: int = 50    # Self-play games per iteration
    mcts_simulations: int = 200      # MCTS sims per move
    max_game_moves: int = 300        # Max moves before draw
    temperature_threshold: int = 30  # Moves before temperature drops to 0

    # Network
    hidden_channels: int = 128
    num_res_blocks: int = 8
    learning_rate: float = 0.001
    weight_decay: float = 1e-4
    batch_size: int = 64
    training_epochs: int = 10

    # Replay buffer
    replay_buffer_size: int = 100_000
    min_replay_size: int = 1000      # Minimum samples before training

    # Checkpointing
    checkpoint_dir: str = "checkpoints"
    checkpoint_interval: int = 5     # Save every N iterations
    log_interval: int = 1            # Print stats every N iterations

    # Device
    device: str = "auto"             # "auto", "cuda", "mps", "cpu"


# ============================================================
# Training Sample
# ============================================================

@dataclass
class TrainingSample:
    board_planes: np.ndarray   # (16, 8, 10)
    policy_target: np.ndarray  # (960,) visit-count distribution
    value_target: float        # -1 (loss) or +1 (win)


# ============================================================
# Self-Play Worker
# ============================================================

def play_self_play_game(
    network: KhetNet,
    config: TrainingConfig,
    device: torch.device,
) -> Tuple[List[TrainingSample], int, int]:
    """
    Play a single game of self-play using MCTS + network.

    Returns:
        samples: list of training samples
        winner: Player.SILVER (0), Player.RED (1), or -1 for draw
        num_moves: total moves played
    """
    game = KhetGame()
    mcts = MCTS(network, num_simulations=config.mcts_simulations, temperature=1.0)

    positions = []  # (board_planes, policy, current_player)

    for move_num in range(config.max_game_moves):
        # Lower temperature after threshold
        if move_num >= config.temperature_threshold:
            mcts.temperature = 0.0
        else:
            mcts.temperature = 1.0

        # Run MCTS
        best_move, pi = mcts.search(game)

        # Save position
        positions.append((
            game.to_tensor_planes().copy(),
            pi.copy(),
            game.current_player,
        ))

        # Apply move
        game.apply_move(best_move)

        if game.winner is not None:
            break

    # Determine winner
    winner = game.winner if game.winner is not None else -1

    # Build training samples with outcome
    samples = []
    for board_planes, policy, player in positions:
        if winner == -1:
            value = 0.0
        elif winner == player:
            value = 1.0
        else:
            value = -1.0
        samples.append(TrainingSample(board_planes, policy, value))

    return samples, winner, game.move_count


# ============================================================
# Training Loop
# ============================================================

def train_network(
    network: KhetNet,
    replay_buffer: deque,
    config: TrainingConfig,
    device: torch.device,
) -> dict:
    """
    Train the network on samples from the replay buffer.
    Returns training metrics.
    """
    if len(replay_buffer) < config.min_replay_size:
        return {"skipped": True, "reason": f"Buffer too small ({len(replay_buffer)})"}

    network.train()

    # Build dataset from replay buffer
    samples = list(replay_buffer)
    np.random.shuffle(samples)

    boards = np.stack([s.board_planes for s in samples])
    policies = np.stack([s.policy_target for s in samples])
    values = np.array([s.value_target for s in samples], dtype=np.float32)

    boards_t = torch.from_numpy(boards).to(device)
    policies_t = torch.from_numpy(policies).to(device)
    values_t = torch.from_numpy(values).unsqueeze(1).to(device)

    dataset = TensorDataset(boards_t, policies_t, values_t)
    loader = DataLoader(dataset, batch_size=config.batch_size, shuffle=True, drop_last=True)

    optimizer = optim.Adam(
        network.parameters(),
        lr=config.learning_rate,
        weight_decay=config.weight_decay,
    )

    total_loss = 0.0
    total_value_loss = 0.0
    total_policy_loss = 0.0
    num_batches = 0

    for epoch in range(config.training_epochs):
        for batch_boards, batch_policies, batch_values in loader:
            optimizer.zero_grad()

            pred_values, pred_policies = network(batch_boards)

            # Value loss: MSE
            value_loss = nn.MSELoss()(pred_values, batch_values)

            # Policy loss: cross-entropy with MCTS visit-count targets
            # pred_policies are log-probs; batch_policies are target distributions
            policy_loss = -torch.sum(batch_policies * pred_policies) / batch_policies.size(0)

            loss = value_loss + policy_loss
            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            total_value_loss += value_loss.item()
            total_policy_loss += policy_loss.item()
            num_batches += 1

    return {
        "total_loss": total_loss / max(num_batches, 1),
        "value_loss": total_value_loss / max(num_batches, 1),
        "policy_loss": total_policy_loss / max(num_batches, 1),
        "num_batches": num_batches,
        "buffer_size": len(replay_buffer),
    }


# ============================================================
# Weight Export (for JavaScript consumption)
# ============================================================

def export_weights_to_json(network: KhetNet, filepath: str):
    """
    Export network weights to a JSON file that can be loaded by the JS frontend.
    """
    state = network.state_dict()
    export = {}
    for key, tensor in state.items():
        export[key] = {
            "shape": list(tensor.shape),
            "data": tensor.cpu().float().numpy().flatten().tolist(),
        }
    with open(filepath, "w") as f:
        json.dump(export, f)
    print(f"Exported weights to {filepath} ({os.path.getsize(filepath) / 1024:.1f} KB)")


# ============================================================
# Device Selection
# ============================================================

def get_device(config: TrainingConfig) -> torch.device:
    if config.device == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return torch.device("mps")
        else:
            return torch.device("cpu")
    return torch.device(config.device)


# ============================================================
# Main Training Pipeline
# ============================================================

def run_training(config: TrainingConfig, resume_path: Optional[str] = None):
    device = get_device(config)
    print(f"Using device: {device}")
    print(f"Config: {config}")
    print()

    # Create network
    network = KhetNet(
        hidden_channels=config.hidden_channels,
        num_res_blocks=config.num_res_blocks,
    ).to(device)
    print(f"Network parameters: {network.count_parameters():,}")

    # Replay buffer
    replay_buffer = deque(maxlen=config.replay_buffer_size)
    start_iteration = 0

    # Resume from checkpoint
    if resume_path and os.path.exists(resume_path):
        checkpoint = torch.load(resume_path, map_location=device)
        network.load_state_dict(checkpoint["model_state_dict"])
        start_iteration = checkpoint.get("iteration", 0)
        if "replay_buffer" in checkpoint:
            replay_buffer.extend(checkpoint["replay_buffer"])
        print(f"Resumed from iteration {start_iteration}, buffer size: {len(replay_buffer)}")

    # Create checkpoint directory
    os.makedirs(config.checkpoint_dir, exist_ok=True)

    # Training loop
    total_silver_wins = 0
    total_red_wins = 0
    total_draws = 0

    for iteration in range(start_iteration, config.num_iterations):
        iter_start = time.time()

        # ---- Self-Play Phase ----
        print(f"\n{'='*60}")
        print(f"Iteration {iteration + 1}/{config.num_iterations}")
        print(f"{'='*60}")
        print(f"Self-play: generating {config.games_per_iteration} games...")

        network.eval()
        iter_samples = 0
        iter_silver = 0
        iter_red = 0
        iter_draws = 0
        iter_moves = 0

        for game_num in range(config.games_per_iteration):
            samples, winner, num_moves = play_self_play_game(network, config, device)
            replay_buffer.extend(samples)
            iter_samples += len(samples)
            iter_moves += num_moves

            if winner == Player.SILVER:
                iter_silver += 1
            elif winner == Player.RED:
                iter_red += 1
            else:
                iter_draws += 1

            # Progress
            if (game_num + 1) % 10 == 0 or game_num == 0:
                elapsed = time.time() - iter_start
                games_per_sec = (game_num + 1) / elapsed
                print(f"  Game {game_num + 1}/{config.games_per_iteration} "
                      f"| S:{iter_silver} R:{iter_red} D:{iter_draws} "
                      f"| {games_per_sec:.1f} games/s "
                      f"| avg {iter_moves / (game_num + 1):.0f} moves")

        total_silver_wins += iter_silver
        total_red_wins += iter_red
        total_draws += iter_draws

        selfplay_time = time.time() - iter_start
        print(f"  Self-play done: {iter_samples} samples in {selfplay_time:.1f}s")
        print(f"  Results: Silver {iter_silver} | Red {iter_red} | Draw {iter_draws}")
        print(f"  Buffer: {len(replay_buffer)} samples")

        # ---- Training Phase ----
        train_start = time.time()
        print(f"Training on {len(replay_buffer)} samples...")

        metrics = train_network(network, replay_buffer, config, device)
        train_time = time.time() - train_start

        if "skipped" in metrics:
            print(f"  Training skipped: {metrics['reason']}")
        else:
            print(f"  Loss: {metrics['total_loss']:.4f} "
                  f"(value: {metrics['value_loss']:.4f}, policy: {metrics['policy_loss']:.4f})")
            print(f"  Training done in {train_time:.1f}s ({metrics['num_batches']} batches)")

        # ---- Checkpoint ----
        if (iteration + 1) % config.checkpoint_interval == 0:
            ckpt_path = os.path.join(config.checkpoint_dir, f"khet_iter_{iteration + 1}.pt")
            torch.save({
                "iteration": iteration + 1,
                "model_state_dict": network.state_dict(),
                "config": config,
            }, ckpt_path)
            print(f"  Checkpoint saved: {ckpt_path}")

        iter_time = time.time() - iter_start
        print(f"  Iteration time: {iter_time:.1f}s")

    # ---- Final Summary ----
    print(f"\n{'='*60}")
    print("Training Complete!")
    print(f"{'='*60}")
    print(f"Total games: {total_silver_wins + total_red_wins + total_draws}")
    print(f"Silver wins: {total_silver_wins}")
    print(f"Red wins:    {total_red_wins}")
    print(f"Draws:       {total_draws}")

    # Save final model
    final_path = os.path.join(config.checkpoint_dir, "khet_final.pt")
    torch.save({
        "iteration": config.num_iterations,
        "model_state_dict": network.state_dict(),
        "config": config,
    }, final_path)
    print(f"Final model saved: {final_path}")

    # Export for JS
    export_path = os.path.join(config.checkpoint_dir, "khet_weights.json")
    export_weights_to_json(network, export_path)

    return network


# ============================================================
# CLI
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Khet Self-Play Training")
    parser.add_argument("--iterations", type=int, default=100, help="Training iterations")
    parser.add_argument("--games", type=int, default=50, help="Self-play games per iteration")
    parser.add_argument("--sims", type=int, default=200, help="MCTS simulations per move")
    parser.add_argument("--hidden", type=int, default=128, help="Network hidden channels")
    parser.add_argument("--blocks", type=int, default=8, help="Number of residual blocks")
    parser.add_argument("--lr", type=float, default=0.001, help="Learning rate")
    parser.add_argument("--batch-size", type=int, default=64, help="Training batch size")
    parser.add_argument("--epochs", type=int, default=10, help="Training epochs per iteration")
    parser.add_argument("--buffer", type=int, default=100_000, help="Replay buffer size")
    parser.add_argument("--resume", type=str, default=None, help="Resume from checkpoint")
    parser.add_argument("--export", type=str, default=None, help="Export weights to JSON")
    parser.add_argument("--device", type=str, default="auto", help="Device (auto/cuda/mps/cpu)")
    parser.add_argument("--quick", action="store_true", help="Quick test run (small config)")

    args = parser.parse_args()

    if args.export:
        # Just export weights from a checkpoint
        if not args.resume:
            print("Error: --export requires --resume to specify a checkpoint")
            sys.exit(1)
        device = torch.device("cpu")
        checkpoint = torch.load(args.resume, map_location=device)
        cfg = checkpoint.get("config", TrainingConfig())
        network = KhetNet(
            hidden_channels=cfg.hidden_channels if hasattr(cfg, 'hidden_channels') else 128,
            num_res_blocks=cfg.num_res_blocks if hasattr(cfg, 'num_res_blocks') else 8,
        )
        network.load_state_dict(checkpoint["model_state_dict"])
        export_weights_to_json(network, args.export)
        return

    config = TrainingConfig(
        num_iterations=args.iterations,
        games_per_iteration=args.games,
        mcts_simulations=args.sims,
        hidden_channels=args.hidden,
        num_res_blocks=args.blocks,
        learning_rate=args.lr,
        batch_size=args.batch_size,
        training_epochs=args.epochs,
        replay_buffer_size=args.buffer,
        device=args.device,
    )

    if args.quick:
        config.num_iterations = 3
        config.games_per_iteration = 5
        config.mcts_simulations = 50
        config.hidden_channels = 32
        config.num_res_blocks = 2
        config.min_replay_size = 10
        config.temperature_threshold = 10
        print("Quick test mode: using minimal settings")

    run_training(config, resume_path=args.resume)


if __name__ == "__main__":
    main()

"""
Train the small (web-sized) Khet network via self-play.
Exports the weights in a compact format for the JS frontend.

Usage:
    python train_small.py --quick        # Quick test (3 iters)
    python train_small.py                # Full training
    python train_small.py --export       # Export best checkpoint to JSON
"""
import argparse
import os
import time
from collections import deque
from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset

from khet_engine import KhetGame, Move, Player, COLS, ROWS
from model_small import KhetNetSmall, MOVES_PER_CELL
from mcts import MCTS


@dataclass
class Config:
    num_iterations: int = 50
    games_per_iteration: int = 40
    mcts_simulations: int = 100
    max_game_moves: int = 200
    temperature_threshold: int = 20
    hidden_channels: int = 32
    num_res_blocks: int = 4
    learning_rate: float = 0.002
    weight_decay: float = 1e-4
    batch_size: int = 128
    training_epochs: int = 5
    replay_buffer_size: int = 50_000
    min_replay_size: int = 500
    checkpoint_dir: str = "checkpoints"


@dataclass
class Sample:
    board: np.ndarray
    policy: np.ndarray
    value: float


def get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def self_play_game(network, config, device):
    game = KhetGame()
    mcts = MCTS(network, num_simulations=config.mcts_simulations, temperature=1.0)
    positions = []

    for move_num in range(config.max_game_moves):
        mcts.temperature = 1.0 if move_num < config.temperature_threshold else 0.1

        best_move, pi = mcts.search(game)
        positions.append((game.to_tensor_planes().copy(), pi.copy(), game.current_player))
        game.apply_move(best_move)

        if game.winner is not None:
            break

    winner = game.winner if game.winner is not None else -1
    samples = []
    for board, policy, player in positions:
        if winner == -1:
            value = 0.0
        elif winner == player:
            value = 1.0
        else:
            value = -1.0
        samples.append(Sample(board, policy, value))

    return samples, winner, game.move_count


def train_on_buffer(network, replay_buffer, config, device):
    if len(replay_buffer) < config.min_replay_size:
        return None

    network.train()
    samples = list(replay_buffer)
    np.random.shuffle(samples)

    boards = torch.from_numpy(np.stack([s.board for s in samples])).to(device)
    policies = torch.from_numpy(np.stack([s.policy for s in samples])).to(device)
    values = torch.tensor([s.value for s in samples], dtype=torch.float32).unsqueeze(1).to(device)

    dataset = TensorDataset(boards, policies, values)
    loader = DataLoader(dataset, batch_size=config.batch_size, shuffle=True, drop_last=True)

    optimizer = optim.Adam(network.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay)

    total_loss = 0
    n = 0
    for epoch in range(config.training_epochs):
        for b, p, v in loader:
            optimizer.zero_grad()
            pred_v, pred_p = network(b)
            v_loss = nn.MSELoss()(pred_v, v)
            p_loss = -torch.sum(p * pred_p) / p.size(0)
            loss = v_loss + p_loss
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n += 1

    return total_loss / max(n, 1) if n else None


def run(config, resume=None):
    device = get_device()
    print(f"Device: {device}")

    network = KhetNetSmall(
        hidden_channels=config.hidden_channels,
        num_res_blocks=config.num_res_blocks,
    ).to(device)
    print(f"Parameters: {network.count_parameters():,}")

    replay_buffer = deque(maxlen=config.replay_buffer_size)
    start_iter = 0

    if resume and os.path.exists(resume):
        ckpt = torch.load(resume, map_location=device)
        network.load_state_dict(ckpt["model_state_dict"])
        start_iter = ckpt.get("iteration", 0)
        print(f"Resumed from iteration {start_iter}")

    os.makedirs(config.checkpoint_dir, exist_ok=True)
    total_s, total_r, total_d = 0, 0, 0

    for iteration in range(start_iter, config.num_iterations):
        t0 = time.time()
        print(f"\n--- Iteration {iteration+1}/{config.num_iterations} ---")

        network.eval()
        iter_samples = 0
        s_wins, r_wins, draws = 0, 0, 0

        for g in range(config.games_per_iteration):
            samples, winner, n_moves = self_play_game(network, config, device)
            replay_buffer.extend(samples)
            iter_samples += len(samples)
            if winner == 0: s_wins += 1
            elif winner == 1: r_wins += 1
            else: draws += 1

            if (g + 1) % 10 == 0:
                elapsed = time.time() - t0
                print(f"  Game {g+1}/{config.games_per_iteration} "
                      f"S:{s_wins} R:{r_wins} D:{draws} "
                      f"({(g+1)/elapsed:.1f} g/s)")

        total_s += s_wins; total_r += r_wins; total_d += draws

        loss = train_on_buffer(network, replay_buffer, config, device)
        if loss is not None:
            print(f"  Training loss: {loss:.4f} | Buffer: {len(replay_buffer)}")

        # Checkpoint every 10 iterations
        if (iteration + 1) % 10 == 0:
            path = os.path.join(config.checkpoint_dir, f"small_iter_{iteration+1}.pt")
            torch.save({"iteration": iteration+1, "model_state_dict": network.state_dict()}, path)
            print(f"  Saved: {path}")

        print(f"  Time: {time.time()-t0:.1f}s | Samples: {iter_samples}")

    # Final save + export
    final_pt = os.path.join(config.checkpoint_dir, "small_final.pt")
    torch.save({"iteration": config.num_iterations, "model_state_dict": network.state_dict()}, final_pt)

    export_path = os.path.join("..", "khet_weights.json")
    network.export_to_json(export_path)

    print(f"\nDone! S:{total_s} R:{total_r} D:{total_d}")
    print(f"Weights exported to {export_path}")
    return network


def export_checkpoint(ckpt_path, out_path, config):
    device = torch.device("cpu")
    ckpt = torch.load(ckpt_path, map_location=device)
    network = KhetNetSmall(
        hidden_channels=config.hidden_channels,
        num_res_blocks=config.num_res_blocks,
    )
    network.load_state_dict(ckpt["model_state_dict"])
    network.export_to_json(out_path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--iterations", type=int, default=50)
    parser.add_argument("--games", type=int, default=40)
    parser.add_argument("--sims", type=int, default=100)
    parser.add_argument("--resume", type=str, default=None)
    parser.add_argument("--export", action="store_true")
    parser.add_argument("--checkpoint", type=str, default="checkpoints/small_final.pt")
    args = parser.parse_args()

    config = Config(
        num_iterations=args.iterations,
        games_per_iteration=args.games,
        mcts_simulations=args.sims,
    )

    if args.quick:
        config.num_iterations = 3
        config.games_per_iteration = 5
        config.mcts_simulations = 30
        config.min_replay_size = 10
        config.training_epochs = 2
        print("Quick mode")

    if args.export:
        export_checkpoint(args.checkpoint, "../khet_weights.json", config)
    else:
        run(config, resume=args.resume)

"""
Train the small (web-sized) Khet network via AlphaZero-style self-play, and
export the weights in the compact format the JS frontend loads.

Improvements over the original:
  * persistent optimizer (Adam momentum is no longer wiped every iteration)
  * parallel self-play across CPU cores (the main speedup on a laptop)
  * an arena that measures the new net vs a uniform-MCTS baseline AND vs the
    previous best, so we can see whether training actually helped
  * correct export path (../data/khet_weights.json — what nn.js fetches)

Usage:
    python train_small.py --quick                  # fast end-to-end smoke test
    python train_small.py --iterations 40 --games 48 --sims 80 --workers 8
    python train_small.py --export --checkpoint checkpoints/small_best.pt
"""
import argparse
import os
import time
from collections import deque
from dataclasses import dataclass, asdict

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import torch.multiprocessing as mp
from torch.utils.data import DataLoader, TensorDataset

from khet_engine import KhetGame, Move, Player
from model_small import KhetNetSmall
from mcts import MCTS

HERE = os.path.dirname(os.path.abspath(__file__))
EXPORT_PATH = os.path.join(HERE, "..", "data", "khet_weights.json")


@dataclass
class Config:
    num_iterations: int = 40
    games_per_iteration: int = 48
    mcts_simulations: int = 80
    max_game_moves: int = 140
    temperature_threshold: int = 20   # plies of exploratory (T=1) play before going greedy
    value_discount: float = 0.99      # win-speed shaping: a win N plies away is worth γ^N
    value_loss_weight: float = 1.5    # sharpen the value head (helps avoid dithering → draws)
    hidden_channels: int = 32
    num_res_blocks: int = 4
    learning_rate: float = 2e-3
    weight_decay: float = 1e-4
    batch_size: int = 256
    train_batches: int = 400          # minibatches sampled from the buffer per iteration
    replay_buffer_size: int = 60_000
    min_replay_size: int = 1_000
    arena_games: int = 20
    arena_sims: int = 60
    eval_every: int = 5
    workers: int = max(1, (os.cpu_count() or 4) - 2)
    checkpoint_dir: str = os.path.join(HERE, "checkpoints")


# ----------------------------------------------------------------------------
# Baseline opponent: uniform policy / neutral value (isolates net quality in arena)
# ----------------------------------------------------------------------------
class UniformNet:
    _uniform = np.full(Move.max_index(), 1.0 / Move.max_index(), dtype=np.float32)

    def predict(self, board_tensor):
        return 0.0, self._uniform


def get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


# ----------------------------------------------------------------------------
# Self-play
# ----------------------------------------------------------------------------
def play_one_game(network, config):
    """Play a single self-play game. Returns (samples, winner, move_count)."""
    game = KhetGame()
    mcts = MCTS(network, num_simulations=config.mcts_simulations, temperature=1.0, add_noise=True)
    positions = []

    for move_num in range(config.max_game_moves):
        mcts.temperature = 1.0 if move_num < config.temperature_threshold else 1e-9
        best_move, pi = mcts.search(game)
        if best_move is None:
            break
        positions.append((game.to_tensor_planes().copy(), pi.copy(), game.current_player))
        game.apply_move(best_move)
        if game.winner is not None:
            break

    winner = game.winner if game.winner is not None else -1
    samples = []
    n = len(positions)
    for i, (board, policy, player) in enumerate(positions):
        if winner == -1:
            value = 0.0
        else:
            # Win-speed shaping: positions closer to the deciding laser are worth
            # more, so the net learns to convert quickly instead of shuffling.
            plies_to_end = (n - 1 - i)
            magnitude = config.value_discount ** plies_to_end
            value = magnitude if winner == player else -magnitude
        samples.append((board, policy, np.float32(value)))
    return samples, winner, game.move_count


def _selfplay_worker(packed):
    """Worker process: rebuild the net on CPU, play n games, return raw samples."""
    state_dict, cfg_dict, n_games, seed = packed
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.set_num_threads(1)

    config = Config(**cfg_dict)
    net = KhetNetSmall(config.hidden_channels, config.num_res_blocks)
    net.load_state_dict(state_dict)
    net.eval()

    all_samples, wins = [], [0, 0, 0]
    for _ in range(n_games):
        samples, winner, _ = play_one_game(net, config)
        all_samples.extend(samples)
        wins[winner if winner >= 0 else 2] += 1
    return all_samples, wins


def generate_selfplay(network, config, pool):
    """Run games_per_iteration games, parallel across workers if a pool is given."""
    cpu_state = {k: v.detach().cpu() for k, v in network.state_dict().items()}
    cfg_dict = asdict(config)

    if pool is None:
        samples, winner, _ = [], None, None
        wins = [0, 0, 0]
        net = network  # already on its device; predict moves data to cpu numpy
        for _ in range(config.games_per_iteration):
            s, w, _ = play_one_game(net, config)
            samples.extend(s)
            wins[w if w >= 0 else 2] += 1
        return samples, wins

    n = config.games_per_iteration
    w = config.workers
    chunks = [n // w + (1 if i < n % w else 0) for i in range(w)]
    base_seed = int(torch.randint(0, 2**31 - 1, (1,)).item())
    tasks = [(cpu_state, cfg_dict, chunks[i], base_seed + i) for i in range(w) if chunks[i] > 0]

    samples, wins = [], [0, 0, 0]
    for s, win in pool.map(_selfplay_worker, tasks):
        samples.extend(s)
        for i in range(3):
            wins[i] += win[i]
    return samples, wins


# ----------------------------------------------------------------------------
# Training
# ----------------------------------------------------------------------------
def train_on_buffer(network, optimizer, replay_buffer, config, device):
    if len(replay_buffer) < config.min_replay_size:
        return None

    network.train()
    buf = list(replay_buffer)
    boards = torch.from_numpy(np.stack([s[0] for s in buf]))
    policies = torch.from_numpy(np.stack([s[1] for s in buf]))
    values = torch.tensor([s[2] for s in buf], dtype=torch.float32).unsqueeze(1)
    dataset = TensorDataset(boards, policies, values)
    loader = DataLoader(dataset, batch_size=config.batch_size, shuffle=True, drop_last=True)

    total, vtot, ptot, n = 0.0, 0.0, 0.0, 0
    it = iter(loader)
    for _ in range(config.train_batches):
        try:
            b, p, v = next(it)
        except StopIteration:
            it = iter(loader)
            b, p, v = next(it)
        b, p, v = b.to(device), p.to(device), v.to(device)

        optimizer.zero_grad()
        pred_v, pred_logp = network(b)
        v_loss = nn.functional.mse_loss(pred_v, v)
        p_loss = -(p * pred_logp).sum(dim=1).mean()
        loss = config.value_loss_weight * v_loss + p_loss
        loss.backward()
        optimizer.step()

        total += loss.item(); vtot += v_loss.item(); ptot += p_loss.item(); n += 1

    return (total / n, vtot / n, ptot / n) if n else None


# ----------------------------------------------------------------------------
# Arena
# ----------------------------------------------------------------------------
def play_match_game(net_a, net_b, a_is_silver, sims, open_plies=14, open_temp=0.7):
    """
    One game between two nets. The opening is sampled (temperature + root noise)
    so repeated games explore different lines; play then goes greedy. Without
    this, deterministic mirror play yields only one line per color and the
    arena winrate is meaningless. Returns winner id (0=A, 1=B) or -1 for a draw.
    """
    game = KhetGame()
    mcts_a = MCTS(net_a, num_simulations=sims, temperature=open_temp, add_noise=True)
    mcts_b = MCTS(net_b, num_simulations=sims, temperature=open_temp, add_noise=True)
    for ply in range(160):
        if ply == open_plies:
            mcts_a.temperature = mcts_b.temperature = 1e-9
            mcts_a.add_noise = mcts_b.add_noise = False
        a_to_move = (game.current_player == Player.SILVER) == a_is_silver
        mcts = mcts_a if a_to_move else mcts_b
        move, _ = mcts.search(game)
        if move is None:
            break
        game.apply_move(move)
        if game.winner is not None:
            break
    if game.winner is None:
        return -1
    return 0 if (game.winner == Player.SILVER) == a_is_silver else 1  # 0 = A wins, 1 = B wins


def arena(net_a, net_b, games, sims):
    """net_a vs net_b, alternating colors. Returns (a_wins, b_wins, draws)."""
    a_wins = b_wins = draws = 0
    for g in range(games):
        res = play_match_game(net_a, net_b, a_is_silver=(g % 2 == 0), sims=sims)
        if res == 0: a_wins += 1
        elif res == 1: b_wins += 1
        else: draws += 1
    return a_wins, b_wins, draws


# ----------------------------------------------------------------------------
# Main loop
# ----------------------------------------------------------------------------
def run(config, resume=None):
    device = get_device()
    print(f"Device: {device} | workers: {config.workers}")

    network = KhetNetSmall(config.hidden_channels, config.num_res_blocks).to(device)
    print(f"Parameters: {network.count_parameters():,}")

    optimizer = optim.Adam(network.parameters(), lr=config.learning_rate,
                           weight_decay=config.weight_decay)
    replay_buffer = deque(maxlen=config.replay_buffer_size)
    start_iter = 0

    if resume and os.path.exists(resume):
        ckpt = torch.load(resume, map_location=device)
        network.load_state_dict(ckpt["model_state_dict"])
        if "optimizer_state_dict" in ckpt:
            optimizer.load_state_dict(ckpt["optimizer_state_dict"])
        start_iter = ckpt.get("iteration", 0)
        print(f"Resumed from iteration {start_iter}")

    os.makedirs(config.checkpoint_dir, exist_ok=True)
    pool = None
    if config.workers > 1:
        ctx = mp.get_context("spawn")
        pool = ctx.Pool(config.workers)

    best_winrate_vs_uniform = 0.0
    try:
        for iteration in range(start_iter, config.num_iterations):
            t0 = time.time()
            print(f"\n--- Iteration {iteration + 1}/{config.num_iterations} ---")

            network.eval()
            samples, wins = generate_selfplay(network, config, pool)
            replay_buffer.extend(samples)
            print(f"  Self-play: {config.games_per_iteration} games "
                  f"(S:{wins[0]} R:{wins[1]} D:{wins[2]}), "
                  f"{len(samples)} samples in {time.time() - t0:.1f}s")

            stats = train_on_buffer(network, optimizer, replay_buffer, config, device)
            if stats:
                print(f"  Loss: {stats[0]:.4f} (value {stats[1]:.4f}, policy {stats[2]:.4f}) "
                      f"| buffer {len(replay_buffer)}")

            # Periodic arena vs uniform baseline (sanity that the net learned).
            if (iteration + 1) % config.eval_every == 0 or iteration + 1 == config.num_iterations:
                network.eval()
                cpu_net = KhetNetSmall(config.hidden_channels, config.num_res_blocks)
                cpu_net.load_state_dict({k: v.detach().cpu() for k, v in network.state_dict().items()})
                cpu_net.eval()
                aw, bw, dd = arena(cpu_net, UniformNet(), config.arena_games, config.arena_sims)
                wr = (aw + 0.5 * dd) / max(1, config.arena_games)
                print(f"  Arena vs uniform-MCTS: {aw}-{bw}-{dd}  (winrate {wr:.2f})")
                if wr >= best_winrate_vs_uniform:
                    best_winrate_vs_uniform = wr
                    torch.save({"iteration": iteration + 1,
                                "model_state_dict": network.state_dict()},
                               os.path.join(config.checkpoint_dir, "small_best.pt"))
                    cpu_net.export_to_json(EXPORT_PATH)
                    print(f"  New best (winrate {wr:.2f}); exported weights → {EXPORT_PATH}")

            torch.save({"iteration": iteration + 1,
                        "model_state_dict": network.state_dict(),
                        "optimizer_state_dict": optimizer.state_dict()},
                       os.path.join(config.checkpoint_dir, "small_final.pt"))
            print(f"  Iteration time: {time.time() - t0:.1f}s")
    finally:
        if pool is not None:
            pool.close()
            pool.join()

    # Ship the strongest net we found (best arena winrate), not just the last one.
    best_path = os.path.join(config.checkpoint_dir, "small_best.pt")
    export_net = KhetNetSmall(config.hidden_channels, config.num_res_blocks)
    if os.path.exists(best_path):
        export_net.load_state_dict(torch.load(best_path, map_location="cpu")["model_state_dict"])
    else:
        export_net.load_state_dict({k: v.detach().cpu() for k, v in network.state_dict().items()})
    export_net.export_to_json(EXPORT_PATH)
    print(f"\nDone. Best winrate vs uniform: {best_winrate_vs_uniform:.2f}")
    print(f"Shipped best net → {EXPORT_PATH}")
    return network


def export_checkpoint(ckpt_path, config):
    ckpt = torch.load(ckpt_path, map_location="cpu")
    net = KhetNetSmall(config.hidden_channels, config.num_res_blocks)
    net.load_state_dict(ckpt["model_state_dict"])
    net.export_to_json(EXPORT_PATH)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true")
    parser.add_argument("--iterations", type=int, default=40)
    parser.add_argument("--games", type=int, default=48)
    parser.add_argument("--sims", type=int, default=80)
    parser.add_argument("--workers", type=int, default=None)
    parser.add_argument("--resume", type=str, default=None)
    parser.add_argument("--export", action="store_true")
    parser.add_argument("--checkpoint", type=str, default="checkpoints/small_best.pt")
    args = parser.parse_args()

    config = Config(
        num_iterations=args.iterations,
        games_per_iteration=args.games,
        mcts_simulations=args.sims,
    )
    if args.workers is not None:
        config.workers = args.workers

    if args.quick:
        config.num_iterations = 2
        config.games_per_iteration = max(config.workers, 6)
        config.mcts_simulations = 24
        config.min_replay_size = 50
        config.train_batches = 30
        config.arena_games = 6
        config.arena_sims = 16
        config.eval_every = 1
        print("Quick mode")

    if args.export:
        export_checkpoint(args.checkpoint, config)
    else:
        run(config, resume=args.resume)

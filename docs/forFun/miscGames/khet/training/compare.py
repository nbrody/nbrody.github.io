"""
Head-to-head arena between two Khet nets, so we can confirm the freshly trained
network is actually stronger than the previously shipped one.

A net source is either:
  * a .pt checkpoint  (dict with 'model_state_dict')
  * a .json export     (the web format produced by export_to_json)

Usage:
    python compare.py training/khet_weights.original.json ../data/khet_weights.json --games 40 --sims 120
    python compare.py checkpoints/small_best.pt uniform --games 20
"""
import argparse
import base64
import json
import struct

import numpy as np
import torch

from khet_engine import Move, Player
from model_small import KhetNetSmall
from mcts import MCTS


def load_json_net(path):
    with open(path) as f:
        data = json.load(f)
    arch = data["architecture"]
    net = KhetNetSmall(arch["hidden_channels"], arch["num_res_blocks"])
    state = {}
    for key, layer in data["layers"].items():
        raw = base64.b64decode(layer["data"])
        flat = np.array(struct.unpack(f"{len(raw)//4}f", raw), dtype=np.float32)
        shape = layer["shape"]
        if shape:
            state[key] = torch.from_numpy(flat.reshape(shape))
        else:
            state[key] = torch.tensor(flat[0])
    net.load_state_dict(state, strict=False)  # skip num_batches_tracked dtype quirks
    net.eval()
    return net


def load_pt_net(path):
    ckpt = torch.load(path, map_location="cpu")
    sd = ckpt["model_state_dict"]
    # Infer architecture from tensor shapes.
    hidden = sd["input_conv.weight"].shape[0]
    blocks = sum(1 for k in sd if k.endswith(".conv1.weight") and k.startswith("res_blocks"))
    net = KhetNetSmall(hidden, blocks)
    net.load_state_dict(sd)
    net.eval()
    return net


class UniformNet:
    _u = np.full(Move.max_index(), 1.0 / Move.max_index(), dtype=np.float32)
    def predict(self, _):
        return 0.0, self._u


def load_net(spec):
    if spec == "uniform":
        return UniformNet()
    if spec.endswith(".json"):
        return load_json_net(spec)
    return load_pt_net(spec)


def play(net_a, net_b, a_silver, sims, open_plies=14, open_temp=0.7):
    """
    One game between two nets. To get a meaningful sample (rather than replaying
    the same deterministic line every game), the first `open_plies` moves are
    sampled with temperature + root noise; play then becomes greedy.
    """
    from khet_engine import KhetGame
    g = KhetGame()
    ma = MCTS(net_a, num_simulations=sims, temperature=open_temp, add_noise=True)
    mb = MCTS(net_b, num_simulations=sims, temperature=open_temp, add_noise=True)
    for ply in range(160):
        if ply == open_plies:
            ma.temperature = mb.temperature = 1e-9
            ma.add_noise = mb.add_noise = False
        a_turn = (g.current_player == Player.SILVER) == a_silver
        mv, _ = (ma if a_turn else mb).search(g)
        if mv is None:
            break
        g.apply_move(mv)
        if g.winner is not None:
            break
    if g.winner is None:
        return -1
    return 0 if (g.winner == Player.SILVER) == a_silver else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("net_a")
    ap.add_argument("net_b")
    ap.add_argument("--games", type=int, default=40)
    ap.add_argument("--sims", type=int, default=120)
    args = ap.parse_args()

    a, b = load_net(args.net_a), load_net(args.net_b)
    aw = bw = dd = 0
    for g in range(args.games):
        r = play(a, b, a_silver=(g % 2 == 0), sims=args.sims)
        if r == 0: aw += 1
        elif r == 1: bw += 1
        else: dd += 1
        print(f"\rGame {g+1}/{args.games}  A:{aw} B:{bw} D:{dd}", end="", flush=True)
    wr = (aw + 0.5 * dd) / max(1, args.games)
    print(f"\n\nA = {args.net_a}\nB = {args.net_b}")
    print(f"A wins {aw}, B wins {bw}, draws {dd}  →  A winrate {wr:.3f}")


if __name__ == "__main__":
    main()

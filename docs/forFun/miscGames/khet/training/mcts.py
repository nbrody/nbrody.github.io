"""
Monte Carlo Tree Search for Khet — guided by a neural network.

AlphaZero-style: the network's policy is a prior and its value is the leaf
evaluator. Value is handled with a clean negamax convention:

  * every node stores Q from the perspective of the player *to move* at that node
  * when a parent scores a child, it uses -child.Q (the child's value is from the
    opponent's seat), so the parent always picks the move best for itself
  * leaf values are backed up alternating sign up the path

This fixes the sign bug in the previous version, where children were scored with
+Q and the search effectively chose the opponent's best reply.
"""
import math
import numpy as np
from typing import Optional, List
from khet_engine import KhetGame, Move

# Exploration constant
C_PUCT = 1.5
# Dirichlet noise for root exploration
DIR_ALPHA = 0.3
DIR_EPSILON = 0.25


class MCTSNode:
    __slots__ = (
        "parent", "move", "player", "children",
        "visit_count", "total_value", "prior", "is_expanded",
    )

    def __init__(self, parent: Optional["MCTSNode"], move: Optional[Move],
                 player: int, prior: float = 0.0):
        self.parent = parent
        self.move = move
        self.player = player          # player to move at this node
        self.children: List["MCTSNode"] = []
        self.visit_count = 0
        self.total_value = 0.0        # sum of values from `player`'s perspective
        self.prior = prior
        self.is_expanded = False

    @property
    def q_value(self) -> float:
        """Mean value from the perspective of the player to move at this node."""
        if self.visit_count == 0:
            return 0.0
        return self.total_value / self.visit_count


class MCTS:
    """Neural network guided Monte Carlo Tree Search."""

    def __init__(self, network, num_simulations: int = 800, temperature: float = 1.0,
                 add_noise: bool = True):
        self.network = network
        self.num_simulations = num_simulations
        self.temperature = temperature
        self.add_noise = add_noise

    def search(self, game: KhetGame):
        """
        Run MCTS from `game`.

        Returns (best_move, pi) where pi is a (960,) visit-count distribution.
        """
        root = MCTSNode(None, None, game.current_player)
        self._expand(root, game)

        if not root.children:
            return None, np.zeros(Move.max_index(), dtype=np.float32)

        # Dirichlet noise at the root encourages exploration during self-play.
        if self.add_noise:
            noise = np.random.dirichlet([DIR_ALPHA] * len(root.children))
            for child, n in zip(root.children, noise):
                child.prior = (1 - DIR_EPSILON) * child.prior + DIR_EPSILON * n

        for _ in range(self.num_simulations):
            node = root
            sim = game.clone()
            path = [node]

            # Selection — descend until we reach an unexpanded node or terminal.
            while node.is_expanded and node.children and sim.winner is None:
                node = self._select_child(node)
                sim.apply_move(node.move)
                path.append(node)

            # Evaluation — value from the perspective of the player to move at the leaf.
            if sim.winner is not None:
                # The player to move at the leaf is the one who did NOT just win.
                leaf_value = 1.0 if sim.winner == sim.current_player else -1.0
            else:
                leaf_value = self._expand(node, sim)

            # Backprop with alternating sign.
            leaf_player = sim.current_player
            for n in path:
                n.visit_count += 1
                n.total_value += leaf_value if n.player == leaf_player else -leaf_value

        # Visit-count policy.
        pi = np.zeros(Move.max_index(), dtype=np.float32)
        for child in root.children:
            pi[child.move.to_index()] = child.visit_count

        if self.temperature <= 1e-6:
            best = max(root.children, key=lambda c: c.visit_count)
            hard = np.zeros_like(pi)
            hard[best.move.to_index()] = 1.0
            return best.move, hard

        # Sample a move ∝ visit_count^(1/T).
        counts = np.array([c.visit_count for c in root.children], dtype=np.float64)
        weights = counts ** (1.0 / self.temperature)
        wsum = weights.sum()
        probs = weights / wsum if wsum > 0 else np.ones(len(counts)) / len(counts)
        idx = int(np.random.choice(len(root.children), p=probs))
        best_move = root.children[idx].move

        pi_sum = pi.sum()
        if pi_sum > 0:
            pi = pi / pi_sum
        return best_move, pi

    def _select_child(self, node: MCTSNode) -> MCTSNode:
        """Pick the child maximizing PUCT, scored from `node`'s perspective."""
        best_score = -float("inf")
        best_child = None
        sqrt_parent = math.sqrt(node.visit_count)
        for child in node.children:
            # child.q_value is from the child's (opponent's) seat → negate for the parent.
            exploitation = -child.q_value
            exploration = C_PUCT * child.prior * sqrt_parent / (1 + child.visit_count)
            score = exploitation + exploration
            if score > best_score:
                best_score = score
                best_child = child
        return best_child

    def _expand(self, node: MCTSNode, game: KhetGame) -> float:
        """
        Expand `node` with the network's policy priors.
        Returns the network value from the perspective of game.current_player.
        """
        node.is_expanded = True
        moves = game.get_legal_moves()
        if not moves:
            return 0.0

        board_tensor = game.to_tensor_planes()
        value, policy = self.network.predict(board_tensor)

        priors = np.array([policy[m.to_index()] for m in moves], dtype=np.float64)
        total = priors.sum()
        priors = priors / total if total > 0 else np.ones(len(moves)) / len(moves)

        for move, prior in zip(moves, priors):
            node.children.append(MCTSNode(node, move, 1 - node.player, prior=float(prior)))

        return value

"""
Monte Carlo Tree Search for Khet — guided by a neural network.

AlphaZero-style: uses the network's policy as a prior and value as a leaf evaluator.
"""
import math
import numpy as np
from typing import Optional, List
from khet_engine import KhetGame, Move, Player

# Exploration constant
C_PUCT = 1.5
# Dirichlet noise for root exploration
DIR_ALPHA = 0.3
DIR_EPSILON = 0.25


class MCTSNode:
    __slots__ = (
        "parent", "move", "player", "children",
        "visit_count", "total_value", "prior",
        "is_expanded", "game_state"
    )

    def __init__(self, parent: Optional["MCTSNode"], move: Optional[Move],
                 player: int, prior: float = 0.0):
        self.parent = parent
        self.move = move
        self.player = player
        self.children: List["MCTSNode"] = []
        self.visit_count = 0
        self.total_value = 0.0
        self.prior = prior
        self.is_expanded = False
        self.game_state = None

    @property
    def q_value(self) -> float:
        if self.visit_count == 0:
            return 0.0
        return self.total_value / self.visit_count

    def ucb_score(self, parent_visits: int) -> float:
        """Upper confidence bound for tree search."""
        exploitation = self.q_value
        exploration = C_PUCT * self.prior * math.sqrt(parent_visits) / (1 + self.visit_count)
        return exploitation + exploration


class MCTS:
    """Neural network guided Monte Carlo Tree Search."""

    def __init__(self, network, num_simulations: int = 800, temperature: float = 1.0):
        self.network = network
        self.num_simulations = num_simulations
        self.temperature = temperature

    def search(self, game: KhetGame) -> tuple:
        """
        Run MCTS from the given game state.

        Returns:
            best_move: the selected Move
            pi: numpy array of shape (960,) — visit-count policy
        """
        root = MCTSNode(None, None, game.current_player)
        self._expand(root, game)

        # Add Dirichlet noise to root priors
        if root.children:
            noise = np.random.dirichlet([DIR_ALPHA] * len(root.children))
            for child, n in zip(root.children, noise):
                child.prior = (1 - DIR_EPSILON) * child.prior + DIR_EPSILON * n

        for _ in range(self.num_simulations):
            node = root
            sim_game = game.clone()

            # Selection
            while node.is_expanded and node.children and sim_game.winner is None:
                node = self._select_child(node)
                sim_game.apply_move(node.move)

            # Evaluation
            if sim_game.winner is not None:
                # Terminal: use actual game result
                if sim_game.winner == game.current_player:
                    value = 1.0
                else:
                    value = -1.0
            else:
                # Expand & evaluate with network
                value = self._expand(node, sim_game)
                # Value is from perspective of node's parent's player
                # Network returns value from perspective of current player in sim_game
                # But sim_game.current_player has already been switched by apply_move
                # So the value is from the perspective of the player who just moved (node's parent player)
                # We need it from root player's perspective
                if sim_game.current_player != game.current_player:
                    value = value  # Same perspective
                else:
                    value = -value

            # Backpropagation
            while node is not None:
                node.visit_count += 1
                # Value is from root player's perspective
                if node.player == game.current_player:
                    node.total_value += value
                else:
                    node.total_value -= value
                node = node.parent

        # Build policy from visit counts
        pi = np.zeros(Move.max_index(), dtype=np.float32)
        for child in root.children:
            pi[child.move.to_index()] = child.visit_count

        # Apply temperature
        if self.temperature == 0:
            # Greedy
            best_idx = np.argmax(pi)
            pi = np.zeros_like(pi)
            pi[best_idx] = 1.0
        else:
            pi = pi ** (1.0 / self.temperature)
            total = pi.sum()
            if total > 0:
                pi /= total

        # Select move
        if self.temperature == 0:
            best_child = max(root.children, key=lambda c: c.visit_count)
            best_move = best_child.move
        else:
            move_probs = []
            for child in root.children:
                move_probs.append(pi[child.move.to_index()])
            move_probs = np.array(move_probs)
            total = move_probs.sum()
            if total > 0:
                move_probs /= total
            else:
                move_probs = np.ones(len(root.children)) / len(root.children)
            idx = np.random.choice(len(root.children), p=move_probs)
            best_move = root.children[idx].move

        return best_move, pi

    def _select_child(self, node: MCTSNode) -> MCTSNode:
        """Select child with highest UCB score."""
        best_score = -float("inf")
        best_child = None
        for child in node.children:
            score = child.ucb_score(node.visit_count)
            if score > best_score:
                best_score = score
                best_child = child
        return best_child

    def _expand(self, node: MCTSNode, game: KhetGame) -> float:
        """
        Expand a node using the neural network.
        Returns the value estimate from the network.
        """
        node.is_expanded = True
        moves = game.get_legal_moves()
        if not moves:
            return 0.0

        # Get network prediction
        board_tensor = game.to_tensor_planes()
        value, policy = self.network.predict(board_tensor)

        # Create children with policy priors
        move_priors = []
        for move in moves:
            idx = move.to_index()
            move_priors.append(policy[idx])

        # Normalize priors
        total = sum(move_priors)
        if total > 0:
            move_priors = [p / total for p in move_priors]
        else:
            move_priors = [1.0 / len(moves)] * len(moves)

        for move, prior in zip(moves, move_priors):
            child = MCTSNode(node, move, 1 - node.player, prior=prior)
            node.children.append(child)

        return value

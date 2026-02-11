"""
Khet Neural Network — Policy + Value architecture for AlphaZero-style training.

- Input: (16, 8, 10) board tensor
- Output: value head (scalar win probability) + policy head (move probabilities)
"""
import torch
import torch.nn as nn
import torch.nn.functional as F

NUM_CHANNELS = 16
BOARD_H = 8
BOARD_W = 10
POLICY_SIZE = 80 * 12  # 960 possible move indices


class ResBlock(nn.Module):
    """Residual block with two convolutions and batch norm."""

    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x):
        residual = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        out = F.relu(out + residual)
        return out


class KhetNet(nn.Module):
    """
    AlphaZero-style dual-head network for Khet.

    Architecture:
      - Input conv: 16ch → hidden_channels
      - N residual blocks
      - Value head: conv → FC → tanh
      - Policy head: conv → FC → log_softmax
    """

    def __init__(self, hidden_channels: int = 128, num_res_blocks: int = 8):
        super().__init__()
        self.hidden_channels = hidden_channels

        # Input tower
        self.input_conv = nn.Conv2d(NUM_CHANNELS, hidden_channels, 3, padding=1, bias=False)
        self.input_bn = nn.BatchNorm2d(hidden_channels)

        # Residual tower
        self.res_blocks = nn.ModuleList([
            ResBlock(hidden_channels) for _ in range(num_res_blocks)
        ])

        # Value head
        self.value_conv = nn.Conv2d(hidden_channels, 1, 1, bias=False)
        self.value_bn = nn.BatchNorm2d(1)
        self.value_fc1 = nn.Linear(BOARD_H * BOARD_W, 128)
        self.value_fc2 = nn.Linear(128, 1)

        # Policy head
        self.policy_conv = nn.Conv2d(hidden_channels, 32, 1, bias=False)
        self.policy_bn = nn.BatchNorm2d(32)
        self.policy_fc = nn.Linear(32 * BOARD_H * BOARD_W, POLICY_SIZE)

    def forward(self, x):
        """
        Args:
            x: (batch, 16, 8, 10) board tensor

        Returns:
            value: (batch, 1) — win probability in [-1, 1]
            policy: (batch, 960) — log probabilities over all moves
        """
        # Shared trunk
        out = F.relu(self.input_bn(self.input_conv(x)))
        for block in self.res_blocks:
            out = block(out)

        # Value head
        v = F.relu(self.value_bn(self.value_conv(out)))
        v = v.view(v.size(0), -1)
        v = F.relu(self.value_fc1(v))
        v = torch.tanh(self.value_fc2(v))

        # Policy head
        p = F.relu(self.policy_bn(self.policy_conv(out)))
        p = p.view(p.size(0), -1)
        p = self.policy_fc(p)
        p = F.log_softmax(p, dim=1)

        return v, p

    def predict(self, board_tensor):
        """
        Single-board inference (no batch dim).
        Returns (value_float, policy_numpy).
        """
        self.eval()
        with torch.no_grad():
            device = next(self.parameters()).device
            x = torch.from_numpy(board_tensor).unsqueeze(0).to(device)
            v, p = self(x)
            return v.item(), p.squeeze(0).exp().cpu().numpy()

    def count_parameters(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

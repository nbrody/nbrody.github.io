"""
Lightweight Khet Neural Network for web deployment.
Much smaller than the full model — designed to be <500KB when exported.

Key difference from model.py: policy head uses per-cell conv instead of a massive FC layer.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
import struct
import base64
import json

NUM_CHANNELS = 16
BOARD_H = 8
BOARD_W = 10
MOVES_PER_CELL = 12  # 8 directions + 4 rotation options


class SmallResBlock(nn.Module):
    def __init__(self, channels):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(channels)

    def forward(self, x):
        residual = x
        out = F.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return F.relu(out + residual)


class KhetNetSmall(nn.Module):
    """
    Compact dual-head network for Khet.

    Policy head: Conv-based (no huge FC layer).
      - Output: (batch, 12, 8, 10) — 12 possible actions per cell
      - Reshaped to (batch, 960) to match move indexing

    Value head: Small FC.
    """

    def __init__(self, hidden_channels=32, num_res_blocks=4):
        super().__init__()
        self.hidden_channels = hidden_channels
        self.num_res_blocks_count = num_res_blocks

        # Input
        self.input_conv = nn.Conv2d(NUM_CHANNELS, hidden_channels, 3, padding=1, bias=False)
        self.input_bn = nn.BatchNorm2d(hidden_channels)

        # Residual tower
        self.res_blocks = nn.ModuleList([
            SmallResBlock(hidden_channels) for _ in range(num_res_blocks)
        ])

        # Value head
        self.value_conv = nn.Conv2d(hidden_channels, 1, 1, bias=False)
        self.value_bn = nn.BatchNorm2d(1)
        self.value_fc1 = nn.Linear(BOARD_H * BOARD_W, 64)
        self.value_fc2 = nn.Linear(64, 1)

        # Policy head — convolutional, outputs 12 channels (one per move type per cell)
        self.policy_conv1 = nn.Conv2d(hidden_channels, hidden_channels, 1, bias=False)
        self.policy_bn = nn.BatchNorm2d(hidden_channels)
        self.policy_conv2 = nn.Conv2d(hidden_channels, MOVES_PER_CELL, 1)

    def forward(self, x):
        # Trunk
        out = F.relu(self.input_bn(self.input_conv(x)))
        for block in self.res_blocks:
            out = block(out)

        # Value head
        v = F.relu(self.value_bn(self.value_conv(out)))
        v = v.view(v.size(0), -1)
        v = F.relu(self.value_fc1(v))
        v = torch.tanh(self.value_fc2(v))

        # Policy head
        p = F.relu(self.policy_bn(self.policy_conv1(out)))
        p = self.policy_conv2(p)  # (batch, 12, 8, 10)
        # Reshape to (batch, 8*10*12) = (batch, 960)
        # Move index = (row * COLS + col) * 12 + action
        # p is (batch, 12, H, W) → transpose to (batch, H, W, 12) → reshape
        p = p.permute(0, 2, 3, 1).contiguous()  # (batch, H, W, 12)
        p = p.view(p.size(0), -1)  # (batch, 960)
        p = F.log_softmax(p, dim=1)

        return v, p

    def predict(self, board_tensor):
        self.eval()
        with torch.no_grad():
            device = next(self.parameters()).device
            x = torch.from_numpy(board_tensor).unsqueeze(0).to(device)
            v, p = self(x)
            return v.item(), p.squeeze(0).exp().cpu().numpy()

    def count_parameters(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

    def export_to_json(self, filepath):
        """Export weights in compact base64-encoded binary format."""
        state = self.state_dict()
        export = {
            'architecture': {
                'hidden_channels': self.hidden_channels,
                'num_res_blocks': self.num_res_blocks_count,
            },
            'layers': {}
        }
        for key, tensor in state.items():
            data = tensor.cpu().float().numpy().flatten()
            binary = struct.pack(f'{len(data)}f', *data)
            b64 = base64.b64encode(binary).decode('ascii')
            export['layers'][key] = {
                'shape': list(tensor.shape),
                'data': b64,
            }
        with open(filepath, 'w') as f:
            json.dump(export, f)
        import os
        size = os.path.getsize(filepath)
        print(f"Exported {filepath}: {size / 1024:.1f} KB, {self.count_parameters():,} params")


if __name__ == "__main__":
    # Quick size check
    for ch, blocks in [(16, 2), (24, 3), (32, 4), (48, 4)]:
        net = KhetNetSmall(hidden_channels=ch, num_res_blocks=blocks)
        params = net.count_parameters()
        raw_kb = params * 4 / 1024
        b64_kb = raw_kb * 4 / 3
        print(f"  ch={ch:2d} blocks={blocks}: {params:>8,} params, ~{b64_kb:.0f} KB base64")

/**
 * Khet Neural Network — Pure JavaScript inference engine.
 * 
 * Loads weights exported from PyTorch (base64-encoded float32)
 * and runs forward passes entirely in the browser.
 * 
 * Architecture (matches model_small.py):
 *   Input conv → N residual blocks → value head + policy head
 */

// ========================
// Tensor Operations
// ========================

/** Create a Float32Array of given size, optionally filled with a value. */
function zeros(n) { return new Float32Array(n); }

/** 
 * Conv2d: (C_in, H, W) → (C_out, H, W) with 3x3 kernel, padding=1, no bias.
 * Weights shape: [C_out, C_in, kH, kW] stored flat.
 */
function conv2d_3x3(input, weight, C_in, C_out, H, W) {
    const out = zeros(C_out * H * W);
    for (let co = 0; co < C_out; co++) {
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let sum = 0;
                for (let ci = 0; ci < C_in; ci++) {
                    for (let ky = -1; ky <= 1; ky++) {
                        const iy = y + ky;
                        if (iy < 0 || iy >= H) continue;
                        for (let kx = -1; kx <= 1; kx++) {
                            const ix = x + kx;
                            if (ix < 0 || ix >= W) continue;
                            const wi = ((co * C_in + ci) * 3 + (ky + 1)) * 3 + (kx + 1);
                            sum += input[ci * H * W + iy * W + ix] * weight[wi];
                        }
                    }
                }
                out[co * H * W + y * W + x] = sum;
            }
        }
    }
    return out;
}

/**
 * Conv2d 1x1: (C_in, H, W) → (C_out, H, W).
 * Weights shape: [C_out, C_in, 1, 1] stored flat.
 * Optional bias shape: [C_out].
 */
function conv2d_1x1(input, weight, bias, C_in, C_out, H, W) {
    const out = zeros(C_out * H * W);
    for (let co = 0; co < C_out; co++) {
        const b = bias ? bias[co] : 0;
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let sum = b;
                for (let ci = 0; ci < C_in; ci++) {
                    sum += input[ci * H * W + y * W + x] * weight[co * C_in + ci];
                }
                out[co * H * W + y * W + x] = sum;
            }
        }
    }
    return out;
}

/**
 * BatchNorm2d inference: y = (x - mean) / sqrt(var + eps) * weight + bias
 */
function batchnorm2d(input, weight, bias, running_mean, running_var, C, H, W) {
    const out = zeros(C * H * W);
    const eps = 1e-5;
    for (let c = 0; c < C; c++) {
        const scale = weight[c] / Math.sqrt(running_var[c] + eps);
        const shift = bias[c] - running_mean[c] * scale;
        const offset = c * H * W;
        for (let i = 0; i < H * W; i++) {
            out[offset + i] = input[offset + i] * scale + shift;
        }
    }
    return out;
}

/** ReLU in-place */
function relu(data) {
    for (let i = 0; i < data.length; i++) {
        if (data[i] < 0) data[i] = 0;
    }
    return data;
}

/** Element-wise add */
function add(a, b) {
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
    return out;
}

/** Fully connected: (in_features,) → (out_features,) */
function linear(input, weight, bias, in_f, out_f) {
    const out = new Float32Array(out_f);
    for (let o = 0; o < out_f; o++) {
        let sum = bias[o];
        const row = o * in_f;
        for (let i = 0; i < in_f; i++) {
            sum += weight[row + i] * input[i];
        }
        out[o] = sum;
    }
    return out;
}

/** Softmax */
function softmax(logits) {
    const out = new Float32Array(logits.length);
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
        out[i] = Math.exp(logits[i] - max);
        sum += out[i];
    }
    for (let i = 0; i < logits.length; i++) out[i] /= sum;
    return out;
}

/** Tanh */
function tanh(x) { return Math.tanh(x); }


// ========================
// Weight Loading
// ========================

/** Decode base64-encoded float32 array */
function decodeWeights(b64String) {
    const binary = atob(b64String);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Float32Array(bytes.buffer);
}


// ========================
// Network Class
// ========================

const BOARD_H = 8;
const BOARD_W = 10;
const INPUT_CHANNELS = 16;
const MOVES_PER_CELL = 12;
const POLICY_SIZE = BOARD_H * BOARD_W * MOVES_PER_CELL; // 960

export class KhetNN {
    constructor() {
        this.loaded = false;
        this.weights = {};
        this.hiddenChannels = 32;
        this.numResBlocks = 4;
    }

    /** Load weights from JSON (fetched from server) */
    async loadWeights(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            this.hiddenChannels = data.architecture.hidden_channels;
            this.numResBlocks = data.architecture.num_res_blocks;

            // Decode all weight tensors
            for (const [key, value] of Object.entries(data.layers)) {
                this.weights[key] = decodeWeights(value.data);
            }

            this.loaded = true;
            console.log(`KhetNN loaded: ${this.hiddenChannels}ch, ${this.numResBlocks} blocks`);
            return true;
        } catch (e) {
            console.warn('Could not load neural network weights:', e);
            return false;
        }
    }

    /** Get a weight tensor by key */
    w(key) { return this.weights[key]; }

    /**
     * Forward pass.
     * @param {Float32Array} input - Board tensor of shape (16, 8, 10) flattened
     * @returns {{ value: number, policy: Float32Array }} value in [-1,1], policy of length 960
     */
    forward(input) {
        const H = BOARD_H, W = BOARD_W;
        const ch = this.hiddenChannels;

        // Input conv + BN + ReLU
        let x = conv2d_3x3(input, this.w('input_conv.weight'), INPUT_CHANNELS, ch, H, W);
        x = batchnorm2d(x,
            this.w('input_bn.weight'), this.w('input_bn.bias'),
            this.w('input_bn.running_mean'), this.w('input_bn.running_var'),
            ch, H, W);
        x = relu(x);

        // Residual blocks
        for (let i = 0; i < this.numResBlocks; i++) {
            const prefix = `res_blocks.${i}`;
            let residual = x;

            x = conv2d_3x3(x, this.w(`${prefix}.conv1.weight`), ch, ch, H, W);
            x = batchnorm2d(x,
                this.w(`${prefix}.bn1.weight`), this.w(`${prefix}.bn1.bias`),
                this.w(`${prefix}.bn1.running_mean`), this.w(`${prefix}.bn1.running_var`),
                ch, H, W);
            x = relu(x);

            x = conv2d_3x3(x, this.w(`${prefix}.conv2.weight`), ch, ch, H, W);
            x = batchnorm2d(x,
                this.w(`${prefix}.bn2.weight`), this.w(`${prefix}.bn2.bias`),
                this.w(`${prefix}.bn2.running_mean`), this.w(`${prefix}.bn2.running_var`),
                ch, H, W);

            x = add(x, residual);
            x = relu(x);
        }

        // ---- Value head ----
        let v = conv2d_1x1(x, this.w('value_conv.weight'), null, ch, 1, H, W);
        v = batchnorm2d(v,
            this.w('value_bn.weight'), this.w('value_bn.bias'),
            this.w('value_bn.running_mean'), this.w('value_bn.running_var'),
            1, H, W);
        v = relu(v);
        // Flatten to 80
        v = linear(v, this.w('value_fc1.weight'), this.w('value_fc1.bias'), H * W, 64);
        v = relu(v);
        v = linear(v, this.w('value_fc2.weight'), this.w('value_fc2.bias'), 64, 1);
        const value = tanh(v[0]);

        // ---- Policy head ----
        let p = conv2d_1x1(x, this.w('policy_conv1.weight'), null, ch, ch, H, W);
        p = batchnorm2d(p,
            this.w('policy_bn.weight'), this.w('policy_bn.bias'),
            this.w('policy_bn.running_mean'), this.w('policy_bn.running_var'),
            ch, H, W);
        p = relu(p);

        // policy_conv2 has bias
        p = conv2d_1x1(p, this.w('policy_conv2.weight'), this.w('policy_conv2.bias'),
            ch, MOVES_PER_CELL, H, W);

        // p is now (12, H, W) — need to transpose to (H, W, 12) and flatten to 960
        const policyLogits = new Float32Array(POLICY_SIZE);
        for (let r = 0; r < H; r++) {
            for (let c = 0; c < W; c++) {
                for (let a = 0; a < MOVES_PER_CELL; a++) {
                    // Source: channel a, row r, col c
                    const srcIdx = a * H * W + r * W + c;
                    // Dest: (r * W + c) * 12 + a
                    const dstIdx = (r * W + c) * MOVES_PER_CELL + a;
                    policyLogits[dstIdx] = p[srcIdx];
                }
            }
        }

        const policy = softmax(policyLogits);

        return { value, policy };
    }

    /**
     * Encode a game state into the neural network input format.
     * Matches khet_engine.py to_tensor_planes() exactly.
     */
    encodeBoard(game) {
        const planes = new Float32Array(INPUT_CHANNELS * BOARD_H * BOARD_W);
        const PIECE_INDEX = { pharaoh: 0, sphinx: 1, pyramid: 2, scarab: 3, anubis: 4 };

        for (let r = 0; r < BOARD_H; r++) {
            for (let c = 0; c < BOARD_W; c++) {
                const piece = game.getAt(c, r);
                if (!piece) continue;
                const idx = PIECE_INDEX[piece.type];
                const isCurrent = (piece.player === game.currentPlayer);
                const offset = isCurrent ? 0 : 5;

                // Piece plane
                planes[(offset + idx) * BOARD_H * BOARD_W + r * BOARD_W + c] = 1.0;

                // Facing plane (channels 10-13)
                planes[(10 + piece.facing) * BOARD_H * BOARD_W + r * BOARD_W + c] = 1.0;
            }
        }

        // Current player indicator (channel 14)
        if (game.currentPlayer === 0) { // SILVER
            const ch14 = 14 * BOARD_H * BOARD_W;
            for (let i = 0; i < BOARD_H * BOARD_W; i++) planes[ch14 + i] = 1.0;
        }

        // Move count (channel 15)
        const moveVal = Math.min((game.moveHistory?.length || 0) / 300.0, 1.0);
        const ch15 = 15 * BOARD_H * BOARD_W;
        for (let i = 0; i < BOARD_H * BOARD_W; i++) planes[ch15 + i] = moveVal;

        return planes;
    }
}

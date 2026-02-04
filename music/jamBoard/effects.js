/**
 * jamBoard Effects Engine
 * Collection of Web Audio API effect wrappers
 */

export class EffectChain {
    constructor(context) {
        this.context = context;
        this.effects = [];
        this.input = context.createGain();
        this.output = context.createGain();

        // Final link
        this.input.connect(this.output);
    }

    addEffect(effect) {
        this.effects.push(effect);
        this.rebuildChain();
    }

    rebuildChain() {
        // Disconnect only the links BETWEEN effects and chain endpoints
        this.input.disconnect();
        this.effects.forEach(e => e.output.disconnect());

        let lastNode = this.input;

        for (const effect of this.effects) {
            lastNode.connect(effect.input);
            lastNode = effect.output;
        }

        lastNode.connect(this.output);
    }
}

class BaseEffect {
    constructor(context, name) {
        this.context = context;
        this.name = name;
        this.input = context.createGain();
        this.output = context.createGain();
        this.bypassNode = context.createGain();
        this.active = false;

        // Setup internal bypass logic
        this.input.connect(this.bypassNode);
        this.bypassNode.connect(this.output);
    }

    toggle(state) {
        this.active = state !== undefined ? state : !this.active;
        if (this.active) {
            this.input.disconnect(this.bypassNode);
            this.connectEffect();
        } else {
            this.disconnectEffect();
            this.input.connect(this.bypassNode);
        }
        return this.active;
    }
}

export class Distortion extends BaseEffect {
    constructor(context) {
        super(context, 'Distortion');
        this.shaper = context.createWaveShaper();
        this.shaper.curve = this.makeDistortionCurve(400);
        this.shaper.oversample = '4x';

        this.gain = context.createGain();
        this.gain.gain.value = 1.0;
    }

    makeDistortionCurve(amount) {
        const k = typeof amount === 'number' ? amount : 50;
        const n_samples = 44100;
        const curve = new Float32Array(n_samples);
        for (let i = 0; i < n_samples; ++i) {
            const x = i * 2 / n_samples - 1;
            curve[i] = (1 + k) * x / (1 + k * Math.abs(x));
        }
        return curve;
    }

    connectEffect() {
        this.input.connect(this.shaper);
        this.shaper.connect(this.gain);
        this.gain.connect(this.output);
    }

    disconnectEffect() {
        this.input.disconnect(this.shaper);
        this.shaper.disconnect(this.gain);
    }

    setAmount(val) {
        this.shaper.curve = this.makeDistortionCurve(val * 1000);
    }
}

export class Delay extends BaseEffect {
    constructor(context) {
        super(context, 'Delay');
        this.delay = context.createDelay(5.0);
        this.feedback = context.createGain();
        this.mix = context.createGain();

        // Defaults
        this.delay.delayTime.value = 0.5;
        this.feedback.gain.value = 0.4;
        this.mix.gain.value = 0.5;
    }

    connectEffect() {
        this.input.connect(this.delay);
        this.delay.connect(this.feedback);
        this.feedback.connect(this.delay);
        this.delay.connect(this.mix);
        this.mix.connect(this.output);
        this.input.connect(this.output); // Dry signal
    }

    disconnectEffect() {
        this.input.disconnect(this.delay);
        this.input.disconnect(this.output);
        this.delay.disconnect(this.feedback);
        this.delay.disconnect(this.mix);
    }
}

export class Reverb extends BaseEffect {
    constructor(context) {
        super(context, 'Reverb');
        this.convolver = context.createConvolver();
        this.wet = context.createGain();
        this.wet.gain.value = 0.5;

        // Procedural Impulse
        this.convolver.buffer = this.buildImpulse(2, 2);
    }

    buildImpulse(duration, decay) {
        const sampleRate = this.context.sampleRate;
        const length = sampleRate * duration;
        const impulse = this.context.createBuffer(2, length, sampleRate);
        for (let i = 0; i < 2; i++) {
            const channelData = impulse.getChannelData(i);
            for (let j = 0; j < length; j++) {
                channelData[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, decay);
            }
        }
        return impulse;
    }

    connectEffect() {
        this.input.connect(this.convolver);
        this.convolver.connect(this.wet);
        this.wet.connect(this.output);
        this.input.connect(this.output); // Dry
    }

    disconnectEffect() {
        this.input.disconnect(this.convolver);
        this.input.disconnect(this.output);
    }
}

export class Wah extends BaseEffect {
    constructor(context) {
        super(context, 'Wah');
        this.filter = context.createBiquadFilter();
        this.filter.type = 'bandpass';
        this.filter.Q.value = 5;
        this.filter.frequency.value = 1000;
    }

    connectEffect() {
        this.input.connect(this.filter);
        this.filter.connect(this.output);
    }

    disconnectEffect() {
        this.input.disconnect(this.filter);
    }

    setFrequency(val) {
        // val 0.0 - 1.0
        const freq = 100 + (val * 4000);
        this.filter.frequency.setTargetAtTime(freq, this.context.currentTime, 0.05);
    }
}

export class Compressor extends BaseEffect {
    constructor(context) {
        super(context, 'Compressor');
        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-24, context.currentTime);
        this.compressor.knee.setValueAtTime(40, context.currentTime);
        this.compressor.ratio.setValueAtTime(12, context.currentTime);
        this.compressor.attack.setValueAtTime(0, context.currentTime);
        this.compressor.release.setValueAtTime(0.25, context.currentTime);
    }

    connectEffect() {
        this.input.connect(this.compressor);
        this.compressor.connect(this.output);
    }

    disconnectEffect() {
        this.input.disconnect(this.compressor);
    }
}

export class Chorus extends BaseEffect {
    constructor(context) {
        super(context, 'Chorus');
        this.delay = context.createDelay();
        this.osc = context.createOscillator();
        this.depth = context.createGain();

        this.delay.delayTime.value = 0.03;
        this.depth.gain.value = 0.002;
        this.osc.frequency.value = 1.5;

        this.osc.connect(this.depth);
        this.depth.connect(this.delay.delayTime);
        this.osc.start();
    }

    connectEffect() {
        this.input.connect(this.delay);
        this.delay.connect(this.output);
        this.input.connect(this.output);
    }

    disconnectEffect() {
        this.input.disconnect(this.delay);
        this.input.disconnect(this.output);
    }
}

export class Filter extends BaseEffect {
    constructor(context) {
        super(context, 'Filter');
        this.filter = context.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.frequency.value = 2000;
    }

    connectEffect() {
        this.input.connect(this.filter);
        this.filter.connect(this.output);
    }

    disconnectEffect() {
        this.input.disconnect(this.filter);
    }
}

export class Tremolo extends BaseEffect {
    constructor(context) {
        super(context, 'Tremolo');
        this.gainNode = context.createGain();
        this.osc = context.createOscillator();
        this.depth = context.createGain();

        this.depth.gain.value = 0.5;
        this.osc.frequency.value = 4.0;

        this.osc.connect(this.depth);
        this.depth.connect(this.gainNode.gain);
        this.osc.start();
    }

    connectEffect() {
        this.input.connect(this.gainNode);
        this.gainNode.connect(this.output);
    }

    disconnectEffect() {
        this.input.disconnect(this.gainNode);
    }
}

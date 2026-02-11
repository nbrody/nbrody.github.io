const GAME_CONFIG = {
    bpm: 128,
    leadIn: 1.8,
    hitLineRatio: 0.84,
    healthStart: 100,
    healthMax: 100,
    travelByDifficulty: {
        yellow: 1.9,
        emerald: 1.7,
        tornado: 1.55
    },
    windowsByDifficulty: {
        yellow: { perfect: 0.08, great: 0.15, good: 0.22, miss: 0.28 },
        emerald: { perfect: 0.065, great: 0.125, good: 0.19, miss: 0.25 },
        tornado: { perfect: 0.05, great: 0.1, good: 0.155, miss: 0.21 }
    }
};

const SCORE_VALUES = {
    perfect: 1000,
    great: 760,
    good: 460
};

const ACCURACY_VALUES = {
    perfect: 1,
    great: 0.82,
    good: 0.58,
    miss: 0
};

const HEALTH_VALUES = {
    perfect: 2.2,
    great: 1.4,
    good: 0.9,
    miss: -9,
    badTap: -3
};

const KEY_TO_LANE = {
    ArrowLeft: 0,
    ArrowDown: 1,
    ArrowUp: 2,
    ArrowRight: 3,
    a: 0,
    A: 0,
    s: 1,
    S: 1,
    w: 2,
    W: 2,
    d: 3,
    D: 3
};

const LANE_LABELS = ["LEFT", "DOWN", "UP", "RIGHT"];

const JUDGEMENT_COPY = {
    perfect: ["Ruby Perfect!", "Emerald Precision!", "Yellow Brick Fire!"],
    great: ["Great Step!", "Munchkin Approved!", "Nice Rhythm!"],
    good: ["Good Step!", "Keep Moving!", "You Are In Time!"],
    miss: ["Flying Monkey Miss!", "The Beat Got Away!", "Witch Trap Miss!"],
    bad: ["No Note There!", "Off The Road!", "Wrong Step!"],
    go: ["Follow The Yellow Brick Beat!"],
    win: ["Emerald City Reached!"],
    lose: ["The Tornado Took Your Combo!"]
};

const SCALE_MAJOR = [0, 2, 4, 5, 7, 9, 11];

const MUSIC_TRACK = {
    stepsPerBar: 16,
    stepDurationBeats: 0.5,
    lookAhead: 0.12,
    progressionDegrees: [0, 3, 4, 5],
    melodyDegrees: [4, null, 5, null, 7, null, 5, null, 4, null, 2, null, 1, null, 2, 4],
    counterDegrees: [2, null, 4, null, 5, null, 4, null, 2, null, 1, null, 0, null, 1, 2]
};

const ui = {
    playfield: document.getElementById("playfield"),
    laneEls: Array.from(document.querySelectorAll(".lane")),
    hitLine: document.getElementById("hitLine"),
    scoreValue: document.getElementById("scoreValue"),
    comboValue: document.getElementById("comboValue"),
    accuracyValue: document.getElementById("accuracyValue"),
    healthValue: document.getElementById("healthValue"),
    songTimeValue: document.getElementById("songTimeValue"),
    statusLine: document.getElementById("statusLine"),
    judgementText: document.getElementById("judgementText"),
    difficultySelect: document.getElementById("difficultySelect"),
    startButton: document.getElementById("startButton"),
    resetButton: document.getElementById("resetButton"),
    endCard: document.getElementById("endCard"),
    tapButtons: Array.from(document.querySelectorAll(".tap-button"))
};

const state = {
    running: false,
    chart: [],
    songStartMs: 0,
    songDuration: 0,
    currentTime: 0,
    travelTime: GAME_CONFIG.travelByDifficulty.emerald,
    timingWindows: { ...GAME_CONFIG.windowsByDifficulty.emerald },
    health: GAME_CONFIG.healthStart,
    score: 0,
    combo: 0,
    maxCombo: 0,
    hits: {
        perfect: 0,
        great: 0,
        good: 0,
        miss: 0
    },
    accuracyEarned: 0,
    accuracyPossible: 0,
    resolvedCount: 0,
    playfieldHeight: 0,
    hitLineY: 0,
    beatDuration: 60 / GAME_CONFIG.bpm,
    nextBeatTime: 0,
    rafId: 0,
    judgementTimeout: 0,
    lanePulseTimeouts: [0, 0, 0, 0],
    audioCtx: null,
    masterGain: null,
    musicGain: null,
    fxGain: null,
    music: {
        active: false,
        stepDuration: (60 / GAME_CONFIG.bpm) * MUSIC_TRACK.stepDurationBeats,
        nextEventTime: 0,
        stepIndex: 0
    }
};

function buildChart() {
    const beat = 60 / GAME_CONFIG.bpm;
    const notes = [];
    let t = GAME_CONFIG.leadIn;

    const motifs = [
        [0, 1, 2, 3, 0, 2, 1, 3],
        [3, 2, 1, 0, 3, 1, 2, 0],
        [0, 1, 0, 2, 1, 3, 2, 3],
        [2, 0, 3, 1, 2, 1, 3, 0]
    ];

    for (let section = 0; section < 8; section += 1) {
        const motif = motifs[section % motifs.length];
        for (let i = 0; i < motif.length; i += 1) {
            const lane = motif[i];
            notes.push({ time: t, lane });

            if (section >= 2 && i % 2 === 0) {
                notes.push({ time: t + beat / 2, lane: (lane + section + 1) % 4 });
            }

            if (section >= 5 && i === 3) {
                notes.push({ time: t, lane: (lane + 2) % 4 });
            }

            t += beat;
        }

        if (section % 2 === 1) {
            [0, 1, 2, 3].forEach((lane, idx) => {
                notes.push({ time: t + (idx * beat) / 2, lane });
            });
            t += beat * 2;
        } else {
            t += beat;
        }
    }

    for (let finisher = 0; finisher < 8; finisher += 1) {
        const lane = [0, 2, 1, 3][finisher % 4];
        notes.push({ time: t, lane });

        if (finisher % 2 === 0) {
            notes.push({ time: t, lane: (lane + 2) % 4 });
        }

        t += beat / 2;
    }

    return notes
        .sort((a, b) => a.time - b.time)
        .map((note, idx) => ({
            id: idx,
            time: note.time,
            lane: note.lane,
            spawned: false,
            resolved: false,
            el: null
        }));
}

function applyDifficulty(diff) {
    const chosen = GAME_CONFIG.travelByDifficulty[diff] ? diff : "emerald";
    state.travelTime = GAME_CONFIG.travelByDifficulty[chosen];
    state.timingWindows = { ...GAME_CONFIG.windowsByDifficulty[chosen] };
}

function setupGameState() {
    cancelAnimationFrame(state.rafId);
    stopMusic();
    state.running = false;
    state.currentTime = 0;
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.health = GAME_CONFIG.healthStart;
    state.hits.perfect = 0;
    state.hits.great = 0;
    state.hits.good = 0;
    state.hits.miss = 0;
    state.accuracyEarned = 0;
    state.accuracyPossible = 0;
    state.resolvedCount = 0;
    state.chart = buildChart();
    state.songDuration = state.chart[state.chart.length - 1].time + 1.5;
    state.nextBeatTime = GAME_CONFIG.leadIn;

    clearNotesFromDom();
    syncGeometry();
    clearEndCard();
    showJudgement("idle", "Ready");
    ui.statusLine.textContent = "Press Start to begin the trip down the yellow brick road.";
    ui.startButton.disabled = false;
    ui.difficultySelect.disabled = false;
    updateStats();
}

function clearNotesFromDom() {
    ui.laneEls.forEach((laneEl) => {
        laneEl.querySelectorAll(".note").forEach((noteEl) => noteEl.remove());
        laneEl.classList.remove("active");
    });
}

function syncGeometry() {
    state.playfieldHeight = ui.playfield.clientHeight;
    state.hitLineY = state.playfieldHeight * GAME_CONFIG.hitLineRatio;
}

function spawnNote(note) {
    const el = document.createElement("div");
    el.className = `note note-lane-${note.lane}`;
    el.textContent = LANE_LABELS[note.lane].charAt(0);
    ui.laneEls[note.lane].appendChild(el);
    note.el = el;
    note.spawned = true;
}

function updateNotes(now) {
    const spawnLead = state.travelTime + 0.05;
    const missWindow = state.timingWindows.miss;

    for (const note of state.chart) {
        if (!note.spawned && now >= note.time - spawnLead) {
            spawnNote(note);
        }

        if (!note.spawned || note.resolved || !note.el) {
            continue;
        }

        const progress = (now - (note.time - state.travelTime)) / state.travelTime;
        const y = progress * state.hitLineY;
        note.el.style.top = `${y}px`;

        if (now - note.time > missWindow) {
            registerMiss(note, true);
        }
    }
}

function cleanupResolvedNotes(now) {
    for (const note of state.chart) {
        if (note.resolved && note.el && now - note.time > 0.28) {
            note.el.remove();
            note.el = null;
        }
    }
}

function resolveHit(note, judgement) {
    if (note.resolved) {
        return;
    }

    note.resolved = true;
    state.resolvedCount += 1;
    state.hits[judgement] += 1;
    state.score += SCORE_VALUES[judgement];
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.accuracyEarned += ACCURACY_VALUES[judgement];
    state.accuracyPossible += 1;
    state.health = clamp(state.health + HEALTH_VALUES[judgement], 0, GAME_CONFIG.healthMax);

    if (note.el) {
        note.el.classList.add(`hit-${judgement}`);
    }

    playHitTone(note.lane, judgement);
    showJudgement(judgement);
    updateStats();
}

function registerMiss(note, fromTimeline) {
    if (note.resolved) {
        return;
    }

    note.resolved = true;
    state.resolvedCount += 1;
    state.combo = 0;
    state.hits.miss += 1;
    state.accuracyPossible += 1;
    state.health = clamp(state.health + HEALTH_VALUES.miss, 0, GAME_CONFIG.healthMax);

    if (note.el) {
        note.el.classList.add("missed");
    }

    playMissTone();
    showJudgement("miss");

    if (!fromTimeline) {
        ui.statusLine.textContent = "Missed the timing window. Stay on the yellow brick road.";
    }

    updateStats();
}

function registerBadTap() {
    state.combo = 0;
    state.health = clamp(state.health + HEALTH_VALUES.badTap, 0, GAME_CONFIG.healthMax);
    playBadTapTone();
    showJudgement("bad");
    updateStats();
}

function judgeDelta(delta) {
    if (delta <= state.timingWindows.perfect) {
        return "perfect";
    }

    if (delta <= state.timingWindows.great) {
        return "great";
    }

    if (delta <= state.timingWindows.good) {
        return "good";
    }

    return "miss";
}

function handleLaneInput(lane) {
    if (!state.running) {
        return;
    }

    pulseLane(lane);

    const now = state.currentTime;
    let bestNote = null;
    let bestDelta = Infinity;

    for (const note of state.chart) {
        if (note.lane !== lane || note.resolved || !note.spawned) {
            continue;
        }

        const delta = Math.abs(now - note.time);
        if (delta < bestDelta) {
            bestDelta = delta;
            bestNote = note;
        }

        if (note.time - now > state.timingWindows.miss) {
            break;
        }
    }

    if (!bestNote || bestDelta > state.timingWindows.miss) {
        registerBadTap();
        return;
    }

    const judgement = judgeDelta(bestDelta);
    if (judgement === "miss") {
        registerMiss(bestNote, false);
        return;
    }

    resolveHit(bestNote, judgement);
}

function pulseLane(lane) {
    const laneEl = ui.laneEls[lane];
    laneEl.classList.add("active");

    clearTimeout(state.lanePulseTimeouts[lane]);
    state.lanePulseTimeouts[lane] = setTimeout(() => {
        laneEl.classList.remove("active");
    }, 90);
}

function pulseHitLine() {
    ui.hitLine.classList.remove("pulse");
    void ui.hitLine.offsetWidth;
    ui.hitLine.classList.add("pulse");
}

function showJudgement(type, forcedText = null) {
    const list = JUDGEMENT_COPY[type] || ["Ready"];
    const text = forcedText || list[Math.floor(Math.random() * list.length)];
    ui.judgementText.textContent = text;
    ui.judgementText.className = `judgement ${type}`;

    clearTimeout(state.judgementTimeout);
    if (type !== "idle" && type !== "go") {
        state.judgementTimeout = setTimeout(() => {
            ui.judgementText.textContent = "On Beat";
            ui.judgementText.className = "judgement idle";
        }, 260);
    }
}

function clearEndCard() {
    ui.endCard.innerHTML = "";
    ui.endCard.classList.add("hidden");
}

function endGame(victory) {
    state.running = false;
    cancelAnimationFrame(state.rafId);
    stopMusic();
    ui.startButton.disabled = false;
    ui.difficultySelect.disabled = false;

    const accuracy = formatAccuracy();
    const headline = victory ? "You reached Emerald City." : "The storm knocked you out.";
    const summary = victory
        ? "Excellent roadwork. The Wizard approves."
        : "Try again and keep your steps tighter.";

    ui.endCard.innerHTML = `
        <h3>${headline}</h3>
        <p><strong>Final Score:</strong> ${state.score.toLocaleString("en-US")}</p>
        <p><strong>Max Combo:</strong> ${state.maxCombo}x</p>
        <p><strong>Accuracy:</strong> ${accuracy}</p>
        <p>${summary}</p>
    `;
    ui.endCard.classList.remove("hidden");

    ui.statusLine.textContent = victory
        ? "Full clear complete. Press Start for another run."
        : "Health dropped to zero. Press Start to retry.";

    showJudgement(victory ? "win" : "lose");
}

function updateBeatPulse(now) {
    while (now >= state.nextBeatTime) {
        pulseHitLine();
        playBeatTone();
        state.nextBeatTime += state.beatDuration;
    }
}

function updateStats() {
    ui.scoreValue.textContent = state.score.toLocaleString("en-US");
    ui.comboValue.textContent = `${state.combo}x`;
    ui.accuracyValue.textContent = formatAccuracy();
    ui.healthValue.textContent = `${Math.round(state.health)}%`;
    ui.songTimeValue.textContent = `${formatClock(state.currentTime)} / ${formatClock(state.songDuration)}`;
}

function formatClock(seconds) {
    const clamped = Math.max(0, Math.floor(seconds));
    const mins = String(Math.floor(clamped / 60)).padStart(2, "0");
    const secs = String(clamped % 60).padStart(2, "0");
    return `${mins}:${secs}`;
}

function formatAccuracy() {
    if (state.accuracyPossible === 0) {
        return "100.0%";
    }

    return `${((state.accuracyEarned / state.accuracyPossible) * 100).toFixed(1)}%`;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function initAudio() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) {
        state.audioCtx = null;
        return;
    }

    if (state.audioCtx) {
        if (state.audioCtx.state === "suspended") {
            state.audioCtx.resume().catch(() => {});
        }
        return;
    }

    try {
        state.audioCtx = new AudioCtor();
        state.masterGain = state.audioCtx.createGain();
        state.masterGain.gain.value = 0.36;
        state.masterGain.connect(state.audioCtx.destination);

        state.musicGain = state.audioCtx.createGain();
        state.musicGain.gain.value = 0.34;
        state.musicGain.connect(state.masterGain);

        state.fxGain = state.audioCtx.createGain();
        state.fxGain.gain.value = 0.52;
        state.fxGain.connect(state.masterGain);
    } catch (err) {
        state.audioCtx = null;
        state.masterGain = null;
        state.musicGain = null;
        state.fxGain = null;
    }
}

function playTone(freq, duration, gain, type = "sine", when = null, channel = "fx") {
    if (!state.audioCtx) {
        return;
    }

    const targetNode = channel === "music" ? state.musicGain : state.fxGain;
    if (!targetNode) {
        return;
    }

    const now = state.audioCtx.currentTime;
    const t = Math.max(when ?? now, now + 0.001);
    const osc = state.audioCtx.createOscillator();
    const amp = state.audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(amp);
    amp.connect(targetNode);
    osc.start(t);
    osc.stop(t + duration + 0.02);
}

function playBeatTone() {
    playTone(146, 0.05, 0.012, "triangle");
}

function playHitTone(lane, judgement) {
    const freqs = [330, 392, 440, 523];
    const gain = judgement === "perfect" ? 0.085 : judgement === "great" ? 0.065 : 0.05;
    playTone(freqs[lane], 0.09, gain, "square");
}

function playMissTone() {
    playTone(116, 0.09, 0.05, "sawtooth");
}

function playBadTapTone() {
    playTone(98, 0.07, 0.035, "triangle");
}

function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

function scaleDegreeToMidi(baseMidi, degree) {
    const octave = Math.floor(degree / 7);
    const wrapped = ((degree % 7) + 7) % 7;
    return baseMidi + SCALE_MAJOR[wrapped] + octave * 12;
}

function playKick(when) {
    if (!state.audioCtx || !state.musicGain) {
        return;
    }

    const t = Math.max(when, state.audioCtx.currentTime + 0.001);
    const osc = state.audioCtx.createOscillator();
    const amp = state.audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(145, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.14);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.16, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(amp);
    amp.connect(state.musicGain);
    osc.start(t);
    osc.stop(t + 0.16);
}

function playRim(when) {
    playTone(210, 0.05, 0.025, "square", when, "music");
    playTone(460, 0.035, 0.018, "square", when + 0.004, "music");
}

function playMusicNote(midi, duration, gain, type, when) {
    playTone(midiToFreq(midi), duration, gain, type, when, "music");
}

function scheduleMusicStep(stepIndex, when) {
    const stepInBar = stepIndex % MUSIC_TRACK.stepsPerBar;
    const bar = Math.floor(stepIndex / MUSIC_TRACK.stepsPerBar);
    const rootDegree = MUSIC_TRACK.progressionDegrees[bar % MUSIC_TRACK.progressionDegrees.length];

    if (stepInBar % 2 === 0) {
        playKick(when);
    } else if (stepInBar % 4 === 1 || stepInBar % 4 === 3) {
        playRim(when);
    }

    if (stepInBar % 4 === 0) {
        const chordRoot = scaleDegreeToMidi(47, rootDegree);
        playMusicNote(chordRoot, 0.5, 0.028, "triangle", when);
        playMusicNote(chordRoot + 4, 0.52, 0.024, "triangle", when + 0.006);
        playMusicNote(chordRoot + 7, 0.5, 0.021, "triangle", when + 0.012);
    }

    if (stepInBar % 2 === 0) {
        const bassDegree = rootDegree + (stepInBar === 6 || stepInBar === 14 ? 4 : 0);
        const bassMidi = scaleDegreeToMidi(35, bassDegree);
        playMusicNote(bassMidi, 0.24, 0.07, "sawtooth", when);
    }

    const melodyDegree = MUSIC_TRACK.melodyDegrees[stepInBar];
    if (melodyDegree !== null) {
        const melodyMidi = scaleDegreeToMidi(59, rootDegree + melodyDegree);
        playMusicNote(melodyMidi, 0.2, 0.05, "square", when);
    }

    const counterDegree = MUSIC_TRACK.counterDegrees[stepInBar];
    if (counterDegree !== null && stepInBar % 2 === 1) {
        const counterMidi = scaleDegreeToMidi(63, rootDegree + counterDegree);
        playMusicNote(counterMidi, 0.18, 0.032, "triangle", when + 0.02);
    }
}

function startMusic() {
    if (!state.audioCtx) {
        ui.statusLine.textContent = "Audio is unavailable in this browser. Gameplay still works.";
        return;
    }

    state.music.active = true;
    state.music.nextEventTime = 0;
    state.music.stepIndex = 0;
}

function stopMusic() {
    state.music.active = false;
}

function updateMusic(songTimeNow) {
    if (!state.audioCtx || !state.music.active) {
        return;
    }

    const horizon = songTimeNow + MUSIC_TRACK.lookAhead;
    while (state.music.nextEventTime <= horizon) {
        const ahead = state.music.nextEventTime - songTimeNow;
        const when = state.audioCtx.currentTime + Math.max(0, ahead);
        scheduleMusicStep(state.music.stepIndex, when);
        state.music.stepIndex += 1;
        state.music.nextEventTime += state.music.stepDuration;
    }
}

function gameLoop() {
    if (!state.running) {
        return;
    }

    state.currentTime = (performance.now() - state.songStartMs) / 1000;
    updateMusic(state.currentTime);
    updateBeatPulse(state.currentTime);
    updateNotes(state.currentTime);
    cleanupResolvedNotes(state.currentTime);
    updateStats();

    if (state.health <= 0) {
        endGame(false);
        return;
    }

    if (state.currentTime > state.songDuration && state.resolvedCount >= state.chart.length) {
        endGame(true);
        return;
    }

    state.rafId = requestAnimationFrame(gameLoop);
}

function startGame() {
    applyDifficulty(ui.difficultySelect.value);
    setupGameState();
    initAudio();
    startMusic();

    state.running = true;
    state.songStartMs = performance.now();
    ui.startButton.disabled = true;
    ui.difficultySelect.disabled = true;
    ui.statusLine.textContent = "Song live. Follow the yellow brick beat.";
    showJudgement("go");
    state.rafId = requestAnimationFrame(gameLoop);
}

function onKeyDown(event) {
    if (event.code === "Space") {
        event.preventDefault();
        if (!state.running) {
            startGame();
        }
        return;
    }

    const lane = KEY_TO_LANE[event.key];
    if (lane === undefined || event.repeat) {
        return;
    }

    event.preventDefault();
    handleLaneInput(lane);
}

function onTapButton(event) {
    event.preventDefault();
    const lane = Number(event.currentTarget.dataset.lane);
    if (Number.isNaN(lane)) {
        return;
    }
    handleLaneInput(lane);
}

function bindEvents() {
    ui.startButton.addEventListener("click", startGame);
    ui.resetButton.addEventListener("click", setupGameState);
    ui.difficultySelect.addEventListener("change", () => {
        applyDifficulty(ui.difficultySelect.value);
        if (!state.running) {
            ui.statusLine.textContent = "Difficulty set. Press Start when ready.";
        }
    });

    ui.tapButtons.forEach((button) => {
        button.addEventListener("pointerdown", onTapButton);
    });

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", syncGeometry);
}

bindEvents();
setupGameState();

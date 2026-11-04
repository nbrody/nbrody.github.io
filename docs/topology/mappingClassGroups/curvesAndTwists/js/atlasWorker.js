// atlasWorker.js — builds the pretzel and the map onto it off the main thread.
import { Surface } from './surface.js';
import * as M from './mcg.js';
import { makePretzel } from './pretzel.js';
import { buildAtlas, atlasData } from './atlas.js';

self.onmessage = e => {
    const { g } = e.data;
    try {
        const S = new Surface(g), refs = {};
        for (const [k, w] of Object.entries(M.chainWords(g))) refs[k] = M.curveFromWord(S, w);
        const d = atlasData(buildAtlas(S, refs, makePretzel(g)));
        self.postMessage({ g, ok: true, data: d }, [d.pz.pos.buffer, d.pz.nrm.buffer, d.pz.tri.buffer, d.K.buffer, d.cm.copy.buffer]);
    } catch (err) {
        self.postMessage({ g, ok: false, error: String(err && err.message || err) });
    }
};

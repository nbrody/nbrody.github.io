/* The ONNX graph is one recurrent step of the trained stroke model. */
importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.js');
importScripts('leading-e.js?v=1');
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const modelDirectories = Object.freeze({original: 'model', general: 'models/general', focused: 'models/focused'});
let session, config, loadedModel;
const tensor = (a, n) => new ort.Tensor('float32', a instanceof Float32Array ? a : (a.length ? new Float32Array(a) : new Float32Array(n)), [1, n]);
function normalPair() {
  const u = Math.max(Number.MIN_VALUE, Math.random());
  const v = Math.random();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}
function sample(y, M, bias) {
  let logits = Array.from(y.slice(1, 1 + M), v => v * (1 + bias));
  const top = Math.max(...logits);
  logits = logits.map(v => Math.exp(v - top));
  let target = Math.random() * logits.reduce((a,b) => a + b, 0), k = M - 1;
  for (let j=0; j<M; j++) { target -= logits[j]; if (target <= 0) { k=j; break; } }
  const mx=y[1+M+k], my=y[1+2*M+k], sx=Math.exp(y[1+3*M+k]-bias), sy=Math.exp(y[1+4*M+k]-bias), rho=Math.tanh(y[1+5*M+k]);
  const [z1,z2] = normalPair();
  return [mx + sx*z1, my + sy*(rho*z1 + Math.sqrt(Math.max(0,1-rho*rho))*z2), Math.random() < 1/(1+Math.exp(-y[0])) ? 1 : 0];
}
function chunks(line) {
  const result = []; let current = '';
  for (const word of line.trim().split(/\s+/).filter(Boolean)) {
    if (current && current.length + 1 + word.length > 14) { result.push(current); current=word; }
    else current += (current ? ' ' : '') + word;
  }
  if (current) result.push(current);
  return result;
}
async function generatePiece(text, selectedBias) {
  const U = text.length, {hidden:H, charDim:E, K, M, norm} = config;
  const bias = Number.isFinite(selectedBias) ? Math.max(0, Math.min(3, selectedBias)) : config.bias;
  const chars = new ort.Tensor('int64', BigInt64Array.from(Array.from(text, c => BigInt(c.charCodeAt(0)-31))), [1,U]);
  let last;
  for (let attempt=0; attempt<4; attempt++) {
    let state = {h1:tensor([], H), c1:tensor([], H), w:tensor([], E), kappa:tensor([], K), h2:tensor([], H), c2:tensor([], H), h3:tensor([], H), c3:tensor([], H)};
    let x = tensor([0,0,1], 3), px=0, py=0, loX=Infinity, hiX=-Infinity, loY=Infinity, hiY=-Infinity;
    const points=[];
    for (let t=0; t<40*U+100; t++) {
      const out=await session.run({x, text:chars, ...state});
      const step=sample(out.y.data, M, bias);
      x=tensor(step, 3);
      for (const name of Object.keys(state)) state[name] = out['next_'+name];
      px+=step[0]*norm; py+=step[1]*norm;
      points.push({x:px,y:py,lift:!!step[2]});
      loX=Math.min(loX,px); hiX=Math.max(hiX,px); loY=Math.min(loY,py); hiY=Math.max(hiY,py);
      const phi=out.phi.data;
      let max=-Infinity; for(let i=0;i<U;i++) max=Math.max(max,phi[i]);
      if (t>5 && phi[U]>max && step[2]) break;
    }
    last={points,loX,hiX};
    if (hiY-loY<2.6 && 0.15*U<hiX-loX && hiX-loX<1.4*U+2) break;
  }
  return last;
}
onmessage = async ({data}) => {
  try {
    const model = data.model ?? 'original';
    if (!Object.hasOwn(modelDirectories, model)) throw new Error('Unknown handwriting model.');
    if (!session || loadedModel !== model) {
      postMessage({type:'loading'});
      const directory = modelDirectories[model];
      const response=await fetch(`${directory}/config.json`);
      if (!response.ok) throw new Error('Could not load model configuration.');
      const nextConfig=await response.json();
      const nextSession=await ort.InferenceSession.create(`${directory}/step.onnx`, {executionProviders:['wasm'], graphOptimizationLevel:'all'});
      config=nextConfig; session=nextSession; loadedModel=model;
    }
    const groups=data.text.split('\n').map(chunks);
    const total=groups.reduce((n,g)=>n+g.length,0);
    const wantsRepair = data.repairLeadingE === true;
    const eligible = wantsRepair && HandwritingLeadingE.supportsLeadingE(data.text);
    let completed=0, repairApplied=false; const lines=[];
    for (const group of groups) {
      let cursor=0; const line=[];
      for (const text of group) {
        let piece;
        if (eligible && completed === 0) {
          if (text === 'E') {
            piece = HandwritingLeadingE.standaloneE();
            repairApplied = true;
          } else {
            const remainder = await generatePiece(text.slice(1), data.bias);
            piece = HandwritingLeadingE.prependE(remainder);
            repairApplied = Boolean(piece);
          }
        }
        if (!piece) piece=await generatePiece(text, data.bias);
        for (const p of piece.points) line.push({...p, x:p.x + cursor - piece.loX});
        if (line.length) line[line.length-1].lift=true;
        cursor += piece.hiX-piece.loX+0.83;
        postMessage({type:'progress',completed:++completed,total});
      }
      lines.push(line);
    }
    if (wantsRepair) postMessage({type:'repair', applied:repairApplied});
    postMessage({type:'done',lines});
  } catch (error) { postMessage({type:'error',message:error?.message || String(error)}); }
};

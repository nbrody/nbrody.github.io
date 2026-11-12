import test from 'node:test';
import assert from 'node:assert/strict';
import {BITS,parseFx,fd,fx,formatFx,pointAtUV,orbitFixed} from '../fixed.js';
import {iterationsFor,precisionFor} from '../deepzoom.js';
const center=[parseFx('-0.743643887037158704752191506114774'),parseFx('0.131825904205311970493132056385139')];
function escapeFixed([cr,ci],limit){let zr=0n,zi=0n;const p=BigInt(BITS),threshold=1000000n<<(2n*p);for(let n=1;n<=limit;n++){const r=((zr*zr-zi*zi)>>p)+cr;zi=((zr*zi)>>(p-1n))+ci;zr=r;if(zr*zr+zi*zi>threshold)return n;}return null;}
test('decimal fixed-point centers retain differences beyond double precision',()=>{
 const a=parseFx('-0.743643887037158704752191506114774'), b=parseFx('-0.743643887037158704752191506114773');
 assert.notEqual(a,b);assert.equal(fd(a),fd(b));assert.equal(formatFx(a,33),'−0.743643887037158704752191506114774');
 assert.ok(Math.abs(fd(parseFx('1e-24'))-fd(fx(1e-24)))<1e-39);
});
test('reference orbit agrees with independently computed high-precision values',()=>{
 const p=orbitFixed(center[0],center[1],1000).at(-1);
 assert.ok(Math.abs(fd(p[0])-(-.20801572532896536))<1e-14);
 assert.ok(Math.abs(fd(p[1])-(-.06423715142554455))<1e-14);
});
test('distinct 10^-24 deep locations match the Decimal escape oracle',()=>{
 const points=[[.1,.1],[.3,.7],[.5,.5],[.7,.3],[.9,.9]];
 const actual=points.map(([u,v])=>escapeFixed(pointAtUV(u,v,center,4e-24),25000));
 assert.deepEqual(actual,[13086,17034,null,17034,13085]);
 assert.ok(iterationsFor(4e-24)>10000);assert.ok(precisionFor(4e-24)>53);
});

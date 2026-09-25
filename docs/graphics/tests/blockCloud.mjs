import assert from 'node:assert/strict';
import {cameraAt,makeNoise,cloudField,clearanceAt,samplingAt,PERIOD,VIEW_PITCH,flightTrack} from '../blockCloud/scene.js';
const data=makeNoise(2718);
assert.deepEqual(data,makeNoise(2718));
assert.notDeepEqual(data,makeNoise(2719));
for(let i=0;i<100;i++) {
  const p=[i*13.87-700,i%50-8,i*9.31];
  assert(Math.abs(cloudField(p,data)-cloudField([p[0]+PERIOD,p[1],p[2]-PERIOD],data))<1e-10);
}
for(const [seconds,scale] of [[0,1],[9.999,1],[10,0.25],[19.999,0.25],[20,4],[29.999,4],[30,1],[40,0.25],[50,4]]) {
  assert.equal(samplingAt(seconds).cell,1.5*scale);
  assert.equal(samplingAt(seconds).density,scale**-3);
}
assert.equal(samplingAt(2,2,2).cell,0.5);
assert.equal(samplingAt(4,2,2).cell,8);
for(const seed of [2718,17,99999]) for(const cell of [0.8,1.5,3]) {
  const noise=makeNoise(seed);
  for(let i=0;i<80;i++) {
    const camera=cameraAt(i*9.7,noise,cell,14,1.5,1);
    assert(clearanceAt(camera.position,noise,cell*4,1.5,1)>1.49);
    // Independently inspect nearby grid samples at all three cube sizes.
    for(const h of [cell/4,cell,cell*4]) {
      const q=camera.position.map(v=>Math.floor(v/h));
      for(let z=-1;z<=1;z++) for(let y=-1;y<=1;y++) for(let x=-1;x<=1;x++) {
        const sample=q.map((v,i)=>(v+[x,y,z][i]+0.5)*h);
        const boxDistance=Math.hypot(...sample.map((v,i)=>Math.max(0,Math.abs(v-camera.position[i])-h/2)));
        if(boxDistance<1) assert(cloudField(sample,noise,1.5,1)>=0);
      }
    }
  }
}
assert(cameraAt(1500,data).position[0]-cameraAt(0,data).position[0]>1000);
const reference=cameraAt(0,data);
for(let i=0;i<2000;i++) {
  const camera=cameraAt(i*0.73,data);
  assert.equal(camera.position[1],reference.position[1], 'No vertical bobbing');
  assert(Math.abs(camera.position[1]-camera.cloudCeiling-6)<1e-10);
  const delta=camera.target.map((v,j)=>v-camera.position[j]);
  assert(Math.abs(Math.atan2(-delta[1],Math.hypot(delta[0],delta[2]))-VIEW_PITCH)<1e-12);
}
for(let i=0;i<16;i++) {
  assert.equal(flightTrack(i*80+30).slope,flightTrack(i*80+70).slope);
  const a=flightTrack(i*80+0.0001), b=flightTrack(i*80-0.0001);
  assert(Math.abs(a.z-b.z)<0.001);
  assert(Math.abs(a.slope-b.slope)<0.001);
}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',e=>{if(e.type()==='error'&&!e.text().includes('404')) {errors.push(e.text()); console.error(e.text());}});
const base=process.env.GRAPHICS_TEST_URL||'http://localhost:8124/docs/graphics/';
try {
  await page.goto(`${base}stage.html?viz=blockCloud`);
  await page.waitForFunction(()=>document.querySelector('#viz').contentDocument?.querySelector('canvas[data-ready=true]') || document.querySelector('#viz').contentDocument?.querySelector('#renderStatus')?.textContent.includes('ERROR:'),null,{timeout:60000});
  assert.deepEqual(errors,[]);
  await page.frameLocator('#viz').locator('canvas[data-ready=true]').waitFor();
  const room=new URL(page.url()).searchParams.get('room');
  const remote=await context.newPage();
  await remote.goto(`${base}remote.html?room=${room}`);
  await remote.getByRole('radiogroup',{name:'Atmosphere',exact:true}).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({path:'/tmp/blockCloud-landscape.png'});
  await remote.getByRole('radiogroup',{name:'Atmosphere',exact:true}).getByRole('radio',{name:'Coarse sampling',exact:true}).click();
  await page.waitForFunction(()=>Number(document.querySelector('#viz').contentDocument.querySelector('canvas').dataset.cell)>2.6);
  await page.screenshot({path:'/tmp/blockCloud-coarse.png'});
  await remote.getByRole('tab',{name:'Playlist'}).click();
  await remote.getByRole('textbox',{name:'Current visualization JSON payload',exact:true}).fill('{"#morphToggle":true,"#cycleSeconds":1,"#flightToggle":true,"#flightSpeed":1}');
  await remote.getByRole('button',{name:'Apply payload',exact:true}).click();
  const initial=await page.frameLocator('#viz').locator('canvas').getAttribute('data-camera');
  await page.waitForFunction(()=>Number(document.querySelector('#viz').contentDocument.querySelector('canvas').dataset.density)<0.75,{timeout:60000});
  assert.notEqual(await page.frameLocator('#viz').locator('canvas').getAttribute('data-camera'),initial);
  assert(Number(await page.frameLocator('#viz').locator('canvas').getAttribute('data-clearance'))>1.49);
  await page.screenshot({path:'/tmp/blockCloud-wander.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: periodic field, instant 1×/¼×/4× size changes every ten seconds, 720 camera clearance cases plus occupied-neighbor checks, constant flight height, fixed 12° pitch, eased occasional turns, shader, remote controls and animated sampling.');
} finally {await browser.close();}

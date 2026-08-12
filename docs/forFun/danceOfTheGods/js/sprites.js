"use strict";
/* Dance of the Gods — sprites: black-figure pottery creatures.
   Every sprite draws facing LEFT in a ~110×100 box, in strict vase order:
   ground shadow → INK silhouette (smooth splines) → SLIP incisions →
   one domain-accent detail → the eye. */

const INK = "#1e1410", SLIP = "#f2e3c8";

/* legacy quad-chain helper (still used by the title art) */
function swooshPath(ctx, pts){
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for(let i=1;i<pts.length-1;i+=2){
    ctx.quadraticCurveTo(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1]);
  }
  ctx.closePath();
}

/* ---- spline helpers: organic vase-painting curves ---- */
function spBlob(ctx, pts, t=1){          // closed Catmull-Rom loop
  const n=pts.length;
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=0;i<n;i++){
    const p0=pts[(i-1+n)%n], p1=pts[i], p2=pts[(i+1)%n], p3=pts[(i+2)%n];
    ctx.bezierCurveTo(p1[0]+(p2[0]-p0[0])/6*t, p1[1]+(p2[1]-p0[1])/6*t,
                      p2[0]-(p3[0]-p1[0])/6*t, p2[1]-(p3[1]-p1[1])/6*t, p2[0],p2[1]);
  }
  ctx.closePath();
}
function spInk(ctx, pts, t=1){ spBlob(ctx,pts,t); ctx.fillStyle=INK; ctx.fill(); }
function spFill(ctx, pts, color, t=1){ spBlob(ctx,pts,t); ctx.fillStyle=color; ctx.fill(); }
function spLine(ctx, pts, t=1){          // open Catmull-Rom path (stroke it yourself)
  const n=pts.length;
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=0;i<n-1;i++){
    const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(n-1,i+2)];
    ctx.bezierCurveTo(p1[0]+(p2[0]-p0[0])/6*t, p1[1]+(p2[1]-p0[1])/6*t,
                      p2[0]-(p3[0]-p1[0])/6*t, p2[1]-(p3[1]-p1[1])/6*t, p2[0],p2[1]);
  }
}
function spStroke(ctx, pts, w, color, t=1){
  ctx.strokeStyle=color; ctx.lineWidth=w; ctx.lineCap="round"; ctx.lineJoin="round";
  spLine(ctx,pts,t); ctx.stroke();
}
function tri(ctx, a, b, c, color){
  ctx.fillStyle=color; ctx.beginPath();
  ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.lineTo(c[0],c[1]);
  ctx.closePath(); ctx.fill();
}
function spEye(ctx, x, y, r, ring){      // slip disc, optional accent ring, ink pupil
  ctx.fillStyle=SLIP; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  if(ring){ ctx.strokeStyle=ring; ctx.lineWidth=Math.max(1.5,r*0.2); ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.stroke(); }
  ctx.fillStyle=INK; ctx.beginPath(); ctx.arc(x-r*0.2,y,r*0.45,0,7); ctx.fill();
  ctx.fillStyle=SLIP; ctx.beginPath(); ctx.arc(x-r*0.32,y-r*0.18,r*0.14,0,7); ctx.fill();
}
function spShadow(ctx, cx, cy, rx){
  ctx.fillStyle="rgba(30,20,16,.18)";
  ctx.beginPath(); ctx.ellipse(cx,cy,rx,rx*0.26,0,0,7); ctx.fill();
}

/* ================= the twelve first stages ================= */
const SPRITES = {

eagle(ctx,acc){ // Peeplet — Zeus's chick, lightning crest
  spShadow(ctx,54,96,27);
  // plump chick body+head
  spInk(ctx,[[26,50],[34,26],[58,16],[80,28],[86,52],[76,78],[52,88],[32,78]]);
  // tail-nub feathers
  tri(ctx,[82,58],[101,50],[87,70],INK);
  tri(ctx,[84,68],[100,67],[84,77],INK);
  // wing incisions
  spStroke(ctx,[[44,50],[62,44],[78,52]],2,SLIP);
  spStroke(ctx,[[46,60],[62,55],[76,61]],2,SLIP);
  // fluff incisions on the chest
  spStroke(ctx,[[38,70],[44,74]],1.6,SLIP);
  spStroke(ctx,[[46,76],[52,80]],1.6,SLIP);
  // beak
  tri(ctx,[22,44],[6,52],[24,58],acc);
  ctx.strokeStyle=INK; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(9,52); ctx.lineTo(21,53); ctx.stroke();
  // lightning crest
  ctx.fillStyle=acc; ctx.beginPath();
  ctx.moveTo(52,16); ctx.lineTo(62,0); ctx.lineTo(56,10); ctx.lineTo(66,8);
  ctx.lineTo(50,22); ctx.lineTo(56,12); ctx.closePath(); ctx.fill();
  // legs + toes
  ctx.strokeStyle=INK; ctx.lineWidth=3.5; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(46,87); ctx.lineTo(44,96); ctx.moveTo(44,96); ctx.lineTo(39,99);
  ctx.moveTo(44,96); ctx.lineTo(44,100); ctx.moveTo(44,96); ctx.lineTo(49,99);
  ctx.moveTo(62,87); ctx.lineTo(63,96); ctx.moveTo(63,96); ctx.lineTo(58,99);
  ctx.moveTo(63,96); ctx.lineTo(63,100); ctx.moveTo(63,96); ctx.lineTo(68,99);
  ctx.stroke();
  spEye(ctx,34,42,7);
},

bull(ctx,acc){ // Calfin — Poseidon's sea calf, wave horns
  spShadow(ctx,56,96,34);
  // legs behind body
  ctx.strokeStyle=INK; ctx.lineWidth=6; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(38,80); ctx.lineTo(38,94); ctx.moveTo(52,82); ctx.lineTo(52,95);
  ctx.moveTo(68,82); ctx.lineTo(70,94); ctx.moveTo(84,74); ctx.lineTo(88,90);
  ctx.stroke();
  // slip hoof caps
  ctx.strokeStyle=SLIP; ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(35,93); ctx.lineTo(41,93); ctx.moveTo(49,94); ctx.lineTo(55,94);
  ctx.moveTo(67,93); ctx.lineTo(73,93); ctx.moveTo(85,89); ctx.lineTo(91,89);
  ctx.stroke();
  // body + head
  spInk(ctx,[[18,56],[34,38],[62,32],[86,38],[97,56],[90,74],[66,84],[36,84],[18,72]]);
  spInk(ctx,[[6,42],[22,32],[36,40],[34,58],[16,64],[4,54]]);
  // wave horns — tight curls
  spStroke(ctx,[[22,33],[14,23],[20,15]],4.5,acc);
  spStroke(ctx,[[34,31],[32,19],[40,14]],4.5,acc);
  // muzzle slip band + nostril
  spStroke(ctx,[[6,52],[16,56],[26,56]],2,SLIP);
  ctx.fillStyle=INK; ctx.beginPath(); ctx.arc(10,53,1.4,0,7); ctx.fill();
  // wave incision along the flank
  spStroke(ctx,[[38,58],[50,50],[62,60],[74,52],[86,60]],2,SLIP);
  // kelp tail
  spStroke(ctx,[[95,60],[106,50],[103,38]],4,acc);
  spFill(ctx,[[100,42],[110,33],[104,46]],acc);
  spEye(ctx,22,44,5.5);
},

hound(ctx,acc){ // Pupnos — Hades's pup, sitting proud
  spShadow(ctx,54,96,32);
  // tail curled up behind
  spStroke(ctx,[[82,72],[96,62],[94,46]],5,INK);
  ctx.fillStyle=acc; ctx.beginPath(); ctx.arc(94,45,2.6,0,7); ctx.fill();
  // haunch (sitting) + upright chest
  spInk(ctx,[[50,54],[74,48],[88,62],[84,84],[60,93],[44,78]]);
  spInk(ctx,[[34,42],[52,40],[60,56],[56,82],[38,90],[27,64]]);
  // front legs, straight
  ctx.strokeStyle=INK; ctx.lineWidth=5; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(40,78); ctx.lineTo(38,95); ctx.moveTo(50,80); ctx.lineTo(50,96);
  ctx.stroke();
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.4;
  ctx.beginPath();
  ctx.moveTo(35,94); ctx.lineTo(41,94); ctx.moveTo(47,95); ctx.lineTo(53,95);
  ctx.stroke();
  // head, held high
  spInk(ctx,[[20,14],[38,10],[46,22],[40,36],[24,38],[14,26]]);
  // tall pricked ears
  tri(ctx,[22,12],[14,-6],[32,8],INK);
  tri(ctx,[38,10],[44,-8],[48,12],INK);
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(21,6); ctx.lineTo(23,0); ctx.moveTo(43,4); ctx.lineTo(44,-2); ctx.stroke();
  // snout + nose + fang
  spInk(ctx,[[8,24],[20,18],[22,32],[12,34]]);
  ctx.fillStyle=acc; ctx.beginPath(); ctx.arc(6,26,2.2,0,7); ctx.fill();
  tri(ctx,[11,32],[13,38],[16,32],SLIP);
  // spiked collar at the neck
  spStroke(ctx,[[24,40],[34,46],[46,42]],4,acc);
  tri(ctx,[26,44],[29,52],[32,45],acc);
  tri(ctx,[34,47],[37,55],[40,47],acc);
  tri(ctx,[42,45],[45,52],[47,44],acc);
  // chest incisions
  spStroke(ctx,[[38,60],[44,66]],1.6,SLIP);
  spStroke(ctx,[[36,68],[42,73]],1.6,SLIP);
  spEye(ctx,28,24,5,acc);
},

owl(ctx,acc){ // Owlet — Athena's glaux, the famous stare
  spShadow(ctx,54,96,26);
  // egg body
  spInk(ctx,[[28,68],[24,40],[40,18],[58,12],[78,20],[86,44],[80,72],[58,86],[36,82]]);
  // horn tufts
  tri(ctx,[34,20],[24,4],[46,12],INK);
  tri(ctx,[72,18],[82,2],[62,10],INK);
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(30,12); ctx.lineTo(33,16); ctx.moveTo(76,10); ctx.lineTo(73,14); ctx.stroke();
  // wing-edge incisions
  spStroke(ctx,[[28,48],[25,62]],2,SLIP);
  spStroke(ctx,[[83,46],[81,62]],2,SLIP);
  // chest chevrons
  spStroke(ctx,[[42,64],[52,70],[62,64]],2,SLIP);
  spStroke(ctx,[[42,72],[52,78],[62,72]],2,SLIP);
  spStroke(ctx,[[44,80],[52,84],[60,80]],2,SLIP);
  // feet
  ctx.strokeStyle=INK; ctx.lineWidth=3.5; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(46,87); ctx.lineTo(41,96); ctx.moveTo(46,87); ctx.lineTo(46,97); ctx.moveTo(46,87); ctx.lineTo(51,96);
  ctx.moveTo(62,85); ctx.lineTo(58,95); ctx.moveTo(62,85); ctx.lineTo(63,96); ctx.moveTo(62,85); ctx.lineTo(67,94);
  ctx.stroke();
  // the glaux eyes
  spEye(ctx,42,38,12,acc);
  spEye(ctx,66,36,12,acc);
  // beak
  tri(ctx,[54,46],[48,58],[61,57],acc);
},

boar(ctx,acc){ // Piglos — the Calydonian bristler
  spShadow(ctx,58,96,36);
  // legs (charging)
  ctx.strokeStyle=INK; ctx.lineWidth=6; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(34,82); ctx.lineTo(26,96); ctx.moveTo(46,86); ctx.lineTo(42,97);
  ctx.moveTo(66,86); ctx.lineTo(70,96); ctx.moveTo(80,78); ctx.lineTo(88,93);
  ctx.stroke();
  ctx.strokeStyle=acc; ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(24,95); ctx.lineTo(29,97); ctx.moveTo(40,96); ctx.lineTo(45,98);
  ctx.moveTo(68,95); ctx.lineTo(73,97); ctx.moveTo(86,92); ctx.lineTo(91,94);
  ctx.stroke();
  // body + head wedge
  spInk(ctx,[[14,58],[30,42],[54,32],[80,34],[96,46],[95,66],[78,82],[48,88],[22,78]]);
  spInk(ctx,[[4,48],[18,40],[32,46],[28,64],[10,66]]);
  // bristle mohawk
  for(const [bx,by] of [[28,42],[42,35],[56,31],[70,32],[82,37]]){
    tri(ctx,[bx,by],[bx+10,by-14],[bx+13,by+1],acc);
  }
  // tusk + snout
  ctx.fillStyle=SLIP; ctx.beginPath();
  ctx.moveTo(12,58); ctx.quadraticCurveTo(0,50,6,41);
  ctx.quadraticCurveTo(9,50,17,53); ctx.closePath(); ctx.fill();
  ctx.fillStyle=SLIP; ctx.beginPath(); ctx.arc(7,56,4,0,7); ctx.fill();
  ctx.fillStyle=INK;
  ctx.beginPath(); ctx.arc(5.5,55,1,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(9,57,1,0,7); ctx.fill();
  // ear + shoulder incision
  tri(ctx,[34,38],[42,26],[50,38],INK);
  spStroke(ctx,[[30,56],[40,64],[38,74]],1.8,SLIP);
  // straight little tail
  spStroke(ctx,[[94,52],[104,44],[108,37]],3,INK);
  ctx.fillStyle=acc; ctx.beginPath(); ctx.arc(108,36,2.2,0,7); ctx.fill();
  spEye(ctx,22,48,4.5);
},

dove(ctx,acc){ // Dovie — Aphrodite's dove
  spShadow(ctx,50,96,24);
  // long tail (behind)
  tri(ctx,[70,52],[106,26],[82,66],INK);
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.5;
  ctx.beginPath();
  ctx.moveTo(76,52); ctx.lineTo(100,33); ctx.moveTo(78,58); ctx.lineTo(98,42);
  ctx.stroke();
  // body + head
  spInk(ctx,[[20,48],[34,32],[58,28],[76,38],[78,54],[62,70],[42,72],[24,62]]);
  spInk(ctx,[[12,32],[24,24],[34,30],[28,42],[16,40]]);
  // folded-wing incisions
  spStroke(ctx,[[34,42],[50,36],[66,44]],2,SLIP);
  spStroke(ctx,[[34,50],[52,44],[68,52]],2,SLIP);
  spStroke(ctx,[[38,58],[52,53],[64,58]],1.6,SLIP);
  // beak
  tri(ctx,[8,32],[0,36],[10,39],acc);
  // heart crest
  ctx.fillStyle=acc; ctx.beginPath();
  ctx.moveTo(22,14); ctx.bezierCurveTo(20,8,13,10,14,15);
  ctx.bezierCurveTo(15,19,19,21,22,23);
  ctx.bezierCurveTo(25,21,29,19,30,15);
  ctx.bezierCurveTo(31,10,24,8,22,14); ctx.fill();
  // legs + toes
  ctx.strokeStyle=INK; ctx.lineWidth=3; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(42,70); ctx.lineTo(42,84); ctx.moveTo(42,84); ctx.lineTo(38,87);
  ctx.moveTo(42,84); ctx.lineTo(42,88); ctx.moveTo(42,84); ctx.lineTo(46,87);
  ctx.moveTo(52,70); ctx.lineTo(54,84); ctx.moveTo(54,84); ctx.lineTo(50,87);
  ctx.moveTo(54,84); ctx.lineTo(54,88); ctx.moveTo(54,84); ctx.lineTo(58,87);
  ctx.stroke();
  spEye(ctx,20,32,4);
},

serpent(ctx,acc){ // Slithra — the Delphic sun-serpent, coiled
  spShadow(ctx,58,96,32);
  // sun halo first (the raised head overlaps its inner edge)
  ctx.strokeStyle=acc; ctx.lineWidth=2.5; ctx.lineCap="round";
  ctx.beginPath(); ctx.arc(32,20,15,0,7); ctx.stroke();
  for(let a=0;a<8;a++){
    const th=a*Math.PI/4+0.4;
    ctx.beginPath();
    ctx.moveTo(32+Math.cos(th)*17,20+Math.sin(th)*17);
    ctx.lineTo(32+Math.cos(th)*23,20+Math.sin(th)*23);
    ctx.stroke();
  }
  // neck rising to the head (behind the coil)
  ctx.strokeStyle=INK; ctx.lineWidth=9; ctx.lineCap="round";
  spLine(ctx,[[52,62],[42,46],[34,32]]); ctx.stroke();
  // three tapering coils, filled, separated by slip contours
  ctx.fillStyle=INK;
  ctx.beginPath(); ctx.ellipse(58,84,30,10,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(58,72,24,9,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(58,61,17,8,0,0,7); ctx.fill();
  spStroke(ctx,[[33,78],[58,71],[83,78]],1.8,SLIP);
  spStroke(ctx,[[42,66],[58,60],[75,66]],1.8,SLIP);
  // tail tip peeking from the bottom coil
  spStroke(ctx,[[86,88],[96,84],[100,77]],5,INK);
  // head
  spInk(ctx,[[18,22],[30,12],[42,14],[42,26],[28,30]]);
  // forked tongue
  ctx.strokeStyle=acc; ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(18,24); ctx.lineTo(9,22);
  ctx.moveTo(9,22); ctx.lineTo(4,18); ctx.moveTo(9,22); ctx.lineTo(5,26);
  ctx.stroke();
  // belly ticks along the bottom coil
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.8;
  for(const tx of [42,50,58,66,74]){
    ctx.beginPath(); ctx.moveTo(tx,86); ctx.lineTo(tx,91); ctx.stroke();
  }
  // accent diamond on the mid coil
  ctx.strokeStyle=acc; ctx.lineWidth=1.8;
  ctx.beginPath(); ctx.moveTo(58,68); ctx.lineTo(62,72); ctx.lineTo(58,76); ctx.lineTo(54,72);
  ctx.closePath(); ctx.stroke();
  spEye(ctx,28,20,4);
},

deer(ctx,acc){ // Fawnling — the golden hind's fawn, mid-leap
  spShadow(ctx,58,97,32);
  // legs first (extended in the leap)
  ctx.lineCap="round";
  ctx.strokeStyle=INK; ctx.lineWidth=4.5;
  spLine(ctx,[[34,58],[22,70],[13,77]]); ctx.stroke();
  spLine(ctx,[[44,60],[34,76],[28,85]]); ctx.stroke();
  spLine(ctx,[[66,62],[80,74],[89,80]]); ctx.stroke();
  spLine(ctx,[[86,56],[98,64],[106,69]]); ctx.stroke();
  // golden hooves — the hind's hooves are always gold, whatever the domain
  ctx.strokeStyle="#e0a833"; ctx.lineWidth=4.5;
  ctx.beginPath();
  ctx.moveTo(13,77); ctx.lineTo(9,80); ctx.moveTo(28,85); ctx.lineTo(24,89);
  ctx.moveTo(89,80); ctx.lineTo(94,83); ctx.moveTo(106,69); ctx.lineTo(110,72);
  ctx.stroke();
  // body, neck, head
  spInk(ctx,[[26,46],[44,36],[68,34],[88,42],[92,56],[72,64],[46,62],[28,56]]);
  spInk(ctx,[[24,46],[14,30],[24,18],[34,24],[36,44]]);
  spInk(ctx,[[6,20],[16,10],[28,12],[28,24],[16,28]]);
  // ear + antler nubs
  tri(ctx,[28,12],[38,4],[34,17],INK);
  ctx.strokeStyle="#e0a833"; ctx.lineWidth=3; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(18,10); ctx.lineTo(12,2); ctx.moveTo(26,8); ctx.lineTo(28,0);
  ctx.stroke();
  // tail nub
  tri(ctx,[90,42],[100,38],[92,50],INK);
  // slip spots
  ctx.fillStyle=SLIP;
  for(const [sx,sy] of [[54,44],[66,42],[60,52],[76,48],[48,50]]){
    ctx.beginPath(); ctx.arc(sx,sy,2.2,0,7); ctx.fill();
  }
  spEye(ctx,16,18,4);
},

crab(ctx,acc){ // Cindercrab — Hephaestus's bronze automaton
  spShadow(ctx,56,96,36);
  // claws behind the shell
  spInk(ctx,[[16,50],[2,38],[-4,52],[8,62],[18,60]]);
  spInk(ctx,[[90,52],[104,42],[110,54],[100,62],[90,58]]);
  ctx.strokeStyle=SLIP; ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(0,46); ctx.lineTo(8,52); ctx.moveTo(108,48); ctx.lineTo(100,54);
  ctx.stroke();
  // legs
  ctx.strokeStyle=INK; ctx.lineWidth=4.5; ctx.lineCap="round";
  spLine(ctx,[[32,74],[24,84],[20,93]]); ctx.stroke();
  spLine(ctx,[[46,77],[44,88],[42,95]]); ctx.stroke();
  spLine(ctx,[[62,77],[66,88],[68,95]]); ctx.stroke();
  spLine(ctx,[[76,72],[86,82],[92,90]]); ctx.stroke();
  // eyestalks
  ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(44,30); ctx.lineTo(38,14); ctx.moveTo(62,30); ctx.lineTo(66,14);
  ctx.stroke();
  // riveted dome shell
  spInk(ctx,[[18,62],[24,38],[46,26],[70,27],[88,42],[89,64],[68,76],[36,76]]);
  // plate seams + rivets
  spStroke(ctx,[[22,52],[54,46],[86,52]],2,SLIP);
  spStroke(ctx,[[52,28],[56,50],[52,74]],2,SLIP);
  ctx.fillStyle=acc;
  for(const [rx,ry] of [[36,42],[68,42],[40,62],[68,62]]){
    ctx.beginPath(); ctx.arc(rx,ry,2.4,0,7); ctx.fill();
  }
  // ember vent on top
  tri(ctx,[48,28],[54,10],[60,28],acc);
  tri(ctx,[52,26],[54,16],[57,26],SLIP);
  // stalk eyes
  spEye(ctx,37,11,5);
  spEye(ctx,67,11,5);
},

tortoise(ctx,acc){ // Tortikin — Hermes's winged lyre-tortoise
  spShadow(ctx,52,96,34);
  // motion lines — fastest joke in the game
  ctx.strokeStyle=SLIP; ctx.lineWidth=2; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(90,46); ctx.lineTo(108,46); ctx.moveTo(88,56); ctx.lineTo(104,56);
  ctx.moveTo(90,66); ctx.lineTo(100,66);
  ctx.stroke();
  // sprinting legs
  ctx.strokeStyle=INK; ctx.lineWidth=5;
  ctx.beginPath();
  ctx.moveTo(32,74); ctx.lineTo(22,90); ctx.moveTo(68,74); ctx.lineTo(78,88);
  ctx.stroke();
  // shell — the lyre
  spInk(ctx,[[14,64],[20,40],[50,28],[80,40],[86,64],[50,78]]);
  spStroke(ctx,[[18,64],[50,72],[82,64]],2,SLIP);
  // strings
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.6;
  for(const sx of [32,42,52,62,72]){
    ctx.beginPath(); ctx.moveTo(sx,40); ctx.lineTo(sx,64); ctx.stroke();
  }
  // crossbar
  spStroke(ctx,[[24,42],[50,36],[76,42]],2.5,acc);
  // hermes wings, swept back with the sprint
  spFill(ctx,[[38,32],[52,16],[58,28]],acc);
  spFill(ctx,[[56,32],[72,18],[76,30]],acc);
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.4;
  ctx.beginPath();
  ctx.moveTo(48,22); ctx.lineTo(46,30); ctx.moveTo(66,24); ctx.lineTo(62,30);
  ctx.stroke();
  // neck + determined little head, stretched into the run
  spInk(ctx,[[14,54],[-2,46],[-6,56],[4,64],[16,62]]);
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(-4,49); ctx.lineTo(4,49); ctx.stroke();
  spEye(ctx,2,54,3.5);
},

grainsnake(ctx,acc){ // Seedviper — Demeter's wheat-crowned serpent
  spShadow(ctx,56,96,30);
  // gliding S body
  ctx.strokeStyle=INK; ctx.lineCap="round"; ctx.lineWidth=12;
  spLine(ctx,[[100,80],[76,90],[50,84],[42,68],[56,56],[64,42],[52,32],[40,26]]); ctx.stroke();
  ctx.lineWidth=6;
  spLine(ctx,[[100,80],[108,73]]); ctx.stroke();
  // head
  spInk(ctx,[[20,22],[30,12],[46,10],[50,22],[40,32],[26,30]]);
  // wheat crown
  ctx.strokeStyle=acc; ctx.lineWidth=2.5; ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(30,12); ctx.lineTo(23,2); ctx.moveTo(37,10); ctx.lineTo(37,0);
  ctx.moveTo(44,12); ctx.lineTo(51,3);
  ctx.stroke();
  ctx.fillStyle=acc;
  ctx.beginPath(); ctx.ellipse(22,-1,2.5,5.5,-0.4,0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(37,-3,2.5,5.5,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(52,0,2.5,5.5,0.4,0,7); ctx.fill();
  ctx.strokeStyle=acc; ctx.lineWidth=1.2;
  ctx.beginPath();
  ctx.moveTo(21,-5); ctx.lineTo(18,-9); ctx.moveTo(37,-8); ctx.lineTo(37,-12);
  ctx.moveTo(53,-4); ctx.lineTo(56,-8);
  ctx.stroke();
  // forked tongue
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.8;
  ctx.beginPath();
  ctx.moveTo(20,24); ctx.lineTo(12,26);
  ctx.moveTo(12,26); ctx.lineTo(7,23); ctx.moveTo(12,26); ctx.lineTo(8,30);
  ctx.stroke();
  // slip diamonds down the back
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.8;
  for(const [dx,dy] of [[84,83],[52,77],[57,54]]){
    ctx.beginPath(); ctx.moveTo(dx,dy-5); ctx.lineTo(dx+5,dy); ctx.lineTo(dx,dy+5); ctx.lineTo(dx-5,dy);
    ctx.closePath(); ctx.stroke();
  }
  spEye(ctx,29,19,3.8);
},

panther(ctx,acc){ // Cubvine — Dionysus's ivy cub
  spShadow(ctx,56,96,34);
  // long curling tail with an ivy-leaf tip
  spStroke(ctx,[[88,64],[104,52],[108,38],[100,30]],6,INK);
  ctx.fillStyle=acc; ctx.beginPath();
  ctx.moveTo(100,30); ctx.quadraticCurveTo(92,22,99,19);
  ctx.quadraticCurveTo(106,18,101,29); ctx.closePath(); ctx.fill();
  // crouched body
  spInk(ctx,[[28,54],[50,42],[76,44],[92,58],[88,74],[66,84],[40,86],[24,70]]);
  // big cub head
  spInk(ctx,[[10,30],[28,16],[48,18],[58,34],[50,50],[28,52],[8,44]]);
  // round ears
  ctx.fillStyle=INK;
  ctx.beginPath(); ctx.arc(22,14,7,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(44,12,7,0,7); ctx.fill();
  ctx.fillStyle=SLIP;
  ctx.beginPath(); ctx.arc(22,14,2.4,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(44,12,2.4,0,7); ctx.fill();
  // ivy wreath — slip-outlined so it reads on the ink head
  spStroke(ctx,[[12,30],[30,24],[48,26]],2.5,acc);
  for(const [lx,ly] of [[15,28],[30,22],[45,25]]){
    ctx.beginPath();
    ctx.moveTo(lx,ly); ctx.quadraticCurveTo(lx-5,ly-9,lx+2,ly-10);
    ctx.quadraticCurveTo(lx+8,ly-9,lx,ly);
    ctx.fillStyle=acc; ctx.fill();
    ctx.strokeStyle=SLIP; ctx.lineWidth=1; ctx.stroke();
  }
  ctx.fillStyle=SLIP;
  ctx.beginPath(); ctx.arc(23,25,1.6,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(38,23,1.6,0,7); ctx.fill();
  // front paws
  ctx.fillStyle=INK;
  ctx.beginPath(); ctx.ellipse(36,86,7,5,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(56,88,7,5,0,0,7); ctx.fill();
  ctx.strokeStyle=SLIP; ctx.lineWidth=1.4;
  ctx.beginPath();
  ctx.moveTo(33,87); ctx.lineTo(33,90); ctx.moveTo(38,87); ctx.lineTo(38,90);
  ctx.moveTo(53,89); ctx.lineTo(53,92); ctx.moveTo(58,89); ctx.lineTo(58,92);
  ctx.stroke();
  // nose + grin
  tri(ctx,[14,40],[10,44],[18,45],acc);
  spStroke(ctx,[[12,47],[22,51],[32,49]],2,SLIP);
  // mischievous eyes
  spEye(ctx,24,34,4.5);
  spEye(ctx,40,32,4.5);
}
};

function drawCreature(ctx, c, x, y, scale, flip, alpha=1){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(flip?-scale:scale, scale);
  ctx.globalAlpha = alpha;
  artDraw(ctx, c.key, c.sprite, DOMAINS[c.dom].color);   // art.js: gen image or vector fallback
  ctx.restore();
}

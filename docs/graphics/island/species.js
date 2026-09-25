// Botanical observations inform these artistic coefficients; they are not fitted growth laws.
export const SPECIES = {
  study: {
    name: 'Simple tree', latin: 'The original primitive study',
    description: 'Start with the original capsule and sphere, then build up the surface in four stages.',
    drivers: 'Choose a species to explore a branching architecture. Geometry uses scene units; specimens are not shown at a common real-world scale.',
    defaults: {}, sources: [], foliage: [.28,.43,.13], bark: [.29,.16,.075],
  },
  redwood: {
    name: 'Coast redwood', latin: 'Sequoia sempervirens',
    description: 'A tall central axis with a tapered crown. Lateral branches shorten toward the tip; lower branches reveal the bole.',
    drivers: 'Moisture and light affect growth. Forest competition changes the proportion of living crown. Try crown base and leader dominance. This represents a conventional crown, not an ancient reiterated canopy.',
    defaults: {height:2.15,radius:.72,spread:.9,amplitude:.07,frequency:4.3,detail:1,maturity:.9,leader:.96,crownBase:.27,angle:5,twist:.06,exposure:.04,flatness:.2},
    sources: [
      ['NASA GLOBE · two-ranked flat needles','https://observer.globe.gov/do-globe-observer/do-more/data-requests/nasa-moon-trees-coast-redwood'],
      ['NPS · tall, tapering architecture','https://www.nps.gov/muwo/planyourvisit/brochure-audio-description.htm'],
      ['Forest Service · crown ratio and competition','https://research.fs.usda.gov/treesearch/41818'],
      ['California State Parks · moisture and light','https://www.parks.ca.gov/?page_id=22257'],
    ], foliage:[.16,.34,.20],bark:[.40,.19,.11],
  },
  juniper: {
    name: 'Hollywood juniper', latin: 'Juniperus chinensis ‘Kaizuka’ / ‘Torulosa’',
    description: 'An irregular upright cultivar with contorted limbs and separate, dense foliage clusters. Its twisting habit does not require coastal wind.',
    drivers: 'Cultivar identity supplies the irregular architecture. Sun and well-drained soil support growth. Try branch angle and twist; leader dominance changes how strongly lateral limbs compete with the central axis.',
    defaults: {height:1.5,radius:.64,spread:.82,amplitude:.095,frequency:5,detail:1,maturity:.85,leader:.3,crownBase:.19,angle:62,twist:.78,exposure:0,flatness:.1},
    sources: [
      ['NC State · scale leaves in four ranks','https://plants.ces.ncsu.edu/plants/juniperus-chinensis-kaizuka/common-name/torulosa-juniper/'],
      ['RHS · cultivar, upright habit and dense clusters','https://www.rhs.org.uk/plants/91774/juniperus-chinensis-kaizuka/details'],
      ['UNF Botanical Garden · open, irregular form','https://www.unf.edu/botanical-garden/plants/juniperus-chinensis.html'],
      ['Oregon Landscape Contractors Board · twisted, upsweeping branches','https://www.oregon.gov/lcb/Documents/ExamPlantList.pdf'],
    ],foliage:[.18,.36,.22],bark:[.34,.25,.17],
  },
  cypress: {
    name: 'Monterey cypress', latin: 'Hesperocyparis macrocarpa (syn. Cupressus macrocarpa)',
    description: 'A spreading crown carried on substantial forks. Exposure produces an asymmetric silhouette; reducing it restores a more upright, sheltered form.',
    drivers: 'Wind and salt exposure sculpt coastal trees. The exposure slider combines lean, shorter windward limbs and a broader leeward crown. It describes a long-term shape, not instantaneous wind or a calibrated wind speed.',
    defaults: {height:1.6,radius:.9,spread:1.15,amplitude:.08,frequency:4.6,detail:1,maturity:.95,leader:.25,crownBase:.44,angle:28,twist:.28,exposure:.7,flatness:.82},
    sources: [
      ['Oregon State · overlapping scale leaves','https://landscapeplants.oregonstate.edu/plants/hesperocyparis-macrocarpa'],
      ['Forest Service · coastal versus sheltered growth','https://research.fs.usda.gov/feis/species-reviews/hesmac'],
    ],foliage:[.25,.38,.19],bark:[.36,.28,.20],
  },
};
export const GROWTH_SPECS = [
  ['maturity','Development',.2,1,.85,0,'Young → developed. An illustrative shape progression, not years.'],
  ['leader','Leader dominance',0,1,.7,1,'Higher values favor one tall axis over competing lateral limbs.'],
  ['crownBase','Crown base',.12,.7,.3,1,'Relative attachment height of the lowest living branch.'],
  ['angle','Branch elevation',-15,75,20,1,'Degrees above horizontal, before twisting and exposure.'],
  ['twist','Branch contortion',0,1,.2,1,'Bends and uneven spacing in the branch skeleton.'],
  ['exposure','Coastal exposure',0,1,0,1,'Stylized persistent wind from −X toward +X; especially relevant to cypress.'],
  ['flatness','Crown flattening',0,1,.3,1,'Compresses foliage clusters vertically; strongest in developed cypress.'],
];
export const MAX_BRANCHES=24, MAX_CROWNS=16;
const mix=(a,b,t)=>a+(b-a)*t;
const blend=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));

// Explicit connected skeleton, rendered as tapered capsule distance bounds.
// The species recipes differ in topology and crown distribution, not just color.
export function buildTree(species, p, stage=3) {
  const branches=[],crowns=[];
  const addBranch=(a,b,r1,r2)=>branches.push({a,b,r1,r2});
  const addCrown=(center,radii,angle=0)=>crowns.push({center,radii,angle});
  const m=p.maturity, growth=.28+.72*m;
  const h=p.height*2.05*growth, girth=(.045+.13*m)*Math.sqrt(p.height/1.5);
  const spread=p.spread*(.28+.72*m), width=p.radius*(.35+.65*m);
  const isRed=species==='redwood', isJun=species==='juniper';
  const wind=stage>=1?p.exposure:0, twist=stage>=1?p.twist:0;
  const lean=wind*(isRed?.22:.72);
  const trunkHeight=h*(stage===0?1:mix(.66,1,p.leader));
  // Bends sampled into a continuous chain; branches attach to that chain exactly.
  const nodes=Array.from({length:5},(_,i)=>{
    const t=i/4;
    return [lean*t*t+twist*(isJun?.42:.18)*Math.sin(t*5)*t,trunkHeight*t,twist*(isJun?.32:.14)*Math.sin(t*7)*t];
  });
  const trunkAt=t=>{const f=Math.min(3.99999,Math.max(0,t)*4),i=Math.floor(f);return blend(nodes[i],nodes[i+1],f-i);};
  for(let i=0;i<4;i++)addBranch(nodes[i],nodes[i+1],girth*(1-.82*i/4),girth*(1-.82*(i+1)/4));
  if(stage===0){
    addCrown([0,h*.7,0],[width*(isRed?.8:1.1),h*.35,width*(isRed?.8:1.1)]);
  } else {
    const count=isRed?12:8;
    for(let i=0;i<count;i++){
      const t=i/(count-1),az=i*2.39996+twist*Math.sin(i*3.7)*1.1;
      const attachment=isRed?mix(p.crownBase,.94,t):mix(p.crownBase,.83,t);
      const root=trunkAt(attachment);
      const variability=1+twist*.32*Math.sin(i*7.13+1.2);
      const reach=spread*variability*(isRed?mix(1.1,.10,t):mix(1.15,.65,t));
      const elevation=p.angle*Math.PI/180;
      const competition=(1-p.leader)*(isJun?.9:.32);
      let tip=[root[0]+Math.cos(az)*reach*Math.cos(elevation),root[1]+reach*Math.sin(elevation)+competition*h*(isJun?.16:(1-t)*.55)+(isJun?twist*h*.11*Math.sin(i*4.2):0),root[2]+Math.sin(az)*reach*Math.cos(elevation)];
      // Windward lengths shorten while leeward branches and crown drift extend.
      tip[0]+=wind*reach*.72;
      if(!isRed&&!isJun){
        const umbrella=h*(.72+.12*Math.sin(i*2.3));
        tip[1]=mix(tip[1],umbrella,p.flatness*m);
      }
      tip[1]=Math.max(girth*2,tip[1]);
      const bend=blend(root,tip,.52);
      bend[0]+=twist*.25*reach*Math.sin(i*4.1);
      bend[2]+=twist*.3*reach*Math.cos(i*3.3);
      bend[1]-=twist*.15*reach;
      const branchRadius=girth*(isRed?.40:.63)*(1-.48*t);
      if(isRed){addBranch(root,tip,branchRadius,.016*growth);}
      else {addBranch(root,bend,branchRadius,branchRadius*.64);addBranch(bend,tip,branchRadius*.64,.023*growth);}
      const size=width*(isRed?mix(.75,.22,t):(.56+.16*Math.sin(i*4.7+2)));
      const center=blend(root,tip,isRed?.67:.87);
      center[1]+=size*(isJun?.5:.16);
      const rx=isRed?Math.max(size,reach*.65):size*(isJun?.8:1.27);
      const ry=isRed?size*.6*(1-.3*p.flatness):size*(isJun?1.3:.8)*(1-.57*p.flatness);
      addCrown(center,[rx,Math.max(.06,ry),size*(isJun?.8:1)],az);
    }
    if(isRed){
      addCrown([nodes[4][0],h*.97,nodes[4][2]],[width*.22,h*.13,width*.22]);
      // Overlapping inner foliage prevents isolated 'pom-poms' on the central axis.
      for(let j=0;j<3;j++){
        const t=mix(p.crownBase,.88,(j+.5)/3),center=trunkAt(t);
        const radial=width*mix(.68,.26,j/2);
        addCrown(center,[radial,h*(1-p.crownBase)*.26,radial]);
      }
    }
    else if(isJun)addCrown(nodes[4].map((v,i)=>v+(i===1?width*.23:0)),[width*.38,width*.85,width*.4]);
  }
  // Fixed-size uniform buffers keep the shader portable within WebGL limits.
  const a=new Float32Array(MAX_BRANCHES*4),b=new Float32Array(MAX_BRANCHES*4);
  const c=new Float32Array(MAX_CROWNS*4),r=new Float32Array(MAX_CROWNS*4);
  let branchBound=1;
  branches.forEach((s,i)=>{a.set([...s.a,s.r1],i*4);b.set([...s.b,s.r2],i*4);branchBound=Math.max(branchBound,1+Math.abs(s.r1-s.r2)/Math.hypot(...s.a.map((v,j)=>v-s.b[j])));});
  crowns.forEach((s,i)=>{c.set([...s.center,s.angle],i*4);r.set([...s.radii,0],i*4);});
  return {branches,crowns,a,b,c,r,branchBound,height:h};
}

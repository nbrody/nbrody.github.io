// Closed color paths keep successive group states visually related.
export const PALETTES = {
  mineral: ['#18383e','#286b72','#5d9a92','#a8beb0','#e9d6af','#db9c70','#c0674e','#793e43'],
  tide: ['#10253d','#234d73','#287e9a','#55b4b3','#b9e2d1','#e5ecd0','#6da99c','#2d646d'],
  ember: ['#2e233e','#65435e','#a55970','#df817e','#f4b88a','#f8dfa3','#b18068','#684458'],
  botanical: ['#203c36','#3e6650','#769064','#b4bd6e','#e5d990','#efe4bd','#ab9e67','#5f7557'],
  mono: ['#182d30','#49615f','#8fa49b','#eceddb','#a4b5a5','#596e68'],
};
function hsl(h,s,l){
  const a=s*Math.min(l,1-l);
  return [0,8,4].map(n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1))));});
}
export function makePalette(name,count,reverse=false,offset=0){
  const stops=(PALETTES[name]||PALETTES.mineral).map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
  return Array.from({length:count},(_,i)=>{
    const index=((reverse?count-1-i:i)+offset+count)%count;
    if(name==='spectrum') return hsl(index/count*360,.67,.57);
    const t=index/count*stops.length,k=Math.floor(t),f=t-k;
    return stops[k].map((v,c)=>Math.round(v+(stops[(k+1)%stops.length][c]-v)*f));
  });
}
export const cssColor=rgb=>`rgb(${rgb.join(',')})`;

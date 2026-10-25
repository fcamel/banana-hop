'use strict';
// Same nine regional representations and primitive actions. Only move/evade
// direction logits use the shared, skill-conditioned spatial scoring head.
const {RegionAttentionNetwork}=require('./regions.cjs');
const {Random}=require('./ppo.cjs');
const {featureCount}=require('./training.cjs');
const {heads,directions}=require('./skills.cjs');
const architecture='region-direction-v1',directionOffset=heads[0];
const directionRegions=Object.freeze([4,5,8,7,6,3,0,1,2]);
const zeros=n=>new Float64Array(n);
function plus(a,b){for(let i=0;i<a.length;i++)a[i]+=b[i];}
class DirectionalRegionNetwork extends RegionAttentionNetwork{
 constructor(input=featureCount,hidden=32,rng=new Random()){
  super(input,hidden,rng);this.architecture=architecture;const p=Array.from(this.parameters);
  const layer=(ins,outs,gain=Math.sqrt(6/(ins+outs)))=>{const w=p.length;for(let i=0;i<ins*outs;i++)p.push((rng.next()*2-1)*gain);const b=p.length;for(let i=0;i<outs;i++)p.push(0);const l={ins,outs,w,b};this.layers.push(l);return l;};
  this.directionRelation=layer(hidden*2+4+heads[0],hidden);this.directionScore=layer(hidden,1,.1);this.parameters=Float64Array.from(p);
 }
 condition(c,skill){
  super.condition(c,skill);const logits=c.activations.at(-1),d=this.width;
  // Sampling first computes a skill and then reconditions the same forward
  // cache; restore the unmodified head when that skill is not move/evade.
  if(!c.baseDirectionLogits)c.baseDirectionLogits=logits.slice(directionOffset,directionOffset+heads[1]);
  if(skill!==0&&skill!==3){logits.set(c.baseDirectionLogits,directionOffset);c.directional=null;return;}
  const oneHot=Array.from({length:heads[0]},(_,i)=>+(i===skill));
  c.directional=directionRegions.map((regionIndex,i)=>{
   const r=c.extension.regions[regionIndex],[dx,dy]=directions[i],norm=Math.hypot(dx,dy)||1;
   const x=Float64Array.from([...c.scene,...r.vector,r.geometry.walkableFraction,r.geometry.centerInside,dx/norm,dy/norm,...oneHot]),relation=this.tanh(this.linear(this.directionRelation,x));
   logits[directionOffset+i]=this.linear(this.directionScore,relation)[0];return {regionIndex,x,relation};
  });
 }
 headBackward(c,out,g){
  if(!c.directional)return {out};
  const filtered=out.slice(),sceneGradient=zeros(this.width),regionGradients=Array.from({length:9},()=>zeros(this.width));
  for(let i=0;i<heads[1];i++){
   const t=c.directional[i],dr=this.linearBack(this.directionScore,t.relation,Float64Array.of(out[directionOffset+i]),g),dx=this.linearBack(this.directionRelation,t.x,this.tanhBack(t.relation,dr),g);
   plus(sceneGradient,dx.slice(0,this.width));plus(regionGradients[t.regionIndex],dx.slice(this.width,this.width*2));filtered[directionOffset+i]=0;
  }
  return {out:filtered,sceneGradient,regionGradients};
 }
}
module.exports={DirectionalRegionNetwork,architecture,directionRegions};

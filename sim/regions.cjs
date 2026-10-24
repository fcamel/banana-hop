'use strict';
// Nine viewport-anchored spatial queries share one relation encoder and pool.
// Positions are derived solely from the existing visible observation contract.
const {AttentionNetwork}=require('./attention.cjs');
const {distribution,Random}=require('./ppo.cjs');
const {featureCount}=require('./training.cjs');
const architecture='region-attention-v2',legacyArchitecture='region-attention-v1',zeros=n=>new Float64Array(n);
const centers=Object.freeze(Array.from({length:9},(_,i)=>Object.freeze({x:(i%3+.5)/3,y:(Math.floor(i/3)+.5)/3})));
function plus(a,b){for(let i=0;i<a.length;i++)a[i]+=b[i];}
function screenPosition(t,input){
 const width=input[16]*1500,height=input[17]*1000;
 if(!(width>0&&height>0))throw Error('Region attention requires a positive viewport');
 const z=t.group===0?input[2]*200:[1,2,4].includes(t.group)?t.x[3]*200:0;
 return {x:.5+(t.group?1250*t.x[1]/width:0),y:.52+(t.group ? .72*1250*t.x[2]/height : 0)-z/height};
}
// Ground-map rectangle projected into the current viewport; no hidden actors.
function regionGeometry(center,input){
 const width=input[16]*1500,height=input[17]*1000;
 if(!(width>0&&height>0))throw Error('Region attention requires a positive viewport');
 const bounds={left:.5-input[20]*2500/width,right:.5+input[19]*2500/width,top:.52-input[22]*2500*.72/height,bottom:.52+input[21]*2500*.72/height};
 const overlap=(a,b,c,d)=>Math.max(0,Math.min(b,d)-Math.max(a,c));
 const area=overlap(center.x-1/6,center.x+1/6,bounds.left,bounds.right)*overlap(center.y-1/6,center.y+1/6,bounds.top,bounds.bottom)*9;
 const inside=center.x>=bounds.left-1e-12&&center.x<=bounds.right+1e-12&&center.y>=bounds.top-1e-12&&center.y<=bounds.bottom+1e-12;
 return {walkableFraction:Math.max(0,Math.min(1,area)),centerInside:+inside};
}
class RegionAttentionNetwork extends AttentionNetwork{
 constructor(input=featureCount,hidden=32,rng=new Random(),terrain=true){
  super(input,hidden,rng);this.terrain=terrain;this.architecture=terrain?architecture:legacyArchitecture;const p=Array.from(this.parameters);
  const layer=(ins,outs,gain=Math.sqrt(6/(ins+outs)))=>{const w=p.length;for(let i=0;i<ins*outs;i++)p.push((rng.next()*2-1)*gain);const b=p.length;for(let i=0;i<outs;i++)p.push(0);const l={ins,outs,w,b};this.layers.push(l);return l;};
  this.regionRelation=layer(hidden+(terrain?8:6),hidden);this.regionScore=layer(hidden,1);this.regionValue=layer(hidden,hidden);this.regionFuse=layer(hidden*10+(terrain?18:0),hidden,.1);this.parameters=Float64Array.from(p);
 }
 sceneForward(baseScene,tokens,input){
  const d=this.width,positions=tokens.map(t=>screenPosition(t,input)),regions=[];
  for(const center of centers){
   const geometry=this.terrain?regionGeometry(center,input):null;
   const objects=tokens.map((t,i)=>{const pos=positions[i],x=Float64Array.from([...t.z,pos.x-center.x,pos.y-center.y,center.x-.5,center.y-.52,1/3,1/3,...(geometry?[geometry.walkableFraction,geometry.centerInside]:[])]),relation=this.tanh(this.linear(this.regionRelation,x));return {x,relation,score:this.linear(this.regionScore,relation)[0],value:this.linear(this.regionValue,relation)};});
   const weights=distribution(objects.map(o=>o.score)),mix=zeros(d);for(let i=0;i<objects.length;i++)for(let k=0;k<d;k++)mix[k]+=weights[i]*objects[i].value[k];
   regions.push({center,geometry,objects,weights,mix,vector:this.tanh(mix)});
  }
  const fused=Float64Array.from([...baseScene,...regions.flatMap(r=>[...r.vector,...(r.geometry?[r.geometry.walkableFraction,r.geometry.centerInside]:[])] )]),projected=this.linear(this.regionFuse,fused),scene=this.tanh(baseScene.map((v,i)=>v+projected[i]));
  return {scene,regions,fused};
 }
 sceneBackward(c,dscene,dz,g){
  const d=this.width,{regions,fused}=c.extension,dp=this.tanhBack(c.scene,dscene),dfused=this.linearBack(this.regionFuse,fused,dp,g),dbase=dp.slice();plus(dbase,dfused.slice(0,d));
  for(let r=0;r<regions.length;r++){
   const region=regions[r],dmix=this.tanhBack(region.vector,dfused.slice(d+r*(d+(this.terrain?2:0)),d+r*(d+(this.terrain?2:0))+d)),dw=zeros(region.objects.length);let average=0;
   for(let i=0;i<dw.length;i++){for(let k=0;k<d;k++)dw[i]+=dmix[k]*region.objects[i].value[k];average+=region.weights[i]*dw[i];}
   for(let i=0;i<dw.length;i++){
    const o=region.objects[i],dv=dmix.map(v=>v*region.weights[i]),dr=this.linearBack(this.regionValue,o.relation,dv,g),ds=region.weights[i]*(dw[i]-average);
    plus(dr,this.linearBack(this.regionScore,o.relation,Float64Array.of(ds),g));const dx=this.linearBack(this.regionRelation,o.x,this.tanhBack(o.relation,dr),g);plus(dz[i],dx.slice(0,d));
   }
  }
  return dbase;
 }
}
module.exports={RegionAttentionNetwork,architecture,legacyArchitecture,centers,screenPosition,regionGeometry};

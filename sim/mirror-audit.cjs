'use strict';
const {featureCount,groups}=require('./training.cjs');
const mirrorDirection=[0,5,4,3,2,1,8,7,6];
function mirrorFeatures(input){
 if(input.length!==featureCount||!Array.from(input).every(Number.isFinite))throw Error('Invalid mirror input');
 const f=Float64Array.from(input),neg=i=>{f[i]=f[i]===0?0:-f[i];};
 for(const i of [0,23,25])neg(i);
 [f[19],f[20]]=[f[20],f[19]];
 f[27]=mirrorDirection[Math.round(f[27]*8)]/8;
 let at=32;
 for(const [name,count,width]of groups)for(let j=0;j<count;j++,at+=width){
  if(!f[at])continue;
  neg(at+1);
  if(name==='slices')neg(at+11);
  if(name==='milk')neg(at+8);
  if(name==='drops')neg(at+4);
 }
 if(f[at]){f[at+5]=mirrorDirection[Math.round(f[at+5]*8)]/8;neg(at+8);}
 return f;
}
function mirrorContext(c){return {skills:[...c.skills],parameters:c.parameters.map(p=>({...p,direction:mirrorDirection.map(i=>p.direction[i]),target:[...p.target],travel:[...p.travel]}))};}
function mirrorChoice(a){return [a[0],mirrorDirection[a[1]],...a.slice(2)];}
function totalVariation(a,b){return a.reduce((n,v,i)=>n+Math.abs(v-b[i]),0)/2;}
module.exports={mirrorFeatures,mirrorDirection,mirrorContext,mirrorChoice,totalVariation};

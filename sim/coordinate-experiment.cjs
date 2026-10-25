'use strict';
const {groups,featureCount}=require('./training.cjs');
const RAW='milk-skills-v5',LOCAL='milk-skills-v5-xy200-v1';
function coordinateIndices(f){let at=32;const out=[];for(const [name,count,width] of groups){for(let i=0;i<count;i++,at+=width)if(f[at])out.push({name,x:at+1,y:at+2});}if(f[at])out.push({name:'activeTarget',x:at+8,y:at+9});return out;}
function prepare(features,contract){
 if(![RAW,LOCAL].includes(contract))throw Error('Explicit supported coordinate contract required');
 if(features.length!==featureCount||!Array.from(features).every(Number.isFinite))throw Error('Invalid raw features');
 const f=Float64Array.from(features);if(contract===LOCAL)for(const {x,y} of coordinateIndices(features)){f[x]*=6.25;f[y]*=6.25;}
 // Do not clip to the old encoder's range after changing numerical units.
 return f;
}
function sample(policy,features,rng,greedy,context){return policy.net.sample(prepare(features,policy.coordinateContract),rng,greedy,context);}
function range(features){const result={};for(const {name,x,y} of coordinateIndices(features)){const r=result[name]??={count:0,maxAbsX:0,maxAbsY:0};r.count++;r.maxAbsX=Math.max(r.maxAbsX,Math.abs(features[x])*6.25);r.maxAbsY=Math.max(r.maxAbsY,Math.abs(features[y])*6.25);}return result;}
module.exports={RAW,LOCAL,coordinateIndices,prepare,sample,range};

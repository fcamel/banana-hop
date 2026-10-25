'use strict';
const {distribution,logProbability}=require('./ppo.cjs');
const {heads}=require('./skills.cjs');
const {mirrorFeatures,mirrorContext,mirrorDirection}=require('./mirror-audit.cjs');
// Equal mixture of two JOINT policies. Posterior branch weights are updated
// after each selected head; averaging each head independently is not equivalent.
function sampleMixture(branches,rng,greedy=false){
 let weights=[.5,.5];const action=[],probs=[];
 for(let h=0;h<heads.length;h++){
  const ps=branches.map(b=>b(h,action[0]));
  const p=ps[0].map((v,i)=>weights[0]*v+weights[1]*ps[1][i]);
  let selected;
  if(greedy)selected=p.indexOf(Math.max(...p));
  else{let u=rng.next();selected=p.length-1;for(let i=0;i<p.length;i++){u-=p[i];if(u<0){selected=i;break;}}}
  action.push(selected);probs.push(p);
  const mass=p[selected];if(!(mass>0))throw Error('Empty mixture choice');weights=weights.map((w,i)=>w*ps[i][selected]/mass);
 }
 return {action,probs,logp:logProbability(probs,action)};
}
function mirrorPolicy(net){
 return {sample(f,rng,greedy,c){
  const contexts=[c,mirrorContext(c)],inputs=[f,mirrorFeatures(f)],caches=inputs.map(x=>net.forward(x));
  const branches=caches.map((cache,b)=>(head,skill)=>{
   if(head===1&&net.condition)net.condition(cache,skill);
   const at=heads.slice(0,head).reduce((a,b)=>a+b,0),context=contexts[b],mask=head===0?context.skills:context.parameters[skill][['','direction','target','travel'][head]];
   const p=distribution(cache.activations.at(-1).slice(at,at+heads[head]),mask);
   return b&&head===1?mirrorDirection.map(i=>p[i]):p;
  });
  return {...sampleMixture(branches,rng,greedy),value:(caches[0].value+caches[1].value)/2};
 }};
}
module.exports={mirrorPolicy,sampleMixture};

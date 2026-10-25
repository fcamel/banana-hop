'use strict';
const {heads,policySize}=require('./ppo.cjs');
const {masksFor,lossAndGradient}=require('./imitation.cjs');
// KL(reference joint policy || learner joint policy), including all legal
// conditional skill branches, not only the teacher's selected skill.
function referencePolicy(net,row){
 const branches=[];let skillProb;
 for(let skill=0;skill<row.context.skills.length;skill++)if(row.context.skills[skill]){
  const f=net.forward(row.features,masksFor(row.context,[skill]),skill);
  if(!skillProb)skillProb=Array.from(f.probs[0]);
  branches.push({skill,probs:f.probs.map(p=>Array.from(p))});
 }
 return {skillProb,branches};
}
function jointKL(net,row,reference,gradient=null,scale=1){
 let loss=0,first=true;
 for(const branch of reference.branches){
  const f=net.forward(row.features,masksFor(row.context,[branch.skill]),branch.skill),g=new Float64Array(policySize+1);let offset=0;
  for(let h=0;h<heads.length;h++){
   const weight=h===0?(first?1:0):reference.skillProb[branch.skill],p=f.probs[h],q=branch.probs[h];
   for(let j=0;j<p.length;j++){if(q[j]>0)loss+=weight*q[j]*Math.log(q[j]/Math.max(1e-30,p[j]));g[offset+j]=scale*weight*(p[j]-q[j]);}offset+=heads[h];
  }
  if(gradient)net.backward(f,g,gradient);first=false;
 }
 return loss;
}
function regularizedLoss(net,batch,references,coefficient=1){
 if(!Number.isFinite(coefficient)||coefficient<0)throw Error('Invalid KL coefficient');
 const result=lossAndGradient(net,batch);let kl=0;
 if(coefficient)for(const row of batch){const ref=references.get(row);if(!ref)throw Error('Missing frozen reference');kl+=jointKL(net,row,ref,result.gradient,coefficient/batch.length)/batch.length;}
 return {...result,bcLoss:result.loss,kl,loss:result.loss+coefficient*kl};
}
module.exports={referencePolicy,jointKL,regularizedLoss};

'use strict';
const {heads,policySize,Adam,Random}=require('./ppo.cjs');
const {skillEnvironment}=require('./training.cjs');
const {choose}=require('./visible-baseline.cjs');
const {validateChoice,skills}=require('./skills.cjs');
function masksFor(context,action){const p=context.parameters[action[0]];return [context.skills,p.direction,p.target,p.travel];}
function lossAndGradient(net,batch,classWeights=null){
 if(!batch.length)throw Error('Empty imitation batch');
 const gradient=new Float64Array(net.parameters.length);let loss=0;
 for(const row of batch){validateChoice(row.action,row.context);const masks=masksFor(row.context,row.action),f=net.forward(row.features,masks,row.action[0]),g=new Float64Array(policySize+1);let offset=0;
  for(let h=0;h<heads.length;h++){const p=f.probs[h],label=row.action[h],weight=classWeights?.[h]?.[label]??1;loss-=weight*Math.log(Math.max(1e-30,p[label]))/batch.length;for(let j=0;j<p.length;j++)g[offset+j]=weight*(p[j]-(j===label?1:0))/batch.length;offset+=heads[h];}
  // No critic objective. Shared representation updates may still change values.
  net.backward(f,g,gradient);
 }return {loss,gradient};
}
function measure(net,rows){
 const head=heads.map(n=>({choices:0,correct:0,confusion:Array.from({length:n},()=>Array(n).fill(0))})),bySkill={};let loss=0,joint=0;const rng=new Random(1);
 for(const row of rows){const masks=masksFor(row.context,row.action),f=net.forward(row.features,masks,row.action[0]),predicted=net.sample(row.features,rng,true,row.context).action;
  if(predicted.every((v,i)=>v===row.action[i]))joint++;
  for(let h=0;h<heads.length;h++){const p=f.probs[h];loss-=Math.log(Math.max(1e-30,p[row.action[h]]));if(masks[h].filter(Boolean).length>1){head[h].choices++;const pred=p.indexOf(Math.max(...p));head[h].confusion[row.action[h]][pred]++;if(pred===row.action[h])head[h].correct++;}}
  const name=skills[row.action[0]].name,s=bySkill[name]??={count:0,skillCorrect:0,jointCorrect:0};s.count++;s.skillCorrect+=+(predicted[0]===row.action[0]);s.jointCorrect+=+predicted.every((v,i)=>v===row.action[i]);
 }
 return {samples:rows.length,loss:loss/rows.length,jointAccuracy:joint/rows.length,heads:head.map((h,index)=>{const recall=h.confusion.map((row,i)=>{const count=row.reduce((a,b)=>a+b,0);return {class:i,count,recall:count?row[i]/count:null};}),present=recall.filter(r=>r.count);return {...h,confusion:index===1?h.confusion:undefined,accuracy:h.choices?h.correct/h.choices:null,recall,macroRecall:present.length?present.reduce((n,r)=>n+r.recall,0)/present.length:null};}),bySkill,majoritySkillAccuracy:Math.max(...Object.values(bySkill).map(s=>s.count))/rows.length};
}
function trainEpoch(net,adam,rows,rng,{batchSize=32,learningRate=.001,classWeights=null}={}){
 const order=rows.slice();for(let i=order.length-1;i>0;i--){const j=Math.floor(rng.next()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 let loss=0;for(let i=0;i<order.length;i+=batchSize){const b=order.slice(i,i+batchSize),r=lossAndGradient(net,b,classWeights);adam.step(net.parameters,r.gradient,learningRate);loss+=r.loss*b.length;}return loss/rows.length;
}
function collect(seed,diagnosticStart=null,diagnosticUntil=undefined){
 const env=skillEnvironment({seed,width:1000,height:650,mobile:false,diagnosticStart,diagnosticUntil}),rows=[];let previous=0;
 while(env.summary().outcome==='running'&&(diagnosticUntil===undefined||env.observe().time<diagnosticUntil-1e-8)){
  const features=env.features(),context=env.context(),action=choose(features,context,previous).choice;validateChoice(action,context);
  rows.push({seed,time:env.observe().time,features,context,action:[...action]});previous=action[1];env.step(action);
 }return {rows,summary:env.summary()};
}
function balancingWeights(rows){
 const counts=heads.map(n=>Array(n).fill(0));for(const row of rows){const masks=masksFor(row.context,row.action);for(const h of [0,1])if(masks[h].filter(Boolean).length>1)counts[h][row.action[h]]++;}
 return counts.map((c,h)=>{if(h>1)return c.map(()=>1);const max=Math.max(...c),raw=c.map(n=>n?Math.min(3,Math.sqrt(max/n)):1),total=c.reduce((a,b)=>a+b,0),average=total?c.reduce((s,n,i)=>s+n*raw[i],0)/total:1;return raw.map((v,i)=>c[i]?v/average:1);});
}
module.exports={balancingWeights,masksFor,lossAndGradient,measure,trainEpoch,collect,Adam,Random};

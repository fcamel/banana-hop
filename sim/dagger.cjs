'use strict';
const {skillEnvironment}=require('./training.cjs');
const {choose}=require('./visible-baseline.cjs');
const {validateChoice}=require('./skills.cjs');
const {Random,lossAndGradient}=require('./imitation.cjs');
// The learner alone advances the world. The teacher labels the same pre-action
// visible observation; its proposed action never changes the rollout.
function collectLearner(net,seed,options={},teacher=choose){
 const env=skillEnvironment({seed,width:1000,height:650,mobile:false,...options}),rng=new Random(seed),rows=[];let previous=0;
 while(env.summary().outcome==='running'&&(options.diagnosticUntil===undefined||env.observe().time<options.diagnosticUntil-1e-8)){
  const features=env.features(),context=env.context(),executedAction=[...net.sample(features,rng,true,context).action];
  const action=[...teacher(features,context,previous).choice];validateChoice(action,context);validateChoice(executedAction,context);
  rows.push({seed,time:env.observe().time,features,context,action,executedAction});previous=executedAction[1];env.step(executedAction);
 }return {rows,summary:env.summary()};
}
function sampleBatch(natural,learner,rng,size=32){
 if(!natural.length||!Number.isInteger(size)||size<2||size%2)throw Error('Need natural rows and an even batch size');
 const half=size/2,draw=pool=>pool[Math.floor(rng.next()*pool.length)];
 return Array.from({length:size},(_,i)=>draw(learner?.length&&i>=half?learner:natural));
}
function trainRound(net,adam,natural,learner,rng,{updates=24,batchSize=32,learningRate=.001}={}){
 let loss=0;for(let i=0;i<updates;i++){const result=lossAndGradient(net,sampleBatch(natural,learner,rng,batchSize));adam.step(net.parameters,result.gradient,learningRate);loss+=result.loss;}
 return {updates,samples:updates*batchSize,loss:loss/updates};
}
module.exports={collectLearner,sampleBatch,trainRound};

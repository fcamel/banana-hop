'use strict';
const {parentPort}=require('node:worker_threads');
const {trainingEnvironment,featureCount}=require('./training.cjs');
const {Network,Random,advantages}=require('./ppo.cjs');
const {createEnvironment}=require('./environment.cjs');
function execute(job){
  if(job.kind!=='rollout'&&(job.startAt||job.startSnapshots))throw Error('Evaluation and baselines must start at 0s');
  if(job.kind==='rollout'&&(![0,30,50].includes(job.startAt??0)||!!job.startAt!==!!job.startSnapshots))throw Error('Invalid rollout curriculum start');
  if(job.kind==='rollout'&&job.startAt&&(!Array.isArray(job.startSnapshots)||job.startSnapshots.some(s=>s.startAt!==job.startAt)))throw Error('Rollout snapshots must match their assigned stage');
  const rng=new Random(job.policySeed),options={seed:job.seed,...job.profile,record:job.kind==='evaluate',startSnapshots:job.kind==='rollout'?job.startSnapshots:undefined};
  if(job.kind==='baseline'){
    if(job.policy!=='rule'){
      const env=trainingEnvironment(options);
      while(env.summary().outcome==='running')env.step(job.policy==='idle'?[0,0,0,0]:[Math.floor(rng.next()*9),Math.floor(rng.next()*2),Math.floor(rng.next()*2),Math.floor(rng.next()*2)]);
      return {score:env.summary().gameSeconds,profile:job.profile};
    }
    const env=createEnvironment({...options,mode:'milk',entrance:false,survivalOnly:true});
    while(env.summary().outcome==='running')env.step(env.policy(env.observe()),6);
    return {score:env.summary().gameSeconds,profile:job.profile};
  }
  const net=new Network(featureCount,job.hidden);net.parameters.set(job.parameters);
  const env=trainingEnvironment(options),buffer=[];let trajectory=[],features=env.features(),episodes=0,physicsSteps=0;const timeBuckets={0:0,30:0,50:0};
  for(let i=0;i<job.decisions;i++){
    const time=env.observe().time;timeBuckets[time<30-1e-8?0:time<50-1e-8?30:50]++;
    const sampled=net.sample(features,rng),before=env.summary().steps,result=env.step(sampled.action);physicsSteps+=result.info.steps-before;
    if(job.kind==='evaluate'&&result.terminated)return {score:result.info.gameSeconds,replay:env.replay(),profile:job.profile};
    trajectory.push({...sampled,features,reward:result.reward,terminated:result.terminated});features=result.features;
    if(result.terminated){buffer.push(...advantages(trajectory,0));trajectory=[];episodes++;features=env.reset((job.seed+episodes)>>>0);}
  }
  if(job.kind==='evaluate')throw Error('Evaluation ended before the 60-second task terminated');
  buffer.push(...advantages(trajectory,net.forward(features).value));
  return {buffer,physicsSteps,episodes,startAt:job.startAt??0,timeBuckets};
}
if(parentPort)parentPort.on('message',job=>{try{parentPort.postMessage({id:job.id,result:execute(job)});}catch(error){parentPort.postMessage({id:job.id,error:error.stack});}});
module.exports={execute};

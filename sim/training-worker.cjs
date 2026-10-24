'use strict';
const {parentPort}=require('node:worker_threads');
const {skillEnvironment,featureCount}=require('./training.cjs');
const {createNetwork,Random,monteCarloReturns}=require('./ppo.cjs');
const {createEnvironment}=require('./environment.cjs');
const itemMetrics=require('./item-metrics.cjs');
function execute(job){
  if(job.kind!=='rollout'&&(job.startAt||job.startSnapshots))throw Error('Evaluation and baselines must start at 0s');
  if(job.kind==='rollout'&&(![0,30,50].includes(job.startAt??0)||!!job.startAt!==!!job.startSnapshots))throw Error('Invalid rollout curriculum start');
  if(job.kind==='rollout'&&job.startAt&&(!Array.isArray(job.startSnapshots)||job.startSnapshots.some(s=>s.startAt!==job.startAt&&!(job.startAt===50&&s.kind==='breakthrough'))))throw Error('Rollout snapshots must match their assigned stage');
  if(job.kind!=='baseline'&&(!Number.isInteger(job.decisions)||job.decisions<1))throw Error('Invalid decision budget');
  const rng=new Random(job.policySeed),options={seed:job.seed,...job.profile,record:job.kind==='evaluate'&&job.recordReplay!==false,startSnapshots:job.kind==='rollout'?job.startSnapshots:undefined};
  if(job.kind==='baseline'){
    if(job.policy!=='rule'){
      const env=skillEnvironment(options);
      while(env.summary().outcome==='running'){
        const pick=mask=>{const valid=mask.flatMap((v,i)=>v?[i]:[]);return valid[Math.floor(rng.next()*valid.length)];},context=env.context(),skill=job.policy==='idle'?0:pick(context.skills);
        env.step(job.policy==='idle'?[0,0,0]:[skill,pick(context.parameters[skill].direction),pick(context.parameters[skill].target),pick(context.parameters[skill].travel)]);
      }
      return {score:env.summary().gameSeconds,profile:job.profile};
    }
    const env=createEnvironment({...options,mode:'milk',entrance:false,survivalOnly:true});
    while(env.summary().outcome==='running')env.step(env.policy(env.observe()),6);
    return {score:env.summary().gameSeconds,profile:job.profile};
  }
  const net=createNetwork(featureCount,job.hidden,new Random(),job.architecture||'mlp-v1');if(!job.parameters||job.parameters.length!==net.parameters.length)throw Error('Worker model parameter size mismatch');net.parameters.set(job.parameters);
  const env=skillEnvironment(options),buffer=[],totals=itemMetrics.empty(),damage=itemMetrics.damageSummary([]);let trajectory=[],features=env.features(),episodes=0,physicsSteps=0;let forcedDecisions=0;const skillCounts={};const timeBuckets={0:0,30:0,50:0};
  for(let i=0;i<job.decisions||(job.kind==='rollout'&&trajectory.length);i++){
    const time=env.observe().time;timeBuckets[time<30-1e-8?0:time<50-1e-8?30:50]++;
    const context=env.context();if(context.skills.filter(Boolean).length===1&&context.parameters[0].direction.filter(Boolean).length===1)forcedDecisions++;
    const sampled=net.sample(features,rng,false,context),before=env.summary().steps,result=env.step(sampled.action);physicsSteps+=result.info.steps-before;skillCounts[result.option.skill]=(skillCounts[result.option.skill]||0)+1;
    if(job.kind==='evaluate'&&result.terminated)return {score:result.info.gameSeconds,...(options.record?{replay:env.replay()}:{}),forcedDecisions,itemMetrics:env.metrics(),damage:{summary:itemMetrics.damageSummary(env.damageEvents()),events:env.damageEvents()},profile:job.profile};
    trajectory.push({...sampled,features,option:result.option,reward:result.reward,terminated:result.terminated});features=result.features;
    if(result.terminated){itemMetrics.mergeDamage(damage,itemMetrics.damageSummary(env.damageEvents()));itemMetrics.add(totals,env.metrics());buffer.push(...monteCarloReturns(trajectory));trajectory=[];episodes++;if(buffer.length<job.decisions)features=env.reset((job.seed+episodes)>>>0);}
  }
  if(job.kind==='evaluate')throw Error('Evaluation ended before the 60-second task terminated');
  return {buffer,physicsSteps,episodes,damage,forcedDecisions,itemMetrics:totals,startAt:job.startAt??0,timeBuckets,skillCounts};
}
if(parentPort)parentPort.on('message',job=>{try{parentPort.postMessage({id:job.id,result:execute(job)});}catch(error){parentPort.postMessage({id:job.id,error:error.stack});}});
module.exports={execute};

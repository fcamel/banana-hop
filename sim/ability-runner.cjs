'use strict';
const fs=require('node:fs');
const {skillEnvironment,featureCount,contract}=require('./training.cjs');
const {createNetwork,Random}=require('./ppo.cjs');
const {createEnvironment,sourceDigest}=require('./environment.cjs');
const {fixture}=require('./ability-scenarios.cjs');
const {choose}=require('./visible-baseline.cjs');
const {AbilityMetrics}=require('./ability-metrics.cjs');
const replay=require('./ability-replay.cjs');
function loadPolicy(file){const c=JSON.parse(fs.readFileSync(file,'utf8'));if(c.contract!==contract||c.sourceDigest!==sourceDigest||c.sizes?.[0]!==featureCount)throw Error('Checkpoint observation/game mismatch');const net=createNetwork(featureCount,c.config.hidden,new Random(1),c.architecture||'mlp-v1');if(c.parameters.length!==net.parameters.length||!c.parameters.every(Number.isFinite))throw Error('Invalid weights');net.parameters.set(c.parameters);return {name:`${c.runId}-g${c.generation}`,net,file,generation:c.generation,architecture:c.architecture};}
function runCase(policy,spec,{seed=0xd2000001,policySeed=seed,greedy=false,record=false,redecisionFrames=30}={}){
 const initial=spec?fixture(spec):null,metrics=new AbilityMetrics(),actions=[],rng=new Random(policySeed),started=performance.now();
 const env=skillEnvironment({diagnosticRedecisionFrames:redecisionFrames,seed,width:1000,height:650,mobile:false,record:record&&!initial,diagnosticStart:initial,diagnosticUntil:spec?.seconds,onPhysicsStep:frame=>{metrics.frame(frame);if(initial&&record)replay.append(actions,frame.action);}});
 let previous=0,decisions=0;
 while(env.summary().outcome==='running'&&env.observe().time<(spec?.seconds??60)-1e-8){
  const f=env.features(),context=env.context(),selected=policy.net?{choice:policy.net.sample(f,rng,greedy,context).action}:policy.name==='idle'?{choice:[0,0,0,0],action:{x:0,y:0}}:choose(f,context,previous);
  metrics.begin(f,selected.choice,env.observe().time);previous=selected.choice[1];decisions++;
  if(policy.name==='visible-primitive'){env.setActionHistory([{skill:'primitive',startedAt:env.observe().time}]);env.stepAction(selected.action,6);}else env.step(selected.choice);
 }
 const summary=env.summary(),diagnostics=metrics.finish(env.damageEvents()),items=env.metrics(),o=env.observe();
 const result={id:spec?.id??`full-${seed}`,family:spec?.family??'full',seed,policySeed,greedy,redecisionFrames,policy:policy.name,summary,items,diagnostics,decisions,wallSeconds:(performance.now()-started)/1000,success:spec?.family==='corner'?Math.abs(o.player.x)<1070&&Math.abs(o.player.y)<1070:spec?.family==='bottle'?items.milkBottles>0:spec?diagnostics.damage.length===0:summary.gameSeconds>=60};
 if(record){if(initial){result.replay={schema:replay.schema,sourceDigest,initial,actions,finalDigest:env.diagnosticDigest()};replay.verify(result.replay);}else{result.replay=env.replay();createEnvironment().restoreTape(result.replay);}result.replayVerified=true;}
 return result;
}
module.exports={loadPolicy,runCase};

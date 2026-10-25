'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy}=require('../sim/ability-runner.cjs'),{skillEnvironment}=require('../sim/training.cjs'),{Random}=require('../sim/ppo.cjs'),{bootstrap}=require('../sim/paired-evaluation.cjs'),{createEnvironment}=require('../sim/environment.cjs'),{recordFrame}=require('../sim/landing-audit.cjs');
const seedBase=Number(process.argv[2]??0xf7100000),count=16,modes=['off','both','decision','reset'];if(!Number.isInteger(seedBase)||seedBase<0||seedBase>0xffffffff-count)throw Error('Invalid seed base');
const source=path.resolve('.training/models/ppo-desktop-attention-validation-v2/best.json'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),net=loadPolicy(source).net;
const dir=path.resolve('.training/diagnostics','landing-ablation-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={source,sourceHash:hash(),seedBase,count,modes,status:'running',rows:[],note:'Frozen greedy NN. decision retains old option when reselected; reset invalidates continuation at the next normal decision, never automatically repeats a skill.'},save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();
for(let i=0;i<count;i++)for(const mode of modes){
 let env,lastLanding=-Infinity,landings=0,postLandingHits=0,vulnerableLandingSeconds=0;const hits=[];
 env=skillEnvironment({seed:seedBase+i,width:1000,height:650,mobile:false,diagnosticLandingMode:mode,record:true,onPhysicsStep:({before,action,result})=>{
  const after=result.observation,damage=after.player.hp<before.player.hp?env.damageEvents().at(-1):null,f=recordFrame(before,after,action,damage);if(f.landed){lastLanding=after.time;landings++;}
  const recent=after.time-lastLanding<=.2+1e-8;if(recent&&before.player.inv<=0&&!before.special)vulnerableLandingSeconds+=after.time-before.time;
  if(damage){postLandingHits+=+recent;hits.push({time:damage.time,reason:damage.reason,postLanding:recent});}
 }});const rng=new Random(seedBase+i);let decisions=0;
 while(env.summary().outcome==='running'){env.step(net.sample(env.features(),rng,true,env.context()).action);decisions++;}
 const tape=env.replay();createEnvironment().restoreTape(tape);if(i===0)fs.writeFileSync(path.join(dir,mode+'.replay.json'),JSON.stringify(tape));
 report.rows.push({seed:i,mode,seconds:env.summary().gameSeconds,decisions,landings,postLandingHits,vulnerableLandingSeconds,hits,items:env.metrics(),kills:env.observe().kills,replayVerified:true});save();console.log(i,mode,env.summary().gameSeconds);
}
report.paired=[['both','off'],['decision','off'],['reset','off'],['both','decision'],['both','reset']].map(([a,b])=>({a,b,...bootstrap(Array.from({length:count},(_,i)=>report.rows.find(r=>r.seed===i&&r.mode===a).seconds-report.rows.find(r=>r.seed===i&&r.mode===b).seconds))}));report.sourceUnchanged=hash()===report.sourceHash;if(!report.sourceUnchanged)throw Error('Source changed');report.status='complete';save();console.log(report.paired);

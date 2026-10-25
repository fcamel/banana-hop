'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy}=require('../sim/ability-runner.cjs');
const {skillEnvironment}=require('../sim/training.cjs');
const {createEnvironment}=require('../sim/environment.cjs');
const {choose}=require('../sim/visible-baseline.cjs');
const audit=require('../sim/failure-audit.cjs');
const {Random}=require('../sim/ppo.cjs');
const source=path.resolve('.training/models/ppo-desktop-attention-validation-v2/best.json'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sourceHash=hash();
const dir=path.resolve('.training/diagnostics','failure-audit-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={source,sourceHash,status:'running',episodes:[],note:'Frozen greedy G50 versus same-visible rule; 16 paired new seeds. No training or policy modification.'};
const save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();
const policies=[{...loadPolicy(source),name:'nn'},{name:'rule'}];
for(let i=0;i<16;i++)for(const policy of policies){
 const seed=0xf3100000+i,rng=new Random(seed),decisions=[];let current=null,previous=0;
 const env=skillEnvironment({seed,width:1000,height:650,mobile:false,record:true,onPhysicsStep:f=>{if(current)audit.frame(current,f);}});
 while(env.summary().outcome==='running'){
  const f=env.features(),context=env.context(),choice=policy.net?policy.net.sample(f,rng,true,context).action:choose(f,context,previous).choice;
  current=audit.begin(f,choice,env.observe().time);decisions.push(current);previous=choice[1];current.result=env.step(choice).option;
 }
 const damage=env.damageEvents().map(e=>({...e,precedingDecisions:decisions.filter(d=>d.time<e.time-1e-8&&d.time>=e.time-2).map(d=>decisions.indexOf(d))}));
 const name=policy.name+'-'+i,tape=env.replay();createEnvironment().restoreTape(tape);
 fs.writeFileSync(path.join(dir,name+'.replay.json'),JSON.stringify(tape));
 fs.writeFileSync(path.join(dir,name+'.trace.json'),JSON.stringify({seed,policy:policy.name,decisions,damage},null,2));
 report.episodes.push({seed,policy:policy.name,seconds:env.summary().gameSeconds,metrics:env.metrics(),summary:audit.summarize(decisions),damageReasons:damage.reduce((a,e)=>(a[e.reason]=(a[e.reason]||0)+1,a),{}),trace:name+'.trace.json',replay:name+'.replay.json',replayVerified:true});save();console.log(policy.name,i,env.summary().gameSeconds);
}
report.sourceUnchanged=hash()===sourceHash;if(!report.sourceUnchanged)throw Error('Source changed');report.status='complete';save();

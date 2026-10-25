'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {loadPolicy}=require('../sim/ability-runner.cjs'),{skillEnvironment}=require('../sim/training.cjs'),{Random}=require('../sim/ppo.cjs'),{bootstrap}=require('../sim/paired-evaluation.cjs'),{createEnvironment}=require('../sim/environment.cjs');
const seedBase=Number(process.argv[2]??0xf5100000);if(!Number.isInteger(seedBase)||seedBase<0||seedBase>0xffffffff-16)throw Error('Invalid seed base');
const source=path.resolve('.training/models/ppo-desktop-attention-validation-v2/best.json'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),net=loadPolicy(source).net;
const dir=path.resolve('.training/diagnostics','landing-decision-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={source,sourceHash:hash(),seedBase,status:'running',rows:[],note:'Frozen greedy NN, 16 new paired seeds. Only diagnostic arm returns control on actual non-damage landing. No prediction, extra observation fields or automatic evasion.'},save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();
for(let i=0;i<16;i++)for(const enabled of [false,true]){
 const seed=seedBase+i,env=skillEnvironment({seed,width:1000,height:650,mobile:false,diagnosticLandingDecision:enabled,record:true}),rng=new Random(seed);let decisions=0,landings=0;
 while(env.summary().outcome==='running'){const a=net.sample(env.features(),rng,true,env.context()).action,r=env.step(a);decisions++;landings+=+(r.option.reason==='diagnostic-landing');}
 const tape=env.replay();createEnvironment().restoreTape(tape);
 if(i===0)fs.writeFileSync(path.join(dir,(enabled?'landing':'original')+'.replay.json'),JSON.stringify(tape));
 report.rows.push({seed:i,enabled,seconds:env.summary().gameSeconds,decisions,landings,replayVerified:true});save();console.log(i,enabled,env.summary().gameSeconds);
}
report.paired=bootstrap(Array.from({length:16},(_,i)=>report.rows.find(r=>r.seed===i&&r.enabled).seconds-report.rows.find(r=>r.seed===i&&!r.enabled).seconds));report.sourceUnchanged=hash()===report.sourceHash;if(!report.sourceUnchanged)throw Error('Source changed');report.status='complete';save();console.log(report.paired);

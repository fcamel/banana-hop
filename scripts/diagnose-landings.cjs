'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createEnvironment}=require('../sim/environment.cjs'),{MotionHistory}=require('../sim/motion.cjs'),{encode}=require('../sim/training.cjs'),{decode}=require('../sim/visible-baseline.cjs'),{threatProbe,landingContext,recordFrame}=require('../sim/landing-audit.cjs');
const prior=process.argv[2];if(!prior)throw Error('Usage: diagnose-landings.cjs FAILURE_AUDIT_DIRECTORY');
const input=JSON.parse(fs.readFileSync(path.join(prior,'report.json'))),dir=path.resolve('.training/diagnostics','landing-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir,{recursive:true});console.log(dir);
const report={prior,status:'running',episodes:[],note:'Replay-only measurements of executed inputs; no policy or reward change. Threats are possible visible same-class objects, not proven hit identities.'},save=()=>fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report,null,2));save();
for(const ep of input.episodes){
 const trace=JSON.parse(fs.readFileSync(path.join(prior,ep.trace))),tape=JSON.parse(fs.readFileSync(path.join(prior,ep.replay))),env=createEnvironment(),play=env.replayTape(tape),history=new MotionHistory(),frames=[];
 const hits=trace.damage.map(e=>({...e,samples:[],kind:e.reason==='被香蕉牛奶噴中'?'drops':e.reason==='撞到香蕉'?'milk':'slices'}));
 let before=env.observe(),done=false,seg=0,left=tape.actions[0].frames;history.update(before);
 while(!done){
  const [x,y,jump,jet,dash,surf]=tape.actions[seg].action,action={x,y,jump:!!jump,jet:!!jet,dash:!!dash,surf:!!surf};
  for(const hit of hits)for(const lead of [.5,.3,.1])if(Math.abs(before.time-(hit.time-lead))<1e-7){
   const v=decode(encode(before,undefined,history)),decision=trace.decisions.find(d=>d.time<=before.time+1e-8&&d.end.time>before.time+1e-8);
   hit.samples.push({lead,time:before.time,player:v.player,input:action,skill:decision?.skill,decisionAge:decision?before.time-decision.time:null,probe:threatProbe(v,action,hit.kind)});
  }
  const out=play.step(),after=out.observation;done=out.done;
  // hurt() resets z/vz: use the recorded PRE-hurt height, never count that reset as landing.
  frames.push(recordFrame(before,after,action,after.player.hp<before.player.hp?env.damageEvents().at(-1):null));
  history.update(after);before=after;if(--left===0&&!done){seg++;left=tape.actions[seg].frames;}
 }
 for(const hit of hits){hit.landing=landingContext(frames,hit.time);if(hit.samples.length!==3&&hit.time>=.5)throw Error('Missing lead samples');}
 report.episodes.push({seed:ep.seed,policy:ep.policy,seconds:ep.seconds,hits,replayVerified:true});save();console.log(ep.policy,ep.seed,hits.length);
}
report.status='complete';save();

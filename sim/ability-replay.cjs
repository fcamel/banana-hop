'use strict';
const {createEnvironment,sourceDigest}=require('./environment.cjs');
const schema='banana-hop-diagnostic-v1';
function append(actions,a){const tuple=[a.x||0,a.y||0,+!!a.jump,+!!a.jet,+!!a.dash,+!!a.surf],last=actions.at(-1);if(last&&tuple.every((n,i)=>n===last.action[i]))last.frames++;else actions.push({frames:1,action:tuple});}
function verify(tape){
 if(tape.schema!==schema||tape.sourceDigest!==sourceDigest||!Array.isArray(tape.actions)||tape.actions.length>36000)throw Error('Invalid diagnostic replay');
 let count=0;for(const s of tape.actions){if(!Number.isInteger(s.frames)||s.frames<1||!Array.isArray(s.action)||s.action.length!==6||s.action.some((x,i)=>!Number.isFinite(x)||(i<2?Math.abs(x)>1:x!==0&&x!==1)))throw Error('Invalid diagnostic input');count+=s.frames;}
 if(count>36000)throw Error('Diagnostic replay too long');
 const env=createEnvironment({...tape.initial.config,record:false});env.restoreSnapshot(tape.initial);
 for(const s of tape.actions){const [x,y,jump,jet,dash,surf]=s.action;for(let i=0;i<s.frames;i++){if(env.summary().outcome!=='running')throw Error('Replay ended early');env.step({x,y,jump:!!jump,jet:!!jet,dash:!!dash,surf:!!surf});}}
 if(env.diagnosticDigest()!==tape.finalDigest)throw Error('Diagnostic replay diverged');return env.summary();
}
module.exports={schema,append,verify};

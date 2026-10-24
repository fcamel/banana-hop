'use strict';
const {createEnvironment,sourceDigest}=require('./environment.cjs');
const {decisionFrames,actionFor}=require('./training.cjs');
const startTimes=Object.freeze([0,50]),bankSchema=1;
const stageShares=Object.freeze([.5,.5]);
function decisionBudgets(rollout){
  const total=rollout*3,raw=stageShares.map(s=>s*total),budgets=raw.map(Math.floor);
  const order=raw.map((n,i)=>({i,f:n-budgets[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);
  const remainder=total-budgets.reduce((a,b)=>a+b);
  for(let n=0;n<remainder;n++)budgets[order[n].i]++;
  return budgets;
}
// Each stage keeps its intended loss mass despite variable complete-episode tails.
function weightRollouts(results){
  const total=results.reduce((s,r)=>s+r.buffer.length,0);
  for(const [i,startAt] of startTimes.entries()){
    const result=results.find(r=>r.startAt===startAt);if(!result?.buffer.length)throw Error('Missing curriculum rollout');
    for(const sample of result.buffer)sample.weight=stageShares[i]*total/result.buffer.length;
  }
  return results.flatMap(r=>r.buffer);
}
function previousChoice(a){
  const magnitude=Math.hypot(a.x||0,a.y||0),angle=Math.atan2(a.y||0,a.x||0);
  const direction=magnitude<.1?0:1+((Math.round(angle/(Math.PI/4))+8)%8);
  return [direction,+(!!a.jump||!!a.jet),+!!a.dash,+!!a.surf];
}
function validateStart(entry,profile){
  if(!entry||(!(entry.kind==='breakthrough'&&entry.startAt>0&&entry.startAt<60)&&![30,50].includes(entry.startAt))||entry.sourceDigest!==sourceDigest)throw Error('Invalid curriculum start/source');
  if(entry.snapshot){
    const c=entry.snapshot.config;
    if(entry.snapshot.sourceDigest!==sourceDigest||c.mode!=='milk'||!c.survivalOnly||c.entrance!==false||Math.abs(entry.snapshot.time-entry.startAt)>1e-7)throw Error('Invalid curriculum snapshot');
    if(c.width!==profile.width||c.height!==profile.height||c.mobile!==profile.mobile)throw Error('Curriculum viewport changed');
    if(entry.kind==='breakthrough'&&(entry.startHp!==2||entry.heal===true))throw Error('Breakthrough requires exactly two HP');
    actionFor(entry.previous);return entry;
  }
  const tape=entry.tape,c=tape?.config;
  if(!c||c.mode!=='milk'||c.survivalOnly!==true||c.entrance!==false||c.seed>=0x40000000)throw Error('Curriculum starts must use training seeds and survival-only milk');
  if(c.width!==profile.width||c.height!==profile.height||c.mobile!==profile.mobile)throw Error('Curriculum viewport changed');
  if(tape.sourceDigest!==sourceDigest||Math.abs(tape.result?.gameSeconds-entry.startAt)>1e-6||tape.result?.outcome!=='running'||!(tape.result.hp>0))throw Error('Curriculum start must be a live, authentic stage boundary');
  actionFor(entry.previous);return entry;
}
// A portable world checkpoint: replaying the actual prefix reconstructs every
// actor, timer, resource and RNG state. No clock jumps, healing or fake enemies.
function createStartBank({profile={width:1000,height:650,mobile:false},seed=7,size=8,maxAttempts=64}={}){
  if(!Number.isInteger(seed)||seed<0||seed>=0x40000000||!Number.isInteger(size)||size<1||size>64||!Number.isInteger(maxAttempts)||maxAttempts<size||seed+maxAttempts>=0x40000000)throw Error('Invalid curriculum bank options');
  const starts={'30':[],'50':[]};
  for(let attempt=0;attempt<maxAttempts&&[30,50].some(t=>starts[t].length<size);attempt++){
    const env=createEnvironment({...profile,mode:'milk',seed:seed+attempt,entrance:false,survivalOnly:true,record:true});let previous=[0,0,0,0];
    while(env.summary().outcome==='running'&&env.summary().gameSeconds<50-1e-8){
      const action=env.policy(env.observe());env.step(action,decisionFrames);previous=previousChoice(action);
      for(const startAt of [30,50])if(starts[startAt].length<size&&Math.abs(env.summary().gameSeconds-startAt)<1e-6&&env.summary().outcome==='running')starts[startAt].push({startAt,sourceDigest,previous:[...previous],tape:env.replay()});
    }
  }
  if([30,50].some(t=>starts[t].length<size))throw Error('Not enough live 30s/50s curriculum starts; no fallback to opening states');
  return {schema:bankSchema,sourceDigest,profile:{...profile},generator:'rule-based-authentic-prefix',starts};
}
function validateBank(bank,profile){
  if(bank?.schema!==bankSchema||bank.sourceDigest!==sourceDigest||JSON.stringify(bank.profile)!==JSON.stringify(profile))throw Error('Incompatible curriculum bank');
  for(const t of startTimes.slice(1)){
    if(!Array.isArray(bank.starts?.[t])||!bank.starts[t].length||bank.starts[t].length>64)throw Error('Missing curriculum stage');
    for(const entry of bank.starts[t]){validateStart(entry,profile);if(entry.startAt!==t&&!(t===50&&entry.kind==='breakthrough'))throw Error('Wrong curriculum stage');}
  }
  return bank;
}
function rolloutJobs({config,random,parameters,banks}){
  const budgets=decisionBudgets(config.rollout);
  return startTimes.map((startAt,i)=>{
    const profile=config.profiles[i%config.profiles.length],bank=banks.find(b=>JSON.stringify(b.profile)===JSON.stringify(profile));
    if(startAt&&!bank)throw Error('Missing curriculum bank for rollout profile');
    return {kind:'rollout',startAt,startSnapshots:startAt?validateBank(bank,profile).starts[startAt]:undefined,seed:Math.floor(random.next()*0x3ffff000),policySeed:Math.floor(random.next()*0xffffffff),profile,decisions:budgets[i],hidden:config.hidden,architecture:config.architecture,parameters};
  });
}
function materialize(entry){
  if(entry.snapshot)return entry;
  const env=createEnvironment(entry.tape.config),tail=[];
  env.restoreTape(entry.tape,o=>tail.push(o));
  const {tape,...rest}=entry;return {...rest,snapshot:env.snapshot(),tail};
}
// The stored stage key 50 denotes the late curriculum category. Breakthrough
// entries carry their actual replay time, which need not be 50 seconds.
function breakthroughTimes(end){
  if(!Number.isFinite(end)||end<4||end>60+1e-6)throw Error('Invalid breakthrough terminal time');
  const latest=Math.max(.1,end-4),earliest=Math.max(.1,end-8);
  return [...new Set(Array.from({length:5},(_,i)=>Math.max(1,Math.floor((earliest+(latest-earliest)*i/4)*60+1e-6))))];
}
function breakthroughStarts(tape){
  if(tape.sourceDigest!==sourceDigest||tape.config.mode!=='milk'||!tape.config.survivalOnly||tape.result.gameSeconds<4)throw Error('Breakthrough replay must contain at least four real seconds');
  createEnvironment().restoreTape(tape); // Verify the complete recorded outcome before using its prefix.
  const targets=breakthroughTimes(tape.result.gameSeconds);
  const env=createEnvironment({...tape.config,record:false}),entries=[],tail=[];let frames=0,previous=[0,0,0,0];
  for(const segment of tape.actions){const [x,y,jump,jet,dash,surf]=segment.action,action={x,y,jump:!!jump,jet:!!jet,dash:!!dash,surf:!!surf};
    for(let i=0;i<segment.frames&&frames<targets.at(-1);i++){
      const r=env.step(action);frames++;previous=previousChoice(action);tail.push(r.observation);if(tail.length>2)tail.shift();
      if(targets.includes(frames))entries.push({kind:'breakthrough',startAt:r.observation.time,sourceDigest,previous:[...previous],startHp:2,snapshot:env.snapshot(),tail:[...tail]});
    }
    if(frames>=targets.at(-1))break;
  }
  if(entries.length!==targets.length)throw Error('Could not extract live breakthrough starts');return entries;
}
module.exports={breakthroughTimes,materialize,breakthroughStarts,startTimes,stageShares,decisionBudgets,weightRollouts,createStartBank,validateStart,validateBank,rolloutJobs};

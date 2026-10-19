'use strict';
const {createEnvironment,sourceDigest}=require('./environment.cjs');
const {decisionFrames,actionFor}=require('./training.cjs');
const startTimes=Object.freeze([0,30,50]),bankSchema=1;
function previousChoice(a){
  const magnitude=Math.hypot(a.x||0,a.y||0),angle=Math.atan2(a.y||0,a.x||0);
  const direction=magnitude<.1?0:1+((Math.round(angle/(Math.PI/4))+8)%8);
  return [direction,+(!!a.jump||!!a.jet),+!!a.dash,+!!a.surf];
}
function validateStart(entry,profile){
  if(!entry||![30,50].includes(entry.startAt)||entry.sourceDigest!==sourceDigest)throw Error('Invalid curriculum start/source');
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
  for(let attempt=0;attempt<maxAttempts&&startTimes.slice(1).some(t=>starts[t].length<size);attempt++){
    const env=createEnvironment({...profile,mode:'milk',seed:seed+attempt,entrance:false,survivalOnly:true,record:true});let previous=[0,0,0,0];
    while(env.summary().outcome==='running'&&env.summary().gameSeconds<50-1e-8){
      const action=env.policy(env.observe());env.step(action,decisionFrames);previous=previousChoice(action);
      for(const startAt of startTimes.slice(1))if(starts[startAt].length<size&&Math.abs(env.summary().gameSeconds-startAt)<1e-6&&env.summary().outcome==='running')starts[startAt].push({startAt,sourceDigest,previous:[...previous],tape:env.replay()});
    }
  }
  if(startTimes.slice(1).some(t=>starts[t].length<size))throw Error('Not enough live 30s/50s curriculum starts; no fallback to opening states');
  return {schema:bankSchema,sourceDigest,profile:{...profile},generator:'rule-based-authentic-prefix',starts};
}
function validateBank(bank,profile){
  if(bank?.schema!==bankSchema||bank.sourceDigest!==sourceDigest||JSON.stringify(bank.profile)!==JSON.stringify(profile))throw Error('Incompatible curriculum bank');
  for(const t of startTimes.slice(1)){
    if(!Array.isArray(bank.starts?.[t])||!bank.starts[t].length||bank.starts[t].length>64)throw Error('Missing curriculum stage');
    for(const entry of bank.starts[t]){validateStart(entry,profile);if(entry.startAt!==t)throw Error('Wrong curriculum stage');}
  }
  return bank;
}
function rolloutJobs({config,random,parameters,banks}){
  return startTimes.map((startAt,i)=>{
    const profile=config.profiles[i%config.profiles.length],bank=banks.find(b=>JSON.stringify(b.profile)===JSON.stringify(profile));
    if(startAt&&!bank)throw Error('Missing curriculum bank for rollout profile');
    return {kind:'rollout',startAt,startSnapshots:startAt?validateBank(bank,profile).starts[startAt]:undefined,seed:Math.floor(random.next()*0x3ffff000),policySeed:Math.floor(random.next()*0xffffffff),profile,decisions:config.rollout,hidden:config.hidden,parameters};
  });
}
module.exports={startTimes,createStartBank,validateStart,validateBank,rolloutJobs};

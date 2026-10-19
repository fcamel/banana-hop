'use strict';
const {createEnvironment}=require('./environment.cjs');
const contract='milk-survival-v2',decisionFrames=6;
const directions=[[0,0],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const groups=[['slices',64,14],['milk',64,10],['bottles',12,4],['drops',128,8],['warnings',16,5],['pickups',16,4]];
const featureCount=32+groups.reduce((n,[,count,width])=>n+count*width,0);
// Use the same world-to-screen projection as game.js, with no offscreen margin.
// Visibility is defined by the object's projected anchor (including altitude).
function inViewport(o,e){
  const x=o.viewport.width/2+e.x-o.player.x,y=o.viewport.height*.52+(e.y-o.player.y)*.72-(e.z||0);
  return x>=0&&x<=o.viewport.width&&y>=0&&y<=o.viewport.height;
}
function encode(o,previous=[0,0,0,0]){
  const p=o.player,scale=o.viewport.scale,v=[p.x/1250,p.y/1250,p.z/200,p.vz/400,p.hp/5,p.inv/2.5,p.damageInv/2.5,p.down,p.recoil,p.jumpLock,p.charge/100,p.milkFuel/5,p.surfStock/3,+!!o.special,+!!p.boosted,(60-o.time)/60,o.viewport.width/1500,o.viewport.height/1000,scale,(1250-p.x)/2500,(1250+p.x)/2500,(1250-p.y)/2500,(1250+p.y)/2500,p.recoilX/400,p.recoilY/400,p.padDriftX/400,p.padDriftY/400,previous[0]/8,...previous.slice(1),1];
  const relative=e=>[(e.x-p.x)/1250,(e.y-p.y)/1250];
  const nearest=list=>list.slice().sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||(a.id||0)-(b.id||0));
  function pack(name,list,make){const [,count,width]=groups.find(g=>g[0]===name),sorted=nearest(list.filter(e=>inViewport(o,e)));for(let i=0;i<count;i++)v.push(...(sorted[i]?make(sorted[i]):Array(width).fill(0)));}
  pack('slices',o.enemies.filter(e=>e.type==='slice'),e=>{
    const motion=e.sliceFlight||e.sliceHop,duration=e.sliceFlight?motion.duration:.63;
    return [1,...relative(e),(e.z||0)/200,(e.stackCount||1)/3,e.hit||0,e.down||0,+!!e.sliceHop,+!!e.sliceFlight,+!!e.stackAnchor,(e.stackTime||0)/3,motion?(motion.bx-motion.ax)/duration/500:0,motion?(motion.by-motion.ay)/duration/500:0,(e.drinking||0)];
  });
  pack('milk',o.enemies.filter(e=>e.type==='milk'),e=>[1,...relative(e),(e.z||0)/200,(e.milkTime||0)/1.1,+(e.milkPhase==='aim'),+(e.milkPhase==='recover'),(e.speed||0)/150,Math.cos(e.milkAim||0),Math.sin(e.milkAim||0)]);
  pack('bottles',o.milkBottles,e=>[1,...relative(e),+(e.claimantId!==undefined)]);
  pack('drops',o.milkDrops.filter(e=>e.hostile),e=>[1,...relative(e),(e.z||0)/200,(e.vx||0)/500,(e.vy||0)/500,+!!e.hostile,e.life||0]);
  pack('warnings',o.spawnWarnings,e=>[1,...relative(e),e.time||0,1]);
  pack('pickups',o.pickups,e=>[1,...relative(e),1]);
  if(v.length!==featureCount)throw Error('Observation contract length mismatch');
  return Float64Array.from(v,n=>{if(!Number.isFinite(n))throw Error('Non-finite training observation');return Math.max(-5,Math.min(5,n));});
}
// Space means a press edge for jumping, and a held button for the milk jet.
// Decisions are held for six physics frames; a held Space never auto-rejumps.
function actionFor(choice,previousSpace=false){
  if(!Array.isArray(choice)||choice.length!==4||choice.some((n,i)=>!Number.isInteger(n)||n<0||n>=(i===0?9:2)))throw Error('Invalid NN action');
  const [x,y]=directions[choice[0]],space=choice[1]===1;
  return {x,y,jump:space&&!previousSpace,jet:space,dash:!!choice[2],surf:!!choice[3]};
}
function trainingEnvironment(options={}){
  let env,observation,previous=[0,0,0,0],initialReward=0,initialTime=0,resetIndex=0;
  function reset(seed=options.seed??1){
    previous=[0,0,0,0];env=createEnvironment({...options,mode:'milk',seed,entrance:false,survivalOnly:true});
    if(options.startSnapshots){
      if(options.record||!Array.isArray(options.startSnapshots)||!options.startSnapshots.length)throw Error('Curriculum restoration requires nonempty snapshots and recording off');
      const entry=options.startSnapshots[((options.seed??1)+resetIndex++)%options.startSnapshots.length];
      require('./curriculum.cjs').validateStart(entry,{width:options.width??1000,height:options.height??650,mobile:options.mobile??false});
      const replay=env.replayTape(entry.tape);while(!replay.step().done){}previous=[...entry.previous];
    }
    observation=env.observe();initialReward=env.summary().reward;initialTime=observation.time;return encode(observation,previous);
  }
  function summary(){const s=env.summary();return {...s,reward:s.reward-initialReward,trainingStartSeconds:initialTime,trainingSeconds:s.gameSeconds-initialTime};}
  reset();
  return {reset,features:()=>encode(observation,previous),observe:()=>observation,summary,replay:()=>env.replay(),
    step(choice){const action=actionFor(choice,!!previous[1]);let reward=0,result;
      for(let i=0;i<decisionFrames&&env.summary().outcome==='running';i++){result=env.step({...action,jump:action.jump&&i===0,dash:action.dash&&i===0,surf:action.surf&&i===0});reward+=result.reward;}
      previous=[...choice];observation=env.observe();return {features:encode(observation,previous),reward,terminated:env.summary().outcome!=='running',truncated:false,info:summary()};
    }};
}
module.exports={contract,featureCount,groups,decisionFrames,directions,inViewport,encode,actionFor,trainingEnvironment};

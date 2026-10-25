'use strict';
const {createEnvironment}=require('./environment.cjs');
const {directions,inViewport,visibleSorted,skillContext,createOption,optionControl,skills,itemList,currentTarget}=require('./skills.cjs');
const {MotionHistory}=require('./motion.cjs');
const {attackTelegraph}=require('./telegraph.cjs');
const contract='milk-skills-v5',decisionFrames=6;
const groups=[['slices',64,18],['milk',64,13],['bottles',12,4],['drops',128,8],['warnings',16,5],['pickups',16,4],['surfPickups',16,4]];
const optionFeatureCount=10;
const featureCount=32+optionFeatureCount+groups.reduce((n,[,count,width])=>n+count*width,0);
function encode(o,previous=[0,0,0,0],history=null,active=null){
  const p=o.player,scale=o.viewport.scale,v=[p.x/1250,p.y/1250,p.z/200,p.vz/400,p.hp/5,p.inv/2.5,p.damageInv/2.5,p.down,p.recoil,p.jumpLock,p.charge/100,p.milkFuel/5,p.surfStock/3,+!!o.special,+!!p.boosted,(60-o.time)/60,o.viewport.width/1500,o.viewport.height/1000,scale,(1250-p.x)/2500,(1250+p.x)/2500,(1250-p.y)/2500,(1250+p.y)/2500,p.recoilX/400,p.recoilY/400,p.padDriftX/400,p.padDriftY/400,previous[0]/8,...previous.slice(1),1];
  const motionFor=e=>history?history.get(e):{vx:0,vy:0,vz:0,valid:false};
  const vertical=e=>{const m=motionFor(e);return [m.vz/400,((e.z||0)-p.z)/200,+m.valid];};
  const relative=e=>[(e.x-p.x)/1250,(e.y-p.y)/1250];
  function pack(name,list,make){const [,count,width]=groups.find(g=>g[0]===name),sorted=visibleSorted(o,list);for(let i=0;i<count;i++)v.push(...(sorted[i]?make(sorted[i]):Array(width).fill(0)));}
  pack('slices',o.enemies.filter(e=>e.type==='slice'),e=>{
    const motion=motionFor(e),telegraph=attackTelegraph(o,e);
    return [1,...relative(e),(e.z||0)/200,(e.stackCount||1)/3,e.hit||0,e.down||0,+!!e.sliceHop,+!!e.sliceFlight,+!!e.stackAnchor,telegraph.seconds/3,motion.vx/500,motion.vy/500,(e.drinking||0),...vertical(e),+telegraph.active];
  });
  pack('milk',o.enemies.filter(e=>e.type==='milk'),e=>[1,...relative(e),(e.z||0)/200,(e.milkTime||0)/1.1,+(e.milkPhase==='aim'),+(e.milkPhase==='recover'),(e.speed||0)/150,Math.cos(e.milkAim||0),Math.sin(e.milkAim||0),...vertical(e)]);
  pack('bottles',itemList(o,'bottle'),e=>[1,...relative(e),+(e.claimantId!==undefined)]);
  pack('drops',o.milkDrops.filter(e=>e.hostile),e=>[1,...relative(e),(e.z||0)/200,(e.vx||0)/500,(e.vy||0)/500,+!!e.hostile,e.life||0]);
  pack('warnings',o.spawnWarnings,e=>[1,...relative(e),e.time||0,1]);
  pack('pickups',itemList(o,'pickup'),e=>[1,...relative(e),1]);
  pack('surfPickups',itemList(o,'surfPickup'),e=>[1,...relative(e),1]);
  const t=active?.target;
  v.push(...(active?[1,active.skill/9,active.frames/60,Math.max(0,skills[active.skill].seconds-active.frames/60),active.travel,active.direction/8,+active.triggered,+active.airborne,t?(t.x-p.x)/1250:0,t?(t.y-p.y)/1250:0]:Array(optionFeatureCount).fill(0)));
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
  const landingMode=options.diagnosticLandingMode??(options.diagnosticLandingDecision?'both':'off');
  if(!['off','both','decision','reset'].includes(landingMode))throw Error('Invalid landing diagnostic mode');
  let env,observation,history,previous=[0,0,0,0],initialReward=0,initialTime=0,resetIndex=0,initialMetrics,initialDamageIndex=0;
  function reset(seed=options.seed??1){
    previous=[0,0,0,0];history=new MotionHistory();const config={...options,mode:'milk',seed,entrance:false,survivalOnly:true};
    if(env)env.reset(config);else env=createEnvironment(config);
    if(options.diagnosticStart){
      if(options.record||options.startSnapshots)throw Error('Diagnostic snapshots cannot record standard Replay or mix with curriculum');
      env.restoreSnapshot(options.diagnosticStart);
    }
    if(options.startSnapshots){
      if(options.record||!Array.isArray(options.startSnapshots)||!options.startSnapshots.length)throw Error('Curriculum restoration requires nonempty snapshots and recording off');
      const entry=options.startSnapshots[((options.seed??1)+resetIndex++)%options.startSnapshots.length];
      require('./curriculum.cjs').validateStart(entry,{width:options.width??1000,height:options.height??650,mobile:options.mobile??false});
      if(entry.snapshot){env.restoreSnapshot(entry.snapshot,{heal:entry.heal===true,hp:entry.startHp});for(const o of entry.tail||[])history.update(o);}else env.restoreTape(entry.tape,o=>history.update(o));previous=[...entry.previous];
    }
    observation=env.observe();history.update(observation);initialReward=env.summary().reward;initialTime=observation.time;initialMetrics=env.metrics();initialDamageIndex=env.damageEvents().length;return encode(observation,previous,history);
  }
  function summary(){const s=env.summary();return {...s,reward:s.reward-initialReward,trainingStartSeconds:initialTime,trainingSeconds:s.gameSeconds-initialTime};}
  reset();
  return {reset,setActionHistory:actions=>env.setActionHistory(actions),damageEvents:()=>env.damageEvents().slice(initialDamageIndex),metrics:()=>Object.fromEntries(Object.entries(env.metrics()).map(([key,value])=>[key,value-initialMetrics[key]])),motion:()=>history,features:active=>encode(observation,previous,history,active),observe:()=>observation,summary,replay:()=>env.replay(),diagnosticDigest:()=>env.diagnosticDigest(),
    step(choice){const action=actionFor(choice,!!previous[1]);return this.stepAction(action,decisionFrames,choice);},
    stepAction(action,frames=decisionFrames,choice=null,includeFeatures=true){let reward=0,result,diagnosticLanded=false;
      for(let i=0;i<frames&&env.summary().outcome==='running'&&(options.diagnosticUntil===undefined||env.observe().time<options.diagnosticUntil-1e-8);i++){const input={...action,jump:action.jump&&i===0,dash:action.dash&&i===0,surf:action.surf&&i===0},before=options.onPhysicsStep||landingMode!=='off'?env.observe():null;result=env.step(input);reward+=result.reward;history.update(result.observation);if(options.onPhysicsStep)options.onPhysicsStep({before,action:input,result});if(landingMode!=='off'&&before.player.z>1&&result.observation.player.z<=1&&result.observation.player.hp===before.player.hp){diagnosticLanded=true;if(landingMode!=='reset')break;}}
      const magnitude=Math.hypot(action.x,action.y),direction=magnitude<.1?0:1+((Math.round(Math.atan2(action.y,action.x)/(Math.PI/4))+8)%8);
      previous=choice?[...choice]:[direction,+(action.jump||action.jet),+action.dash,+action.surf];observation=result?result.observation:env.observe();return {features:includeFeatures?encode(observation,previous,history):undefined,reward,terminated:env.summary().outcome!=='running',truncated:options.diagnosticUntil!==undefined&&observation.time>=options.diagnosticUntil-1e-8,info:summary(),...(landingMode!=='off'?{diagnosticLanded}:{})};
    }};
}
function skillEnvironment(options={}){
  const landingMode=options.diagnosticLandingMode??(options.diagnosticLandingDecision?'both':'off');
  const redecisionFrames=options.diagnosticRedecisionFrames??30;
  if(![12,30].includes(redecisionFrames))throw Error('Diagnostic redecision frames must be 12 or 30');
  const env=trainingEnvironment(options);let active=null,actions=[],serial=0;
  const features=()=>env.features(active?{...active,target:currentTarget(active,env.observe())||null}:null);
  function describe(option){return {decision:++serial,skill:skills[option.skill].name,direction:option.direction,travel:option.travel===1?'jump':'walk',target:option.target?{...option.target}:null,startedAt:env.observe().time,optionElapsed:option.frames/60};}
  return {...env,reset(seed){active=null;actions=[];serial=0;env.reset(seed);return features();},features,context:()=>skillContext(env.observe()),
    diagnosticOption:()=>active?JSON.parse(JSON.stringify(active)):null,
    step(choice){
      const candidate=createOption(choice,env.observe());
      const same=active&&active.skill===candidate.skill&&active.direction===candidate.direction&&active.travel===candidate.travel&&JSON.stringify(active.target?.kind)===JSON.stringify(candidate.target?.kind)&&
        (active.target?.id!==undefined?active.target.id===candidate.target?.id:JSON.stringify(active.target)===JSON.stringify(candidate.target));
      const option=same?active:candidate,limit=Math.round(skills[option.skill].seconds*60),budget=Math.min(redecisionFrames,limit-option.frames);
      actions.push(describe(option));actions=actions.slice(-3);env.setActionHistory(actions);
      const initialFrames=option.frames;let reward=0,result,reason='decision',landedDuringDecision=false;
      do{
        const control=optionControl(option,env.observe());
        if(control.done){reason=control.reason;if(option.frames>initialFrames)break;}
        const frames=control.done?decisionFrames:Math.min(decisionFrames,budget-(option.frames-initialFrames));
        const before=env.summary().steps;result=env.stepAction(control.action||{x:0,y:0,jump:false,jet:false,dash:false,surf:false},frames,null,false);reward+=result.reward;option.frames+=result.info.steps-before;
        if(result.diagnosticLanded){landedDuringDecision=true;if(landingMode!=='reset'){reason='diagnostic-landing';break;}}
        if(control.done)break;
      }while(option.frames-initialFrames<budget&&!result.terminated&&!result.truncated);
      if(option.frames>=limit)reason='timeout';
      if(result.terminated)reason='terminal';
      if(result.truncated)reason='diagnostic-horizon';
      active=(reason==='decision'&&!(landingMode==='reset'&&landedDuringDecision))||(reason==='diagnostic-landing'&&landingMode==='decision')?option:null;
      return {...result,features:features(),reward,option:{skill:skills[option.skill].name,travel:option.travel===1?'jump':'walk',frames:option.frames-initialFrames,totalFrames:option.frames,continued:!!same,reason}};
    }
  };
}
module.exports={contract,skillEnvironment,featureCount,groups,decisionFrames,directions,inViewport,encode,actionFor,trainingEnvironment};

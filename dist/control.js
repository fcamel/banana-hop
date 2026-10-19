'use strict';
// Shared by the browser and the isolated Node runner. No rendering or policy code
// participates in the game RNG, so drawing extra frames cannot alter a replay.
const simulationHeadless=globalThis.BANANA_HEADLESS===true;
const simulationSources=['control.js','boss.js','surf.js','milk.js','entrance.js','giant.js','game.js'];
const simulationSchema=1,simulationRuleset='banana-hop-sim-2',simulationDt=1/60;
let simulationRandomState=null,simulationConfig=null,simulationSession=null;
function gameRandom(){
  if(simulationRandomState===null)return Math.random();
  let t=simulationRandomState=(simulationRandomState+0x6D2B79F5)>>>0;
  t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
  return ((t^(t>>>14))>>>0)/4294967296;
}
function simulationOptions(options={}){
  const config={mode:options.mode??'milk',seed:options.seed??1,width:options.width??1000,height:options.height??650,mobile:options.mobile??false,entrance:options.entrance??true};
  if(options.survivalOnly!==undefined&&typeof options.survivalOnly!=='boolean')throw Error('Invalid survival-only flag');
  if(options.survivalOnly){if(config.mode!=='milk')throw Error('Survival-only training requires milk mode');config.survivalOnly=true;}
  if(!['milk','milk-boss','survival','boss'].includes(config.mode))throw Error('Unknown simulation mode');
  if(!Number.isInteger(config.seed)||config.seed<0||config.seed>0xffffffff)throw Error('Seed must be a uint32');
  for(const key of ['width','height'])if(!Number.isInteger(config[key])||config[key]<200||config[key]>4096)throw Error('Invalid simulation viewport');
  if(typeof config.mobile!=='boolean'||typeof config.entrance!=='boolean')throw Error('Invalid simulation flags');
  return config;
}
function simulationAction(action={}){
  const axis=value=>{if(value===undefined)return 0;if(!Number.isFinite(value))throw Error('Non-finite movement');return Math.round(Math.max(-1,Math.min(1,value))*1e6)/1e6;};
  return {x:axis(action.x),y:axis(action.y),jump:!!action.jump,jet:!!action.jet,dash:!!action.dash,surf:!!action.surf};
}
function actionTuple(a){return [a.x,a.y,+a.jump,+a.jet,+a.dash,+a.surf];}
function tupleAction(a){return simulationAction({x:a[0],y:a[1],jump:a[2],jet:a[3],dash:a[4],surf:a[5]});}
function simulationObserve(){
  const cacheKeys=new Set(['gridX','gridY','gridIndex','peelGridOrder','peelGridQuery']);
  const copy=value=>JSON.parse(JSON.stringify(value,(key,v)=>cacheKeys.has(key)?undefined:v instanceof Set?Array.from(v):v));
  return copy({schema:simulationSchema,steps:simulationSession?.steps||0,time:elapsed,phase:boxSequence?'entrance':isBossWorldFrozen()?'ceremony':boss||giantBattle?'boss':'survival',state:state==='paused'&&simulationSession?'playing':state,
    viewport:{width:W,height:H,scale:characterScale()},player:{...player,charge,surfStock,milkFuel:milkPack?.ammo||0,boosted:!!giantBattle&&(player.giantBoostUntil||0)>giantBattle.clock},kills,special:special?{mode:special.mode,t:special.t,duration:special.duration}:null,
    enemies:enemies.filter(e=>e.hp>0),peels,pickups,surfPickups,milkBottles,milkDrops,spawnWarnings,durianWarnings,
    boss:boss?{...boss,clones:bossClones,shots:bossShots}:null,
    giants:liveGiants().map(g=>({...g,pads:giantPads(g),body:giantBodyParts(g)})),bossTime:giantBattle?.clock??bossElapsed});
}
// Fixed-size NN input: player state + nearest 16 enemies + nearest 8 hazards.
// Structured observations remain available for policies needing richer features.
function simulationFeatures(observation){
  const o=observation,p=o.player,values=[p.x/1250,p.y/1250,p.z/520,p.vz/520,p.hp/5,p.charge/100,p.milkFuel/5,p.surfStock/3,p.inv/2.5,+p.boosted,o.time/120,o.phase==='boss'?1:0];
  const pack=(items,count,kind)=>{const sorted=items.slice().sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));for(let i=0;i<count;i++){const e=sorted[i];values.push(...(e?[(e.x-p.x)/1250,(e.y-p.y)/1250,(e.z||0)/520,(e.hp||1)/3,kind?1:0,1]:[0,0,0,0,0,0]));}};
  pack([...o.enemies,...o.giants,...(o.boss?[o.boss,...o.boss.clones]:[])],16,true);pack([...o.peels,...o.milkDrops,...(o.boss?.shots||[])],8,false);
  return new Float32Array(values);
}
function simulationDigest(value){
  const json=JSON.stringify(value,(_,v)=>typeof v==='number'&&Number.isFinite(v)?Math.round(v*1e6)/1e6:v);
  let hash=2166136261;for(let i=0;i<json.length;i++)hash=Math.imul(hash^json.charCodeAt(i),16777619);return (hash>>>0).toString(16).padStart(8,'0');
}
// Canonicalize simulation coordinates between fixed steps. Different V8 builds
// can differ by a few ulps in trigonometry; crowded collisions amplify that drift.
// This does not enlarge hitboxes or change damage, timers, RNG or manual play.
const simulationCoordinateKeys=new Set(['x','y','z','vx','vy','vz','ax','ay','bx','by','dx','dy','kx','ky','recoilX','recoilY','padDriftX','padDriftY','slipX','slipY','prevX','prevY','startZ','speed','dashSpeed','brakeSpeed','flightRemaining']);
const simulationAngleKeys=new Set(['angle','aim','face','rollAngle']);
function canonicalizeSimulationWorld(){
  const seen=new WeakSet();
  function visit(object){
    if(!object||typeof object!=='object'||seen.has(object)||object instanceof Set)return;seen.add(object);
    for(const key of Object.keys(object)){
      const value=object[key];
      if(typeof value==='number'&&Number.isFinite(value)){
        const precision=simulationCoordinateKeys.has(key)?1e6:simulationAngleKeys.has(key)?1e9:0;
        if(precision)object[key]=Math.round(value*precision)/precision||0;
      }else if(value&&typeof value==='object')visit(value);
    }
  }
  visit([player,enemies,peels,pickups,orbitPeels,boss,bossClones,bossShots,giantBattle,milkBottles,milkDrops,milkPack,surfPickups,surfFlights,boxSequence,special,spawnWarnings,spawnHeading,spawnMotion,durianWarnings]);
}
function createSimulation(options={}){
  const config=simulationOptions(options),record=options.record===true;
  let steps=0,totalReward=0,segments=[],lastTuple=null;
  const environment={config,steps:0,active:true,policy:createRuleBasedPolicy(),sourceDigest:options.sourceDigest||null,
    reset(){
      steps=0;totalReward=0;segments=[];lastTuple=null;environment.policy.reset();environment.steps=0;environment.active=true;
      simulationSession=environment;simulationConfig=config;simulationRandomState=config.seed;serial=0;peelGridQuerySerial=0;debugUnlocked=false;invincibleMode=false;
      $('gameMode').value=config.mode;resize();reset(config.entrance);resize();canonicalizeSimulationWorld();return simulationObserve();
    },
    observe:simulationObserve,
    step(input={},frames=1){
      if(simulationSession!==environment)throw Error('This environment is no longer active');
      if(!Number.isInteger(frames)||frames<1||frames>600)throw Error('Invalid frame repeat');
      const action=simulationAction(input),tuple=actionTuple(action);let reward=0;
      for(let i=0;i<frames&&state==='playing';i++){
        if(record){if(lastTuple&&tuple.every((v,j)=>v===lastTuple[j]))segments[segments.length-1].frames++;else{segments.push({frames:1,action:tuple});lastTuple=tuple;}}
        const beforeHp=player.hp,beforeKills=kills,beforeTime=elapsed;keys.clear();stick.x=action.x;stick.y=action.y;
        if(action.jet)keys.add(' ');if(action.jump)jump();if(action.dash)activate();if(action.surf)activateSurf();
        update(simulationDt);canonicalizeSimulationWorld();steps++;environment.steps=steps;
        reward+=config.survivalOnly?Math.max(0,elapsed-beforeTime):(kills-beforeKills)*.1+(player.hp-beforeHp)+(state==='over'?(player.hp>0?10:-10):.001);
      }
      totalReward+=reward;return {observation:simulationObserve(),reward,terminated:state==='over',truncated:false,info:environment.summary()};
    },
    summary(){return {steps,seconds:steps*simulationDt,gameSeconds:elapsed,kills,hp:player.hp,outcome:state==='over'?(player.hp>0?'win':'loss'):'running',reward:totalReward};},
    replay(){
      if(!record)throw Error('Replay recording was not enabled');
      return {schema:simulationSchema,ruleset:simulationRuleset,sourceDigest:environment.sourceDigest,config:{...config},dt:simulationDt,steps,actions:segments.map(s=>({frames:s.frames,action:[...s.action]})),finalDigest:simulationDigest({observation:simulationObserve(),randomState:simulationRandomState}),result:environment.summary()};
    }
  };
  environment.reset();return environment;
}
function validateReplay(tape){
  if(!tape||tape.schema!==simulationSchema||tape.ruleset!==simulationRuleset||tape.dt!==simulationDt)throw Error('Unsupported replay format/ruleset');
  simulationOptions(tape.config);
  if(!Number.isInteger(tape.steps)||tape.steps<0||tape.steps>2160000||!Array.isArray(tape.actions)||tape.actions.length>tape.steps)throw Error('Invalid replay length');
  let frames=0;for(const segment of tape.actions){if(!Number.isInteger(segment.frames)||segment.frames<1||!Array.isArray(segment.action)||segment.action.length!==6||segment.action.some(v=>!Number.isFinite(v))||segment.action.slice(0,2).some(v=>Math.abs(v)>1)||segment.action.slice(2).some(v=>v!==0&&v!==1))throw Error('Invalid replay action');frames+=segment.frames;}
  if(frames!==tape.steps||typeof tape.finalDigest!=='string')throw Error('Incomplete replay');return tape;
}
function createReplay(tape){
  validateReplay(tape);const env=createSimulation({...tape.config,record:false});let segment=0,left=tape.actions[0]?.frames||0,verified=false;
  return {environment:env,step(){
    if(env.steps<tape.steps){const before=env.steps;env.step(tupleAction(tape.actions[segment].action));if(env.steps===before)throw Error('Replay ended before the recorded final step');if(--left===0){segment++;left=tape.actions[segment]?.frames||0;}}
    if(env.steps===tape.steps&&!verified){verified=true;if(simulationDigest({observation:env.observe(),randomState:simulationRandomState})!==tape.finalDigest)throw Error('Replay diverged from its recorded result');}
    return {done:env.steps===tape.steps,observation:env.observe()};
  }};
}
// Forecast from observation data only; never advance actors or consume game RNG.
function ruleSlicePose(e,t,scale){
  const motion=e.sliceFlight||e.sliceHop;if(!motion)return e;
  const flight=!!e.sliceFlight,duration=flight?motion.duration:sliceRules.hopDuration,u=Math.min(1,(motion.t+t)/duration);
  return {x:motion.ax+(motion.bx-motion.ax)*u,y:motion.ay+(motion.by-motion.ay)*u,z:flight?(motion.startZ||0)*(1-u)+Math.sin(u*Math.PI)*sliceRules.flightHeight:Math.sin(u*Math.PI)*sliceRules.hopHeight*scale};
}
function ruleGiantForecast(g,t,scale){
  if(!g.attackPhase)return {pads:g.pads,phase:'idle',x:g.x,y:g.y};
  const phases=['idle','charge','out','return','recover'],durations=[giantRules.attackIdle,giantRules.attackCharge,giantRules.attackOut,giantRules.attackReturn,giantRules.attackRecover];
  let phase=g.attackPhase,time=g.attackTime||0,angle=g.angle||0,remaining=t;
  while(remaining>1e-8){
    const index=phases.indexOf(phase),step=Math.min(remaining,durations[index]-time);
    angle+=phase==='charge'?giantRules.orbitSpeed*step+(giantRules.chargeSpin-giantRules.orbitSpeed)*(time*step+step*step/2)/giantRules.attackCharge:(phase==='out'||phase==='return'?giantRules.flightSpin:giantRules.orbitSpeed)*step;
    remaining-=step;time+=step;if(time>=durations[index]-1e-8){phase=phases[(index+1)%5];time=0;}
  }
  const radius=(phase==='out'?giantRules.orbitRadius+(giantRules.attackRadius-giantRules.orbitRadius)*time/giantRules.attackOut:phase==='return'?giantRules.attackRadius+(giantRules.orbitRadius-giantRules.attackRadius)*boxEase(time/giantRules.attackReturn):giantRules.orbitRadius)*scale;
  const landing=g.jumpLanding||g,launch=g.jumpLaunch||g,u=phase==='return'?boxEase(time/giantRules.attackReturn):0;
  const origin=phase==='out'?launch:phase==='return'?{x:launch.x+(landing.x-launch.x)*u,y:launch.y+(landing.y-launch.y)*u}:g.attackPhase==='out'||g.attackPhase==='return'?landing:g;
  return {phase,time,x:origin.x,y:origin.y,pads:Array.from({length:4},(_,i)=>({index:i,x:origin.x+Math.cos(angle+i*TAU/4)*radius,y:origin.y+Math.sin(angle+i*TAU/4)*radius}))};
}
function ruleDodgeMotion(o,wanted,jump){
  const p=o.player,s=o.viewport.scale,moving=o.enemies.filter(e=>e.type==='slice'&&e.hp>0&&!(e.down>0)&&!(e.hit>0)&&(e.sliceHop||e.sliceFlight)&&Math.hypot(e.x-p.x,e.y-p.y)<500*s),giants=o.giants.filter(g=>!g.forming&&!(g.hit>0));
  if(!moving.length&&!giants.length)return wanted;
  // Sample more finely than a policy decision: fast slices can cross the whole
  // collision radius between decisions. Include future landing and wall edges.
  const samples=Array.from({length:10},(_,i)=>{const t=(i+1)*.05;return {t,slices:moving.map(e=>({...ruleSlicePose(e,t,s),flight:!!e.sliceFlight})),giants:giants.map(g=>({g,...ruleGiantForecast(g,t,s)}))};});
  const velocities=[wanted,{x:0,y:0}];for(let i=0;i<16;i++)velocities.push({x:Math.cos(i*TAU/16),y:Math.sin(i*TAU/16)});
  const initialVz=jump&&p.z<=1&&p.down<=0&&p.recoil<=0&&!(p.jumpLock>0)&&!p.milkFuel?350:p.vz||0;
  function score(v){
    let danger=0,near=0,height=p.z||0,vz=initialVz,boosted=!!p.boosted;
    for(const sample of samples){
      const t=sample.t,point={x:p.x+v.x*205*t+(p.padDriftX||0)*(1-Math.exp(-2.5*t))/2.5,y:p.y+v.y*205*t+(p.padDriftY||0)*(1-Math.exp(-2.5*t))/2.5};
      const before=height;height=Math.max(0,height+vz*.05-415*.05*.05);vz-=830*.05;
      // A valid descending pad landing launches the player; treating its future
      // ground position as a collision would make the AI avoid every good stomp.
      if(vz<0&&before>=giantRules.padHeight*s&&height<=giantRules.padHeight*s&&sample.giants.some(g=>g.pads.some(pad=>Math.hypot(pad.x-point.x,pad.y-point.y)<=giantRules.padRadius*s))){height=giantRules.padHeight*s;vz=giantRules.boost;boosted=true;}
      const z=height;
      if(boosted&&vz<0&&sample.giants.some(g=>g.phase!=='out'&&g.phase!=='return'&&before>=(g.g.hp*giantRules.headStep+giantRules.headExtra)*s&&z<=(g.g.hp*giantRules.headStep+giantRules.headExtra)*s&&Math.pow((point.x-g.x)/(giantRules.headRadius*s),2)+Math.pow((point.y-g.y+giantRules.headBackOffset*s)/(giantRules.headDepth*s),2)<=1))break;
      const radial=(h,r)=>{const d=Math.hypot(h.x-point.x,h.y-point.y),margin=d-r;if(margin<0)danger+=1+Math.min(1,-margin/r);else if(margin<20*s)near+=(20*s-margin)/(20*s);};
      for(const e of sample.slices)if(z>=e.z-80*s-4&&z<=e.z+14*s+4)radial(e,35*s);
      for(const g of sample.giants){
        const pads=g.pads,aboveWall=z>giantRules.wallHeight*s;
        if(g.phase!=='return'&&z<(g.phase==='out'?giantRules.padHeight+14:giantRules.padHeight-6)*s+4)for(const pad of pads)radial(pad,(giantRules.padRadius+18)*s);
        if(g.phase!=='out'&&g.phase!=='return'){
          if(z<(g.g.hp*giantRules.headStep+giantRules.headExtra-10)*s)radial(g,(giantRules.bodyRadius+9)*s);
          const atOpening=(boosted||z>=(giantRules.padHeight-6)*s)&&pads.some(pad=>Math.hypot(pad.x-point.x,pad.y-point.y)<(giantRules.padRadius+18)*s);
          if(!aboveWall&&!atOpening)for(let i=0;i<pads.length;i++){
            const a=pads[i],b=pads[(i+1)%pads.length];if(segmentDistance(point,a.x,a.y,b.x,b.y)<(giantRules.wallRadius+21)*s)danger+=2;
          }
        }else if(g.phase==='out'){
          const launch=g.g.jumpLaunch||g.g,landing=g.g.jumpLanding||g.g,sky=(o.viewport.height||650)+220*s;
          const body=g.time<.55?{...launch,z:sky*boxEase(g.time/.55)}:{...landing,z:g.time<1?sky:sky*(1-Math.pow(Math.min(1,(g.time-1)/(giantRules.attackOut-1)),2))};
          for(let i=0;i<g.g.hp;i++){const bodyZ=body.z+i*giantRules.headStep*s;if(z>=bodyZ-20*s&&z<bodyZ+65*s)radial(body,(giantRules.bodyRadius+18)*s);}
          if(g.time>giantRules.attackOut-.45&&z<70*s)radial(landing,(giantRules.bodyRadius+25)*s);
        }
      }
    }
    const edge=Math.max(0,Math.abs(p.x+v.x*205*.5)-1230)+Math.max(0,Math.abs(p.y+v.y*205*.5)-1230);
    return danger*100+near*2+edge+Math.hypot(v.x-wanted.x,v.y-wanted.y);
  }
  let best=wanted,bestScore=score(wanted);for(const v of velocities){const value=score(v);if(value<bestScore-.05){best=v;bestScore=value;}}
  return best;
}
function createRuleBasedPolicy(){
  let lock=null,arrived=false,lastStep=-1,avoidSide=1,avoidUntil=0;
  function resetMemory(){lock=null;arrived=false;lastStep=-1;avoidSide=1;avoidUntil=0;}
  function policy(o){
    if(o.steps<lastStep)resetMemory();lastStep=o.steps;
    const p=o.player;if(o.phase==='entrance'||o.phase==='ceremony')return {};
    const distance=e=>Math.hypot(e.x-p.x,e.y-p.y),nearest=list=>list.slice().sort((a,b)=>distance(a)-distance(b))[0];
    const giants=o.giants.filter(g=>!g.forming);
    let kind,choices;
    if(giants.length){
      kind=p.boosted?'head':'pad';
      const assembled=giants.filter(g=>g.attackPhase!=='out'&&g.attackPhase!=='return');
      const focus=p.boosted&&lock?.giantId!=null?assembled.find(g=>g.id===lock.giantId):null;
      choices=(focus?[focus]:assembled).flatMap(g=>p.boosted?[{...g,key:'head:'+g.id,giantId:g.id}]:g.pads.map(pad=>({...pad,key:`pad:${g.id}:${pad.index}`,giantId:g.id})));
    }else if(o.boss){
      kind='boss';const actors=[{...o.boss,key:'boss'},...(o.boss.clones||[]).map(g=>({...g,key:'clone:'+g.id}))];
      const available=actors.filter(g=>!(g.hit>0)&&!['shield','shield-aim','teleport-aim'].includes(g.phase)&&!o.boss.cinematic);
      choices=available.length?available:actors;
    }
    else{
      const bottles=p.milkFuel<=0?o.milkBottles:[],enemies=o.enemies.filter(e=>e.hp>0);
      kind=bottles.length?'bottle':p.milkFuel>0&&enemies.length?'enemy':o.pickups.length?'pickup':'enemy';
      choices=(kind==='bottle'?bottles:kind==='pickup'?o.pickups:enemies).map(e=>({...e,key:kind+':'+e.id}));
    }
    const candidate=nearest(choices),current=lock?.kind===kind?choices.find(e=>e.key===lock.key):null;
    // Keep equal/near-equal targets. A clearly closer target may replace a lock
    // only after one second; disappearance or a new task class is immediate.
    const replace=!current||(candidate&&o.steps-lock.since>=60&&distance(candidate)<distance(current)*.75);
    const target=replace?candidate:current;
    if(replace){lock=target?{key:target.key,kind,since:o.steps,giantId:target.giantId}:null;arrived=false;}
    const gap=target?distance(target):Infinity,scale=o.viewport.scale;
    if(target){if(arrived&&gap>=40*scale)arrived=false;else if(!arrived&&gap<=20*scale)arrived=true;}
    // Slow down near the destination, then remain still in a larger release
    // zone. This is movement-only: jumps, jets and emergency skills stay live.
    const strength=target?(arrived?0:Math.min(1,Math.max(0,(gap-20*scale)/(20*scale)))):1;
    let x=target?target.x-p.x:Math.cos(o.steps/120),y=target?target.y-p.y:Math.sin(o.steps/120),length=Math.hypot(x,y)||1;x=x/length*strength;y=y/length*strength;
    const z=p.z||0,grounded=z<=1,ready=p.down<=0&&p.recoil<=0,able=kind==='boss'&&target&&!(target.hit>0)&&!['shield','shield-aim','teleport-aim'].includes(target.phase)&&!o.boss?.cinematic;
    let bossJump=false,padJump=false;
    if(kind==='pad'&&target){
      padJump=grounded&&ready&&gap<115*scale;
      // Rise above the damaging side before moving onto the launch surface.
      if(z<(giantRules.padHeight-6)*scale&&gap<90*scale){
        const travel=gap<(giantRules.padRadius+24)*scale?-1:0;x=(target.x-p.x)/(gap||1)*travel;y=(target.y-p.y)/(gap||1)*travel;
      }
    }
    if(kind==='boss'&&target){
      const shield=['shield','shield-aim'].includes(target.phase),wait=(shield?165:140)*scale;
      // Ordinary enemies can be approached on the ground; boss bodies cannot.
      // Take off at a distance, and only close in above the contact height.
      let travel;
      if(!able)travel=Math.max(-1,Math.min(1,(gap-wait)/(30*scale)));
      else if(z>=32)travel=Math.max(0,Math.min(1,(gap-28*scale)/(20*scale)));
      else if(grounded&&gap>110*scale)travel=Math.min(1,(gap-100*scale)/(20*scale));
      else{travel=gap<70*scale?-1:0;bossJump=grounded&&ready&&gap<=110*scale;}
      const d=gap||1;x=(target.x-p.x)/d*travel;y=(target.y-p.y)/d*travel;
      if(!gap){x=-1;y=0;}
    }
    const clearance=Math.min(z,z+(p.vz||0)*.1-4.15);
    const minions=kind==='boss'?o.enemies.filter(e=>e.hp>0&&e.type!=='durian'&&!(e.down>.1)&&!(e.hit>.1)&&clearance<43):[];
    // Minions are obstacles during boss pursuit, even when the boss is farther
    // away than jumping range. Retain a passing side briefly instead of weaving.
    let closest=null,closestGap=Infinity;
    for(const enemy of minions){
      const d=distance(enemy),radius=(enemy.type==='charger'||enemy.type==='thrower'||enemy.hp>1?150:110)*scale;
      if(d>=radius)continue;
      const dx=d?(p.x-enemy.x)/d:-1,dy=d?(p.y-enemy.y)/d:0,force=(radius-d)/(35*scale);
      x+=dx*force;y+=dy*force;if(d<closestGap){closest=enemy;closestGap=d;}
    }
    if(closest){
      const dx=(closest.x-p.x)/(closestGap||1),dy=(closest.y-p.y)/(closestGap||1);
      if(o.steps>=avoidUntil){const cross=dx*y-dy*x;avoidSide=cross<0?-1:1;avoidUntil=o.steps+30;}
      const force=Math.min(2,(110*scale-closestGap)/(35*scale));if(force>0){x-=dy*avoidSide*force;y+=dx*avoidSide*force;}
      if(grounded&&ready&&closest.type!=='durian')bossJump=true;
    }
    // Shields hurt at every jump height; do not try to jump through one.
    if(kind==='boss')for(const actor of [o.boss,...(o.boss.clones||[])]){
      const shield=['shield','shield-aim'].includes(actor.phase);
      if(!shield&&(z>=32||actor.hit>0))continue;
      const d=distance(actor),radius=(shield?165:70)*scale;if(d<radius){const force=(radius-d)/(25*scale)+1;x+=(d?(p.x-actor.x)/d:-1)*force;y+=(d?(p.y-actor.y)/d:0)*force;}
    }
    for(const hazard of [...o.peels,...o.enemies.filter(e=>e.type==='durian'),...(o.boss?.shots||[])]){const d=distance(hazard);if(d>0&&d<100){const force=(100-d)/35;x+=(p.x-hazard.x)/d*force;y+=(p.y-hazard.y)/d*force;}}
    if(Math.abs(p.x)>1100)x-=Math.sign(p.x)*1.5;if(Math.abs(p.y)>1100)y-=Math.sign(p.y)*1.5;length=Math.max(1,Math.hypot(x,y));
    const jump=kind==='pad'?padJump:kind==='head'?false:kind==='boss'?bossJump:o.enemies.some(e=>distance(e)<110&&e.type!=='durian');
    const movement=ruleDodgeMotion(o,{x:x/length||0,y:y/length||0},jump);
    return {...movement,jump,jet:p.milkFuel>0&&o.enemies.some(e=>distance(e)<170),dash:p.charge>=100&&(giants.length>0||(kind==='boss'?able&&gap<180*scale:o.enemies.some(e=>distance(e)<180))),surf:p.surfStock>0&&p.hp<=2&&!giants.length};
  }
  policy.reset=resetMemory;return policy;
}
function ruleBasedAction(o){return (simulationSession?.policy||createRuleBasedPolicy())(o);}
function stopSimulation(){simulationSession=null;simulationConfig=null;simulationRandomState=null;keys.clear();stick.x=stick.y=0;}
globalThis.BananaAI={createEnvironment:createSimulation,createReplay,validateReplay,createRuleBasedPolicy,ruleBasedAction,features:simulationFeatures,digest:simulationDigest,stop:stopSimulation,dt:simulationDt,sources:simulationSources};

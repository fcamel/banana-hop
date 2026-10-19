'use strict';
// 蕉片崛起：獨立的 60 秒小兵關與香蕉片巨人戰。切換關卡時重設狀態。
let milkStage=false,milkBottles=[],milkDrops=[],milkPack=null,nextMilkAt=10,milkJetTouch=null,milkTouchLabel='',milkBottleRevision=0,sliceRallies=[];
const milkRules={duration:60,ammo:5,jetDuration:1.5,jetInterval:.12,jetHeight:108,jetLift:300,jetDownSpeed:420,sliceSpeed:110,sliceSpeedVariation:14,ingest:.9,bottleInterval:10,bottleLimit:12,bottleGap:500,enemyLimit:50};
const sliceRules={count:3,charge:1,shotInterval:1,fallDuration:.25,layerHeight:16,flightSpeed:460,flightMinDuration:.42,flightHeight:42,overshoot:201.6,hopDuration:.63,hopStrideTime:.6,hopWait:.5,hopPrepare:.2,hopHeight:48,mergeRadius:23};
const bottleShotRules={count:5,angle:Math.PI/3,speed:240,life:3,aimRange:680};
function milkPressure(time=elapsed){
  if(giantBattle)return {intervalMin:2,intervalMax:5,hopWait:sliceRules.hopWait,stride:sliceRules.hopStrideTime};
  if(time>=50)return {intervalMin:.8,intervalMax:1.4,hopWait:.25,stride:1};
  if(time>=30)return {intervalMin:1.5,intervalMax:3,hopWait:.4,stride:.8};
  return {intervalMin:2,intervalMax:5,hopWait:sliceRules.hopWait,stride:sliceRules.hopStrideTime};
}
function milkJetActive(){return !!milkPack&&(keys.has(' ')||milkJetTouch!==null)&&state==='playing'&&!mobilePlayBlocked&&!isBossWorldFrozen()&&!special&&player.down<=0&&player.recoil<=0;}
function clearMilkJetInput(){milkJetTouch=null;if(milkPack)milkPack.spraying=false;}
function milkJetPercent(){return milkPack?Math.ceil(milkPack.ammo/milkRules.ammo*100-1e-8):0;}
function moveMilkJet(dt){
  const height=milkRules.jetHeight*characterScale();
  if(player.z<=height){player.z=Math.min(height,player.z+milkRules.jetLift*characterScale()*dt);player.vz=player.z<height?milkRules.jetLift*characterScale():0;}
  else{player.vz=Math.max(-160*characterScale(),player.vz-830*dt);player.z=Math.max(height,player.z+player.vz*dt);if(player.z===height)player.vz=0;}
}
function sliceContact(e,playerFrom){
  const from=e.sliceFrom||e,s=characterScale(),radius=29*s;
  const x=from.x-playerFrom.x,y=from.y-playerFrom.y,dx=(e.x-player.x)-x,dy=(e.y-player.y)-y;
  const a=dx*dx+dy*dy,b=x*dx+y*dy,c=x*x+y*y-radius*radius;
  let lo=0,hi=1;
  if(a<1e-9){if(c>=0)return false;}else{const discriminant=b*b-a*c;if(discriminant<0)return false;const root=Math.sqrt(discriminant);lo=Math.max(lo,(-b-root)/a);hi=Math.min(hi,(-b+root)/a);}
  const z=(from.z||0)-(playerFrom.z||0),dz=((e.z||0)-player.z)-z;
  const bottom=-14*s,top=80*s;
  if(Math.abs(dz)<1e-9){if(z<bottom||z>top)return false;}else{const t1=(bottom-z)/dz,t2=(top-z)/dz;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
  return lo<=hi;
}
function milkPopulation(){return enemies.reduce((n,e)=>n+(e.hp>0?(e.type==='slice'?(e.stackCount||1):1):0),0);}
function spawnSliceStack(radius,position=null){
  if(radius===undefined&&!position){
    position=chooseNaturalSpawn();if(!position)return null;
  }
  const e=spawn(radius,'slice',position);e.stackCount=sliceRules.count;e.hp=sliceRules.count;e.stackTime=0;e.stackDrop=0;e.stackAnchor=true;e.nextSliceShot=sliceRules.charge+sliceRules.shotInterval;
  return e;
}
function sliceGoal(e){
  if(e.sliceRallyId!=null)return player;
  if(e.sliceBottleRevision!==milkBottleRevision){
    if(e.sliceBottleRevision!==undefined){e.sliceGoal=null;e.sliceBottleId=null;}
    e.sliceBottleRevision=milkBottleRevision;
  }
  if(e.sliceGoal==='player')return player;
  if(e.sliceGoal==='bottle'){
    const locked=milkBottles.find(b=>b.id===e.sliceBottleId);
    if(locked)return locked;
  }
  let bottle=null,gap=Infinity;
  for(const b of milkBottles){const d=dist(e,b);if(d<gap){bottle=b;gap=d;}}
  const playerGap=dist(e,player),total=playerGap+gap,bottleChance=total>0?playerGap/total:.5;
  if(bottle&&gameRandom()<bottleChance){e.sliceGoal='bottle';e.sliceBottleId=bottle.id;return bottle;}
  e.sliceGoal='player';e.sliceBottleId=null;return player;
}
function sliceAtTargetBottle(e){
  if(e.type!=='slice'||(e.stackCount||1)>1||e.sliceGoal!=='bottle')return false;
  const bottle=milkBottles.find(b=>b.id===e.sliceBottleId);
  return !!bottle&&dist(e,bottle)<24*characterScale();
}
function advanceSliceRally(group){
  const members=group.memberIds.map(id=>enemies.find(e=>e.id===id&&e.hp>0&&e.type==='slice')) .filter(Boolean);
  if(!members.length)return false;
  let base=members.find(e=>e.id===group.baseId);
  if(!base){base=members[0];group.baseId=base.id;group.ready=false;}
  if(group.ready&&(base.stackCount||1)<=1&&!base.stackAnchor)return false;
  for(const e of members)e.sliceRallyId=base.id;
  for(const e of members){
    if(e===base||(base.stackCount||1)>=3)continue;
    if(!e.sliceHop&&!base.sliceHop&&!e.sliceFlight&&!base.sliceFlight&&(e.z||0)<=0&&(base.z||0)<=0&&e.hit<=0&&e.knock<=0&&e.down<=0&&base.hit<=0&&base.knock<=0&&base.down<=0&&dist(e,base)<=sliceRules.mergeRadius*characterScale())mergeSliceIntoStack(base,e);
  }
  if(members.every(e=>e===base||e.hp<=0))group.ready=true;
  return true;
}
function updateOffscreenSliceRallies(){
  for(const e of enemies)if(e.type==='slice')e.sliceRallyId=null;
  const active=sliceRallies.filter(advanceSliceRally),used=new Set(active.flatMap(group=>group.memberIds));
  const limit=!giantBattle&&elapsed>=milkRules.duration-10?2:1;
  const pool=enemies.filter(e=>!used.has(e.id)&&e.hp>0&&e.type==='slice'&&(e.stackCount||1)<3&&!e.sliceFlight&&e.hit<=0&&e.knock<=0&&e.down<=0&&!(e.drinking>0)&&!isInView(e,0,e.z||0)&&sliceGoal(e)===player).sort((a,b)=>(b.stackCount||1)-(a.stackCount||1)||a.id-b.id);
  for(const base of pool){
    if(active.length>=limit)break;
    if(used.has(base.id)||base.hp<=0)continue;
    const followers=pool.filter(e=>e!==base&&!used.has(e.id)&&e.hp>0&&(e.stackCount||1)===1&&dist(e,base)<=320).sort((a,b)=>dist(a,base)-dist(b,base)).slice(0,3-(base.stackCount||1));
    if(!followers.length)continue;
    const group={baseId:base.id,memberIds:[base.id,...followers.map(e=>e.id)],ready:false};
    for(const id of group.memberIds)used.add(id);
    if(advanceSliceRally(group))active.push(group);
  }
  sliceRallies=active;
}
function mergeSliceIntoStack(base,e){
  base.stackCount=(base.stackCount||1)+1;base.hp+=1;const rally=sliceRallies.find(group=>group.baseId===base.id);if(rally&&base.stackCount>=3)rally.ready=true;base.stackAnchor=true;base.stackTime=0;base.nextSliceShot=sliceRules.charge+sliceRules.shotInterval;base.stackDrop=0;
  e.hp=0;e.sliceHop=null;e.sliceFlight=null;e.z=0;burst(base.x,base.y,'#e6c97e',5);sfx('peel');
}
function mergeLandingSlice(e,before,after){
  if(e.hp<=0||e.hit>0||e.knock>0||e.down>0||after>=before||e.drinking>0||sliceAtTargetBottle(e))return false;
  const s=characterScale(),targets=enemies.filter(other=>other!==e&&(e.sliceRallyId==null||other.id===e.sliceRallyId)&&(other.sliceRallyId==null||e.sliceRallyId===other.id)&&other.type==='slice'&&other.hp>0&&!(other.drinking>0)&&!sliceAtTargetBottle(other)&&!other.sliceFlight&&!other.sliceHop&&other.down<=0&&other.knock<=0&&other.hit<=0&&(other.stackCount||1)<sliceRules.count&&before>=(other.stackCount||1)*sliceRules.layerHeight*s&&after<=(other.stackCount||1)*sliceRules.layerHeight*s&&dist(e,other)<=sliceRules.mergeRadius*s).sort((a,b)=>dist(e,a)-dist(e,b));
  const base=targets[0];if(!base)return false;
  mergeSliceIntoStack(base,e);return true;
}
function moveSliceHop(e,dt,target){
  if(e.sliceHop){
    const hop=e.sliceHop,before=e.z||0;hop.t=Math.min(sliceRules.hopDuration,hop.t+dt);
    const u=hop.t/sliceRules.hopDuration;e.x=hop.ax+(hop.bx-hop.ax)*u;e.y=hop.ay+(hop.by-hop.ay)*u;e.z=u>=1?0:Math.sin(u*Math.PI)*sliceRules.hopHeight*characterScale();
    if(mergeLandingSlice(e,before,e.z))return;
    if(u>=1){e.sliceHop=null;e.z=0;e.sliceHopWait=milkPressure().hopWait;}
    return;
  }
  if(e.sliceGoal==='bottle'&&dist(e,target)<24*characterScale())return;
  e.sliceHopWait=Math.max(0,(e.sliceHopWait||0)-dt);if(e.sliceHopWait>0)return;
  const dx=target.x-e.x,dy=target.y-e.y,d=Math.hypot(dx,dy)||1,travel=Math.min(d,e.speed*milkPressure().stride);
  e.sliceHop={t:0,ax:e.x,ay:e.y,bx:clamp(e.x+dx/d*travel,-arenaSize+35,arenaSize-35),by:clamp(e.y+dy/d*travel,-arenaSize+35,arenaSize-35)};
  moveSliceHop(e,Math.min(dt,sliceRules.hopDuration),target);
}
function launchSliceFlight(e,startZ){
  const angle=Math.atan2(player.y-e.y,player.x-e.x),reach=dist(e,player)+sliceRules.overshoot*characterScale();
  const bx=clamp(e.x+Math.cos(angle)*reach,-arenaSize+35,arenaSize-35),by=clamp(e.y+Math.sin(angle)*reach,-arenaSize+35,arenaSize-35);
  e.sliceFlight={t:0,ax:e.x,ay:e.y,bx,by,startZ,duration:Math.max(sliceRules.flightMinDuration,Math.hypot(bx-e.x,by-e.y)/sliceRules.flightSpeed)};e.z=startZ;
}
function moveSliceFlight(e,dt){
  const flight=e.sliceFlight,before=e.z||0;flight.t=Math.min(flight.duration,flight.t+dt);
  const u=flight.t/flight.duration;e.x=flight.ax+(flight.bx-flight.ax)*u;e.y=flight.ay+(flight.by-flight.ay)*u;e.z=flight.startZ*(1-u)+Math.sin(u*Math.PI)*sliceRules.flightHeight;
  if(mergeLandingSlice(e,before,e.z))return true;
  if(u>=1){e.sliceFlight=null;e.z=0;e.sliceHopWait=milkPressure().hopWait;}
  return true;
}
function updateSliceSplit(e,dt){
  if(e.sliceFlight)return moveSliceFlight(e,dt);
  if(!e.stackAnchor)return false;
  if((e.stackCount||1)<=1){e.stackAnchor=false;return false;}
  const rally=sliceRallies.find(group=>group.baseId===e.id);if(rally&&!rally.ready)return true;
  e.stackTime+=dt;
  while(e.stackCount>1&&e.stackTime+1e-9>=e.nextSliceShot){
    const startZ=(e.stackCount-1)*sliceRules.layerHeight;e.stackCount--;e.hp--;e.nextSliceShot+=sliceRules.shotInterval;
    const child=spawn(0,'slice',{x:e.x,y:e.y});launchSliceFlight(child,startZ);sliceGoal(child);sfx('peel');
  }
  if(e.stackCount<=1)e.stackAnchor=false;
  return true;
}
function roundDuration(){return milkStage?milkRules.duration:gameDuration;}
function resetMilkStage(){sliceRallies=[];milkBottleRevision=0;milkBottles=[];milkDrops=[];milkPack=null;nextMilkAt=10;clearMilkJetInput();resetGiants();}
function spawnMilkBottle(point=null){
  if(milkBottles.length>=milkRules.bottleLimit)return null;
  if(!point){
    const a=gameRandom()*TAU,r=Math.min(240,W*.28,H*.3/.72);
    point={x:player.x+Math.cos(a)*r,y:player.y+Math.sin(a)*r};
  }
  const bottle={id:serial++,x:clamp(point.x,-arenaSize+50,arenaSize-50),y:clamp(point.y,-arenaSize+50,arenaSize-50),age:0};
  milkBottles.push(bottle);milkBottleRevision++;return bottle;
}
function spawnMilkPair(){
  const angle=gameRandom()*TAU;
  for(const side of [0,1]){
    let point=null;
    for(const radius of [320,500,750,1100,1600,2200]){
      for(let i=0;i<32;i++){
        const a=angle+side*Math.PI+i*TAU/32,p={x:clamp(player.x+Math.cos(a)*radius,-arenaSize+50,arenaSize-50),y:clamp(player.y+Math.sin(a)*radius,-arenaSize+50,arenaSize-50)};
        if(dist(p,player)>=240&&milkBottles.every(b=>dist(p,b)>=milkRules.bottleGap)){point=p;break;}
      }
      if(point)break;
    }
    if(point)spawnMilkBottle(point);
  }
}
function nearestMilkBottle(e){
  let nearest=null,gap=420;
  for(const bottle of milkBottles){const d=dist(e,bottle);if(d<gap){nearest=bottle;gap=d;}}
  return nearest;
}
function moveMilkEnemy(e,dt){
  if(e.type==='slice'&&updateSliceSplit(e,dt))return;
  const goal=e.type==='slice'?sliceGoal(e):player,rally=e.type==='slice'&&e.sliceRallyId!=null?enemies.find(other=>other.id===e.sliceRallyId&&other.hp>0):null,target=rally||goal;
  if(rally===e&&!e.sliceHop)return;
  const aim=target||player,dx=aim.x-e.x,dy=aim.y-e.y,d=Math.hypot(dx,dy)||1;
  if(e.type==='slice'){
    moveSliceHop(e,dt,aim);return;
  }
  e.milkTime=(e.milkTime||0)+dt;
  if(e.milkPhase==='aim'){
    if(e.milkTime>=.75){
      for(let i=0;i<bottleShotRules.count;i++)emitMilkDrop(e,e.milkAim+(i/(bottleShotRules.count-1)-.5)*bottleShotRules.angle,true);
      e.milkPhase='recover';e.milkTime=0;sfx('whoosh');
    }
  }else if(e.milkPhase==='recover'){
    // A visible recoil and recovery window allows the player to approach.
    if(e.milkTime>=.9){e.milkPhase='walk';e.milkTime=0;}
  }else if(d<bottleShotRules.aimRange&&e.milkTime>=1.1){
    e.milkAim=Math.atan2(dy,dx);e.milkPhase='aim';e.milkTime=0;
  }else if(d>115){const travel=Math.min(Math.max(0,d-115),e.speed*dt);e.x+=dx/d*travel;e.y+=dy/d*travel;}
}
function collectMilkBottles(path){
  const bottle=milkBottles.find(b=>crossesPickup(b,path));
  if(!bottle)return;
  milkBottles=milkBottles.filter(b=>b!==bottle);
  const refill=!!milkPack;
  milkPack={ammo:milkRules.ammo,emit:milkPack?.emit||0,spraying:false};
  notify(refill?'牛奶燃料補滿！':'牛奶噴射！按住跳躍浮空 · 鬆開落下');sfx('pickup');
  burst(player.x,player.y,'#fff1c9',10);
}
function updateMilkClaims(dt){
  for(const bottle of milkBottles){
    const owner=enemies.find(e=>e.id===bottle.claimantId);
    if(!owner||owner.hp<=0||owner.type!=='slice'||owner.stackAnchor||(owner.stackCount||1)>1||owner.sliceHop||owner.sliceFlight||owner.hit>0||owner.knock>0||owner.down>0||owner.sliceBottleId!==bottle.id||dist(owner,bottle)>=24*characterScale()){
      if(owner){owner.drinking=0;owner.milkTarget=null;}
      delete bottle.claimantId;
    }
  }
  for(const e of enemies){
    if(e.type!=='slice'||e.hp<=0||e.sliceRallyId!=null||e.sliceFlight||e.sliceHop||e.stackAnchor||e.stackDrop>0||(e.stackCount||1)>1)continue;
    const goal=sliceGoal(e);
    const bottle=e.sliceGoal==='bottle'?goal:null;
    if(!bottle||dist(e,bottle)>=24*characterScale()||e.hit>0||e.knock>0||e.down>0){const prior=milkBottles.find(b=>b.id===e.milkTarget&&b.claimantId===e.id);if(prior)delete prior.claimantId;e.drinking=0;e.milkTarget=null;continue;}
    if(bottle.claimantId!==undefined&&bottle.claimantId!==e.id){e.drinking=0;e.milkTarget=null;continue;}
    bottle.claimantId=e.id;
    if(e.milkTarget!==bottle.id){e.milkTarget=bottle.id;e.drinking=0;}
    e.drinking+=dt;
    if(e.drinking<milkRules.ingest)continue;
    // Consume atomically: a second slice cannot reuse this bottle in this frame.
    milkBottles=milkBottles.filter(b=>b!==bottle);
    e.type='milk';e.hp=1;e.speed=62;e.drinking=0;e.milkTarget=null;
    e.milkPhase='walk';e.milkTime=0;e.hit=0;
    burst(e.x,e.y,'#fff1c9',16);texts.push({x:e.x,y:e.y,z:80,text:'香蕉牛奶！',life:1});sfx('bossCast');
  }
}
function emitMilkDrop(origin,angle,hostile=true){
  const speed=bottleShotRules.speed,reach=20;
  milkDrops.push({x:origin.x+Math.cos(angle)*reach,y:origin.y+Math.sin(angle)*reach,z:32,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:bottleShotRules.life,hostile});
}
function emitPlayerMilkJet(){
  const s=characterScale(),hits=new Set();
  for(const side of [-1,0,1]){
    const z=Math.max(8*s,player.z-2*s);
    milkDrops.push({x:player.x+milkBackpackOffset()+side*8*s,y:player.y+8*s,z,vx:side*18*s,vy:10*s,vz:-milkRules.jetDownSpeed*s,life:(z+12*s)/(milkRules.jetDownSpeed*s),jet:true,hostile:false,waveHits:hits});
  }
  sfx('milkJet');
}
function updateMilkSpray(dt){
  if(milkPack){
    milkPack.spraying=milkJetActive();
    if(milkPack.spraying){
      const activeDt=Math.min(dt,milkPack.ammo/milkRules.ammo*milkRules.jetDuration);
      milkPack.ammo=Math.max(0,milkPack.ammo-activeDt*milkRules.ammo/milkRules.jetDuration);milkPack.emit-=activeDt;
      while(milkPack.emit<=0&&activeDt>0){milkPack.emit+=milkRules.jetInterval;emitPlayerMilkJet();}
      if(milkPack.ammo<=1e-9){milkPack=null;notify('牛奶噴完了！');sfx('peel');}
    }
  }
  for(const drop of milkDrops){
    const ax=drop.x,ay=drop.y,az=drop.z,step=Math.min(dt,Math.max(0,drop.life));
    drop.x+=drop.vx*step;drop.y+=drop.vy*step;if(drop.jet)drop.z+=drop.vz*step;drop.life=Math.max(0,drop.life-dt);
    if(drop.hostile){
      if(player.z<48&&segmentDistance(player,ax,ay,drop.x,drop.y)<23*characterScale()){
        hurt('被香蕉牛奶噴中');drop.life=0;
      }
      continue;
    }
    let victim=null,nearest=Infinity;
    for(const e of enemies){
      if(e.hp<=0||(e.hit>0&&e.type!=='milk')||drop.waveHits?.has(e.id))continue;
      const s=characterScale(),radius=26*s;
      const top=(e.z||0)+34*s,bottom=(e.z||0)-4*s,dz=az-drop.z;
      if(!drop.jet||dz<=0||az<bottom||drop.z>top)continue;
      const enter=clamp((az-top)/dz,0,1),exit=clamp((az-bottom)/dz,0,1);
      if(segmentDistance(e,ax+(drop.x-ax)*enter,ay+(drop.y-ay)*enter,ax+(drop.x-ax)*exit,ay+(drop.y-ay)*exit)>radius)continue;
      const gap=enter;
      if(gap<nearest){victim=e;nearest=gap;}
    }
    if(drop.jet&&drop.z<=0)drop.life=0;
    if(victim&&hitEnemy(victim,false)){
      drop.waveHits?.add(victim.id);drop.life=0;
      if(victim.hp>0){const a=Math.atan2(victim.y-player.y,victim.x-player.x);victim.knock=.18;victim.kx=Math.cos(a)*100;victim.ky=Math.sin(a)*100;}
      burst(victim.x,victim.y,'#fff4d6',5);
    }
  }
  milkDrops=milkDrops.filter(drop=>drop.life>0);
}
function updateMilkStage(dt,path){
  if(!milkStage)return;
  while(!giantBattle&&nextMilkAt<milkRules.duration&&elapsed>=nextMilkAt){
    nextMilkAt+=milkRules.bottleInterval;spawnMilkPair();
  }
  milkBottles.forEach(b=>b.age+=dt);
  // Grounded player pickups win ties; airborne players cannot steal a bottle.
  collectMilkBottles(path);updateMilkClaims(dt);updateMilkSpray(dt);
}
function updateMilkHUD(){if(simulationHeadless)return;
  const label=milkPack?'噴射':'跳踩';if(label!==milkTouchLabel){$('jumpTouch').innerHTML=`↑<small>${label}</small>`;milkTouchLabel=label;}
  const gauge=$('milkGauge');gauge.hidden=!milkStage||!milkPack||state!=='playing';
  if(gauge.hidden)return;
  $('milkFuel').style.width=`${milkPack.ammo/milkRules.ammo*100}%`;
  $('milkTime').textContent=`${milkJetPercent()}%`;
  gauge.setAttribute('aria-valuenow',milkPack.ammo.toFixed(2));
  gauge.setAttribute('aria-valuetext',`牛奶燃料剩餘 ${milkJetPercent()}%，按住跳躍向下噴射`);
}
function drawMilkImage(height,x=0,y=0){
  const source=renderSprite(milkBottleSprite),width=height*milkBottleSprite.naturalWidth/milkBottleSprite.naturalHeight;
  ctx.drawImage(source,x-width/2,y-height,width,height);
}
function drawMilkPickup(b){
  const p=screen(b.x,b.y),s=characterScale();
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(s,s);
  ellipse(0,5,25,10,'#e9e2ba33','#c6b98c');
  drawMilkImage(69,0,Math.sin(elapsed*3+b.id)*3);
  const drinker=enemies.find(e=>e.hp>0&&e.type==='slice'&&e.milkTarget===b.id&&e.drinking>0);
  if(drinker){ctx.beginPath();ctx.ellipse(0,3,30,12,0,-Math.PI/2,-Math.PI/2+TAU*drinker.drinking/milkRules.ingest);ctx.strokeStyle='#efb66c';ctx.lineWidth=4;ctx.stroke();}
  ctx.restore();
}
function sliceHopPreparation(e){
  if(e.type!=='slice'||e.hp<=0||(e.stackCount||1)>1||e.stackAnchor||e.sliceHop||e.sliceFlight||e.down>0||e.knock>0||e.hit>0||e.drinking>0)return 0;
  const wait=e.sliceHopWait||0;
  return wait>0?clamp(1-wait/sliceRules.hopPrepare,0,1):0;
}
function drawMilkEnemy(e){
  const wobble=Math.sin(elapsed*7+e.wobble),drinking=e.type==='slice'&&(e.drinking||0)>0;
  ctx.save();ctx.rotate(e.down>0?1.3:wobble*.035);
  if(e.type==='slice'){
    const sprite=renderSprite(sliceSprite),width=104,height=width*sliceSprite.naturalHeight/sliceSprite.naturalWidth;
    if(drinking){const u=e.drinking/milkRules.ingest;ctx.translate(0,-u*42);ctx.scale(1-u*.55,1-u*.55);}
    const prepare=sliceHopPreparation(e);
    if(prepare>0){ctx.translate(0,14);ctx.scale(1+prepare*.16,1-prepare*.26);ctx.translate(0,-14);}
    const drop=0;
    for(let i=0;i<(e.stackCount||1);i++)ctx.drawImage(sprite,-width/2,-height+14-i*sliceRules.layerHeight-drop-(e.z||0),width,height);
  }else{
    drawMilkImage(88,0,-2+Math.abs(wobble));
    drawSliceEyes(0,-40);
    if(e.milkPhase==='aim'){
      const len=15+e.milkTime/.75*16;ellipse(0,-85,len*.6,6,'#fff1cb88','#f5d58d');
    }
  }
  ctx.restore();
}
function drawSliceEyes(x,y){
  ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.moveTo(-19,-9);ctx.quadraticCurveTo(0,-4,19,-9);ctx.lineTo(17,5);ctx.quadraticCurveTo(0,12,-17,5);ctx.closePath();ctx.fillStyle='#342416';ctx.strokeStyle='#79502c';ctx.lineWidth=1.3;ctx.fill();ctx.stroke();
  for(const side of [-1,1]){ctx.save();ctx.scale(side,1);ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(14,-4);ctx.quadraticCurveTo(13,7,7,5);ctx.closePath();ctx.fillStyle='#ffe37c';ctx.fill();ctx.restore();}
  ctx.restore();
}
function drawMilkAmmo(){
  if(!milkPack)return;
  ctx.save();ctx.translate(59,-player.z-52);
  ctx.fillStyle='#302b25dd';ctx.beginPath();ctx.roundRect(-31,-3,62,12,4);ctx.fill();
  ctx.fillStyle='#171d1b';ctx.fillRect(-26,1,52,4);
  ctx.fillStyle=milkPack.ammo<=2?'#d9ad77':'#ecdfb8';ctx.fillRect(-26,1,52*milkPack.ammo/milkRules.ammo,4);ctx.restore();
}
function milkBackpackOffset(){return -(Math.cos(player.face)<0?-1:1)*18*characterScale();}
function drawMilkPack(){
  if(!milkPack||special)return;
  const side=Math.cos(player.face)<0?-1:1;
  ctx.save();ctx.translate(-side*18,-player.z-25);ctx.rotate(Math.PI);
  drawMilkImage(47,0,23.5);ctx.restore();
}
function drawPlayerMilkColumn(){
  if(!milkPack?.spraying)return;
  const s=characterScale(),top=screen(player.x+milkBackpackOffset(),player.y,player.z+1.5*s),ground=screen(player.x+milkBackpackOffset(),player.y+8*s),wave=Math.sin(elapsed*35)*2*s;
  ctx.save();const milk=ctx.createLinearGradient(top.x,top.y,ground.x,ground.y);milk.addColorStop(0,'#fff2d9');milk.addColorStop(1,'#e6d7b5cc');ctx.fillStyle=milk;
  ctx.beginPath();ctx.moveTo(top.x-5*s,top.y-5*s);ctx.bezierCurveTo(top.x-7*s+wave,top.y+player.z*.5,ground.x-11*s,ground.y-10*s,ground.x-12*s,ground.y);ctx.quadraticCurveTo(ground.x,ground.y+5*s,ground.x+12*s,ground.y);ctx.bezierCurveTo(ground.x+9*s,ground.y-10*s,top.x+7*s+wave,top.y+player.z*.5,top.x+5*s,top.y-5*s);ctx.closePath();ctx.fill();
  for(let i=0;i<5;i++){const a=i*Math.PI/4,r=(7+((elapsed*50+i*7)%13))*s;ellipse(ground.x+Math.cos(a)*r,ground.y-Math.sin(a)*r*.3,3*s,1.5*s,'#efe1c3aa');}ctx.restore();
}
function drawMilkEffects(){
  drawPlayerMilkColumn();
  for(const drop of milkDrops){
    if(drop.jet){if(!milkPack?.spraying){const p=screen(drop.x,drop.y,drop.z);ellipse(p.x,p.y,2*characterScale(),4*characterScale(),'#efe1c3aa');}continue;}
    if(!isInView(drop,20,drop.z))continue;
    const s=characterScale(),p=screen(drop.x,drop.y,drop.jet?drop.z*s:drop.z),angle=drop.jet?Math.atan2(drop.vy*.72-drop.vz,drop.vx):Math.atan2(drop.vy*.72,drop.vx);
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);ctx.globalAlpha=Math.min(1,drop.life*5);
    if(drop.hostile)ellipse(0,0,10*s,5*s,'#f6d692','#b29469');
    else{
      // Rounded creamy fireballs: separated volleys, soft tails, no continuous beam.
      ellipse(-7*s,0,14*s,7*s,'#dcc79c44');
      ctx.beginPath();ctx.moveTo(-21*s,-3*s);ctx.quadraticCurveTo(-11*s,-2*s,-8*s,-7*s);ctx.bezierCurveTo(8*s,-12*s,16*s,-4*s,11*s,4*s);ctx.quadraticCurveTo(3*s,12*s,-8*s,5*s);ctx.quadraticCurveTo(-14*s,2*s,-21*s,-3*s);ctx.fillStyle='#eddbb3';ctx.fill();
      ellipse(3*s,-1*s,6*s,4*s,'#fff0d1');
    }
    ctx.restore();
  }
}

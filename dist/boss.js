'use strict';
const bossNameDuration=1;
let boss=null,bossElapsed=0,bossShots=[],bossClones=[];
const bossMusicBuffers=new Map();
let bossFireSprite=null;
const bossCloneCooldown=10,bossMaxBodies=3,bossMaxHp=10,bossFireDodgeHeight=58,bossShieldRadius=112,bossFireZ=20;
function bossFirePattern(){
  if(boss.hp<=6)return {count:7,rows:3,rounds:2,gap:.18,roundGap:.35,aim:1,rest:.4,extra:0};
  if(boss.hp===7)return {count:6,rows:3,rounds:1,gap:.2,roundGap:.35,aim:1,rest:.5,extra:0};
  if(boss.hp===8)return {count:5,rows:2,rounds:1,gap:.22,roundGap:.35,aim:1,rest:.6,extra:0};
  if(boss.hp===9)return {count:4,rows:1,rounds:1,gap:.24,roundGap:.35,aim:1,rest:.7,extra:0};
  return {count:3,rows:1,rounds:1,gap:.24,roundGap:.35,aim:1,rest:.8,extra:0};
}
function bossRadius(){return Math.min(W,H/.72)*.34;}
function isBossEntrance(){return !!boss&&['entrance','entrance-pose','entrance-banner'].includes(boss.phase);}
function isBossCinematic(){return !!boss&&['quadrants-cinematic','split-cinematic'].includes(boss.phase);}
function isBossWorldFrozen(){return !!boxSequence||isBossEntrance()||isGiantEntrance();}
function bossViewportPoint(sx,sy,margin=70,view=player){return {x:clamp(view.x+sx-W/2,-arenaSize+margin,arenaSize-margin),y:clamp(view.y+(sy-H*.52)/.72,-arenaSize+margin,arenaSize-margin)};}
function bossOtherSide(actor=boss,reserved=[]){
  const occupied=[...bossClones,...reserved];
  const p=screen(actor.x,actor.y),xs=p.x<W/2?[.8,.2]:[.2,.8];
  const candidates=xs.flatMap(x=>[.5,.25,.75].map(y=>bossCloneSite(x,y)));
  return candidates.find(point=>dist(point,player)>115*characterScale()&&dist(point,actor)>100*characterScale()&&occupied.every(clone=>dist(point,clone)>95*characterScale()))||candidates.sort((a,b)=>Math.min(dist(b,player),...occupied.map(clone=>dist(b,clone)))-Math.min(dist(a,player),...occupied.map(clone=>dist(a,clone))))[0];
}
function startBossBattle(debug=false){
  if(boss)return;
  bossShots=[];bossClones=[];bossElapsed=0;keys.clear();stick.x=stick.y=0;$('knob').style.transform='';noticeLife=0;$('notice').textContent='';shake=0;resize();
  const offset=Math.min(140,Math.max(0,(H*.52-190*characterScale()-95)/.72)),side=offset<60?(player.x>0?-1:1)*Math.min(180,W*.25):0;
  boss={x:clamp(player.x+side,-arenaSize+130,arenaSize-130),y:clamp(player.y-offset,-arenaSize+130,arenaSize-130),z:0,hp:bossMaxHp,phase:'entrance',time:3,move:0,hit:0,facing:1,stageSeen:new Set([10]),nextTeleport:Infinity,nextShield:Infinity,nextClone:Infinity,rituals:[]};
  if(debug)for(const x of [.25,.75])for(const y of [.25,.75])for(let i=0;i<3;i++){
    const point=bossViewportPoint(W*x+(i-1)*26,H*y+(i===1?-20:15));peels.push({id:serial++,...point,age:.6});
  }
  trackBattlePeaks();$('finalCountdown').hidden=true;sfx('warning');syncMusic();updateHUD();
}
function prepareDebugBossStage(hp){
  if(!debugUnlocked||!boss||![5,2].includes(hp))return;
  // Skip the entrance, retaining its conversion of minions into ground peels.
  updateBossEntrance(5);boss.hp=hp;
  for(let previous=bossMaxHp;previous>hp;previous--)boss.stageSeen.add(previous);
  boss.nextTeleport=bossElapsed+5;boss.nextShield=bossElapsed+3;
  onBossHealthChanged();if(!isBossCinematic())beginBossMove();updateHUD();
}
function resumeBossWorld(){
  special=null;player.z=0;player.vz=0;player.down=0;player.recoil=0;player.inv=Math.max(player.inv,2.5);player.slipCooldown=Math.max(player.slipCooldown,.5);if(player.stompGuard>0)player.stompGuard=player.inv;combo=0;comboLife=0;bossShots=[];
  keys.clear();stick.x=stick.y=0;$('knob').style.transform='';
}
function updateBossEntrance(dt){
  let remaining=dt;
  while(isBossEntrance()&&remaining>0){
    const step=Math.min(remaining,Math.max(0,boss.time));boss.time=Math.max(0,boss.time-step);bossElapsed+=step;remaining-=step;
    if(boss.time>1e-8)break;
    if(boss.phase==='entrance'){
      boss.transformed=enemies.filter(e=>e.hp>0).map(e=>({x:e.x,y:e.y}));
      for(const e of enemies)if(e.hp>0)peels.push({id:serial++,x:e.x,y:e.y,age:.6,large:isLargeBanana(e)});
      enemies=[];durianWarnings=[];boss.phase='entrance-pose';boss.time=1;sfx('bossCast');
    }else if(boss.phase==='entrance-pose'){boss.phase='entrance-banner';boss.time=bossNameDuration;sfx('start');}
    else{boss.transformed=[];resumeBossWorld();beginBossMove();}
  }
  updateHUD();
}
function bossCloneReady(){
  return !!boss&&boss.hp>0&&boss.hp<=2&&!isBossEntrance()&&!isBossCinematic()&&boss.phase!=='clone-aim'&&bossClones.length<bossMaxBodies-1&&bossElapsed>=boss.nextClone;
}
function beginBossCloneCast(){
  boss.phase='clone-aim';boss.time=1;boss.fireRows=0;boss.cloneTargets=planBossClones();boss.cloneTarget=boss.cloneTargets[0];sfx('warning');
}
function bossYellowLimit(){
  const scale=characterScale();
  return Math.min(60,Math.floor(W*H*.5/(72*96*scale*scale)));
}
function bossYellowCount(){return enemies.reduce((count,e)=>count+(e.type==='normal'&&e.hp===1?1:0),0);}
function beginBossMove(actor=boss){
  if(actor===boss&&bossCloneReady()){beginBossCloneCast();return;}
  let move;const canRevive=bossYellowCount()<bossYellowLimit();
  if(boss.hp===1){
    const moves=canRevive?['sea-aim','revive','fire-aim']:['sea-aim','fire-aim'];
    if(bossElapsed>=actor.nextShield)moves.push('shield-aim');
    if(actor===boss&&bossElapsed>=actor.nextTeleport)moves.push('teleport-aim');
    move=moves[Math.floor(Math.random()*moves.length)];
  }else if(boss.hp<=6&&bossElapsed>=actor.nextShield)move='shield-aim';
  else if(actor===boss&&boss.hp<=7&&bossElapsed>=actor.nextTeleport)move='teleport-aim';
  else{do{move=['sea-aim','revive','fire-aim'][actor.move++%3];}while(move==='revive'&&!canRevive);}
  actor.phase=move;actor.time=move==='revive'?3:move==='teleport-aim'?.3:1;
  if(move==='teleport-aim')actor.teleportTarget=bossOtherSide(actor);
  if(move==='fire-aim'){const origin=bossFireOrigin(actor);actor.aim=Math.atan2(player.y-origin.y,player.x-origin.x);}
  if(move==='revive'){
    actor.radius=bossRadius();actor.revivePeels=peels.filter(p=>!p.ritual&&!p.summonWave&&dist(p,actor)<=actor.radius).sort((a,b)=>dist(a,actor)-dist(b,actor)).slice(0,12);actor.summonPoints=[];
  }
  sfx('warning');
}
function bossSummon(point){
  if(enemies.length>=110||bossYellowCount()>=bossYellowLimit())return false;
  const e=spawn(0,'normal',point);e.hp=1;e.color=bananaColor(e);e.speed=65;e.rise=.6;e.hit=.6;burst(e.x,e.y,'#b8d889',8);return true;
}
function releaseBossRevival(actor=boss){
  for(const p of actor.revivePeels||[]){const index=peels.indexOf(p);if(index>=0&&!p.ritual&&!p.summonWave&&bossSummon(p))peels.splice(index,1);}
  sfx('bossCast');actor.phase='rest';actor.time=.8;
}
function bossSeaRadius(){return Math.max(bossRadius()*1.5,Math.hypot(W/2,H/.72/2)*.7);}
function releaseBossSeaWave(index,actor=boss){
  const count=[8,12,16][index],target=bossSeaRadius()*(.75+index*.45),start=40*characterScale();
  for(let i=0;i<count;i++){const a=(i+(index%2)*.5)*TAU/count;peels.push({id:serial++,x:clamp(actor.x+Math.cos(a)*start,-arenaSize+20,arenaSize-20),y:clamp(actor.y+Math.sin(a)*start,-arenaSize+20,arenaSize-20),age:.6,bossWave:{dx:Math.cos(a),dy:Math.sin(a),remaining:Math.max(0,target-start)}});}
  shake=.12;sfx('bossSlam');
}
function moveBossPeel(p,dt){
  if(p.ritual)return true;
  if(!p.bossWave)return false;
  const wave=p.bossWave,travel=Math.min(wave.remaining,(wave.speed||280)*dt);wave.remaining-=travel;p.x=clamp(p.x+wave.dx*travel,-arenaSize+20,arenaSize-20);p.y=clamp(p.y+wave.dy*travel,-arenaSize+20,arenaSize-20);if(wave.remaining<=0)delete p.bossWave;return true;
}
function bossFireOrigin(actor,scale=characterScale()){
  // Convert the staff orb's screen offset to the projectile's world plane.
  return {x:actor.x+46*scale,y:actor.y+(bossFireZ-120*scale)/.72};
}
function emitBossFire(actor,count){
  const origin=bossFireOrigin(actor);
  for(let i=0;i<count;i++){const a=actor.aim+(i-(count-1)/2)*Math.min(.22,(Math.PI/2)/Math.max(1,count-1));bossShots.push({...origin,vx:Math.cos(a)*215,vy:Math.sin(a)*215,life:2.6});}sfx('bossCast');
}
function releaseBossFireRow(actor=boss){emitBossFire(actor,actor.firePattern.count);actor.fireRows--;actor.fireRowIndex++;}
function bossFireGap(actor=boss){return actor.fireRowIndex%actor.firePattern.rows===0?actor.firePattern.roundGap:actor.firePattern.gap;}
function releaseBossFire(actor=boss){
  const pattern=actor.firePattern=bossFirePattern();actor.fireRows=pattern.rows*pattern.rounds;actor.fireRowIndex=0;releaseBossFireRow(actor);actor.fireClock=bossFireGap(actor);
  actor.phase='fire';actor.time=pattern.rounds*(pattern.rows-1)*pattern.gap+(pattern.rounds-1)*pattern.roundGap+pattern.rest;
}
function releaseSummonQuake(origin=boss,view=player){
  const wave=[];
  for(const x of [.25,.75])for(const y of [.25,.75])for(let i=0;i<6;i++){
    const a=i*TAU/6,target=bossViewportPoint(W*x+Math.cos(a)*34,H*y+Math.sin(a)*26,70,view),dx=target.x-origin.x,dy=target.y-origin.y,d=Math.hypot(dx,dy)||1,start=Math.min(35*characterScale(),d);
    const peel={id:serial++,x:origin.x+dx/d*start,y:origin.y+dy/d*start,age:.6,summonWave:true,quakeTarget:target,bossWave:{dx:dx/d,dy:dy/d,remaining:Math.max(0,d-start),speed:900}};
    peels.push(peel);wave.push(peel);
  }
  boss.quakeFlash={x:origin.x,y:origin.y,t:0};sfx('bossSlam');shake=.12;return wave;
}
function completeSummonQuake(wave,view=player){
  for(const peel of wave){if(!peels.includes(peel))continue;peel.x=peel.quakeTarget.x;peel.y=peel.quakeTarget.y;delete peel.bossWave;delete peel.summonWave;delete peel.quakeTarget;}
  return planQuadrantRituals(view);
}
function planQuadrantRituals(view=player){
  const groups=[];
  for(let quadrant=0;quadrant<4;quadrant++){
    const right=quadrant%2,bottom=Math.floor(quadrant/2);
    const candidates=peels.filter(p=>!p.ritual&&!p.bossWave&&!(p.slideTime>0)&&p.age>.5).filter(p=>{const s={x:W/2+p.x-view.x,y:H*.52+(p.y-view.y)*.72};return s.x>=25&&s.x<=W-25&&s.y>=25&&s.y<=H-25&&(s.x>=W/2?1:0)===right&&(s.y>=H/2?1:0)===bottom;});
    if(candidates.length<3)continue;
    const target=bossViewportPoint(W*(right?.75:.25),H*(bottom?.75:.25),70,view);candidates.sort((a,b)=>dist(a,target)-dist(b,target));
    const first=candidates[0],second=candidates.slice(1).sort((a,b)=>dist(b,first)-dist(a,first))[0];
    const third=candidates.filter(p=>p!==first&&p!==second).sort((a,b)=>Math.abs((second.x-first.x)*(b.y-first.y)-(second.y-first.y)*(b.x-first.x))-Math.abs((second.x-first.x)*(a.y-first.y)-(second.y-first.y)*(a.x-first.x)))[0];
    const sources=[first,second,third],center={x:sources.reduce((v,p)=>v+p.x,0)/3,y:sources.reduce((v,p)=>v+p.y,0)/3};
    const group={sources,origins:sources.map(p=>({x:p.x,y:p.y})),center,t:0};for(const p of sources)p.ritual=true;groups.push(group);
  }
  return groups;
}
function advanceRituals(groups,progress){
  for(const group of groups){
    if(group.done)continue;group.t=clamp(progress,0,1);
    group.sources.forEach((p,i)=>{p.x=group.origins[i].x+(group.center.x-group.origins[i].x)*group.t;p.y=group.origins[i].y+(group.center.y-group.origins[i].y)*group.t;});
    if(group.t>=1){
      const valid=group.sources.every(p=>peels.includes(p));
      if(valid){peels=peels.filter(p=>!group.sources.includes(p));const e=spawn(0,'charger',group.center);e.phase='turn';e.phaseTime=2;e.rise=.6;e.hit=.8;group.actor=e;burst(e.x,e.y,'#a0ce74',18);}
      for(const p of group.sources)delete p.ritual;group.done=true;
    }
  }
}
function summonRedWave(){
  for(const side of [0,1]){
    const p=bossViewportPoint(side?W-75:75,H*.5,100);const e=spawn(0,'thrower',p);e.rise=.6;e.hit=.8;
    for(const offset of [-38,38]){const d=spawn(0,'durian',{x:clamp(p.x+(side?-45:45),-arenaSize+45,arenaSize-45),y:clamp(p.y+offset,-arenaSize+45,arenaSize-45)});d.hit=.8;d.rise=.6;}
    burst(p.x,p.y,'#dc9e7f',18);
  }sfx('bossCast');
}
function spawnBossClone(point){
  if(bossClones.length>=bossMaxBodies-1)return null;
  const clone={id:serial++,...point,z:0,isClone:true,phase:'rest',time:1+bossClones.length*.4,hit:.8,move:bossClones.length%3,nextShield:bossElapsed+4+bossClones.length*2};bossClones.push(clone);burst(clone.x,clone.y,'#b1d995',18);return clone;
}
function bossCloneSite(x,y){
  // Keep the whole sprite below the top HUD, especially in phone landscape.
  const top=Math.min(H*.55,210*characterScale()+60);
  return bossViewportPoint(W*x,clamp(H*y,top,H-45));
}
function planBossClones(origin=boss){
  const count=Math.min(boss.hp===1?2:1,bossMaxBodies-1-bossClones.length);
  if(count<=0)return [];
  // Only score a few visible spawn sites when casting, never in the frame loop.
  const candidates=[.16,.5,.84].flatMap(x=>[.22,.5,.78].map(y=>bossCloneSite(x,y)));
  const occupied=[origin,...bossClones];
  function score(targets){
    const bodies=[...occupied,...targets];let separation=Infinity,altitude=Infinity;
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      separation=Math.min(separation,dist(bodies[i],bodies[j]));
      for(let k=j+1;k<bodies.length;k++){
        const a=bodies[i],b=bodies[j],c=bodies[k];
        const area=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x));
        altitude=Math.min(altitude,area/Math.max(1,dist(a,b),dist(a,c),dist(b,c)));
      }
    }
    const clearance=Math.min(...targets.map(point=>dist(point,player)));
    return separation+(Number.isFinite(altitude)?altitude*.8:0)-Math.max(0,115*characterScale()-clearance)*3;
  }
  let targets=[],best=-Infinity;
  const proposals=candidates.flatMap((point,i)=>count===1?[[point]]:candidates.slice(i+1).map(other=>[point,other]));
  for(const proposal of proposals){
    const value=score(proposal);
    if(value>best){best=value;targets=proposal;}
  }
  return targets;
}
function bossCloneRetreatPoint(){
  const scale=characterScale(),top=Math.min(H*.55,210*scale+60);
  const lo=bossViewportPoint(100*scale,top,130),hi=bossViewportPoint(W-100*scale,H-35*scale,130);
  const candidates=[{x:lo.x,y:lo.y},{x:lo.x,y:hi.y},{x:hi.x,y:lo.y},{x:hi.x,y:hi.y}];
  // With two clones, the farthest nearest-clone distance is attained at a
  // corner or where their perpendicular bisector meets a viewport edge.
  for(let i=0;i<bossClones.length;i++)for(let j=i+1;j<bossClones.length;j++){
    const a=bossClones[i],b=bossClones[j],dx=b.x-a.x,dy=b.y-a.y,c=(b.x*b.x+b.y*b.y-a.x*a.x-a.y*a.y)/2;
    if(Math.abs(dy)>1e-8)for(const x of [lo.x,hi.x]){const y=(c-dx*x)/dy;if(y>=lo.y&&y<=hi.y)candidates.push({x,y});}
    if(Math.abs(dx)>1e-8)for(const y of [lo.y,hi.y]){const x=(c-dy*y)/dx;if(x>=lo.x&&x<=hi.x)candidates.push({x,y});}
  }
  const clearance=point=>Math.min(...bossClones.map(clone=>dist(point,clone)));
  return candidates.sort((a,b)=>clearance(b)-clearance(a))[0];
}
function separateOriginalFromClones(){
  if(!bossClones.length)return;
  const target=bossCloneRetreatPoint();
  burst(boss.x,boss.y,'#7d9673',12);boss.x=target.x;boss.y=target.y;boss.knock=0;burst(boss.x,boss.y,'#b1d995',18);
}
function spawnBossCloneBatch(targets=planBossClones()){
  const before=bossClones.length;
  for(const point of targets)spawnBossClone(point);
  if(bossClones.length>before)separateOriginalFromClones();
}
function startBossCinematic(kind){
  boss.fireRows=0;boss.knock=0;boss.phase=kind==='quadrants'?'quadrants-cinematic':'split-cinematic';boss.time=6;
  boss.cinematic={kind,t:0,duration:boss.time,from:{x:boss.x,y:boss.y},center:bossViewportPoint(W/2,H/2),view:{x:player.x,y:player.y},groups:[],targets:kind==='split'?planBossClones(bossViewportPoint(W/2,H/2)):[],target:null};
  player.recoil=0;player.down=0;sfx('ritualCharge');
  bossShots=[];sfx('warning');
}
function updateBossCinematic(dt){
  const scene=boss.cinematic;const step=Math.min(dt,scene.duration-scene.t);scene.t+=step;boss.time=Math.max(0,scene.duration-scene.t);bossElapsed+=step;shake=Math.max(0,shake-step);if(boss.quakeFlash)boss.quakeFlash.t+=step;
  boss.hit=Math.max(0,boss.hit-step);
  const travel=clamp(scene.t/.8,0,1);if(!scene.departed){boss.x=scene.from.x+(scene.center.x-scene.from.x)*travel;boss.y=scene.from.y+(scene.center.y-scene.from.y)*travel;}
  const rise=clamp(scene.t/.95,0,1);
  boss.z=Math.min(90,Math.max(20,H*.5/characterScale()-210))*rise*rise*(3-2*rise)*(1-clamp((scene.t-5.1)/.9,0,1));
  if(scene.kind==='quadrants'){
    if(scene.t>=1.6&&!scene.wave)scene.wave=releaseSummonQuake(scene.center,scene.view);
    if(scene.wave)for(const peel of scene.wave)moveBossPeel(peel,step);
    if(scene.t>=2.5&&!scene.planned){scene.groups=completeSummonQuake(scene.wave,scene.view);scene.planned=true;}
    advanceRituals(scene.groups,clamp((scene.t-2.5)/2,0,1));
    if(scene.t>=4.5&&!scene.summoned){scene.summoned=true;sfx('bossCast');}
    for(const group of scene.groups)if(group.actor)group.actor.rise=Math.max(0,.6-(scene.t-4.5));
  }else{
    if(scene.t>=1.6&&!scene.released){scene.released=true;boss.quakeFlash={x:scene.center.x,y:scene.center.y,t:0};shake=.12;sfx('bossSlam');}
    if(scene.t>=4.5&&!scene.spawned){spawnBossCloneBatch(scene.targets);scene.departed=true;scene.spawned=scene.summoned=true;sfx('bossCast');}
    if(scene.t>=5&&!scene.shieldCharging){scene.shieldCharging=true;sfx('warning');}
  }
  if(boss.time<=1e-8){boss.z=0;boss.cinematic=null;boss.phase=scene.kind==='split'?'shield':'rest';boss.time=scene.kind==='split'?3:.8;boss.nextClone=bossElapsed+bossCloneCooldown;if(scene.kind==='split'){boss.nextShield=bossElapsed+14;sfx('bossCast');}shake=.08;sfx('bossSlam');}
  updateHUD();
}
function onBossHealthChanged(){
  if(boss.stageSeen.has(boss.hp))return;boss.stageSeen.add(boss.hp);
  if([7,4,2].includes(boss.hp))spawnSurfPickup();
  if(boss.hp===7)boss.nextTeleport=bossElapsed+5;
  if(boss.hp===6)boss.nextShield=bossElapsed+3;
  if(boss.hp===5)startBossCinematic('quadrants');
  if(boss.hp===4){boss.summonQuake={t:0,wave:releaseSummonQuake(),planned:false};}
  if(boss.hp===3||boss.hp===2)summonRedWave();
  if(boss.hp===2)boss.nextClone=bossElapsed;
  if(boss.hp===1){startBossCinematic('split');syncMusic();}
}
function tryStompBoss(){
  if(!boss||boss.hp<=0||isBossCinematic()||isBossWorldFrozen())return false;
  const targets=[boss,...bossClones].filter(actor=>actor.hit<=0&&actor.phase!=='shield'&&dist(player,actor)<=56*characterScale()).sort((a,b)=>dist(player,a)-dist(player,b));
  const target=targets[0];if(!target)return false;
  return hitBoss(target,true);
}
function protectStompLanding(){
  if(player.stompLandingPending&&player.z<=0){player.stompLandingPending=false;player.inv=Math.max(player.inv,.5);player.stompGuard=player.inv;player.slipCooldown=Math.max(player.slipCooldown,.5);}
}
function bounceFromStomp(target,height=43){
  const a=dist(player,target)>1?Math.atan2(player.y-target.y,player.x-target.x):Math.PI/2;
  player.stompLandingPending=true;player.padDriftX=player.padDriftY=0;player.z=height;player.vz=200;player.down=0;player.recoil=.7;
  player.recoilX=Math.cos(a)*420*characterScale();player.recoilY=Math.sin(a)*420*characterScale();
  player.inv=Math.max(player.inv,1);player.stompGuard=player.inv;player.slipCooldown=Math.max(player.slipCooldown,1);player.giantBoostUntil=0;
}
function hitBoss(target,isStomp){
  if(!boss||boss.hp<=0||isBossCinematic()||isBossWorldFrozen()||(target!==boss&&!bossClones.includes(target))||target.hit>0||target.phase==='shield')return false;
  const a=dist(player,target)>1?Math.atan2(player.y-target.y,player.x-target.x):Math.PI/2;
  const hitX=target.x,hitY=target.y;
  if(isStomp){
    bounceFromStomp(target);
    combo=0;comboLife=0;stats.stompHits++;stats.maxCombo=Math.max(stats.maxCombo,1);charge=Math.min(100,charge+20);sfx('stomp');sfx('jump');
  }else sfx('hit');
  burst(hitX,hitY,'#c9e7a5',16);texts.push({x:hitX,y:hitY,z:145*characterScale(),text:isStomp?'踩中！':special?.mode==='surf'?'衝浪命中！':'衝刺命中！',life:.65});shake=.07;
  if(target!==boss){bossClones=bossClones.filter(clone=>clone!==target);kills++;if(isStomp)stats.stompKills++;if(bossCloneReady())beginBossCloneCast();}
  else{
    if(boss.hp<=2)boss.nextClone=Math.max(bossElapsed,boss.nextClone)+1;
    boss.hit=4;boss.phase='stunned';boss.time=.65;boss.fireRows=0;boss.knock=.4;boss.kx=-Math.cos(a)*260*characterScale();boss.ky=-Math.sin(a)*260*characterScale();
    if(boss.hp<=2&&bossClones.length){
      const promoted=bossClones.splice(Math.floor(Math.random()*bossClones.length),1)[0];boss.x=promoted.x;boss.y=promoted.y;boss.knock=0;kills++;if(isStomp)stats.stompKills++;notify('分身繼承本尊！');
    }else{
      boss.hp--;
      if(boss.hp<=0){kills++;if(isStomp)stats.stompKills++;bossShots=[];finish(true);}
      else onBossHealthChanged();
    }
  }
  updateHUD();return true;
}
function updateBossActor(actor,dt){
  actor.hit=Math.max(0,actor.hit-dt);actor.time-=dt;
  if(actor.knock>0){const step=Math.min(dt,actor.knock);actor.knock-=step;actor.x=clamp(actor.x+actor.kx*step,-arenaSize+130,arenaSize-130);actor.y=clamp(actor.y+actor.ky*step,-arenaSize+130,arenaSize-130);}
  else if(actor.phase==='rest'){const d=dist(player,actor),travel=Math.min(Math.max(0,d-125*characterScale()),38*dt);if(d>0){actor.x+=(player.x-actor.x)/d*travel;actor.y+=(player.y-actor.y)/d*travel;}}
  if(Math.abs(player.x-actor.x)>30)actor.facing=player.x>=actor.x?1:-1;
  if(actor.phase==='sea'){actor.waveClock-=dt;while(actor.waveClock<=0&&actor.waves<3){releaseBossSeaWave(actor.waves++,actor);actor.waveClock+=.3;}}
  if(actor.phase==='fire'&&actor.fireRows>0){actor.fireClock-=dt;while(actor.fireClock<=0&&actor.fireRows>0){releaseBossFireRow(actor);actor.fireClock+=bossFireGap(actor);}}
  if(actor.time<=0){
    if(['entrance','rest','stunned'].includes(actor.phase))beginBossMove(actor);
    else if(actor.phase==='sea-aim'){actor.phase='sea';actor.time=1;actor.waves=0;actor.waveClock=0;}
    else if(actor.phase==='sea'){actor.phase='rest';actor.time=.7;}
    else if(actor.phase==='revive')releaseBossRevival(actor);
    else if(actor.phase==='fire-aim')releaseBossFire(actor);
    else if(actor.phase==='fire'){actor.phase='rest';actor.time=.2;}
    else if(actor.phase==='teleport-aim'){actor.x=actor.teleportTarget.x;actor.y=actor.teleportTarget.y;actor.nextTeleport=bossElapsed+10;actor.phase='rest';actor.time=.6;burst(actor.x,actor.y,'#c4e6a5',18);sfx('bossCast');}
    else if(actor.phase==='shield-aim'){actor.phase='shield';actor.time=3;actor.nextShield=bossElapsed+14;sfx('bossCast');}
    else if(actor.phase==='shield'){actor.phase='rest';actor.time=.6;}
    else if(actor.phase==='clone-aim'){const count=Math.min(boss.hp===1?2:1,bossMaxBodies-1-bossClones.length);spawnBossCloneBatch(actor.cloneTargets.length===count?actor.cloneTargets:planBossClones());actor.nextClone=bossElapsed+bossCloneCooldown;actor.phase='rest';actor.time=.6;sfx('bossCast');}
  }
}
function updateBossClones(dt){
  for(const clone of bossClones){
    updateBossActor(clone,dt);
    if(clone.phase==='shield'&&dist(player,clone)<(bossShieldRadius+15)*characterScale())hurt('碰到鬼火防護罩','boss');
    else if(clone.hit<=0&&player.z<25&&dist(player,clone)<40*characterScale())hurt('撞到魔王分身','boss');
  }
}
function updateBoss(dt){
  if(!boss)return;if(isBossEntrance()){updateBossEntrance(dt);return;}if(isBossCinematic()){updateBossCinematic(dt);return;}
  bossElapsed+=dt;if(boss.quakeFlash)boss.quakeFlash.t+=dt;
  if(boss.summonQuake){const quake=boss.summonQuake;quake.t+=dt;if(quake.t>=.9&&!quake.planned){boss.rituals=completeSummonQuake(quake.wave);quake.planned=true;}if(quake.planned){advanceRituals(boss.rituals,(quake.t-.9)/1.2);boss.rituals=boss.rituals.filter(group=>!group.done);if(!boss.rituals.length)boss.summonQuake=null;}}
  if(bossCloneReady())beginBossCloneCast();
  updateBossActor(boss,dt);
  updateBossClones(dt);
  for(const shot of bossShots){const oldX=shot.x,oldY=shot.y;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.life-=dt;if(player.z<bossFireDodgeHeight&&segmentDistance(player,oldX,oldY,shot.x,shot.y)<(14+15*characterScale())&&!special&&player.inv<=0){hurt('被鬼火擊中','boss');shot.life=0;}}
  bossShots=bossShots.filter(p=>p.life>0&&Math.abs(p.x)<arenaSize+50&&Math.abs(p.y)<arenaSize+50);
  if(boss.phase==='shield'&&dist(player,boss)<(bossShieldRadius+15)*characterScale())hurt('碰到鬼火防護罩','boss');
  else if(boss.hit<=0&&player.z<25&&dist(player,boss)<40*characterScale())hurt('撞到腐蕉大法師','boss');
}
function drawBossEntranceGround(){
  const center=screen(boss.x,boss.y),r=105*characterScale(),rise=boss.phase==='entrance'?clamp(1-boss.time/3,0,1):1;
  ctx.save();ctx.translate(center.x,center.y);ctx.scale(1,.72);
  const glow=ctx.createRadialGradient(0,0,r*.15,0,0,r*1.4);glow.addColorStop(0,'#c2ed8444');glow.addColorStop(.65,'#7ec65455');glow.addColorStop(1,'#70b44c00');
  ellipse(0,0,r*1.4,r*1.4,glow);ctx.globalAlpha=.45+.55*Math.min(1,rise*4);ctx.strokeStyle='#b6e584';ctx.lineWidth=2;
  for(const radius of [r,r*1.14]){ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.stroke();}
  // Two interlocking triangles, projected onto the ground plane.
  for(const start of [-Math.PI/2,Math.PI/2]){
    ctx.beginPath();for(let i=0;i<3;i++){const a=start+i*TAU/3,x=Math.cos(a)*r,y=Math.sin(a)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();
  }
  for(let i=0;i<6;i++){const a=-Math.PI/2+i*TAU/6;ellipse(Math.cos(a)*r*1.14,Math.sin(a)*r*1.14,3,3,'#def2b2');}
  ctx.restore();
  if(boss.phase==='entrance-pose'){
    const progress=1-boss.time;
    if(progress<.45)for(const point of boss.transformed){const p=screen(point.x,point.y);ctx.save();ctx.globalAlpha=1-progress/.45;ellipse(p.x,p.y,16+progress*50,8+progress*25,null,'#b6e584');ctx.restore();}
  }
}
function drawRitualGroups(groups){
  for(const group of groups||[]){
    if(group.done)continue;
    const center=screen(group.center.x,group.center.y);ellipse(center.x,center.y,25+group.t*15,12+group.t*9,'#a3cd7822','#bde199');
  }
}
function bossRitualDim(){
  const scene=boss?.cinematic;
  return scene ? .35*Math.min(clamp(scene.t/.7,0,1),clamp((6-scene.t)/.9,0,1)):0;
}
function bossRitualLean(time){
  if(time<1.6)return -.06*clamp(time/.9,0,1);
  return time<2.2?.18*Math.sin((time-1.6)/.6*Math.PI):0;
}
function drawBossRitualBackdrop(){
  const dim=bossRitualDim();if(dim<=0)return;
  ctx.save();ctx.fillStyle=`rgba(7,18,16,${dim})`;ctx.fillRect(0,0,W,H);ctx.restore();
}
function drawBossRitualAura(){
  const scene=boss?.cinematic;if(!scene)return;
  const scale=characterScale();
  if(scene.kind==='split'&&scene.t>=1.6&&scene.t<4.5){
    for(const target of scene.targets)for(let i=0;i<4;i++){
      const t=((scene.t-1.6)*.65+i*.25)%1,p=screen(scene.center.x+(target.x-scene.center.x)*t,scene.center.y+(target.y-scene.center.y)*t,Math.sin(t*Math.PI)*45*scale);
      ellipse(p.x,p.y,3*scale,5*scale,'#d3e9b6');
    }
  }
  for(const group of scene.groups)if(!group.done)for(let i=0;i<group.origins.length;i++){
    const from=group.origins[i],t=(scene.t*2+i*.33)%1,to=group.center,p=screen(from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t,8);
    ellipse(p.x,p.y,3*scale,3*scale,'#dbedb8');
  }
}
function drawBossRitualHighlights(){
  const scene=boss?.cinematic;if(!scene)return;
  const scale=characterScale(),time=scene.t;
  if(time<1.95){
    const lean=bossRitualLean(time),foot=screen(boss.x,boss.y,(boss.z||0)*scale),x=foot.x+(46*Math.cos(lean)+120*Math.sin(lean))*scale,y=foot.y+(46*Math.sin(lean)-120*Math.cos(lean))*scale;
    const charge=clamp(time/1.3,0,1),tighten=clamp((time-1.3)/.3,0,1),released=time>=1.6;
    const radius=(released?24+(time-1.6)*220:12+charge*27-tighten*25)*scale;
    ctx.save();ctx.globalAlpha=released?clamp(1-(time-1.6)/.35,0,1):.5+charge*.4;
    const glow=ctx.createRadialGradient(x,y,2,x,y,radius*1.8);glow.addColorStop(0,'#e1efb9dd');glow.addColorStop(.4,'#a6d6a37a');glow.addColorStop(1,'#a6d6a300');ellipse(x,y,radius*1.8,radius*1.8,glow);ellipse(x,y,Math.max(5,radius*.25),Math.max(7,radius*.3),'#e3f0c7');
    if(!released)for(let i=0;i<6;i++){const angle=i*TAU/6+time*2,distance=(52-charge*24-tighten*18)*scale;ellipse(x+Math.cos(angle)*distance,y+Math.sin(angle)*distance,2.5*scale,2.5*scale,'#d3e9b6');}
    ctx.restore();
  }
  if(scene.summoned&&time<5.15){
    const progress=clamp((time-4.5)/.65,0,1);
    for(const point of scene.kind==='split'?scene.targets:scene.groups.map(group=>group.center)){
      const p=screen(point.x,point.y);ctx.save();ctx.globalAlpha=(1-progress)*.8;
      const glow=ctx.createRadialGradient(p.x,p.y-22*scale,2,p.x,p.y-22*scale,65*scale);glow.addColorStop(0,'#dfedbdcc');glow.addColorStop(1,'#a3d6a000');ellipse(p.x,p.y-22*scale,55*scale,80*scale,glow);ellipse(p.x,p.y,(30+progress*25)*scale,(13+progress*11)*scale,'#d8ebac66','#c5e2a6');ctx.restore();
    }
  }
}
function drawBossGround(){
  if(!boss)return;
  drawBossRitualAura();
  if(boss.quakeFlash&&boss.quakeFlash.t<.6){const wave=boss.quakeFlash,p=screen(wave.x,wave.y),progress=wave.t/.6;ctx.save();ctx.globalAlpha=1-progress;ctx.strokeStyle='#d5d694';ctx.lineWidth=3;for(const offset of [0,25]){const radius=35+progress*bossSeaRadius()+offset;ctx.beginPath();ctx.ellipse(p.x,p.y,radius,radius*.72,0,0,TAU);ctx.stroke();}ctx.restore();}
  if(boss.cinematic?.kind==='split')drawBossEntranceGround();
  drawOneBossGround(boss);for(const clone of bossClones)drawOneBossGround(clone);
  drawRitualGroups(boss.rituals);if(boss.cinematic)drawRitualGroups(boss.cinematic.groups);
  const targets=boss.phase==='teleport-aim'?[boss.teleportTarget]:boss.phase==='clone-aim'?boss.cloneTargets:boss.cinematic?.targets||[];
  for(const target of targets){const p=screen(target.x,target.y);ellipse(p.x,p.y,45*characterScale(),26*characterScale(),'#a5ce7522','#c3e29c');}
}
function drawBossShield(p,scale,actor=boss,behind=false){
  const active=actor.phase==='shield',progress=active?1:clamp(1-actor.time,0,1),radius=(75+progress*(bossShieldRadius-75))*scale;
  ctx.save();ctx.translate(p.x,p.y-70*scale);
  if(behind){
    // A translucent body-height dome, using one fill rather than blur filters.
    const height=(82+progress*28)*scale,centerY=-12*scale;
    ellipse(0,centerY,radius,height,active?'#a3e4cf18':'#a3e4cf0c',active?'#b0ead132':'#b0ead11c');
  }
  // Eight larger upright flames orbit with position changes only; no blur or particles.
  for(let i=0;i<8;i++){
    const a=i*TAU/8+bossElapsed*1.5,depth=Math.sin(a);
    if((depth<0)!==behind)continue;
    const x=Math.cos(a)*radius,y=depth*radius*.72,flameScale=1.35+Math.max(0,depth)*.15;
    ctx.save();ctx.translate(x,y);ctx.scale(flameScale,flameScale);
    const lift=(32+8*Math.sin(bossElapsed*5+i*1.7))*scale;
    ctx.globalAlpha=(active?.85:.35+progress*.3)*(behind?.7:1);ctx.fillStyle=i%2?'#9fc875':'#bddc8b';ctx.beginPath();ctx.moveTo(-9*scale,8*scale);ctx.quadraticCurveTo(-14*scale,-4*scale,-6*scale,-20*scale);ctx.quadraticCurveTo(-5*scale,-12*scale,-1*scale,-10*scale);ctx.quadraticCurveTo(7*scale,-25*scale,4*scale,-lift);ctx.quadraticCurveTo(18*scale,-11*scale,10*scale,7*scale);ctx.quadraticCurveTo(0,15*scale,-9*scale,8*scale);ctx.fill();
    ctx.fillStyle='#e1edb3';ctx.beginPath();ctx.moveTo(-3*scale,5*scale);ctx.quadraticCurveTo(0,-5*scale,2*scale,-13*scale);ctx.quadraticCurveTo(7*scale,6*scale,-3*scale,5*scale);ctx.fill();
    ctx.restore();
  }
  if(!behind){ctx.globalAlpha=1;ctx.fillStyle='#d6e9af';ctx.font=`bold ${Math.max(12,14*scale)}px sans-serif`;ctx.textAlign='center';ctx.fillText(active?'鬼火護罩':'護罩蓄力',0,-150*scale);}
  ctx.restore();
}
function drawBossTeleportTrail(p,scale){
  const target=screen(boss.teleportTarget.x,boss.teleportTarget.y),length=Math.hypot(target.x-p.x,target.y-p.y)||1,dx=(target.x-p.x)/length,dy=(target.y-p.y)/length,progress=clamp(1-boss.time/.3,0,1);
  ctx.save();
  for(let i=3;i>=1;i--){
    const shift=(10+i*12)*progress*scale;ctx.save();ctx.translate(p.x-dx*shift,p.y-dy*shift);ctx.scale(scale,scale);ctx.globalAlpha=(.2+i*.06)*(1-progress*.4);ctx.fillStyle='#161b19';ctx.beginPath();ctx.moveTo(-45,8);ctx.quadraticCurveTo(-33,-66,-12,-162);ctx.lineTo(16,-185);ctx.quadraticCurveTo(39,-83,50,8);ctx.closePath();ctx.fill();ctx.restore();
  }
  ctx.strokeStyle='#263326aa';ctx.lineWidth=2;
  for(const y of [-145,-105,-60]){const x=p.x-dx*45*scale,sy=p.y+y*scale;ctx.beginPath();ctx.moveTo(x,sy);ctx.lineTo(x-dx*(30+progress*35)*scale,sy-dy*20*scale);ctx.stroke();}ctx.restore();
}
function drawOneBossGround(boss){
  if(!boss)return;
  const p=screen(boss.x,boss.y);
  if(isBossEntrance()){drawBossEntranceGround();return;}
  if(boss.phase==='revive'){
    const radius=boss.radius,progress=clamp(1-boss.time/3,0,1);
    ellipse(p.x,p.y,radius,radius*.72,'#8ac86b18','#a6d37a');
    ctx.save();ctx.setLineDash([7,9]);ctx.lineWidth=2;ellipse(p.x,p.y,radius*progress,radius*.72*progress,null,'#c3dc8e99');ctx.restore();
    for(const point of [...boss.summonPoints,...boss.revivePeels.filter(item=>peels.includes(item))]){const s=screen(point.x,point.y);ellipse(s.x,s.y,17+progress*5,8+progress*4,'#aed88c44','#c7df9a');}
  }
  if(boss.phase==='sea-aim'){const radius=bossRadius()*.75;ellipse(p.x,p.y,radius,radius*.72,'#d7be6822','#d7be68');}
}
function drawBossFireCharge(p,scale,actor=boss){
  const origin=bossFireOrigin(actor,scale),source=screen(origin.x,origin.y,bossFireZ);
  const progress=clamp(1-actor.time,0,1),x=source.x,y=source.y,radius=(30+progress*21)*scale;
  ctx.save();
  const glow=ctx.createRadialGradient(x,y,3*scale,x,y,radius*1.5);glow.addColorStop(0,'#edf5b9dd');glow.addColorStop(.35,'#a8d477aa');glow.addColorStop(1,'#8ec56400');
  ellipse(x,y,radius*1.5,radius*1.5,glow);
  for(let i=0;i<6;i++){
    const a=i*TAU/6+progress*1.1,distance=(65-progress*46)*scale;
    ellipse(x+Math.cos(a)*distance,y+Math.sin(a)*distance,3*scale,3*scale,'#dceba5');
  }
  ellipse(x,y,(9+progress*12)*scale,(12+progress*14)*scale,'#d7eaa5','#eff4c3');
  ctx.fillStyle='#e1edb4';ctx.strokeStyle='#25351d';ctx.lineWidth=3;ctx.font=`bold ${Math.max(12,15*scale)}px sans-serif`;ctx.textAlign='center';
  ctx.strokeText('鬼火蓄力',x,y-radius*1.5-8);ctx.fillText('鬼火蓄力',x,y-radius*1.5-8);ctx.restore();
}
function drawBossActor(actor=boss){
  if(!isInView(actor,400))return;
  const p=screen(actor.x,actor.y),scale=characterScale(),height=190,width=height*bossSprite.naturalWidth/bossSprite.naturalHeight;
  const shieldActor=actor===boss&&boss.cinematic?.kind==='split'&&boss.cinematic.t>=5?{...actor,phase:'shield-aim'}:actor;
  const shieldPoint=shieldActor===actor?p:screen(actor.x,actor.y,(actor.z||0)*scale);
  if(actor===boss&&boss.phase==='teleport-aim')drawBossTeleportTrail(p,scale);
  if(['shield-aim','shield'].includes(shieldActor.phase))drawBossShield(shieldPoint,scale,shieldActor,true);
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(scale,scale);ellipse(0,8,45,13,'#20271d66');ctx.translate(0,-(actor.z||0));
  if(actor===boss&&isBossEntrance()){
    const progress=actor.phase==='entrance'?clamp(1-actor.time/3,0,1):1;
    ctx.beginPath();ctx.rect(-width,-height-50,width*2,height+62);ctx.clip();
    ctx.translate(0,height*(1-progress));
    if(actor.phase!=='entrance'){ctx.translate(0,-5);ctx.rotate(-.045);ctx.scale(1.04,1.04);}
  }else ctx.translate(0,Math.sin(bossElapsed*3)*2);
  if(actor.isClone)ctx.globalAlpha*=.82;
  if(actor===boss&&boss.phase==='teleport-aim')ctx.globalAlpha*=.35+.65*clamp(boss.time/.3,0,1);
  if(actor.hp<=0){ctx.rotate(.7);ctx.globalAlpha=.3;}else if(actor.hit>0)ctx.globalAlpha=.65+.25*Math.sin(bossElapsed*25);
  if(actor===boss&&boss.cinematic)ctx.rotate(bossRitualLean(boss.cinematic.t));
  ctx.drawImage(renderSprite(bossSprite),-width/2,-height+12,width,height);ctx.restore();
  if(['shield-aim','shield'].includes(shieldActor.phase))drawBossShield(shieldPoint,scale,shieldActor);
  if(actor.phase==='fire-aim')drawBossFireCharge(p,scale,actor);
  if(actor===boss)drawBossSummonGauge(p,scale);
}
function bossSummonCharge(){
  if(!boss||boss.hp>2||boss.hp<=0||isBossCinematic())return null;
  const casting=boss.phase==='clone-aim',remaining=casting?Math.max(0,boss.time):Math.max(0,boss.nextClone-bossElapsed);
  return {remaining,progress:clamp(1-remaining/(casting?1:bossCloneCooldown),0,1),full:bossClones.length>=bossMaxBodies-1,casting};
}
function drawBossSummonGauge(p,scale){
  const charge=bossSummonCharge();if(!charge)return;
  const width=Math.max(112,112*scale),height=7,x=p.x-width/2,above=p.y-(208+(boss.z||0))*scale,y=above<115?p.y+24:above;
  ctx.save();ctx.fillStyle='#17231fee';ctx.fillRect(x-4,y-21,width+8,34);ctx.fillStyle='#415449';ctx.fillRect(x,y,width,height);
  ctx.fillStyle=charge.casting?'#e1eaa5':'#a9d7ae';ctx.fillRect(x,y,width*charge.progress,height);
  ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillStyle='#dfedcf';
  const label=charge.full?`召喚 ${charge.remaining.toFixed(1)}s · 滿員`:charge.remaining>0?`召喚 ${charge.remaining.toFixed(1)}s`:'召喚就緒';
  ctx.fillText(label,p.x,y-6);ctx.restore();
}
function drawBossClonePreview(target){
  const scene=boss.cinematic;if(!scene||scene.kind!=='split'||scene.spawned)return;
  const progress=clamp((scene.t-2.5)/2,0,1);if(progress<=0)return;
  const p=screen(target.x,target.y),size=.6+.4*progress;
  ctx.save();ctx.globalAlpha=progress;ctx.translate(p.x,p.y);ctx.scale(size,size);ctx.translate(-p.x,-p.y);
  drawBossActor({...target,isClone:true,hit:0,phase:'preview'});ctx.restore();
}
function prepareBossFireSprite(){
  const surface=document.createElement('canvas');surface.width=surface.height=100;
  const brush=surface.getContext('2d'),glow=brush.createRadialGradient(50,50,6,50,50,50);
  glow.addColorStop(0,'#f0f5ad');glow.addColorStop(.35,'#b8dc79dd');glow.addColorStop(1,'#8ec56400');
  brush.fillStyle=glow;brush.beginPath();brush.ellipse(50,50,50,50,0,0,Math.PI*2);brush.fill();
  brush.fillStyle='#d9ed9f';brush.beginPath();brush.ellipse(50,50,18,22,0,0,Math.PI*2);brush.fill();bossFireSprite=surface;
}
function drawBossShots(){
  if(!bossShots.length)return;if(!bossFireSprite)prepareBossFireSprite();
  for(const shot of bossShots){if(!isInView(shot,40,bossFireZ))continue;const p=screen(shot.x,shot.y,bossFireZ);ctx.drawImage(bossFireSprite,p.x-25,p.y-25,50,50);}
}
function updateBossHUD(){
  const giantBanner=isGiantNameEntrance();
  const banner=boss?.phase==='entrance-banner'||giantBanner;$('bossBanner').hidden=!banner;
  $('bossBannerTitle').textContent=giantBanner?'進擊的蕉巨':'腐蕉大法師';
  if(giantBanner)$('bossBanner').classList.add('giant-banner');else $('bossBanner').classList.remove('giant-banner');
  if(banner){const progress=clamp(giantBanner?(giantBattle.clock-giantRules.ceremony)/bossNameDuration:1-boss.time/bossNameDuration,0,1);$('bossBanner').style.opacity=String(Math.min(1,progress*12,(1-progress)*10));$('bossBanner').style.transform=`translateY(${(1-Math.min(1,progress*6))*12}px)`;}
  $('bossHud').hidden=!boss||isBossCinematic();$('gameClock').hidden=!!boss||!!giantBattle;
  if(!boss)return;
  if($('bossBananas').dataset?.hp!==String(boss.hp)){
    $('bossBananas').innerHTML=Array.from({length:bossMaxHp},(_,i)=>`<span class="health-banana ${i<boss.hp?'filled':'empty'}" aria-hidden="true"><svg viewBox="0 0 34 32"><path d="M7 3C1 14 7 31 23 29C31 28 34 19 32 11C26 21 15 17 13 4Z"/><path class="banana-seam" d="M8 8C7 21 20 28 29 20"/><path class="banana-tip" d="M7 2L13 3L13 7L7 6Z"/></svg></span>`).join('');
    if($('bossBananas').dataset)$('bossBananas').dataset.hp=String(boss.hp);
    $('bossBananas').setAttribute('aria-label',`魔王生命 ${boss.hp} / ${bossMaxHp}`);
  }
  $('bossAction').textContent=({'entrance':'腐蕉大法師現身','entrance-pose':'萬蕉歸皮','entrance-banner':'準備開戰','sea-aim':'蕉皮海','sea':'蕉皮海','revive':'死蕉召喚','fire-aim':'鬼火蓄力','fire':'連發鬼火','stunned':'命中！','rest':'腐蕉大法師','teleport-aim':'瞬移','shield-aim':'護罩蓄力','shield':'鬼火防護罩','quadrants-cinematic':'四方聚蕉','split-cinematic':'分身降臨','clone-aim':'分身召喚'})[boss.phase]||'腐蕉大法師';
  if(boss.hp<=2)$('bossAction').textContent+=` · ${bossClones.length+1} 體`;
}
// Dedicated ghost-funk score: 16 bars at 128 BPM, two semitones lower, with fixed tempo throughout battle.
function createBossMusicBuffer(context,climax=false){
  const rate=22050,length=rate*30,buffer=context.createBuffer(1,length,rate),data=buffer.getChannelData(0),step=30/128;
  function note(at,midi,duration,volume,voice){
    const f=440*Math.pow(2,(midi-2-69)/12),start=Math.round(at*rate);
    for(let i=0;i<duration*rate;i++){
      const t=i/rate,p=t/duration,a=TAU*f*t;
      let wave,envelope;
      if(voice==='choir'){
        wave=.58*Math.sin(a)+.24*Math.sin(a*2)+.12*Math.sin(a*3);
        envelope=Math.sin(Math.PI*p)**2*(.9+.1*Math.sin(TAU*4.2*t));
      }else if(voice==='organ'){
        wave=.62*Math.sin(a)+.265*Math.sin(a*2)+.09*Math.sin(a*4)+.025*Math.sin(a*8);
        envelope=Math.min(1,t/.012)*Math.min(1,(duration-t)/.045)*(.85+.15*Math.sin(TAU*5*t));
      }else if(voice==='bell'){
        wave=.8*Math.sin(a)+.15*Math.sin(a*2.76)+.05*Math.sin(a*5.4);
        envelope=Math.min(1,t/.004)*Math.exp(-6*p)*(1-p);
      }else{
        wave=.7*Math.sin(a)+.2*Math.sin(a*2)+.1*Math.sin(a*3);
        envelope=Math.min(1,t/.006)*Math.pow(1-p,2);
      }
      data[(start+i)%length]+=wave*envelope*volume;
    }
  }
  function drum(at,kind,volume){
    const start=Math.round(at*rate),duration=kind==='kick'?.19:kind==='tom'?.2:kind==='snare'?.12:.04;let seed=777;
    for(let i=0;i<duration*rate;i++){
      const t=i/rate,p=t/duration;seed=(seed*1664525+1013904223)>>>0;
      const noise=seed/2147483648-1;
      const wave=kind==='kick'?Math.sin(TAU*(43*t+45*.025*(1-Math.exp(-t/.025)))):kind==='tom'?Math.sin(TAU*(85*t+50*.035*(1-Math.exp(-t/.035)))):kind==='snare'?.7*noise+.3*Math.sin(TAU*150*t):noise;
      data[(start+i)%length]+=wave*Math.min(1,t/.003)*Math.pow(1-p,3)*volume;
    }
  }
  const roots=[45,45,41,41,43,43,40,40,45,45,48,48,41,40,44,45];
  const phrases=[[69,72,76,75],[72,71,68,69],[65,68,72,71],[64,68,71,68]];
  for(let bar=0;bar<16;bar++){
    const at=bar*8*step,root=roots[bar],melody=phrases[Math.floor(bar/2)%4];
    // Syncopated bass under sustained minor choir and bright, reedy organ stabs.
    for(const [i,offset] of [[0,0],[1.5,12],[3.5,7],[4,0],[6,10],[7.25,12]])note(at+i*step,root+offset,step*.7,.075,'bass');
    for(const interval of [0,3,7])note(at,root+12+interval,step*7.8,.014,'choir');
    for(const i of [1,5])for(const interval of [0,3,7])note(at+i*step,root+24+interval,step*.7,.025,'organ');
    for(const [i,index] of [[.25,0],[2.5,1],[4,2],[6.5,3]])note(at+i*step,melody[index],step*.8,.043,'organ');
    if(bar%2===0||climax){
      note(at+.5*step,melody[0]+12,step*2.4,.042,'bell');
      note(at+3.5*step,melody[2]+12,step*2.4,.032,'bell');
    }
    for(const i of [0,3.5,4])drum(at+i*step,'kick',.1);
    for(const i of [2,6])drum(at+i*step,'snare',.045);
    for(let i=0;i<8;i++)drum(at+(i+.55)*step,'hat',.008);
    if(bar%4===3||climax)for(const [i,volume] of [[6.5,.055],[7,.045],[7.5,.065]])drum(at+i*step,'tom',volume);
    if(climax)for(const i of [1.5,5.5])note(at+i*step,melody[3]+12,step*1.2,.025,'bell');
  }
  return buffer;
}
function currentBossMusicBuffer(){
  const key=boss?.hp===1?'final':'normal',cached=bossMusicBuffers.get(key);
  if(cached?.context===audioCtx)return cached.buffer;
  const buffer=preparedMusicBuffer(`boss:${key}`,audioCtx,()=>createBossMusicBuffer(audioCtx,key==='final'));bossMusicBuffers.set(key,{context:audioCtx,buffer});return buffer;
}

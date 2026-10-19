'use strict';
let giantBattle=null,giantDullSprite=null;
const giantRules={hp:3,max:3,interval:10,entranceSafety:200,entranceSeparation:300,entranceInv:.5,ceremony:3.2,hintDuration:5,orbitRadius:102,orbitSpeed:.55,padHeight:28,padRadius:36,wallHeight:125,wallRadius:11,padDriftFactor:.35,padDriftMax:240,boost:520,boostWindow:2.5,headStep:34,headExtra:14,headRadius:46,headDepth:51,headBackOffset:12,bodyRadius:53,speed:30,ejectDuration:.85,attackIdle:6,attackCharge:2,attackOut:2,attackReturn:1,attackRecover:1,attackRadius:330,chargeSpin:7,flightSpin:4};
function resetGiants(){giantBattle=null;}
function isGiantCeremony(){return !!giantBattle?.formations.some(f=>f.initial);}
function liveGiants(){return giantBattle?giantBattle.giants.filter(g=>g.hp>0):[];}
function prepareGiantArt(){
  const sprite=renderSprite(giantBodySprite),surface=document.createElement('canvas');surface.width=sprite.width||giantBodySprite.naturalWidth;surface.height=sprite.height||giantBodySprite.naturalHeight;
  const brush=surface.getContext('2d');brush.filter='saturate(.4) brightness(.72)';brush.drawImage(sprite,0,0,surface.width,surface.height);giantDullSprite=surface;
}
function beginGiantBattle(){
  if(giantBattle||!milkStage)return;
  giantBattle={clock:0,nextAt:giantRules.interval,giants:[],formations:[],supplies:[],fallen:[],ejections:[],taught:false,hintUntil:giantRules.ceremony+bossNameDuration+giantRules.hintDuration};
  for(const e of enemies){
    if(e.hp<=0)continue;
    for(let i=0;i<(e.type==='slice'?(e.stackCount||1):1);i++)giantBattle.fallen.push({x:e.x+(i-1)*9,y:e.y+i*6,angle:(e.wobble||0)+i,age:0});
  }
  clearBoxInput();sliceRallies=[];enemies=[];milkBottles=[];milkDrops=[];peels=[];player.giantBoostUntil=0;
  for(const site of initialGiantSites())formGiant(site,true);
  noticeLife=0;$('notice').textContent='';syncMusic();updateHUD();
}
function giantSiteBounds(){
  const s=characterScale();
  // Keep the assembled head and the full idle shield orbit inside the camera.
  return {left:Math.max(-arenaSize+150*s,player.x-W/2+150*s),right:Math.min(arenaSize-150*s,player.x+W/2-150*s),top:Math.max(-arenaSize+150*s,player.y+(170*s-H*.52)/.72),bottom:Math.min(arenaSize-150*s,player.y+(H*.48-100*s)/.72)};
}
function initialGiantSites(){
  const s=characterScale(),offset=Math.min(290,W*.28),preferred=[{x:player.x-offset,y:player.y},{x:player.x+offset,y:player.y}];
  const world={left:-arenaSize+150*s,right:arenaSize-150*s,top:-arenaSize+150*s,bottom:arenaSize-150*s};
  const safe=p=>dist(p,player)>=giantRules.entranceSafety*s;
  const separated=(a,b)=>dist(a,b)>=giantRules.entranceSeparation*s;
  const choose=b=>{
    if(b.left>b.right||b.top>b.bottom)return null;
    const inside=p=>p.x>=b.left&&p.x<=b.right&&p.y>=b.top&&p.y<=b.bottom;
    if(preferred.every(p=>inside(p)&&safe(p))&&separated(...preferred))return preferred;
    const candidates=preferred.filter(p=>inside(p)&&safe(p));
    for(let x=0;x<=10;x++)for(let y=0;y<=10;y++){
      const p={x:b.left+(b.right-b.left)*x/10,y:b.top+(b.bottom-b.top)*y/10};
      if(safe(p))candidates.push(p);
    }
    let pair=null,best=Infinity;
    for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
      const a=candidates[i],b=candidates[j];if(!separated(a,b))continue;
      const forward=dist(a,preferred[0])+dist(b,preferred[1]),reverse=dist(b,preferred[0])+dist(a,preferred[1]),score=Math.min(forward,reverse);
      if(score<best){best=score;pair=forward<=reverse?[a,b]:[b,a];}
    }
    return pair;
  };
  // Prefer the full head/orbit on screen. At tight corners, retain safe spacing
  // before visual margins; never clamp a giant back into the player's space.
  const visible={left:Math.max(world.left,player.x-W/2),right:Math.min(world.right,player.x+W/2),top:Math.max(world.top,player.y-H*.52/.72),bottom:Math.min(world.bottom,player.y+H*.48/.72)};
  return choose(giantSiteBounds())||choose(visible)||choose(world);
}
function giantSite(){
  const {left,right,top,bottom}=giantSiteBounds(),giants=liveGiants();
  const candidates=[{x:left,y:top},{x:right,y:top},{x:left,y:bottom},{x:right,y:bottom}];
  // With at most two existing giants, a maximin point is a corner or the
  // intersection of their perpendicular bisector with a viewport edge.
  for(let i=0;i<giants.length;i++)for(let j=i+1;j<giants.length;j++){
    const a=giants[i],b=giants[j],dx=2*(b.x-a.x),dy=2*(b.y-a.y),c=b.x*b.x+b.y*b.y-a.x*a.x-a.y*a.y;
    if(Math.abs(dy)>1e-9)for(const x of [left,right]){const y=(c-dx*x)/dy;if(y>=top&&y<=bottom)candidates.push({x,y});}
    if(Math.abs(dx)>1e-9)for(const y of [top,bottom]){const x=(c-dy*y)/dx;if(x>=left&&x<=right)candidates.push({x,y});}
  }
  const separation=p=>Math.min(...giants.map(g=>dist(g,p)));
  return candidates.reduce((best,p)=>separation(p)>separation(best)?p:best,candidates[0]);
}
function giantPads(g){
  const radius=giantPadRadius(g)*characterScale(),u=g.attackPhase==='return'?boxEase(g.attackTime/giantRules.attackReturn):0,origin=g.jumpLaunch&&giantBodyScattered(g)?{x:g.jumpLaunch.x+(g.x-g.jumpLaunch.x)*u,y:g.jumpLaunch.y+(g.y-g.jumpLaunch.y)*u}:g;
  return Array.from({length:4},(_,i)=>{const angle=g.angle+i*TAU/4;return {x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius,index:i};});
}
function giantPadRadius(g){
  const phase=g.attackPhase,time=g.attackTime||0;
  if(phase==='out')return giantRules.orbitRadius+(giantRules.attackRadius-giantRules.orbitRadius)*clamp(time/giantRules.attackOut,0,1);
  if(phase==='return')return giantRules.attackRadius+(giantRules.orbitRadius-giantRules.attackRadius)*boxEase(time/giantRules.attackReturn);
  return giantRules.orbitRadius;
}
function giantBodyPose(g){
  if(g.attackPhase!=='out')return {x:g.x,y:g.y,z:0};
  const t=g.attackTime||0,launch=g.jumpLaunch||g,landing=g.jumpLanding||g,height=H+220*characterScale();
  if(t<.55)return {x:launch.x,y:launch.y,z:height*boxEase(t/.55)};
  return {x:landing.x,y:landing.y,z:t<1?height:height*(1-Math.pow(clamp((t-1)/(giantRules.attackOut-1),0,1),2))};
}
function giantBodyParts(g){
  if(g.forming){const f=giantBattle?.formations.find(f=>f.g===g);if(f)return f.parts.filter(p=>p.index<3&&p.index>=3-g.hp).map(part=>({...giantPartPose(f,part),head:part.index===2}));}
  const s=characterScale(),p=giantBodyPose(g);
  return Array.from({length:g.hp},(_,i)=>({...p,z:p.z+i*giantRules.headStep*s,head:i===g.hp-1}));
}
function giantLandingRole(g){
  const ranked=liveGiants().filter(other=>!other.forming).sort((a,b)=>b.hp-a.hp||a.id-b.id);
  return ranked[0]===g?'chase':ranked[ranked.length-1]===g?'retreat':'random';
}
function beginGiantSkyDrop(g){
  const b=giantSiteBounds();g.jumpLaunch={x:g.x,y:g.y};g.landingRole=giantLandingRole(g);
  if(g.landingRole==='chase')g.jumpLanding={x:player.x,y:player.y};
  else if(g.landingRole==='retreat'){
    const corners=[{x:b.left,y:b.top},{x:b.right,y:b.top},{x:b.left,y:b.bottom},{x:b.right,y:b.bottom}];
    g.jumpLanding=corners.reduce((best,p)=>dist(p,player)>dist(best,player)?p:best,corners[0]);
  }else g.jumpLanding={x:b.left+gameRandom()*(b.right-b.left),y:b.top+gameRandom()*(b.bottom-b.top)};
}
function giantBodyScattered(g){return g.attackPhase==='out'||g.attackPhase==='return';}
function updateGiantAttack(g,dt){
  g.padSweeps=[];g.landingImpact=false;let remaining=dt;
  const phases=['idle','charge','out','return','recover'],durations={idle:giantRules.attackIdle,charge:giantRules.attackCharge,out:giantRules.attackOut,return:giantRules.attackReturn,recover:giantRules.attackRecover};
  g.attackPhase||='idle';g.attackTime||=0;
  while(remaining>1e-9){
    const phase=g.attackPhase,step=Math.min(remaining,durations[phase]-g.attackTime,.025),before=phase==='out'?giantPads(g):null;
    const spin=phase==='charge'?giantRules.orbitSpeed+(giantRules.chargeSpin-giantRules.orbitSpeed)*(g.attackTime+step*.5)/giantRules.attackCharge:phase==='out'||phase==='return'?giantRules.flightSpin:giantRules.orbitSpeed;
    g.angle=(g.angle+spin*step)%TAU;g.attackTime+=step;remaining-=step;
    if(before){const after=giantPads(g);for(let i=0;i<4;i++)g.padSweeps.push({ax:before[i].x,ay:before[i].y,bx:after[i].x,by:after[i].y});}
    if(g.attackTime>=durations[phase]-1e-9){g.attackPhase=phases[(phases.indexOf(phase)+1)%phases.length];g.attackTime=0;if(g.attackPhase==='charge')sfx('ritualCharge');if(g.attackPhase==='out'){beginGiantSkyDrop(g);sfx('whoosh');}if(phase==='out'){if(g.jumpLanding){g.x=g.jumpLanding.x;g.y=g.jumpLanding.y;}g.landingImpact=true;sfx('bossSlam');}if(g.attackPhase==='recover'){g.jumpLaunch=null;g.jumpLanding=null;}}
  }
}
function giantHeadHeight(g){return (g.hp*giantRules.headStep+giantRules.headExtra)*characterScale();}
function formGiant(site=null,initial=false,bodyCount=giantRules.hp){
  if(!giantBattle||liveGiants().length>=giantRules.max)return false;
  site||=giantSite();const g={id:serial++,x:site.x,y:site.y,hp:bodyCount,angle:0,hit:0,forming:true,attackPhase:'idle',attackTime:0,padSweeps:[]};
  giantBattle.giants.push(g);
  const parts=Array.from({length:bodyCount+4},(_,i)=>({x:site.x,y:site.y,index:i+3-bodyCount}));
  giantBattle.formations.push({g,time:0,parts,initial,bodyCount});
  sfx('ritualCharge');return true;
}
function updateGiantEjections(dt){
  for(const piece of giantBattle.ejections){
    piece.time=Math.min(giantRules.ejectDuration,piece.time+dt);
    if(piece.time<giantRules.ejectDuration||piece.released)continue;
    piece.released=true;
    for(let i=0;i<3;i++){
      const angle=piece.angle+i*TAU/3,child=spawn(0,'slice',{x:clamp(piece.bx+Math.cos(angle)*34.5,-arenaSize+35,arenaSize-35),y:clamp(piece.by+Math.sin(angle)*34.5,-arenaSize+35,arenaSize-35)});
      if(special)special.hits.add(child.id);
      child.hit=.6;child.knock=.55;child.kx=Math.cos(angle)*360;child.ky=Math.sin(angle)*360;
    }
    burst(piece.bx,piece.by,'#e6c56e',12);sfx('peel');
  }
  giantBattle.ejections=giantBattle.ejections.filter(p=>!p.released);
}
function supplyGiantPiece(){
  const wounded=liveGiants().filter(g=>!g.forming&&g.hp<giantRules.hp).sort((a,b)=>a.hp-b.hp)[0];
  if(wounded){giantBattle.supplies.push({g:wounded,time:0});sfx('ritualCharge');}
  else if(liveGiants().length<giantRules.max)formGiant(null,false,1);
}
function updateGiantSupplies(dt){
  for(const piece of giantBattle.supplies){
    piece.time=Math.min(1,piece.time+dt);
    if(piece.time>=1&&piece.g.hp>0){piece.g.hp=Math.min(giantRules.hp,piece.g.hp+1);piece.g.refillUntil=giantBattle.clock+.7;burst(piece.g.x,piece.g.y,'#e6c56e',8);sfx('bossSlam');}
  }
  giantBattle.supplies=giantBattle.supplies.filter(p=>p.time<1&&p.g.hp>0);
}
function updateGiantBattle(dt){
  if(!giantBattle)return;
  const battle=giantBattle;battle.clock+=dt;
  for(const p of battle.fallen)p.age+=dt;
  updateGiantEjections(dt);updateGiantSupplies(dt);
  for(const g of liveGiants()){
    g.hit=Math.max(0,g.hit-dt);
    if(g.forming)continue;
    updateGiantAttack(g,dt);
    const dx=player.x-g.x,dy=player.y-g.y,d=Math.hypot(dx,dy)||1;
    if(['idle','recover'].includes(g.attackPhase)&&d>240*characterScale()&&(player.giantBoostUntil||0)<battle.clock){const step=Math.min(d-240*characterScale(),giantRules.speed*dt);g.x+=dx/d*step;g.y+=dy/d*step;}
  }
  for(const form of battle.formations){
    form.time=Math.min(giantRules.ceremony,form.time+dt);
    if(form.time>=giantRules.ceremony){form.g.forming=false;sfx('bossSlam');}
  }
  battle.formations=battle.formations.filter(form=>form.g.forming&&form.g.hp>0);
  if(!liveGiants().length&&!battle.formations.length){if(!battle.ejections.length)finish(true);return;}
  if(battle.clock>=battle.nextAt){
    battle.nextAt+=giantRules.interval;
    supplyGiantPiece();
  }
}
function hitGiant(g,isStomp=true){
  if(!giantBattle||isGiantEntrance()||g.hp<=0||g.hit>0||(isStomp&&(g.forming||isGiantCeremony()||giantBodyScattered(g)||(player.giantBoostUntil||0)<=giantBattle.clock)))return false;
  const body=giantBodyPose(g),head=giantHeadHeight(g)+body.z,angle=Math.atan2(g.y-player.y,g.x-player.x);
  g.hp--;g.hit=.9;if(isStomp){giantBattle.taught=true;player.giantBoostUntil=0;}
  giantBattle.ejections.push({x:body.x,y:body.y,z:head,bx:clamp(body.x+Math.cos(angle)*160,-arenaSize+60,arenaSize-60),by:clamp(body.y+Math.sin(angle)*160,-arenaSize+60,arenaSize-60),angle,time:0,released:false});
  if(isStomp){bounceFromStomp(g,head);stats.stompHits++;charge=Math.min(100,charge+20);}
  shake=.08;sfx(isStomp?'stomp':'hit');burst(g.x,g.y,'#f4d584',14);
  if(g.hp===0){kills++;if(isStomp)stats.stompKills++;}
  texts.push({x:body.x,y:body.y,z:head+20*characterScale(),text:'命中！',life:.65});
  return true;
}
function giantPadVelocity(g,p){
  const a=g.angle+p.index*TAU/4,s=characterScale(),r=giantPadRadius(g)*s,phase=g.attackPhase;
  const omega=phase==='charge'?giantRules.orbitSpeed+(giantRules.chargeSpin-giantRules.orbitSpeed)*g.attackTime/giantRules.attackCharge:phase==='out'||phase==='return'?giantRules.flightSpin:giantRules.orbitSpeed;
  const u=clamp((g.attackTime||0)/giantRules.attackReturn,0,1),radial=phase==='out'?(giantRules.attackRadius-giantRules.orbitRadius)*s/giantRules.attackOut:phase==='return'?(giantRules.orbitRadius-giantRules.attackRadius)*s*6*u*(1-u)/giantRules.attackReturn:0;
  return {x:Math.cos(a)*radial-Math.sin(a)*r*omega,y:Math.sin(a)*radial+Math.cos(a)*r*omega};
}
function giantWallsActive(g){return !g.forming&&g.attackPhase!=='out'&&g.attackPhase!=='return';}
function giantWallContacts(g){
  if(!giantWallsActive(g))return;
  const s=characterScale(),boosted=(player.giantBoostUntil||0)>giantBattle.clock;
  if(player.z>giantRules.wallHeight*s)return;
  const pads=giantPads(g);
  // The launch platform is the safe opening into the wall. A fresh boost lets
  // the player clear its adjoining endpoints before reaching the wall top.
  if((boosted||player.z>=(giantRules.padHeight-6)*s)&&pads.some(p=>dist(player,p)<(giantRules.padRadius+18)*s))return;
  for(let i=0;i<4;i++){
    const a=pads[i],b=pads[(i+1)%4];
    if(segmentDistance(player,a.x,a.y,b.x,b.y)<(giantRules.wallRadius+15)*s){hurt('碰到巨人電牆！先踩護盾彈高');return;}
  }
}
function inGiantHeadLanding(g){
  const s=characterScale(),dx=(player.x-g.x)/(giantRules.headRadius*s),dy=(player.y-g.y+giantRules.headBackOffset*s)/(giantRules.headDepth*s);
  return dx*dx+dy*dy<=1;
}
function resolveGiantLanding(before,after){
  if(!giantBattle||special||player.down>0||player.vz>=0)return false;
  const scale=characterScale();
  for(const g of liveGiants()){
    if(g.forming||giantBodyScattered(g))continue;
    const height=giantHeadHeight(g);
    if(before>=height&&after<=height&&inGiantHeadLanding(g)&&hitGiant(g))return true;
  }
  const height=giantRules.padHeight*scale;
  if(before<height||after>height)return false;
  const options=liveGiants().filter(g=>!g.forming).flatMap(g=>giantPads(g).map(p=>({...p,g}))).filter(p=>dist(player,p)<=giantRules.padRadius*scale).sort((a,b)=>dist(player,a)-dist(player,b));
  if(!options.length)return false;
  const velocity=giantPadVelocity(options[0].g,options[0]),speed=Math.hypot(velocity.x,velocity.y)*giantRules.padDriftFactor,ratio=Math.min(1,giantRules.padDriftMax*scale/(speed||1));
  player.padDriftX=velocity.x*giantRules.padDriftFactor*ratio;player.padDriftY=velocity.y*giantRules.padDriftFactor*ratio;
  player.z=height;player.vz=giantRules.boost;player.jumpLock=.1;player.giantBoostUntil=giantBattle.clock+giantRules.boostWindow;
  player.inv=Math.max(player.inv,.3);player.stompGuard=player.inv;sfx('jump');burst(options[0].x,options[0].y,'#e8d695',6);
  return true;
}
function giantContacts(){
  if(!giantBattle||isGiantCeremony())return;
  const s=characterScale();
  for(const g of liveGiants()){
    if(g.forming||g.hit>0)continue;
    giantWallContacts(g);
    if(!giantBodyScattered(g)&&dist(player,g)<giantRules.bodyRadius*s&&player.z<giantHeadHeight(g)-10*s)hurt('碰到香蕉片巨人');
    if(g.landingImpact){if(dist(player,g)<(giantRules.bodyRadius+15)*s&&player.z<60*s)hurt('被空降巨人壓中');g.landingImpact=false;}
    if(g.attackPhase==='out')for(const p of giantBodyParts(g))if(dist(player,p)<(giantRules.bodyRadius+12)*s&&player.z>=p.z-15*s&&player.z<p.z+60*s)hurt('碰到空降巨人本體');
    if(g.attackPhase==='out')for(const sweep of g.padSweeps||[])if(player.z<(giantRules.padHeight+14)*s&&segmentDistance(player,sweep.ax,sweep.ay,sweep.bx,sweep.by)<(giantRules.padRadius+12)*s)hurt('被螺旋蕉片盾擊中');
    if(g.attackPhase!=='return')for(const p of giantPads(g))if(dist(player,p)<(giantRules.padRadius+12)*s&&player.z<(giantRules.padHeight-6)*s)hurt(g.attackPhase==='out'?'被螺旋蕉片盾擊中':'碰到旋轉蕉片！先跳上去');
  }
}
function drawGiantSlice(sprite,width,height,x,y,z=0,alpha=1){
  const p=screen(x,y,z),s=characterScale();ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(sprite,p.x-width*s/2,p.y-height*s,width*s,height*s);ctx.restore();
}
function drawGiantGround(){
  if(!giantBattle)return;
  for(const piece of giantBattle.fallen){
    if(!isInView(piece,60))continue;
    const p=screen(piece.x,piece.y),s=characterScale(),fall=Math.max(0,1-piece.age/.5);
    ctx.save();ctx.translate(p.x,p.y-fall*10);ctx.rotate(piece.angle*.12);ctx.globalAlpha=.8;ctx.drawImage(giantDullSprite||renderSprite(giantBodySprite),-22*s,-23*s,44*s,29*s);ctx.restore();
  }
  for(const g of liveGiants()){
    if(g.forming)continue;
    if(g.attackPhase==='out'&&g.jumpLanding){
      const q=screen(g.jumpLanding.x,g.jumpLanding.y),s=characterScale(),u=clamp(g.attackTime/giantRules.attackOut,0,1);
      ctx.save();ellipse(q.x,q.y,58*s,22*s,`rgba(14,12,10,${.25+u*.4})`);ctx.strokeStyle='#30271fb3';ctx.lineWidth=2*s;ctx.beginPath();ctx.ellipse(q.x,q.y,65*s,25*s,0,0,TAU);ctx.stroke();ctx.restore();
    }
    const p=screen(g.x,g.y),s=characterScale();ctx.save();
    const glow=ctx.createRadialGradient(p.x,p.y-38*s,12*s,p.x,p.y-38*s,132*s);glow.addColorStop(0,'#e5ce7f1b');glow.addColorStop(1,'#e5ce7f00');ctx.fillStyle=glow;ctx.fillRect(p.x-140*s,p.y-175*s,280*s,280*s);
    ellipse(p.x,p.y+5*s,63*s,17*s,'#30291833');
    if(g.attackPhase==='charge'){
      ctx.strokeStyle='#e4cb8f99';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y-giantRules.padHeight*s,giantRules.orbitRadius*s,giantRules.orbitRadius*s*.72,0,-Math.PI/2,-Math.PI/2+TAU*g.attackTime/giantRules.attackCharge);ctx.stroke();
    }
    if(g.attackPhase==='out'){
      ctx.strokeStyle='#dcb87166';ctx.lineWidth=3*s;
      for(const pad of giantPads(g)){const angle=g.angle+pad.index*TAU/4,r=giantPadRadius(g)*s,tail=screen(g.x+Math.cos(angle-.15)*(r-18*s),g.y+Math.sin(angle-.15)*(r-18*s),giantRules.padHeight*s),tip=screen(pad.x,pad.y,giantRules.padHeight*s);ctx.beginPath();ctx.moveTo(tail.x,tail.y);ctx.lineTo(tip.x,tip.y);ctx.stroke();}
    }
    ctx.restore();
  }
}
function drawGiantActor(g){
  const scale=characterScale(),alpha=g.hit>0?.72:1;
  for(let i=0;i<g.hp-1;i++)drawGiantSlice(renderSprite(giantBodySprite),100,66,g.x,g.y,i*giantRules.headStep*scale,alpha);
  drawGiantSlice(renderSprite(giantHeadSprite),108,101,g.x,g.y,(g.hp-1)*giantRules.headStep*scale,alpha);
  const p=screen(g.x,g.y,giantHeadHeight(g)+23*scale);
  ctx.save();for(let i=0;i<giantRules.hp;i++)ellipse(p.x+(i-1)*11*scale,p.y,3*scale,3*scale,i<g.hp?'#e9c66c':'#756744');ctx.restore();
}
function isGiantNameEntrance(){return !!giantBattle&&giantBattle.clock>=giantRules.ceremony&&giantBattle.clock<giantRules.ceremony+bossNameDuration;}
function isGiantEntrance(){return !!giantBattle&&giantBattle.clock<giantRules.ceremony+bossNameDuration;}
function updateGiantEntrance(dt){
  if(!isGiantEntrance())return;
  const assemblyStep=Math.min(dt,Math.max(0,giantRules.ceremony-giantBattle.clock));
  if(assemblyStep>0)updateGiantBattle(assemblyStep);
  const titleStep=dt-assemblyStep;
  if(titleStep>0)giantBattle.clock=Math.min(giantRules.ceremony+bossNameDuration,giantBattle.clock+titleStep);
  if(!isGiantEntrance()){clearBoxInput();special=null;player.z=0;player.vz=0;player.down=0;player.recoil=0;player.inv=Math.max(player.inv,giantRules.entranceInv);player.stompGuard=player.inv;}
  updateHUD();
}
function giantHintActive(){return !!giantBattle&&!isGiantCeremony()&&!isGiantNameEntrance()&&giantBattle.clock<giantBattle.hintUntil;}
function giantHintPads(){
  if(!giantHintActive())return [];
  return liveGiants().filter(g=>!g.forming).flatMap(g=>giantPads(g));
}
function giantHintOpacity(){return giantHintActive()?.15+.85*(.5+.5*Math.cos((giantBattle.clock-giantRules.ceremony-bossNameDuration)*TAU*2)):0;}
function drawGiantHints(){
  const s=characterScale(),alpha=giantHintOpacity();
  if(!alpha)return;
  ctx.save();ctx.globalAlpha=alpha;
  for(const pad of giantHintPads()){
    const p=screen(pad.x,pad.y,giantRules.padHeight*s);
    ellipse(p.x,p.y,37*s,18*s,'#f0d58c22','#f0d58cbb');
    ctx.beginPath();ctx.moveTo(p.x,p.y-45*s);ctx.lineTo(p.x+11*s,p.y-32*s);ctx.lineTo(p.x+4*s,p.y-32*s);ctx.lineTo(p.x+4*s,p.y-15*s);ctx.lineTo(p.x-4*s,p.y-15*s);ctx.lineTo(p.x-4*s,p.y-32*s);ctx.lineTo(p.x-11*s,p.y-32*s);ctx.closePath();
    ctx.fillStyle='#f2dc9c';ctx.strokeStyle='#665338';ctx.lineWidth=1.5*s;ctx.fill();ctx.stroke();
  }
  ctx.restore();
}
function drawGiantPad(g,p){
  const height=giantRules.padHeight*characterScale();
  drawGiantSlice(renderSprite(giantBodySprite),96,63,p.x,p.y,height-48*characterScale(),g.attackPhase==='return'?.45:1);
}
function addGiantActors(actors){
  if(!giantBattle)return;
  for(const g of liveGiants()){
    if(g.forming)continue;
    actors.push({y:g.y-giantRules.orbitRadius*characterScale()*.5,draw:()=>drawGiantWalls(g)});
    if(giantBodyScattered(g)){
      for(const p of giantBodyParts(g))actors.push({y:p.y,draw:()=>drawGiantSlice(renderSprite(p.head?giantHeadSprite:giantBodySprite),p.head?108:100,p.head?101:66,p.x,p.y,p.z,g.hit>0?.72:1)});
    }else actors.push({y:g.y,draw:()=>drawGiantActor(g)});
    for(const p of giantPads(g))actors.push({y:p.y,draw:()=>drawGiantPad(g,p)});
  }
}
function drawGiantWalls(g){
  if(!giantWallsActive(g))return;
  const pads=giantPads(g),s=characterScale(),height=giantRules.wallHeight*s;
  ctx.save();
  for(let i=0;i<4;i++){
    const a=pads[i],b=pads[(i+1)%4],baseA=screen(a.x,a.y,giantRules.padHeight*s),baseB=screen(b.x,b.y,giantRules.padHeight*s),topA=screen(a.x,a.y,height),topB=screen(b.x,b.y,height);
    const glow=ctx.createLinearGradient(0,Math.min(topA.y,topB.y),0,Math.max(baseA.y,baseB.y));
    glow.addColorStop(0,'#c9efce88');glow.addColorStop(.45,'#9edec04d');glow.addColorStop(1,'#a8e4c877');
    ctx.fillStyle=glow;ctx.strokeStyle='#c3edcfaa';ctx.lineWidth=1.5*s;
    // Each pair of neighbouring pads supports one uninterrupted light plane.
    ctx.beginPath();ctx.moveTo(baseA.x,baseA.y);ctx.lineTo(baseB.x,baseB.y);ctx.lineTo(topB.x,topB.y);ctx.lineTo(topA.x,topA.y);ctx.closePath();ctx.fill();ctx.stroke();
  }
  ctx.restore();
}
function giantPartPose(formation,part){
  const g=formation.g,t=formation.time,i=part.index,s=characterScale();
  const fall=clamp((t-i*.045)/.8,0,1),u=boxEase((t-1.2)/1.7),target=i<3?g:giantPads(g)[i-3];
  return {x:part.x+(target.x-part.x)*u,y:part.y+(target.y-part.y)*u,z:(1-fall*fall)*Math.min(420,H*.8)+(i<3?(i-3+g.hp)*34*s:(giantRules.padHeight-48)*s)*u+Math.sin(u*Math.PI)*45};
}
function drawGiantSupplyGlow(g,u,healed=false){
  const s=characterScale(),base=screen(g.x,g.y),top=screen(g.x,g.y,giantHeadHeight(g)+(healed?90:280)*s),fade=healed?1-u:.45+u*.3,width=(healed?42:29)*s;
  ctx.save();ctx.globalAlpha=fade;
  const beam=ctx.createLinearGradient(0,top.y,0,base.y);beam.addColorStop(0,'#b9e6b000');beam.addColorStop(.5,'#b9e6b033');beam.addColorStop(1,'#e4d79d66');
  ctx.fillStyle=beam;ctx.fillRect(base.x-width,top.y,width*2,base.y-top.y);
  ctx.strokeStyle='#c5e3acbb';ctx.lineWidth=2*s;
  for(let i=0;i<4;i++){
    const x=base.x+(i-1.5)*16*s,y=top.y+((u*2+i/4)%1)*(base.y-top.y);
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+Math.min(23*s,(base.y-top.y)*.15));ctx.stroke();
  }
  const r=(healed?42+u*35:40)*s;
  ctx.beginPath();ctx.ellipse(base.x,base.y+3*s,r,r*.3,0,0,TAU);ctx.stroke();
  ctx.restore();
}
function giantFormationBeamPose(form){
  const fade=1-boxEase((form.time-1.2)/.7);
  return {progress:boxEase(form.time/.35),alpha:.55*fade};
}
function drawGiantFormationBeam(form){
  const pose=giantFormationBeamPose(form);if(pose.alpha<=0)return;
  const s=characterScale(),base=screen(form.g.x,form.g.y),top=-60,bottom=top+(base.y+8*s-top)*pose.progress,width=68*s;
  ctx.save();ctx.globalAlpha=pose.alpha;
  const glow=ctx.createLinearGradient(base.x-width,0,base.x+width,0);glow.addColorStop(0,'#ffe7a000');glow.addColorStop(.3,'#fff0bd55');glow.addColorStop(.5,'#fff7d6aa');glow.addColorStop(.7,'#fff0bd55');glow.addColorStop(1,'#ffe7a000');ctx.fillStyle=glow;ctx.fillRect(base.x-width,top,width*2,Math.max(0,bottom-top));
  ctx.strokeStyle='#fff1baaa';ctx.lineWidth=2*s;
  for(let i=0;i<5;i++){const x=base.x+(i-2)*22*s,y=top+((form.time*1.8+i/5)%1)*(bottom-top);ctx.beginPath();ctx.moveTo(x,Math.max(top,y-24*s));ctx.lineTo(x,y);ctx.stroke();}
  ellipse(base.x,bottom,width*.8,12*s,'#ffe9ab44');
  if(pose.progress>=1)ellipse(base.x,base.y+5*s,width,18*s,'#ffe5a122','#ebd09188');
  ctx.restore();
}
function drawGiantEffects(){
  if(!giantBattle)return;
  const scale=characterScale();
  for(const g of liveGiants())if(g.refillUntil>giantBattle.clock)drawGiantSupplyGlow(g,1-(g.refillUntil-giantBattle.clock)/.7,true);
  for(const formation of giantBattle.formations){
    drawGiantFormationBeam(formation);
    const parts=formation.parts.map(part=>({part,p:giantPartPose(formation,part)})).sort((a,b)=>a.p.y-b.p.y||((a.part.index<3?1:0)-(b.part.index<3?1:0))||a.part.index-b.part.index);
    for(const {part,p} of parts){
      const i=part.index;
      if(i<3&&i<3-formation.g.hp)continue;
      if(formation.bodyCount===1&&i>=3&&formation.time<1.2)continue;
      drawGiantSlice(renderSprite(i===2?giantHeadSprite:giantBodySprite),i<3?100:96,i===2?94:i<3?62:63,p.x,p.y,p.z);
    }
  }
  for(const piece of giantBattle.supplies){
    const g=piece.g,u=piece.time;
    drawGiantSupplyGlow(g,u);
    drawGiantSlice(renderSprite(giantBodySprite),96,62,g.x,g.y,giantHeadHeight(g)+(1-u*u)*Math.min(420,H*.8));
  }
  for(const piece of giantBattle.ejections){
    const u=piece.time/giantRules.ejectDuration,x=piece.x+(piece.bx-piece.x)*u,y=piece.y+(piece.by-piece.y)*u,z=piece.z*(1-u)+Math.sin(u*Math.PI)*65;
    drawGiantSlice(renderSprite(giantBodySprite),96*(1-u*.25),62*(1-u*.25),x,y,z);
  }
  drawGiantHints();

}

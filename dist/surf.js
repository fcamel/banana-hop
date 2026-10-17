'use strict';
let surfStock=0,surfPickups=[],nextSurfAt=15,greenSurfKills=0,surfFlights=[];
function resetSurf(){
  surfStock=0;surfPickups=[];greenSurfKills=0;surfFlights=[];
  nextSurfAt=15+Math.max(0,Math.ceil((elapsed-15)/30))*30;
}
function spawnSurfPickup(point=null){
  if(!point){
    const candidates=[];
    for(let i=0;i<24;i++){
      const angle=i*TAU/24,radius=Math.min(W*.3,H*.3/.72);
      const p={x:clamp(player.x+Math.cos(angle)*radius,-arenaSize+55,arenaSize-55),y:clamp(player.y+Math.sin(angle)*radius,-arenaSize+55,arenaSize-55)};
      const clearance=Math.min(300,...enemies.filter(e=>e.hp>0).map(e=>dist(p,e)),...(boss?[boss,...bossClones].map(e=>dist(p,e)):[]));
      const spacing=Math.min(250,...surfPickups.map(item=>dist(p,item)));
      candidates.push({...p,score:clearance+spacing*.6});
    }
    point=candidates.sort((a,b)=>b.score-a.score)[0];
  }
  surfPickups.push({id:serial++,x:clamp(point.x,-arenaSize+35,arenaSize-35),y:clamp(point.y,-arenaSize+35,arenaSize-35),age:0});
  burst(point.x,point.y,'#a8ded2',8);
}
function updateSurfHUD(){
  const surfing=special?.mode==='surf'&&!isBossWorldFrozen()&&state==='playing';
  $('surfGauge').hidden=!surfing;
  if(surfing){
    const remaining=Math.max(0,special.duration-special.t);
    $('surfGauge').style.top=`${H*.52-110*characterScale()-30}px`;
    $('surfGauge').setAttribute('aria-valuenow',remaining.toFixed(2));
    $('surfGauge').setAttribute('aria-valuetext',`衝浪剩餘 ${remaining.toFixed(1)} 秒`);
    $('surfTime').textContent=`${remaining.toFixed(1)}s`;
    $('surfFuel').style.width=`${remaining/4*100}%`;
    if(special.feedFlash>0)$('surfGauge').classList.add('refilling');else $('surfGauge').classList.remove('refilling');
  }
  $('surfCount').textContent=`×${surfStock}`;
  $('surfUse').disabled=surfStock===0||!!special||state!=='playing'||isBossWorldFrozen();
  $('surfUse').setAttribute('aria-label',`蕉皮衝浪，剩餘 ${surfStock} 個，最多 3 個，K 鍵使用`);
}
function activateSurf(){
  if(state!=='playing'||isBossWorldFrozen()||special||surfStock<=0)return false;
  const dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+stick.x;
  const dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+stick.y;
  const angle=Math.hypot(dx,dy)>.1?Math.atan2(dy,dx):player.face;
  surfStock--;stats.surfs++;special={mode:'surf',t:0,duration:2,feedFlash:0,dx:Math.cos(angle),dy:Math.sin(angle),speed:420,hits:new Set(),trail:[],nextSound:.15};
  player.down=0;player.recoil=0;player.vz=0;player.z=0;player.face=angle;
  notify('蕉皮衝浪！移動轉向 · 吃蕉皮延長');sfx('ultimate');updateHUD();return true;
}
function steerSurf(s,mx,my,dt){
  if(Math.hypot(mx,my)<=.1)return;
  const target=Math.atan2(my,mx),current=Math.atan2(s.dy,s.dx);
  const delta=Math.atan2(Math.sin(target-current),Math.cos(target-current)),angle=current+delta*(1-Math.exp(-5*dt));
  s.dx=Math.cos(angle);s.dy=Math.sin(angle);
}
function feedSurf(s,ax,ay){
  let eaten=0;
  peels=peels.filter(p=>{
    if(p.ritual||p.summonWave||segmentDistance(p,ax,ay,player.x,player.y)>(26+(p.large||p.red?16:0))*characterScale())return true;
    eaten++;return false;
  });
  if(eaten){
    stats.surfPeels+=eaten;
    const before=s.duration;s.duration=Math.min(4,s.duration+eaten*.2);s.feedFlash=.45;
    const gain=s.duration-before;
    burst(player.x,player.y,'#c7f4d7',Math.min(18,8+eaten*2));sfx('pickup');
    texts.push({x:player.x,y:player.y,z:155*characterScale(),text:gain>.001?`衝浪 +${gain.toFixed(1)}s`:'蕉皮吸收！',life:.65});
  }
}
function updateSurfItems(dt,path){
  if(!boss)while(nextSurfAt<gameDuration&&elapsed>=nextSurfAt){spawnSurfPickup();nextSurfAt+=30;}
  for(const flight of surfFlights)flight.t+=dt;surfFlights=surfFlights.filter(flight=>flight.t<.45);
  for(const item of surfPickups)item.age+=dt;
  collectSurfPickups(path);
}
function collectSurfPickups(path=null){
  for(const item of surfPickups){
    if(surfStock<3&&!item.collected&&crossesPickup(item,path)){surfStock++;item.collected=true;const from=screen(item.x,item.y),button=$('surfUse').getBoundingClientRect(),arena=canvas.getBoundingClientRect();surfFlights.push({x:from.x,y:from.y,toX:button.left-arena.left+button.width/2,toY:button.top-arena.top+button.height/2,t:0});sfx('pickup');notify(`蕉皮滑板 +1 · ${surfStock} / 3`);}
  }
  surfPickups=surfPickups.filter(item=>!item.collected);
}
function drawSurfPickup(item){
  if(!isInView(item,65))return;
  const p=screen(item.x,item.y),bob=Math.sin(item.age*3)*3;
  ctx.save();ctx.translate(p.x,p.y);ellipse(0,7,24,7,'#202c2866');ellipse(0,0,31,19,'#a6daca22','#a8d8c980');
  const sprite=renderSprite(surfItemSprite),width=64,height=width*sprite.height/sprite.width;
  ctx.drawImage(sprite,-width/2,-height-2+bob,width,height);ctx.restore();
}
function drawSurfIndicators(){
  for(const item of surfPickups){
    const marker=bunchIndicator(item);if(!marker)continue;
    ctx.save();ctx.translate(marker.x,marker.y);ellipse(0,0,17,17,'#23352fef','#98c6b5');
    const sprite=renderSprite(surfItemSprite),width=30,height=width*sprite.height/sprite.width;ctx.drawImage(sprite,-width/2,-height/2,width,height);
    ctx.rotate(marker.angle);ctx.beginPath();ctx.moveTo(29,0);ctx.lineTo(20,-6);ctx.lineTo(20,6);ctx.closePath();ctx.fillStyle='#a8d8c9';ctx.fill();ctx.restore();
  }
}
function drawSurfHero(){
  const sprite=renderSprite(heroSurfSprite),height=105,width=height*sprite.width/sprite.height;
  if(special.feedFlash>0){
    const progress=1-special.feedFlash/.45;
    ctx.save();ctx.globalAlpha=1-progress;ctx.lineWidth=3;ctx.strokeStyle='#b9f3d4';
    for(const offset of [0,12]){ctx.beginPath();ctx.ellipse(0,4,24+progress*42+offset,10+progress*17+offset*.4,0,0,TAU);ctx.stroke();}
    ctx.restore();
  }
  ctx.save();ctx.translate(0,Math.sin(special.t*8)*1.5);if(special.dx<-.05)ctx.scale(-1,1);
  ctx.drawImage(sprite,-width*.5,-height+13,width,height);ctx.restore();
}

function drawSurfFlights(){
  const sprite=renderSprite(surfItemSprite);
  for(const flight of surfFlights){const t=clamp(flight.t/.45,0,1),ease=1-(1-t)*(1-t),width=38*(1-t*.45),height=width*sprite.height/sprite.width;ctx.save();ctx.globalAlpha=1-t*.4;ctx.drawImage(sprite,flight.x+(flight.toX-flight.x)*ease-width/2,flight.y+(flight.toY-flight.y)*ease-height/2,width,height);ctx.restore();}
}

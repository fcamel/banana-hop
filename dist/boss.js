'use strict';
let boss=null,bossElapsed=0,bossShots=[];
const bossMusicBuffers=new Map();
function bossRadius(){return Math.min(W,H/.72)*.34;}
function startBossBattle(debug=false){
  if(boss)return;
  for(const e of enemies){if(e.hp>0)peels.push({id:serial++,x:e.x,y:e.y,age:0,large:isLargeBanana(e)});}
  enemies=[];durianWarnings=[];bossShots=[];bossElapsed=0;special=null;
  player.z=0;player.vz=0;player.down=0;player.inv=Math.max(player.inv,2.5);combo=0;comboLife=0;
  resize();
  const offset=Math.min(140,Math.max(0,(H*.52-190*characterScale()-95)/.72));
  const side=offset<60?(player.x>0?-1:1)*Math.min(180,W*.25):0;
  boss={x:clamp(player.x+side,-arenaSize+130,arenaSize-130),y:clamp(player.y-offset,-arenaSize+130,arenaSize-130),hp:5,phase:'entrance',time:2,move:0,hit:0,facing:1};
  if(debug){for(let i=0;i<8;i++){const a=i*TAU/8;peels.push({id:serial++,x:boss.x+Math.cos(a)*bossRadius()*.7,y:boss.y+Math.sin(a)*bossRadius()*.7,age:.6});}}
  $('finalCountdown').hidden=true;notify('腐蕉法師現身！跳踩五次擊敗它');sfx('warning');syncMusic();updateHUD();
}
function beginBossMove(){
  const moves=['sea-aim','revive','fire-aim'];boss.phase=moves[boss.move++%moves.length];
  boss.time=boss.phase==='revive'?3:1;
  if(boss.phase==='fire-aim')boss.aim=Math.atan2(player.y-boss.y,player.x-boss.x);
  if(boss.phase==='revive'){
    boss.radius=bossRadius();boss.revivePeels=peels.filter(p=>dist(p,boss)<=boss.radius).sort((a,b)=>dist(a,boss)-dist(b,boss)).slice(0,6);
    const count=3+Math.floor(Math.random()*4);boss.summonPoints=[];
    for(let i=0;i<count;i++){
      const a=i*TAU/count+Math.random()*.35,r=boss.radius*(.55+Math.random()*.4);
      let point={x:clamp(boss.x+Math.cos(a)*r,-arenaSize+40,arenaSize-40),y:clamp(boss.y+Math.sin(a)*r,-arenaSize+40,arenaSize-40)};
      if(dist(point,player)<65*characterScale()){const angle=Math.atan2(point.y-player.y,point.x-player.x);point={x:clamp(player.x+Math.cos(angle)*90,-arenaSize+40,arenaSize-40),y:clamp(player.y+Math.sin(angle)*90,-arenaSize+40,arenaSize-40)};}
      boss.summonPoints.push(point);
    }
  }
  sfx('warning');
}
function bossSummon(point){
  if(enemies.length>=110)return false;
  const e=spawn(0,'normal',point);e.hp=1;e.color=bananaColor(e);e.speed=65;e.rise=.6;e.hit=.6;burst(e.x,e.y,'#b8d889',8);return true;
}
function releaseBossRevival(){
  for(const point of boss.summonPoints||[])bossSummon(point);
  for(const p of boss.revivePeels||[]){const index=peels.indexOf(p);if(index>=0&&bossSummon(p))peels.splice(index,1);}
  sfx('bossCast');boss.phase='rest';boss.time=1.2;
}
function releaseBossSeaWave(index){
  const count=[8,12,16][index],target=bossRadius()*(.75+index*.45),start=40*characterScale();
  for(let i=0;i<count;i++){
    const a=(i+(index%2)*.5)*TAU/count;
    peels.push({id:serial++,x:clamp(boss.x+Math.cos(a)*start,-arenaSize+20,arenaSize-20),y:clamp(boss.y+Math.sin(a)*start,-arenaSize+20,arenaSize-20),age:.6,bossWave:{dx:Math.cos(a),dy:Math.sin(a),remaining:Math.max(0,target-start)}});
  }
  shake=.12;sfx('bossSlam');
}
function moveBossPeel(p,dt){
  if(!p.bossWave)return false;
  const wave=p.bossWave,travel=Math.min(wave.remaining,280*dt);wave.remaining-=travel;
  p.x=clamp(p.x+wave.dx*travel,-arenaSize+20,arenaSize-20);p.y=clamp(p.y+wave.dy*travel,-arenaSize+20,arenaSize-20);
  if(wave.remaining<=0)delete p.bossWave;
  return true;
}
function releaseBossFire(){
  for(const spread of [-.3,0,.3]){const a=boss.aim+spread;bossShots.push({x:boss.x,y:boss.y-5,vx:Math.cos(a)*215,vy:Math.sin(a)*215,life:5});}
  sfx('bossCast');boss.phase='rest';boss.time=1.4;
}
function tryStompBoss(){
  if(!boss||boss.hp<=0||boss.hit>0||boss.phase==='entrance'||dist(player,boss)>56*characterScale())return false;
  boss.hp--;boss.hit=1.25;boss.phase='stunned';boss.time=1.25;
  const a=dist(player,boss)>1?Math.atan2(player.y-boss.y,player.x-boss.x):Math.PI/2;
  player.z=0;player.vz=0;player.down=.45;player.downPose='hurt';player.slipX=Math.cos(a)*520*characterScale();player.slipY=Math.sin(a)*520*characterScale();player.inv=Math.max(player.inv,1);player.slipCooldown=1;
  combo=0;comboLife=0;stats.stompHits++;stats.maxCombo=Math.max(stats.maxCombo,1);charge=Math.min(100,charge+20);
  burst(boss.x,boss.y,'#e2d38a',22);shake=.18;sfx('stomp');
  if(boss.hp<=0){kills++;stats.stompKills++;bossShots=[];finish(true);}
  else if(boss.hp===1)syncMusic();
  updateHUD();return true;
}
function updateBoss(dt){
  if(!boss)return;
  bossElapsed+=dt;boss.hit=Math.max(0,boss.hit-dt);boss.time-=dt;
  if(boss.phase==='rest'){
    const d=dist(player,boss),travel=Math.min(Math.max(0,d-125*characterScale()),38*dt);
    if(d>0){boss.x+=(player.x-boss.x)/d*travel;boss.y+=(player.y-boss.y)/d*travel;}
  }
  if(Math.abs(player.x-boss.x)>30)boss.facing=player.x>=boss.x?1:-1;
  if(boss.phase==='sea'){
    boss.waveClock-=dt;
    while(boss.waveClock<=0&&boss.waves<3){releaseBossSeaWave(boss.waves++);boss.waveClock+=.3;}
  }
  if(boss.time<=0){
    if(['entrance','rest','stunned'].includes(boss.phase))beginBossMove();
    else if(boss.phase==='sea-aim'){boss.phase='sea';boss.time=1;boss.waves=0;boss.waveClock=0;}
    else if(boss.phase==='sea'){boss.phase='rest';boss.time=1;}
    else if(boss.phase==='revive')releaseBossRevival();
    else if(boss.phase==='fire-aim')releaseBossFire();
  }
  for(const shot of bossShots){
    const oldX=shot.x,oldY=shot.y;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.life-=dt;
    if(segmentDistance(player,oldX,oldY,shot.x,shot.y)<(14+15*characterScale())&&!special&&player.inv<=0){hurt('被鬼火擊中');shot.life=0;}
  }
  bossShots=bossShots.filter(p=>p.life>0&&Math.abs(p.x)<arenaSize+50&&Math.abs(p.y)<arenaSize+50);
  if(boss.phase!=='entrance'&&boss.hit<=0&&!special&&player.z<25&&dist(player,boss)<40*characterScale())hurt('撞到腐蕉法師');
}
function drawBossGround(){
  if(!boss)return;
  const p=screen(boss.x,boss.y);
  if(boss.phase==='revive'){
    const radius=boss.radius,progress=clamp(1-boss.time/3,0,1);
    ellipse(p.x,p.y,radius,radius*.72,'#8ac86b18','#a6d37a');
    ctx.save();ctx.setLineDash([7,9]);ctx.lineWidth=2;ellipse(p.x,p.y,radius*progress,radius*.72*progress,null,'#c3dc8e99');ctx.restore();
    for(const point of [...boss.summonPoints,...boss.revivePeels.filter(item=>peels.includes(item))]){const s=screen(point.x,point.y);ellipse(s.x,s.y,17+progress*5,8+progress*4,'#aed88c44','#c7df9a');}
  }
  if(boss.phase==='sea-aim'){const radius=bossRadius()*.75;ellipse(p.x,p.y,radius,radius*.72,'#d7be6822','#d7be68');}
  if(boss.phase==='fire-aim'){ellipse(p.x,p.y-70*characterScale(),18,18,'#b5db7b55','#d4ed9d');}
}
function drawBossActor(){
  const p=screen(boss.x,boss.y),scale=characterScale(),height=190,width=height*bossSprite.naturalWidth/bossSprite.naturalHeight;
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(scale,scale);ellipse(0,8,45,13,'#20271d66');
  ctx.translate(0,Math.sin(bossElapsed*3)*2);if(boss.hp<=0){ctx.rotate(.7);ctx.globalAlpha=.3;}else if(boss.hit>0)ctx.globalAlpha=.65+.25*Math.sin(bossElapsed*25);
  ctx.drawImage(bossSprite,-width/2,-height+12,width,height);ctx.restore();
}
function drawBossShots(){
  for(const shot of bossShots){const p=screen(shot.x,shot.y,20);ctx.save();const glow=ctx.createRadialGradient(p.x,p.y,3,p.x,p.y,25);glow.addColorStop(0,'#f0f5ad');glow.addColorStop(.35,'#b8dc79dd');glow.addColorStop(1,'#8ec56400');ellipse(p.x,p.y,25,25,glow);ellipse(p.x,p.y,9,11,'#d9ed9f');ctx.restore();}
}
function updateBossHUD(){
  $('bossHud').hidden=!boss;$('gameClock').hidden=!!boss;
  if(!boss)return;
  if($('bossBananas').dataset?.hp!==String(boss.hp)){
    $('bossBananas').innerHTML=Array.from({length:5},(_,i)=>`<span class="health-banana ${i<boss.hp?'filled':'empty'}" aria-hidden="true"><svg viewBox="0 0 34 32"><path d="M7 3C1 14 7 31 23 29C31 28 34 19 32 11C26 21 15 17 13 4Z"/><path class="banana-seam" d="M8 8C7 21 20 28 29 20"/><path class="banana-tip" d="M7 2L13 3L13 7L7 6Z"/></svg></span>`).join('');
    if($('bossBananas').dataset)$('bossBananas').dataset.hp=String(boss.hp);
    $('bossBananas').setAttribute('aria-label',`魔王生命 ${boss.hp} / 5`);
  }
  $('bossAction').textContent=({'entrance':'腐蕉法師現身','sea-aim':'蕉皮海','sea':'蕉皮海','revive':'蕉皮復生','fire-aim':'三連鬼火','stunned':'命中！','rest':'腐蕉法師'})[boss.phase]||'腐蕉法師';
}
function createBossMusicBuffer(context,climax=false){
  const rate=22050,length=rate*30,buffer=context.createBuffer(1,length,rate),data=buffer.getChannelData(0),step=30/128;
  function note(at,midi,duration,volume,voice){const f=440*Math.pow(2,(midi-69)/12),start=Math.round(at*rate);for(let i=0;i<duration*rate;i++){const t=i/rate,p=t/duration,a=TAU*f*t,attack=Math.min(1,t/.007),envelope=attack*Math.pow(1-p,voice==='organ'?1.5:3);const wave=voice==='organ'?.55*Math.sin(a)+.25*Math.sin(2*a)+.12*Math.sin(4*a):voice==='wood'?.8*Math.sin(a)+.2*Math.sin(a*2.76):.8*Math.sin(a)+.2*Math.sin(2*a);data[(start+i)%length]+=wave*envelope*volume;}}
  function drum(at,kick,volume){const start=Math.round(at*rate),duration=kick?.15:.08;let seed=777;for(let i=0;i<duration*rate;i++){const t=i/rate,p=t/duration;seed=(seed*1664525+1013904223)>>>0;const wave=kick?Math.sin(TAU*(45*t+28*.025*(1-Math.exp(-t/.025)))):seed/2147483648-1;data[(start+i)%length]+=wave*Math.min(1,t/.003)*Math.pow(1-p,3)*volume;}}
  const roots=[45,41,43,40],melody=[69,72,76,75,72,71,68,69];
  for(let bar=0;bar<16;bar++){
    const at=bar*8*step,root=roots[Math.floor(bar/2)%4];
    for(const [i,offset] of [[0,0],[3,12],[4,7],[7,10]])note(at+i*step,root+offset,step*.8,.065,'bass');
    for(const i of [1,5])for(const interval of [0,3,7])note(at+i*step,root+12+interval,step*.65,.018,'organ');
    for(let i=0;i<8;i++){if(i===0||i===4)drum(at+i*step,true,.08);if(i===2||i===6)drum(at+i*step,false,.03);if(i%2===0||climax)drum(at+(i+.5)*step,false,.006);}
    for(const i of climax?[0,1,2,3]:[0,2])note(at+(i*2+.5)*step,melody[(bar+i)%8],step*1.3,.022,'wood');
  }
  return buffer;
}
function currentBossMusicBuffer(){
  const key=boss.hp===1?'final':'normal',cached=bossMusicBuffers.get(key);
  if(cached?.context===audioCtx)return cached.buffer;
  const buffer=createBossMusicBuffer(audioCtx,key==='final');bossMusicBuffers.set(key,{context:audioCtx,buffer});return buffer;
}

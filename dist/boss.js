'use strict';
let boss=null,bossElapsed=0,bossShots=[];
const bossMusicBuffers=new Map();
const bossMaxHp=10,bossFireDodgeHeight=58;
function bossFirePattern(){
  if(boss.hp<=2)return {count:9,rows:5,gap:.24,aim:1,rest:.5,extra:3};
  if(boss.hp<=4)return {count:7,rows:3,gap:.3,aim:1,rest:.75,extra:2};
  if(boss.hp<=7)return {count:5,rows:2,gap:.4,aim:1,rest:1,extra:1};
  return {count:3,rows:1,gap:.4,aim:1,rest:1.4,extra:0};
}
function bossRadius(){return Math.min(W,H/.72)*.34;}
function isBossEntrance(){return !!boss&&['entrance','entrance-pose','entrance-banner'].includes(boss.phase);}
function startBossBattle(debug=false){
  if(boss)return;
  bossShots=[];bossElapsed=0;keys.clear();stick.x=stick.y=0;$('knob').style.transform='';
  noticeLife=0;$('notice').textContent='';shake=0;
  resize();
  const offset=Math.min(140,Math.max(0,(H*.52-190*characterScale()-95)/.72));
  const side=offset<60?(player.x>0?-1:1)*Math.min(180,W*.25):0;
  boss={x:clamp(player.x+side,-arenaSize+130,arenaSize-130),y:clamp(player.y-offset,-arenaSize+130,arenaSize-130),hp:bossMaxHp,phase:'entrance',time:3,move:0,hit:0,facing:1};
  if(debug){for(let i=0;i<8;i++){const a=i*TAU/8;peels.push({id:serial++,x:boss.x+Math.cos(a)*bossRadius()*.7,y:boss.y+Math.sin(a)*bossRadius()*.7,age:.6});}}
  $('finalCountdown').hidden=true;sfx('warning');syncMusic();updateHUD();
}
// The world update is suspended until all three entrance stages have finished.
function updateBossEntrance(dt){
  let remaining=dt;
  while(isBossEntrance()&&remaining>0){
    const step=Math.min(remaining,Math.max(0,boss.time));boss.time=Math.max(0,boss.time-step);bossElapsed+=step;remaining-=step;
    if(boss.time>1e-8)break;
    if(boss.phase==='entrance'){
      boss.transformed=enemies.filter(e=>e.hp>0).map(e=>({x:e.x,y:e.y}));
      for(const e of enemies){if(e.hp>0)peels.push({id:serial++,x:e.x,y:e.y,age:.6,large:isLargeBanana(e)});}
      enemies=[];durianWarnings=[];boss.phase='entrance-pose';boss.time=1;sfx('bossCast');
    }else if(boss.phase==='entrance-pose'){
      boss.phase='entrance-banner';boss.time=.9;sfx('start');
    }else{
      boss.transformed=[];special=null;player.z=0;player.vz=0;player.down=0;player.recoil=0;
      player.inv=Math.max(player.inv,2.5);player.slipCooldown=Math.max(player.slipCooldown,.5);combo=0;comboLife=0;
      keys.clear();stick.x=stick.y=0;$('knob').style.transform='';beginBossMove();
    }
  }
  updateHUD();
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
function beginBossMove(){
  const pattern=bossFirePattern(),moves=['sea-aim','revive','fire-aim',...Array(pattern.extra).fill('fire-aim')];boss.phase=moves[boss.move++%moves.length];
  boss.time=boss.phase==='revive'?3:boss.phase==='fire-aim'?pattern.aim:1;
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
function releaseBossFireRow(){
  const pattern=boss.firePattern;
  for(let i=0;i<pattern.count;i++){
    const a=boss.aim+(i-(pattern.count-1)/2)*.22;
    bossShots.push({x:boss.x,y:boss.y-5,vx:Math.cos(a)*215,vy:Math.sin(a)*215,life:5});
  }
  boss.fireRows--;sfx('bossCast');
}
function releaseBossFire(){
  boss.firePattern=bossFirePattern();boss.fireRows=boss.firePattern.rows;boss.fireClock=boss.firePattern.gap;
  releaseBossFireRow();boss.phase='fire';boss.time=(boss.firePattern.rows-1)*boss.firePattern.gap+boss.firePattern.rest;
}
function tryStompBoss(){
  if(!boss||boss.hp<=0||boss.hit>0||isBossEntrance()||dist(player,boss)>56*characterScale())return false;
  boss.hp--;boss.hit=4;boss.phase='stunned';boss.time=.65;boss.fireRows=0;
  const a=dist(player,boss)>1?Math.atan2(player.y-boss.y,player.x-boss.x):Math.PI/2;
  boss.knock=.4;boss.kx=-Math.cos(a)*260*characterScale();boss.ky=-Math.sin(a)*260*characterScale();
  player.z=43;player.vz=200;player.down=0;player.recoil=.7;player.recoilX=Math.cos(a)*420*characterScale();player.recoilY=Math.sin(a)*420*characterScale();player.inv=Math.max(player.inv,1);player.slipCooldown=1;
  combo=0;comboLife=0;stats.stompHits++;stats.maxCombo=Math.max(stats.maxCombo,1);charge=Math.min(100,charge+20);
  burst(boss.x,boss.y,'#e2d38a',22);shake=.18;sfx('stomp');
  if(boss.hp<=0){kills++;stats.stompKills++;bossShots=[];finish(true);}
  else if(boss.hp===1)syncMusic();
  updateHUD();return true;
}
function updateBoss(dt){
  if(!boss)return;
  if(isBossEntrance()){updateBossEntrance(dt);return;}
  bossElapsed+=dt;boss.hit=Math.max(0,boss.hit-dt);boss.time-=dt;
  if(boss.knock>0){
    const step=Math.min(dt,boss.knock);boss.knock-=step;
    boss.x=clamp(boss.x+boss.kx*step,-arenaSize+130,arenaSize-130);boss.y=clamp(boss.y+boss.ky*step,-arenaSize+130,arenaSize-130);
  }else if(boss.phase==='rest'){
    const d=dist(player,boss),travel=Math.min(Math.max(0,d-125*characterScale()),38*dt);
    if(d>0){boss.x+=(player.x-boss.x)/d*travel;boss.y+=(player.y-boss.y)/d*travel;}
  }
  if(Math.abs(player.x-boss.x)>30)boss.facing=player.x>=boss.x?1:-1;
  if(boss.phase==='sea'){
    boss.waveClock-=dt;
    while(boss.waveClock<=0&&boss.waves<3){releaseBossSeaWave(boss.waves++);boss.waveClock+=.3;}
  }
  if(boss.phase==='fire'&&boss.fireRows>0){
    boss.fireClock-=dt;
    while(boss.fireClock<=0&&boss.fireRows>0){releaseBossFireRow();boss.fireClock+=boss.firePattern.gap;}
  }
  if(boss.time<=0){
    if(['entrance','rest','stunned'].includes(boss.phase))beginBossMove();
    else if(boss.phase==='sea-aim'){boss.phase='sea';boss.time=1;boss.waves=0;boss.waveClock=0;}
    else if(boss.phase==='sea'){boss.phase='rest';boss.time=1;}
    else if(boss.phase==='revive')releaseBossRevival();
    else if(boss.phase==='fire-aim')releaseBossFire();
    else if(boss.phase==='fire'){boss.phase='rest';boss.time=.2;}
  }
  for(const shot of bossShots){
    const oldX=shot.x,oldY=shot.y;shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.life-=dt;
    if(player.z<bossFireDodgeHeight&&segmentDistance(player,oldX,oldY,shot.x,shot.y)<(14+15*characterScale())&&!special&&player.inv<=0){hurt('被鬼火擊中');shot.life=0;}
  }
  bossShots=bossShots.filter(p=>p.life>0&&Math.abs(p.x)<arenaSize+50&&Math.abs(p.y)<arenaSize+50);
  if(boss.phase!=='entrance'&&boss.hit<=0&&!special&&player.z<25&&dist(player,boss)<40*characterScale())hurt('撞到腐蕉法師');
}
function drawBossGround(){
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
  if(boss.phase==='fire-aim')drawBossFireAim(p);
}
function drawBossFireAim(p){
  const scale=characterScale(),progress=clamp(1-boss.time,0,1),radius=145*scale,spread=(bossFirePattern().count-1)*.11+.12;
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(1,.72);ctx.rotate(boss.aim);
  ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,radius,-spread,spread);ctx.closePath();
  ctx.fillStyle=`rgba(155,201,109,${.09+progress*.12})`;ctx.fill();ctx.strokeStyle='#b5d68a99';ctx.lineWidth=2;ctx.stroke();
  ctx.beginPath();ctx.moveTo(radius-18,-8);ctx.lineTo(radius,0);ctx.lineTo(radius-18,8);ctx.stroke();ctx.restore();
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(1,.72);ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(0,0,56*scale,-Math.PI/2,-Math.PI/2+TAU*progress);ctx.strokeStyle='#d1e89b';ctx.stroke();ctx.restore();
}
function drawBossFireCharge(p,scale){
  const progress=clamp(1-boss.time,0,1),x=p.x+46*scale,y=p.y-120*scale,radius=(30+progress*21)*scale;
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
function drawBossActor(){
  if(!isInView(boss,300))return;
  const p=screen(boss.x,boss.y),scale=characterScale(),height=190,width=height*bossSprite.naturalWidth/bossSprite.naturalHeight;
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(scale,scale);ellipse(0,8,45,13,'#20271d66');
  if(isBossEntrance()){
    const progress=boss.phase==='entrance'?clamp(1-boss.time/3,0,1):1;
    ctx.beginPath();ctx.rect(-width,-height-50,width*2,height+62);ctx.clip();
    ctx.translate(0,height*(1-progress));
    if(boss.phase!=='entrance'){ctx.translate(0,-5);ctx.rotate(-.045);ctx.scale(1.04,1.04);}
  }else ctx.translate(0,Math.sin(bossElapsed*3)*2);
  if(boss.hp<=0){ctx.rotate(.7);ctx.globalAlpha=.3;}else if(boss.hit>0)ctx.globalAlpha=.65+.25*Math.sin(bossElapsed*25);
  ctx.drawImage(renderSprite(bossSprite),-width/2,-height+12,width,height);ctx.restore();
  if(boss.phase==='fire-aim')drawBossFireCharge(p,scale);
}
function drawBossShots(){
  for(const shot of bossShots){if(!isInView(shot,40,20))continue;const p=screen(shot.x,shot.y,20);ctx.save();const glow=ctx.createRadialGradient(p.x,p.y,3,p.x,p.y,25);glow.addColorStop(0,'#f0f5ad');glow.addColorStop(.35,'#b8dc79dd');glow.addColorStop(1,'#8ec56400');ellipse(p.x,p.y,25,25,glow);ellipse(p.x,p.y,9,11,'#d9ed9f');ctx.restore();}
}
function updateBossHUD(){
  const banner=boss?.phase==='entrance-banner';$('bossBanner').hidden=!banner;
  if(banner){const progress=clamp(1-boss.time/.9,0,1);$('bossBanner').style.opacity=String(Math.min(1,progress*8,(1-progress)*6));$('bossBanner').style.transform=`translateY(${(1-Math.min(1,progress*6))*12}px)`;}
  $('bossHud').hidden=!boss;$('gameClock').hidden=!!boss;
  if(!boss)return;
  if($('bossBananas').dataset?.hp!==String(boss.hp)){
    $('bossBananas').innerHTML=Array.from({length:bossMaxHp},(_,i)=>`<span class="health-banana ${i<boss.hp?'filled':'empty'}" aria-hidden="true"><svg viewBox="0 0 34 32"><path d="M7 3C1 14 7 31 23 29C31 28 34 19 32 11C26 21 15 17 13 4Z"/><path class="banana-seam" d="M8 8C7 21 20 28 29 20"/><path class="banana-tip" d="M7 2L13 3L13 7L7 6Z"/></svg></span>`).join('');
    if($('bossBananas').dataset)$('bossBananas').dataset.hp=String(boss.hp);
    $('bossBananas').setAttribute('aria-label',`魔王生命 ${boss.hp} / ${bossMaxHp}`);
  }
  $('bossAction').textContent=({'entrance':'腐蕉法師現身','entrance-pose':'萬蕉歸皮','entrance-banner':'準備開戰','sea-aim':'蕉皮海','sea':'蕉皮海','revive':'蕉皮復生','fire-aim':'鬼火蓄力','fire':'連發鬼火','stunned':'命中！','rest':'腐蕉法師'})[boss.phase]||'腐蕉法師';
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
  const key=boss.hp===1?'final':'normal',cached=bossMusicBuffers.get(key);
  if(cached?.context===audioCtx)return cached.buffer;
  const buffer=preparedMusicBuffer(`boss:${key}`,audioCtx,()=>createBossMusicBuffer(audioCtx,key==='final'));bossMusicBuffers.set(key,{context:audioCtx,buffer});return buffer;
}

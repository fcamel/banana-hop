'use strict';
let boxSequence=null;
const boxRules={entranceDuration:2.4,dropDuration:1.3/1.5,launchDelay:.55,jumpDuration:.75};
const boxEase=u=>{u=clamp(u,0,1);return u*u*(3-2*u);};
function resetBoxState(){boxSequence=null;}
function populateRound(){
  for(let i=0;i<(milkStage?2:7);i++){const radius=180+gameRandom()*180;if(milkStage)spawnSliceStack(radius);else spawn(radius);}
  if(milkStage)spawnMilkPair();
  trackBattlePeaks();
}
function clearBoxInput(){clearMilkJetInput();keys.clear();stick.x=stick.y=0;stickPointer=null;$('knob').style.transform='';}
function startBoxEntrance(){
  boxSequence={kind:'entrance',time:0,x:player.x,y:player.y,impact:false};
  clearBoxInput();noticeLife=0;$('notice').textContent='';syncMusic();
}
function entrancePose(sequence){
  const t=sequence.time,land=boxRules.dropDuration,launch=land+boxRules.launchDelay,flight=Math.max(0,t-launch),u=clamp(flight/boxRules.jumpDuration,0,1);
  return {drop:(1-clamp(t/land,0,1)**2)*Math.min(440,H*.8),open:t>=land+.12?1:0,
    hero:'standing',heroAlpha:t>=launch?1:0,heroY:70*(1-boxEase(u/.3)),heroZ:u===0||u===1?0:Math.sin(u*Math.PI)*84,
    beamCover:boxEase((t-land)/.1)*(1-boxEase((t-land-.3)/.25)),beamRise:boxEase((t-land)/.16),beamAlpha:t<land||t>=launch?0:1-boxEase((t-land-.3)/.25),

    stretch:1,caseAlpha:1-boxEase((t-(launch+boxRules.jumpDuration))/.23),entry:0};
}
function updateBoxSequence(dt){
  if(!boxSequence||state!=='playing'||mobilePlayBlocked)return;
  const sequence=boxSequence,previous=sequence.time;
  const duration=boxRules.entranceDuration;
  sequence.time=Math.min(duration,previous+dt);
  if(!sequence.impact&&sequence.time>=boxRules.dropDuration){sequence.impact=true;sfx('bossSlam');shake=.08;burst(sequence.x,sequence.y,'#c2b28c',9);}
  // Cosmetic dust ages while the world itself remains frozen.
  for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z=Math.max(0,p.z+p.vz*dt);p.vz-=380*dt;}
  particles=particles.filter(p=>p.life>0);shake=Math.max(0,shake-dt);
  if(sequence.time<duration)return;
  boxSequence=null;clearBoxInput();player.z=0;player.vz=0;player.jumpLock=0;
  populateRound();notify(milkStage?'搶牛奶瓶！別讓香蕉片先入瓶':'跳踩集氣 · 撐過 120 秒');
  syncMusic();updateHUD();
}
function drawBoxPart(sprite,width,height,x=0,y=0){ctx.drawImage(renderSprite(sprite),x-width/2,y-height/2,width,height);}
function drawBoxEntrance(sequence){
  const pose=entrancePose(sequence),p=screen(sequence.x,sequence.y),s=characterScale();
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(s,s);
  const grounded=1-Math.min(1,pose.drop/440);
  ctx.save();ctx.globalAlpha=pose.caseAlpha*(1-pose.beamCover);ellipse(0,7,28+grounded*56,7+grounded*12,'#332c2444');
  if(!pose.open)drawBoxPart(caseClosedSprite,174,80,0,-22-pose.drop);
  else drawBoxPart(caseBaseSprite,174,80,0,-22);
  ctx.restore();
  if(pose.beamAlpha>0){
    const height=(H/s+120)*pose.beamRise,base=22,top=base-height;
    ctx.save();ctx.globalAlpha=pose.beamAlpha;
    const glow=ctx.createLinearGradient(-125,0,125,0);glow.addColorStop(0,'#fff1a000');glow.addColorStop(.1,'#fff0ab55');glow.addColorStop(.16,'#fff0b5bb');glow.addColorStop(.5,'#fff3c5cc');glow.addColorStop(.84,'#fff0b5bb');glow.addColorStop(.9,'#fff0ab55');glow.addColorStop(1,'#fff1a000');
    ctx.fillStyle=glow;ctx.beginPath();ctx.moveTo(-125,base);ctx.lineTo(-115,top);ctx.lineTo(115,top);ctx.lineTo(125,base);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#fff3b866';ctx.lineWidth=2;
    for(let i=0;i<5;i++){const x=(i-2)*35,y=base-((sequence.time-boxRules.dropDuration)*700+i*47)%Math.max(1,height);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-35);ctx.stroke();}
    ellipse(0,8,111,24,'#f8e7a544','#fff0aa66');ctx.restore();
  }
  if(pose.heroAlpha){
    ctx.save();ctx.beginPath();ctx.rect(-120,-1000,240,975);if(pose.heroY>0)ctx.clip();
    drawHero(0,pose.heroY-pose.heroZ,1.12,player.face);ctx.restore();
    if(pose.heroY>0){ctx.save();ctx.globalAlpha=pose.caseAlpha;ctx.beginPath();ctx.rect(-90,-25,180,43);ctx.clip();drawBoxPart(caseBaseSprite,174,80,0,-22);ctx.restore();}
  }
  ctx.restore();
}
function drawBoxSequence(){drawBoxEntrance(boxSequence);}

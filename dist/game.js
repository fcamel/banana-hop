'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const $=id=>document.getElementById(id),TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let W=1000,H=600,dpr=1,state='loading',previous=0,elapsed=0,spawnClock=0,charge=0,kills=0,combo=0,comboLife=0,noticeLife=0,shake=0,sound=true,audioCtx,endElapsed=0,nextDurianAt=10,durianWarnings=[],nextChargerAt=20,nextThrowerAt=30;
let enemies=[],peels=[],particles=[],texts=[],special=null,player,keys=new Set(),stick={x:0,y:0},stickPointer=null,serial=0;
const arenaSize=1250,lastSfx=new Map(),gameDuration=120;
let debugUnlocked=false,debugCode='',invincibleMode=false;
let pickups=[],orbitPeels=[],nextPickupAt=17,nextBunchSide=0;
function freshStats(){return {maxCombo:0,stompKills:0,stompHits:0,dashes:0,bunches:0,surfs:0,maxEnemies:0,maxPeels:0,slips:0,surfPeels:0};}
let stats=freshStats();
function trackBattlePeaks(){
  let count=(boss?.hp>0?1+bossClones.length:0)+(giantBattle?liveGiants().length:0);
  for(const enemy of enemies)if(enemy.hp>0)count+=enemy.type==='slice'?(enemy.stackCount||1):1;
  stats.maxEnemies=Math.max(stats.maxEnemies,count);
  stats.maxPeels=Math.max(stats.maxPeels,peels.length);
}

const heroSprite=new Image(),heroSlipSprite=new Image(),heroHurtSprite=new Image(),durianSprite=new Image(),enemySprite=new Image(),groundSprite=new Image(),floorTile=new Image();
const bossSprite=new Image(),heroSurfSprite=new Image(),surfItemSprite=new Image(),sliceSprite=new Image(),milkBottleSprite=new Image(),giantBodySprite=new Image(),giantHeadSprite=new Image(),caseClosedSprite=new Image(),caseBaseSprite=new Image(),caseLidSprite=new Image(),heroCurledSprite=new Image(),heroRisingSprite=new Image(),heroStretchSprite=new Image();
const gameAssets=[
  {image:caseClosedSprite,src:'assets/banana-case-closed-v1.webp'},
  {image:caseBaseSprite,src:'assets/banana-case-base-v1.webp'},
  {image:caseLidSprite,src:'assets/banana-case-lid-v1.webp'},
  {image:heroCurledSprite,src:'assets/hero-curled-v1.webp'},
  {image:heroRisingSprite,src:'assets/hero-rising-v1.webp'},
  {image:heroStretchSprite,src:'assets/hero-stretch-v1.webp'},
  {image:giantBodySprite,src:'assets/giant-banana-body-v1.webp'},
  {image:giantHeadSprite,src:'assets/giant-banana-head-v1.webp'},
  {image:sliceSprite,src:'assets/enemy-banana-slice-v1.webp'},
  {image:milkBottleSprite,src:'assets/milk-bottle-v1.webp'},
  {image:heroSurfSprite,src:'assets/hero-surf-v1.webp'},
  {image:surfItemSprite,src:'assets/surfboard-v1.webp'},
  {image:bossSprite,src:'assets/boss-necromancer-v1.webp'},
  {image:heroSprite,src:'assets/hero-front-v1.webp'},
  {image:heroSlipSprite,src:'assets/hero-slip-v1.webp'},
  {image:heroHurtSprite,src:'assets/hero-hurt-v1.webp'},
  {image:durianSprite,src:'assets/durian-v1.webp'},
  {image:enemySprite,src:'assets/enemy-phantoms-v1.webp'},
  {image:groundSprite,src:'assets/ground-items-v1.webp'},
  {image:floorTile,src:'assets/floor-tile-v1.webp'}
];
let assetsReady=false,loadingPromise=null,assetLoadAttempt=0,mutedFloor=null;
function prepareFloorTile(){
  const surface=document.createElement('canvas');surface.width=floorTile.naturalWidth;surface.height=floorTile.naturalHeight;
  const brush=surface.getContext('2d');brush.filter='saturate(0.5) brightness(0.56)';brush.drawImage(floorTile,0,0);mutedFloor=surface;
}
// Downsample once at loading time, retaining enough pixels for DPR 2 and large enemies.
const renderSprites=new Map();
function prepareRenderSprites(){
  renderSprites.clear();
  const specs=[{image:caseClosedSprite,width:348},{image:caseBaseSprite,width:348},{image:caseLidSprite,width:348},{image:heroCurledSprite,width:244},{image:heroRisingSprite,height:156},{image:heroStretchSprite,height:224},{image:giantBodySprite,width:220},{image:giantHeadSprite,height:230},{image:sliceSprite,width:208},{image:milkBottleSprite,height:192},{image:heroSurfSprite,height:240},{image:surfItemSprite,width:160},{image:heroSprite,height:205},{image:heroSlipSprite,height:280},{image:heroHurtSprite,height:280},{image:durianSprite,width:192},{image:bossSprite,height:410},{image:enemySprite,columns:4,height:192,variants:[1,2]},{image:groundSprite,columns:3,height:256}];
  for(const spec of specs){
    const frames=new Map(),columns=spec.columns||1,sw=spec.image.naturalWidth/columns,sh=spec.image.naturalHeight;
    for(const variant of spec.variants||[1])for(let frame=0;frame<columns;frame++){
      const surface=document.createElement('canvas');surface.height=Math.ceil((spec.height||spec.width*sh/sw)*variant);surface.width=Math.ceil(surface.height*sw/sh);
      const brush=surface.getContext('2d');brush.imageSmoothingEnabled=true;brush.imageSmoothingQuality='high';brush.drawImage(spec.image,frame*sw,0,sw,sh,0,0,surface.width,surface.height);
      frames.set(`${frame}:${variant}`,surface);
    }
    renderSprites.set(spec.image,frames);
  }
  prepareBossFireSprite();prepareGiantArt();
}
function renderSprite(image,frame=0,variant=1){return renderSprites.get(image)?.get(`${frame}:${variant}`)||image;}
function isInView(point,margin=100,z=0){
  const x=W/2+point.x-player.x,y=H*.52+(point.y-player.y)*.72-z;
  return x>=-margin&&x<=W+margin&&y>=-margin&&y<=H+margin;
}
function loadGameImage(asset){
  return new Promise((resolve,reject)=>{
    const sprite=asset.image;let completed=false,decoding=false;
    const cleanup=()=>{clearTimeout(timer);sprite.onload=null;sprite.onerror=null;};
    const fail=()=>{if(completed)return;completed=true;cleanup();reject(new Error(asset.src));};
    const ready=()=>{
      if(completed||decoding)return;decoding=true;
      Promise.resolve().then(()=>sprite.decode?.()).then(()=>{
        if(completed)return;
        if(!sprite.naturalWidth){fail();return;}
        completed=true;cleanup();resolve();
      }).catch(fail);
    };
    const timer=setTimeout(fail,45000);sprite.onload=ready;sprite.onerror=fail;
    if(sprite.complete&&sprite.naturalWidth)ready();
    else sprite.src=asset.src+(assetLoadAttempt>1?'?retry='+assetLoadAttempt:'');
  });
}
function loadGameAssets(){
  if(assetsReady)return Promise.resolve(true);
  if(loadingPromise)return loadingPromise;
  state='loading';assetLoadAttempt++;$('loadingScreen').hidden=false;$('loadingRetry').hidden=true;$('overlay').hidden=true;$('start').disabled=true;
  $('loadingMessage').textContent='正在準備角色與場地…';$('loadingProgress').max=gameAssets.length;$('loadingProgress').value=0;$('loadingCount').textContent='0 / '+gameAssets.length;
  let loaded=0;
  loadingPromise=Promise.all(gameAssets.map(asset=>loadGameImage(asset).then(()=>{
    loaded++;$('loadingProgress').value=loaded;$('loadingCount').textContent=loaded+' / '+gameAssets.length;return true;
  },()=>false))).then(async results=>{
    if(results.some(ok=>!ok))throw new Error('Image loading failed');
    prepareFloorTile();prepareRenderSprites();$('loadingMessage').textContent='正在準備音樂…';await prepareMusicTracks();assetsReady=true;state='intro';$('modeOptions').hidden=false;keys.clear();$('start').disabled=false;$('overlay').hidden=false;$('loadingScreen').hidden=true;return true;
  }).catch(()=>{
    state='load-error';$('loadingMessage').textContent='圖片載入未完成，請檢查網路後重試。';$('loadingRetry').hidden=false;return false;
  }).finally(()=>{loadingPromise=null;});
  return loadingPromise;
}
function newPlayer(){return {x:0,y:0,z:0,vz:0,hp:5,inv:0,damageInv:0,down:0,recoil:0,stompGuard:0,recoilX:0,recoilY:0,padDriftX:0,padDriftY:0,stompLandingPending:false,downPose:'slip',slipX:0,slipY:0,slipCooldown:0,face:0,jumpLock:0};}
player=newPlayer();
function characterScale(){return window.matchMedia?.('(max-width: 650px), (pointer: coarse)').matches ? .7 : 1;}
function resize(){const b=canvas.getBoundingClientRect();W=b.width;H=b.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(resize).observe(canvas);
function unlockAudio(){if(!sound)return;try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});}catch{}}
// Shared output keeps both music and effects on the same loudness controls.
let audioOutput=null,volumeLevel=1,lastVolumeLevel=1;
function getAudioOutput(){
  if(audioOutput?.context===audioCtx)return audioOutput.input;
  const input=audioCtx.createGain(),output=audioCtx.createGain();input.gain.setValueAtTime(3,audioCtx.currentTime);
  output.gain.setValueAtTime(sound?volumeLevel:0,audioCtx.currentTime);output.connect(audioCtx.destination);
  if(typeof audioCtx.createDynamicsCompressor==='function'){
    const compressor=audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-12,audioCtx.currentTime);
    compressor.knee.setValueAtTime(12,audioCtx.currentTime);
    compressor.ratio.setValueAtTime(8,audioCtx.currentTime);
    compressor.attack.setValueAtTime(.003,audioCtx.currentTime);
    compressor.release.setValueAtTime(.15,audioCtx.currentTime);
    input.connect(compressor);compressor.connect(output);
    audioOutput={context:audioCtx,input,compressor,output};
  }else{input.connect(output);audioOutput={context:audioCtx,input,output};}
  return input;
}
function tone(freq=440,duration=.08,type='sine',volume=.035,delay=0,endFreq=freq*.6){
  if(!sound)return;unlockAudio();if(!audioCtx)return;
  try{const start=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,start);o.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),start+duration);g.gain.setValueAtTime(.001,start);g.gain.exponentialRampToValueAtTime(volume*3,start+.008);g.gain.exponentialRampToValueAtTime(.001,start+duration);o.connect(g);g.connect(getAudioOutput());o.start(start);o.stop(start+duration+.015);o.onended=()=>{o.disconnect();g.disconnect();};}catch{}
}
function sfx(name,pitch=1){
  if(!sound)return;unlockAudio();if(!audioCtx)return;const now=audioCtx.currentTime;if(now-(lastSfx.get(name)??-Infinity)<.04)return;lastSfx.set(name,now);
  if(name==='milkJet'){
    try{const duration=.16,buffer=audioCtx.createBuffer(1,Math.ceil(audioCtx.sampleRate*duration),audioCtx.sampleRate),data=buffer.getChannelData(0);
      let rumble=0;
      for(let i=0;i<data.length;i++){
        const t=now+i/audioCtx.sampleRate,noise=Math.random()*2-1;
        rumble=rumble*.97+noise*.03;
        const engine=.5*Math.sin(TAU*70*t)+.22*Math.sin(TAU*140*t)+.1*Math.sin(TAU*210*t);
        const thrust=.9+.1*Math.sin(TAU*23*t);
        data[i]=engine*thrust+rumble*.8+noise*.12;
      }
      const source=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter(),gain=audioCtx.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(950,now);
      gain.gain.setValueAtTime(.001,now);gain.gain.exponentialRampToValueAtTime(.11,now+.012);gain.gain.setValueAtTime(.11,now+.12);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
      source.connect(filter);filter.connect(gain);gain.connect(getAudioOutput());source.start(now);source.stop(now+duration);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    }catch{}return;
  }
  if(name==='pickup')[660,880,1100].forEach((f,i)=>tone(f,.16,'triangle',.03,i*.07,f));
  if(name==='ritualCharge'){tone(110,1.5,'triangle',.035,0,165);tone(165,1.3,'sine',.025,.15,290);}
  if(name==='bossCast'){tone(180,.3,'triangle',.025,0,360);tone(290,.25,'sine',.025,.1,140);}
  if(name==='bossSlam'){tone(85,.23,'triangle',.045,0,35);}
  if(name==='durianThrow'){tone(180,.11,'triangle',.045,0,620);tone(520,.25,'sine',.032,.07,100);tone(95,.09,'triangle',.035,.02,60);}
  if(name==='redDash')tone(900,.3,'sawtooth',.018,0,150);
  if(name==='jump')tone(230,.15,'sine',.04,0,520);
  if(name==='stomp'){tone(150,.08,'triangle',.055);tone(430*pitch,.12,'sine',.035,.025,620*pitch);}
  if(name==='peel'){tone(680,.09,'triangle',.025);tone(950,.1,'sine',.02,.06,400);}
  if(name==='slip'){tone(600,.28,'sine',.04,0,110);tone(160,.12,'triangle',.025,.2,70);}
  if(name==='hurt'){tone(120,.22,'sawtooth',.025,0,55);tone(180,.16,'triangle',.04,.035,65);}
  if(name==='charge'){[520,660,880].forEach((f,i)=>tone(f,.13,'sine',.035,i*.07,f));}
  if(name==='ultimate'){[260,390,520].forEach((f,i)=>tone(f,.2,'triangle',.04,i*.06,f*1.4));}
  if(name==='whoosh')tone(260,.12,'triangle',.018,0,340);
  if(name==='hit')tone(170,.07,'triangle',.022,0,90);
  if(name==='warning'){tone(740,.14,'square',.018,0,740);tone(520,.16,'square',.018,.2,520);}
  if(name==='start'){[330,440,660].forEach((f,i)=>tone(f,.14,'triangle',.03,i*.09,f));}
  if(name==='lose'){[330,260,195,130].forEach((f,i)=>tone(f,.25,'triangle',.03,i*.16,f*.85));}
  if(name==='win'){
    const melody=[[0,523.25,.12],[.14,659.25,.12],[.28,784,.22],[.56,659.25,.12],[.70,698.46,.12],[.84,880,.22],[1.12,784,.2],[1.36,1046.5,.5]];
    for(const [at,f,length] of melody)tone(f,length,'triangle',.025,at,f);
    for(const f of [261.63,329.63,392])tone(f,.5,'sine',.014,1.36,f);
    for(const at of [0,.28,.56,.84,1.12,1.36])tone(110,.075,'triangle',.018,at,65);
  }
}
// Fourteen bars at 112 BPM = exactly 30 seconds; note tails wrap across the seam.
let musicBuffer=null,musicSource=null,musicGain=null;
const musicTempoBuffers=new Map();
function createMusicBuffer(context,tempo=1){
  const rate=22050,duration=30/tempo,length=Math.round(rate*duration),buffer=context.createBuffer(1,length,rate),data=buffer.getChannelData(0),step=duration/112;
  const hz=n=>440*Math.pow(2,(n-69)/12);
  function note(at,midi,duration,volume,voice){
    const start=Math.round(at*rate),count=Math.ceil(duration*rate),frequency=hz(midi);
    for(let i=0;i<count;i++){
      const t=i/rate,p=t/duration,a=TAU*frequency*t;
      const envelope=Math.min(1,t/.006)*Math.pow(1-p,voice==='wood'?4:2);
      const wave=voice==='bass'?(Math.sin(a)+.25*Math.sin(a*2))*.8:voice==='wood'?(Math.sin(a)+.3*Math.sin(a*2.76))*.75:(Math.sin(a)+.18*Math.sin(a*2)+.12*Math.sin(a*3))*.75;
      data[(start+i)%length]+=wave*envelope*volume;
    }
  }
  function drum(at,kind,accent=1){
    const duration=kind==='kick'?.16:kind==='snare'?.1:.045,start=Math.round(at*rate);
    let seed=12345;
    for(let i=0;i<duration*rate;i++){
      const t=i/rate,p=t/duration;seed=(seed*1664525+1013904223)>>>0;const noise=seed/2147483648-1;
      const wave=kind==='kick'?Math.sin(TAU*(48*t+35*.025*(1-Math.exp(-t/.025)))):kind==='snare'?(noise*.65+Math.sin(TAU*170*t)*.35):noise*Math.sin(TAU*6200*t);
      data[(start+i)%length]+=wave*Math.min(1,t/.002)*Math.pow(1-p,3)*(kind==='kick'?.09:kind==='snare'?.035:.012)*accent;
    }
  }
  const roots=[45,45,50,50,43,43,45],bassSteps=[0,3,4,6],bassOffsets=[0,12,7,10];
  const melody=[76,null,79,81,null,79,76,null,74,null,76,null,79,null,74,null];
  for(let bar=0;bar<14;bar++){
    const root=roots[bar%7],at=bar*8*step;
    bassSteps.forEach((s,i)=>note(at+s*step,root+bassOffsets[i],step*(i===0?1.2:.7),.065,'bass'));
    for(let i=0;i<8;i++){drum(at+i*step,'hat',i%2?.65:1);if(i===0||i===4||i===7&&bar%2)drum(at+i*step,'kick');if(i===2||i===6)drum(at+i*step,'snare');}
    for(const off of [1,5])for(const interval of [0,3,7])note(at+off*step,root+24+interval,step*.55,.012,'keys');
    for(let i=0;i<4;i++){
      const n=melody[(bar%4)*4+i];
      if(n!==null)note(at+(i*2+.5)*step,n+(bar>=7?-12:0),step*1.5,.021,'wood');
    }
  }
  return buffer;
}
// Synthesize PCM while the loading screen is visible, without requiring audio playback permission.
const preparedMusic=new Map(),preparedAudioBuffers=new WeakMap();
let preparingMusic=null;
function prepareMusicTracks(){
  if(preparingMusic)return preparingMusic;
  const factory={createBuffer(_channels,length,rate){const data=new Float32Array(length);return {length,sampleRate:rate,duration:length/rate,getChannelData:()=>data};}};
  const jobs=[...[1,1.2,1.5,2].map(rate=>[`survival:${rate}`,()=>createMusicBuffer(factory,rate)]),['boss:normal',()=>createBossMusicBuffer(factory,false)],['boss:final',()=>createBossMusicBuffer(factory,true)]];
  preparingMusic=(async()=>{
    for(const [key,generate] of jobs){if(preparedMusic.has(key))continue;await new Promise(resolve=>setTimeout(resolve,0));preparedMusic.set(key,generate());}
  })().catch(error=>{preparingMusic=null;throw error;});
  return preparingMusic;
}
function preparedMusicBuffer(key,context,fallback){
  const pcm=preparedMusic.get(key);if(!pcm)return fallback();
  let buffers=preparedAudioBuffers.get(context);if(!buffers){buffers=new Map();preparedAudioBuffers.set(context,buffers);}
  if(!buffers.has(key)){const buffer=context.createBuffer(1,pcm.length,pcm.sampleRate);buffer.getChannelData(0).set(pcm.getChannelData(0));buffers.set(key,buffer);}
  return buffers.get(key);
}
function musicRate(time=elapsed){if(boss||giantBattle)return 1;return time>=roundDuration()-30?1.2:1;}
function musicOffset(time=elapsed){const threshold=roundDuration()-30;return (Math.min(time,threshold)+Math.max(0,time-threshold)*1.2)%30;}
function updateMusicRate(){if(musicSource)syncMusic();}
function currentMusicBuffer(){
  if(boss||giantBattle)return currentBossMusicBuffer();
  const tempo=musicRate();
  if(tempo===1)return musicBuffer ||= preparedMusicBuffer('survival:1',audioCtx,()=>createMusicBuffer(audioCtx));
  const cached=musicTempoBuffers.get(tempo);
  if(cached?.context===audioCtx)return cached.buffer;
  const buffer=preparedMusicBuffer(`survival:${tempo}`,audioCtx,()=>createMusicBuffer(audioCtx,tempo));musicTempoBuffers.set(tempo,{context:audioCtx,buffer});return buffer;
}
function syncMusic(){
  if(musicSource){try{musicGain.gain.setTargetAtTime(0,audioCtx.currentTime,.008);musicSource.stop(audioCtx.currentTime+.04);}catch{}musicSource=null;musicGain=null;}
  if(state!=='playing'||mobilePlayBlocked||!sound||boxSequence)return;
  unlockAudio();if(!audioCtx)return;
  try{
    const buffer=currentMusicBuffer();
    const source=audioCtx.createBufferSource(),gain=audioCtx.createGain();
    source.buffer=buffer;source.loop=true;gain.gain.setValueAtTime(0,audioCtx.currentTime);gain.gain.linearRampToValueAtTime(boss||giantBattle?1.8:1.5,audioCtx.currentTime+.08);
    source.connect(gain);gain.connect(getAudioOutput());
    source.onended=()=>{source.disconnect();gain.disconnect();};
    source.playbackRate?.setValueAtTime(1,audioCtx.currentTime);source.start(0,boss?bossElapsed%30:giantBattle?giantBattle.clock%30:musicOffset()/musicRate());musicSource=source;musicGain=gain;
  }catch{}
}

function notify(msg){if(giantBattle)return;$('notice').textContent=msg;noticeLife=2;}
function updateHUD(){updateBossHUD();const inBoss=!!boss||!!giantBattle,t=Math.max(0,Math.ceil(roundDuration()-elapsed));$('tempoLabel').textContent=inBoss?'Boss 戰・已經過':milkStage?'蕉片崛起':'蕉皮末日';
  $('bossClock').hidden=!inBoss;
  if(inBoss){const seconds=Math.floor(giantBattle?giantBattle.clock:bossElapsed);$('bossTimer').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
  for(const [name,active] of [['warning',milkStage?t<=45&&t>30:elapsed>=60&&elapsed<90],['danger',milkStage?t<=30:elapsed>=90]]){if(active&&!inBoss)$('gameClock').classList.add(name);else $('gameClock').classList.remove(name);}
  $('finalCountdown').hidden=inBoss||state!=='playing'||t>10||t<=0;$('finalCountdown').textContent=t<=10?String(t):'';
  $('timer').textContent=`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;if($('hearts').dataset?.hp!==String(player.hp)){
  $('hearts').innerHTML=Array.from({length:5},(_,i)=>`<span class="health-banana ${i<player.hp?'filled':'empty'}" aria-hidden="true"><svg viewBox="0 0 34 32"><path d="M7 3C1 14 7 31 23 29C31 28 34 19 32 11C26 21 15 17 13 4Z"/><path class="banana-seam" d="M8 8C7 21 20 28 29 20"/><path class="banana-tip" d="M7 2L13 3L13 7L7 6Z"/></svg></span>`).join('');
  $('hearts').setAttribute('aria-label',`生命 ${player.hp} / 5`);if($('hearts').dataset)$('hearts').dataset.hp=String(player.hp);
}$('kills').textContent=String(kills).padStart(3,'0');$('bar1').style.width=`${Math.min(charge,100)}%`;$('chargeMeter').setAttribute('aria-valuenow',String(Math.round(charge)));if(charge>=100)$('chargeMeter').classList.add('ready');else $('chargeMeter').classList.remove('ready');$('specialTouch').disabled=charge<100||!!special||isBossWorldFrozen();$('jumpTouch').disabled=isBossWorldFrozen();updateSurfHUD();updateMilkHUD();$('surfUse').style.display=milkStage?'none':'';$('combo').textContent=combo>1&&comboLife>0?`${combo} 連踩`:'';}
function reset(showEntrance=true){if(!assetsReady)return;resetBoxState();spawnHeading={x:1,y:0};spawnMotion=[];spawnWarnings=[];spawnDueWaves=0;spawnReleaseClock=0;$('keyboardStartHint').hidden=true;const directMilkBoss=$('gameMode').value==='milk-boss'||(debugUnlocked&&$('debugStart').value==='milk-boss');milkStage=$('gameMode').value==='milk'||directMilkBoss;resetMilkStage();boss=null;bossElapsed=0;bossShots=[];bossClones=[];$('overlayText').hidden=false;invincibleMode=debugUnlocked&&!!$('debugInvincible').checked;$('overlay').classList.remove('victory');$('debugOptions').hidden=true;$('modeOptions').hidden=true;$('overlay').classList.remove('intro-screen');stats=freshStats();$('resultStats').hidden=true;lastSfx.clear();unlockAudio();sfx('start');nextDurianAt=10;durianWarnings=[];nextChargerAt=20;nextThrowerAt=30;pickups=[];orbitPeels=[];nextPickupAt=17;nextBunchSide=0;endElapsed=0;$('overlay').classList.remove('ending');$('arena')?.classList.remove('ended');$('endWipe').hidden=true;$('start').disabled=false;player=newPlayer();enemies=[];peels=[];particles=[];texts=[];special=null;elapsed=!milkStage&&debugUnlocked?[62,32,12].includes(Number($('debugStart').value))?gameDuration-Number($('debugStart').value):0:0;if(elapsed>0){nextDurianAt=elapsed+2;nextChargerAt=elapsed+2;nextThrowerAt=elapsed+3;nextPickupAt=elapsed+2;}resetSurf();spawnClock=milkStage?smallSpawnInterval():.4/.75;charge=0;kills=0;combo=0;comboLife=0;noticeLife=0;keys.clear();stick.x=stick.y=0;state='playing';syncMusic();$('overlay').hidden=true;$('pause').textContent='Ⅱ';$('arena')?.classList.add('playing');if(characterScale()<1){document.body?.classList.add('game-active');window.scrollTo?.(0,0);resize();}if(directMilkBoss){elapsed=milkRules.duration;beginGiantBattle();}const debugBossHp=!milkStage&&debugUnlocked?({'boss-5':5,'boss-2':2}[$('debugStart').value]):undefined;if(!milkStage&&($('gameMode').value==='boss'||(debugUnlocked&&$('debugStart').value==='boss')||debugBossHp)){populateRound();elapsed=120;nextPickupAt=122;startBossBattle(true);if(debugBossHp)prepareDebugBossStage(debugBossHp);}if(!boss&&!giantBattle){if(showEntrance&&elapsed===0)startBoxEntrance();else populateRound();}trackBattlePeaks();updateHUD();canvas.focus();if(!boxSequence&&!giantBattle)notify(milkStage?'搶牛奶瓶！香蕉片也會跳進去 · 撐過 60 秒':boss?'':characterScale()<1?'左側移動 · 右側跳踩／衝刺 · 撐過 120 秒':'SPACE 跳踩 · J 衝刺 · 撐過 120 秒');}
function gameTempo(time=elapsed){return !milkStage&&time>=90?1.5:1;}
function smallSpawnInterval(time=elapsed){if(milkStage){const p=milkPressure(time);return p.intervalMin+Math.random()*(p.intervalMax-p.intervalMin);}return Math.max(.5,(.9-time*.005)/.75);}
const enemyTimeSpeedCap=188;
function enemyWalkSpeed(e,tempo=gameTempo()){return Math.min(e.speed*tempo,e.type==='normal'||e.type==='thrower'?enemyTimeSpeedCap:Infinity);}
function isLargeBanana(e){return e.type==='charger'||e.type==='thrower';}
const ripenessColors={3:'#81b64c',2:'#c9d66b',1:'#f9d25c'};
function bananaColor(e){return e.type==='thrower'?'#e26d64':isLargeBanana(e)?ripenessColors[3]:ripenessColors[clamp(e.hp,1,3)];}
// Fixed viewport cells select sparse entry points before direction is sampled.
let spawnHeading={x:1,y:0},spawnMotion=[],spawnWarnings=[],spawnDueWaves=0,spawnReleaseClock=0;
const arrivalRules={warning:.5,safeRadius:140,cellSize:160,keepCells:5,denseLimit:3};
function updateSpawnHeading(dx,dy,dt){
  if(dt<=0)return;
  spawnMotion.push({dx,dy,dt});
  let excess=spawnMotion.reduce((sum,p)=>sum+p.dt,0)-1;
  while(excess>1e-9&&spawnMotion.length){
    const first=spawnMotion[0];
    if(first.dt<=excess){excess-=first.dt;spawnMotion.shift();}
    else{const keep=(first.dt-excess)/first.dt;first.dx*=keep;first.dy*=keep;first.dt-=excess;break;}
  }
  const vector=spawnMotion.reduce((sum,p)=>({x:sum.x+p.dx,y:sum.y+p.dy}),{x:0,y:0});
  if(Math.hypot(vector.x,vector.y)>.001)spawnHeading=vector;
}
function naturalSpawnCells(){
  const cells=[],r=arrivalRules.cellSize,heading=Math.atan2(spawnHeading.y,spawnHeading.x);
  const worldLeft=screen(-arenaSize+45,player.y).x,worldRight=screen(arenaSize-45,player.y).x;
  const worldTop=screen(player.x,-arenaSize+45).y,worldBottom=screen(player.x,arenaSize-45).y;
  const counts=new Map();
  for(const enemy of [...enemies,...spawnWarnings]){
    if(enemy.hp!==undefined&&enemy.hp<=0)continue;
    const p=screen(enemy.x,enemy.y);if(p.x<0||p.x>=W||p.y<0||p.y>=H)continue;
    const key=Math.floor(p.x/r)+','+Math.floor(p.y/r),count=enemy.stackCount||(enemy.time!==undefined&&milkStage?sliceRules.count:1);
    counts.set(key,(counts.get(key)||0)+count);
  }
  for(let row=0;row<Math.ceil(H/r);row++)for(let col=0;col<Math.ceil(W/r);col++){
    const left=Math.max(col*r,worldLeft),right=Math.min((col+1)*r,W,worldRight),top=Math.max(row*r,worldTop),bottom=Math.min((row+1)*r,H,worldBottom);
    if(right-left<24||bottom-top<24)continue;
    const x=player.x+(left+right)/2-W/2,y=player.y+((top+bottom)/2-H*.52)/.72;
    if(Math.hypot(x-player.x,y-player.y)<arrivalRules.safeRadius)continue;
    const count=counts.get(col+','+row)||0,density=count*r*r/((right-left)*(bottom-top));
    const dot=Math.cos(Math.atan2(y-player.y,x-player.x)-heading),sector=dot>.5?'front':dot<-.5?'back':'side';
    cells.push({x,y,col,row,count,density,sector});
  }
  return cells;
}
function lowestDensityCells(cells,allowDense=false){
  const legal=cells.filter(p=>allowDense||p.density<arrivalRules.denseLimit),ranked=legal.map(p=>p.density).sort((a,b)=>a-b);
  if(!ranked.length)return [];
  const cutoff=ranked[Math.min(arrivalRules.keepCells,ranked.length)-1];
  return legal.filter(p=>p.density<=cutoff);
}
function naturalSpawnOptions(){return lowestDensityCells(naturalSpawnCells());}
function arrivalSectorWeights(){return elapsed>=roundDuration()/2?{front:.8,side:.2,back:0}:{front:.5,side:.3,back:.2};}
function chooseNaturalSpawn(){
  const cells=naturalSpawnCells(),weights=arrivalSectorWeights(),hasDirection=p=>weights[p.sector]>0;
  // Density and direction guide placement, but never delete a scheduled wave.
  let options=naturalSpawnOptions();
  if(!options.some(hasDirection))options=lowestDensityCells(cells.filter(hasDirection));
  if(!options.length||!options.some(hasDirection))options=lowestDensityCells(cells.filter(hasDirection),true);
  if(!options.length)options=lowestDensityCells(cells,true);
  if(!options.length)return null;
  const sectors=Object.keys(weights).filter(sector=>weights[sector]>0&&options.some(p=>p.sector===sector));
  if(!sectors.length)return options[Math.floor(Math.random()*options.length)];
  let pick=Math.random()*sectors.reduce((sum,sector)=>sum+weights[sector],0);
  const sector=sectors.find(name=>(pick-=weights[name])<0)||sectors[sectors.length-1],pool=options.filter(p=>p.sector===sector);
  return pool[Math.min(pool.length-1,Math.floor(Math.random()*pool.length))];
}
function recyclableNaturalEnemies(){
  return enemies.filter(e=>e.hp>0&&(milkStage?e.type==='slice'&&e.sliceRallyId==null:e.type==='normal'&&e.hp===1));
}
function naturalEnemyCost(e){return milkStage&&e.type==='slice'?(e.stackCount||1):1;}
function naturalArrivalCapacity(reserved=0,allowRecycle=false){
  const count=milkStage?milkPopulation():enemies.filter(e=>e.hp>0).length,cost=milkStage?sliceRules.count:1,limit=milkStage?milkRules.enemyLimit:110;
  const reclaimable=allowRecycle?recyclableNaturalEnemies().reduce((sum,e)=>sum+naturalEnemyCost(e),0):0;
  return count+(reserved+1)*cost-reclaimable<=limit;
}
function makeRoomForNaturalArrival(){
  if(naturalArrivalCapacity())return true;
  if(!naturalArrivalCapacity(0,true))return false;
  const candidates=recyclableNaturalEnemies().sort((a,b)=>dist(player,b)-dist(player,a)),removed=new Set();
  let count=milkStage?milkPopulation():enemies.filter(e=>e.hp>0).length;
  const cost=milkStage?sliceRules.count:1,limit=milkStage?milkRules.enemyLimit:110;
  for(const enemy of candidates){
    if(count+cost<=limit)break;
    removed.add(enemy.id);count-=naturalEnemyCost(enemy);
  }
  // Recycling is removal, never combat: no kills, charge, drops or ripening.
  enemies=enemies.filter(e=>!removed.has(e.id));
  for(const bottle of milkBottles)if(removed.has(bottle.claimantId))delete bottle.claimantId;
  return true;
}
function updateNaturalArrivals(dt){
  if(boss||giantBattle){spawnWarnings=[];spawnDueWaves=0;spawnReleaseClock=0;return;}
  spawnReleaseClock=Math.max(0,spawnReleaseClock-dt);
  const pending=spawnWarnings;spawnWarnings=[];
  for(const warning of pending){
    warning.time=Math.max(0,warning.time-dt);
    if(warning.time>0){spawnWarnings.push(warning);continue;}
    if(spawnReleaseClock>0||!makeRoomForNaturalArrival()){spawnWarnings.push(warning);continue;}
    if(milkStage)spawnSliceStack(0,warning);else spawn(0,'normal',warning);
    spawnReleaseClock=.5;
  }
  spawnClock-=dt;
  if(spawnClock<=0){spawnDueWaves++;spawnClock=smallSpawnInterval();}
  if(spawnDueWaves>0&&spawnWarnings.length===0&&naturalArrivalCapacity(0,true)){
    const point=chooseNaturalSpawn();
    if(point){spawnWarnings.push({...point,time:arrivalRules.warning});spawnDueWaves--;}
  }
}
function drawSpawnWarnings(){
  for(const warning of spawnWarnings){
    if(!isInView(warning,60))continue;
    const p=screen(warning.x,warning.y),progress=1-warning.time/arrivalRules.warning;
    ellipse(p.x,p.y,24+progress*10,12+progress*5,'#e9ce7233','#d3b86e');
    ctx.save();ctx.globalAlpha=.5+progress*.35;ctx.strokeStyle='#eddb9e';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(p.x-7,p.y+1);ctx.lineTo(p.x,p.y-7);ctx.lineTo(p.x+7,p.y+1);ctx.stroke();ctx.restore();
  }
}

function spawn(radius,forcedType='normal',position=null){const a=Math.random()*TAU,r=radius||(Math.max(W,H)*.6+100);const type=milkStage&&forcedType==='normal'?'slice':forcedType;const ripenessRoll=Math.random(),hp=type==='thrower'?2:type==='slice'||type==='durian'||type==='charger'?1:ripenessRoll<.5?2:1;enemies.push({id:serial++,x:clamp(player.x+Math.cos(a)*r,-arenaSize+30,arenaSize-30),y:clamp(player.y+Math.sin(a)*r*.85,-arenaSize+30,arenaSize-30),hp,type,speed:type==='durian'?40:55+Math.random()*25+elapsed*.24,wobble:Math.random()*TAU,hit:0,knock:0,kx:0,ky:0,down:0,slipCooldown:0,slipX:0,slipY:0,color:ripenessColors[hp]});const enemy=enemies[enemies.length-1];if(type==='slice')enemy.speed=milkRules.sliceSpeed+Math.random()*milkRules.sliceSpeedVariation;if(position){enemy.x=position.x;enemy.y=position.y;}enemy.facing=player.x>=enemy.x?1:-1;enemy.lastFacingAt=-Infinity;if(type==='durian'){enemy.rollAngle=0;enemy.rollFacing=enemy.x<=player.x?1:-1;}if(type==='thrower'){enemy.hp=2;enemy.speed=(67.5+elapsed*.24)*1.5;enemy.color=bananaColor(enemy);enemy.throwCooldown=1;enemy.phase='seek';}if(type==='charger'){enemy.x=clamp(enemy.x,-arenaSize+52,arenaSize-52);enemy.y=clamp(enemy.y,-arenaSize+52,arenaSize-52);enemy.color=bananaColor(enemy);enemy.phase='approach';enemy.phaseTime=0;enemy.speed=52;}return enemy;}
// Deterministic arrivals: a visible warning precedes each scheduled durian.
function updateDurianSchedule(){
  if(elapsed>=nextDurianAt-1.2){
    const limit=Math.min(12,1+Math.floor(elapsed/12));
    if(enemies.filter(e=>e.type==='durian'&&e.hp>0).length+durianWarnings.length<limit){
      const side=Math.random()<.5?-1:1;
      const candidates=[side,-side].map(sign=>({x:clamp(player.x+sign*Math.max(120,W/2-45),-arenaSize+35,arenaSize-35),y:clamp(player.y+(Math.random()-.5)*Math.min(240,H*.35/.72),-arenaSize+35,arenaSize-35)}));
      const position=candidates.sort((a,b)=>dist(player,b)-dist(player,a))[0];
      durianWarnings.push({...position,at:nextDurianAt});notify('榴槤來襲！避開尖刺');sfx('warning');
    }
    nextDurianAt+=Math.max(3,10-elapsed/22);
  }
  for(const warning of durianWarnings){if(elapsed<warning.at)continue;if(enemies.length>=110){const victim=enemies.filter(e=>e.type!=='durian').sort((a,b)=>dist(player,b)-dist(player,a))[0];if(victim)enemies=enemies.filter(e=>e!==victim);}spawn(0,'durian',warning);}
  durianWarnings=durianWarnings.filter(w=>elapsed<w.at);
}

function updateChargerSchedule(){
  if(elapsed<nextChargerAt)return;
  nextChargerAt+=Math.max(2.5,8-elapsed/30)*1.5;
  if(enemies.filter(e=>e.type==='charger'&&e.hp>0).length>=10)return;
  if(enemies.length>=110){const victim=enemies.filter(e=>e.type==='normal').sort((a,b)=>dist(player,b)-dist(player,a))[0];if(!victim)return;enemies=enemies.filter(e=>e!==victim);}
  const sign=player.x>0?-1:1;
  spawn(0,'charger',{x:clamp(player.x+sign*Math.max(140,Math.min(340,W/2-45)),-arenaSize+35,arenaSize-35),y:clamp(player.y+(Math.random()-.5)*140,-arenaSize+35,arenaSize-35)});
  notify('大深綠香蕉來襲！踩中會分裂');sfx('warning');
}
function updateThrowerSchedule(){
  if(elapsed<nextThrowerAt)return;
  nextThrowerAt+=Math.max(5,14-elapsed/25);
  if(enemies.filter(e=>e.type==='thrower'&&e.hp>0).length>=4)return;
  if(enemies.length>=110){const victim=enemies.find(e=>e.type==='normal');if(!victim)return;enemies=enemies.filter(e=>e!==victim);}
  const side=player.x>0?-1:1;
  spawn(0,'thrower',{x:clamp(player.x+side*Math.min(320,Math.max(130,W/2-70)),-arenaSize+60,arenaSize-60),y:clamp(player.y+80,-arenaSize+60,arenaSize-60)});
  notify('大紅香蕉來襲！會抓榴槤投擲');sfx('warning');
}
function releaseHeldDurian(owner){
  if(owner.heldDurian===undefined)return;
  const fruit=enemies.find(e=>e.id===owner.heldDurian);
  if(fruit){delete fruit.carriedBy;fruit.z=0;fruit.x=owner.x;fruit.y=owner.y;}
  delete owner.heldDurian;
}
function updateThrower(e,dt,tempo=1){
  e.throwCooldown=Math.max(0,(e.throwCooldown||0)-dt);
  if(e.phase==='windup'){
    const fruit=enemies.find(d=>d.id===e.heldDurian&&d.hp>0);
    if(!fruit){e.phase='seek';delete e.heldDurian;return;}
    fruit.x=e.x+(e.facing||1)*48*characterScale();fruit.y=e.y+8;fruit.z=50;
    e.phaseTime-=dt;
    if(e.phaseTime<=0){
      delete fruit.carriedBy;delete e.heldDurian;
      const duration=clamp(dist(fruit,player)/620,.4,1.4);
      fruit.projectile={t:0,duration,startZ:50,fromX:fruit.x,fromY:fruit.y,toX:player.x,toY:player.y};
      fruit.down=0;fruit.knock=0;fruit.rollAngle=0;fruit.rollFacing=player.x>=fruit.x?1:-1;e.phase='seek';e.throwCooldown=2.8;sfx('durianThrow');
    }
    return;
  }
  const available=enemies.filter(d=>d.type==='durian'&&d.hp>0&&d.carriedBy===undefined&&!d.projectile);
  const fruit=available.find(d=>d.id===e.targetDurian)||available.sort((a,b)=>dist(e,a)-dist(e,b))[0];
  e.targetDurian=fruit?.id;
  const target=fruit||player,d=dist(e,target);
  if(fruit&&d<82&&e.throwCooldown<=0){fruit.carriedBy=e.id;fruit.z=50;fruit.x=e.x+(e.facing||1)*48*characterScale();fruit.y=e.y+8;fruit.down=0;fruit.knock=0;e.heldDurian=fruit.id;e.phase='windup';e.phaseTime=.65;sfx('warning');return;}
  if(d>(fruit?72:100)){const travel=Math.min(Math.max(0,d-(fruit?72:100)),enemyWalkSpeed(e,tempo)*dt);e.x+=(target.x-e.x)/(d||1)*travel;e.y+=(target.y-e.y)/(d||1)*travel;}
}
function updateThrownDurian(e,dt){
  const shot=e.projectile,oldX=e.x,oldY=e.y;shot.t=Math.min(shot.duration,shot.t+dt);
  const p=shot.t/shot.duration;e.x=shot.fromX+(shot.toX-shot.fromX)*p;e.y=shot.fromY+(shot.toY-shot.fromY)*p;
  e.z=(shot.startZ||50)*(1-p)+45*Math.sin(Math.PI*p);e.rollAngle=(e.rollAngle||0)+(e.rollFacing||1)*dt*12;
  if(segmentDistance(player,oldX,oldY,e.x,e.y)<38*characterScale())hurt('被榴槤擊中');
  if(p>=1){delete e.projectile;e.z=0;e.rollAngle=0;}
}

function ramBananas(red,fromX,fromY){
  red.rammed ||= new Set();
  for(const target of enemies){
    if(target===red||target.hp<=0||target.type==='durian'||red.rammed.has(target.id))continue;
    const radius=(isLargeBanana(target)?68:52)*characterScale();
    if(segmentDistance(target,fromX,fromY,red.x,red.y)>radius)continue;
    red.rammed.add(target.id);
    let dx=target.x-fromX,dy=target.y-fromY,length=Math.hypot(dx,dy);
    if(length<1){dx=Math.cos(red.aim);dy=Math.sin(red.aim);length=1;}
    const force=clamp((red.dashSpeed||320)*.6+200,360,680);
    target.kx=dx/length*force;target.ky=dy/length*force;target.knock=.35;
    burst(target.x,target.y,'#cfb779',5);sfx('hit');
  }
}

function updateCharger(e,dt,tempo=1){
  if(e.phase==='approach'){
    const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;
    if(d<=380){e.phase='aim';e.phaseTime=.5;e.aim=Math.atan2(dy,dx);e.facing=dx>=0?1:-1;sfx('warning');}
    else{const travel=Math.min(d,e.speed*dt*tempo);e.x+=dx/d*travel;e.y+=dy/d*travel;}
  }else if(e.phase==='aim'){
    e.phaseTime=Math.max(0,e.phaseTime-dt);
    if(e.phaseTime<=0){e.phase='dash';e.dashSpeed=320;e.rammed=new Set();sfx('redDash');}
  }else if(e.phase==='dash'||e.phase==='brake'){
    const fromX=e.x,fromY=e.y,dx=Math.cos(e.aim),dy=Math.sin(e.aim),limit=arenaSize-52;
    // Current camera bounds, inset enough to keep the large sprite visible.
    const left=Math.max(-limit,player.x-W/2+64*characterScale()),right=Math.min(limit,player.x+W/2-64*characterScale());
    const top=Math.max(-limit,player.y+(128*characterScale()-H*.52)/.72),bottom=Math.min(limit,player.y+(H-32*characterScale()-H*.52)/.72);
    const edgeX=dx>1e-8?(right-e.x)/dx:dx< -1e-8?(left-e.x)/dx:Infinity;
    const edgeY=dy>1e-8?(bottom-e.y)/dy:dy< -1e-8?(top-e.y)/dy:Infinity;
    const remaining=Math.max(0,Math.min(edgeX,edgeY));
    let desired;
    if(e.phase==='dash'){
      const speed=e.dashSpeed??320,nextSpeed=Math.min(960,speed+1400*dt);
      desired=(speed+nextSpeed)*.5*dt*tempo;e.dashSpeed=nextSpeed;
      // Reserve a full second to decelerate before reaching the visible edge.
      if(remaining<=nextSpeed*.5*tempo+desired){e.phase='brake';e.phaseTime=1;e.brakeSpeed=remaining*2;}
    }
    if(e.phase==='brake'){
      const before=e.phaseTime,after=Math.max(0,before-dt);
      desired=e.brakeSpeed*(before*before-after*after)*.5;
      e.phaseTime=after;e.dashSpeed=e.brakeSpeed*after;
    }
    const travel=Math.min(desired,remaining);
    e.x=clamp(e.x+dx*travel,left,right);e.y=clamp(e.y+dy*travel,top,bottom);ramBananas(e,fromX,fromY);
    if(e.phase==='brake'&&e.phaseTime<=0){e.phase='turn';e.phaseTime=2;e.dashSpeed=0;e.down=0;e.slipX=0;e.slipY=0;}
  }else if(e.phase==='turn'){
    e.phaseTime=Math.max(0,e.phaseTime-dt);
    if(e.phaseTime<=0){e.aim=Math.atan2(player.y-e.y,player.x-e.x);e.facing=Math.cos(e.aim)>=0?1:-1;e.phase='aim';e.phaseTime=.5;sfx('warning');}
  }
}
function updatePeels(dt){
  for(const p of peels){p.prevX=p.x;p.prevY=p.y;if(p.summonWave&&boss?.cinematic?.kind==='quadrants')continue;if(moveBossPeel(p,dt))continue;
    if(p.slideTime>0&&p.flightRemaining!==undefined){
      const speed=Math.hypot(p.vx,p.vy),limit=arenaSize-50;
      const dx=speed?p.vx/speed:0,dy=speed?p.vy/speed:0;
      p.x=clamp(p.x,-limit,limit);p.y=clamp(p.y,-limit,limit);
      const edgeX=dx>0?(limit-p.x)/dx:dx<0?(-limit-p.x)/dx:Infinity;
      const edgeY=dy>0?(limit-p.y)/dy:dy<0?(-limit-p.y)/dy:Infinity;
      const toEdge=Math.max(0,Math.min(edgeX,edgeY)),travel=Math.min(p.flightRemaining,speed*dt,toEdge);
      p.x+=dx*travel;p.y+=dy*travel;
      p.flightRemaining=travel>=toEdge-1e-8?0:Math.max(0,p.flightRemaining-travel);
      p.slideTime=speed>0?p.flightRemaining/speed:0;
    }
    else if(p.slideTime>0){const step=Math.min(dt,p.slideTime),decay=Math.exp(-1.5*step),travel=(1-decay)/1.5;p.x=clamp(p.x+p.vx*travel,-arenaSize,arenaSize);p.y=clamp(p.y+p.vy*travel,-arenaSize,arenaSize);p.vx*=decay;p.vy*=decay;p.slideTime=Math.max(0,p.slideTime-dt);}
  }
}
// 96-unit cells exceed the largest peel contact radius (58 units).
const collisionCellSize=96;
let peelGridQuerySerial=0;
function collisionGridKey(x,y){return (x+32768)*65536+y+32768;}
function locateCollisionCell(actor){
  actor.gridX=Math.floor(actor.x/collisionCellSize);actor.gridY=Math.floor(actor.y/collisionCellSize);
  actor.gridIndex=collisionGridKey(actor.gridX,actor.gridY);return actor.gridIndex;
}
function buildPeelGrid(){
  const grid={buckets:new Map(),consumed:new Set(),query:0,checks:0};
  for(let order=0;order<peels.length;order++){
    const p=peels[order];locateCollisionCell(p);p.peelGridOrder=order;p.peelGridQuery=0;
    if(p.ritual||p.summonWave||p.age<=.5)continue;
    const ax=p.prevX??p.x,ay=p.prevY??p.y;
    // Register every cell spanned by the swept path, not only the end position.
    const left=Math.floor(Math.min(ax,p.x)/collisionCellSize),right=Math.floor(Math.max(ax,p.x)/collisionCellSize);
    const top=Math.floor(Math.min(ay,p.y)/collisionCellSize),bottom=Math.floor(Math.max(ay,p.y)/collisionCellSize);
    for(let x=left;x<=right;x++)for(let y=top;y<=bottom;y++){
      const key=collisionGridKey(x,y);let bucket=grid.buckets.get(key);
      if(!bucket){bucket=[];grid.buckets.set(key,bucket);}bucket.push(p);
    }
  }
  return grid;
}
function touchingPeel(actor,grid=buildPeelGrid()){
  locateCollisionCell(actor);const query=++peelGridQuerySerial,scale=characterScale();grid.query++;let first;
  for(let x=actor.gridX-1;x<=actor.gridX+1;x++)for(let y=actor.gridY-1;y<=actor.gridY+1;y++){
    const bucket=grid.buckets.get(collisionGridKey(x,y));if(!bucket)continue;
    for(const p of bucket){
      if(p.peelGridQuery===query)continue;p.peelGridQuery=query;
      if(grid.consumed.has(p)||p.ritual||p.summonWave||p.age<=.5||(first&&p.peelGridOrder>=first.peelGridOrder))continue;
      grid.checks++;
      const ax=p.prevX??p.x,ay=p.prevY??p.y,dx=p.x-ax,dy=p.y-ay,length=dx*dx+dy*dy;
      const t=length?clamp(((actor.x-ax)*dx+(actor.y-ay)*dy)/length,0,1):0;
      const gapX=actor.x-ax-t*dx,gapY=actor.y-ay-t*dy,radius=16+10*scale+(p.red||p.large?16:0)+(isLargeBanana(actor)?16*scale:0);
      if(gapX*gapX+gapY*gapY<radius*radius)first=p;
    }
  }
  return first;
}

function spawnBunch(){
  // Prefer unoccupied sides, resolving ties in left/right/top/bottom order.
  const active=pickups.filter(p=>!p.collected),counts=[0,0,0,0],limit=arenaSize-45;
  for(const p of active){
    const dx=(p.x-player.x)/(W/2),dy=(p.y-player.y)*.72/(H/2);
    counts[Math.abs(dx)>=Math.abs(dy)?(dx<0?0:1):(dy<0?2:3)]++;
  }
  const options=[];
  for(let side=0;side<4;side++){
    for(let i=0;i<9;i++){
      const along=.12+(.76*(i+Math.random())/9);
      const sx=side===0?-60:side===1?W+60:W*along;
      const sy=side===2?-60:side===3?H+60:H*along;
      const x=player.x+sx-W/2,y=player.y+(sy-H*.52)/.72;
      if(Math.abs(x)>limit||Math.abs(y)>limit)continue;
      const spacing=active.length?Math.min(...active.map(p=>Math.hypot(p.x-x,p.y-y))):Math.random();
      options.push({x,y,side,spacing});
    }
  }
  options.sort((a,b)=>counts[a.side]-counts[b.side]||((a.side-nextBunchSide+4)%4)-((b.side-nextBunchSide+4)%4)||b.spacing-a.spacing);
  const chosen=options[0];
  if(!chosen)return; // No reachable space outside this viewport.
  nextBunchSide=(chosen.side+1)%4;
  pickups=active.slice(-1);
  pickups.push({id:serial++,x:chosen.x,y:chosen.y,age:0});
}

function collectBunch(){
  stats.bunches++;player.inv=Math.max(player.inv,.5);
  const group=serial++,hits=new Map();
  for(let i=0;i<6;i++)orbitPeels.push({group,hits,index:i,t:0,x:player.x,y:player.y,prevX:player.x,prevY:player.y,angle:i*TAU/6,age:1});
  notify('氣功蕉皮！六片向外旋轉');sfx('pickup');
}
function segmentDistance(point,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;const t=l?clamp(((point.x-ax)*dx+(point.y-ay)*dy)/l,0,1):0;return Math.hypot(point.x-ax-t*dx,point.y-ay-t*dy);}
function crossesPickup(item,path=null){
  if(!(player.z<=0||special||path?.dashing))return false;
  const radius=special?.mode==='surf'||path?.surfing?55:35;
  return (path&&(path.grounded||path.dashing)?segmentDistance(item,path.x,path.y,player.x,player.y):dist(item,player))<radius;
}
function collectBunchPickups(path=null){
  for(const item of pickups)if(!item.collected&&crossesPickup(item,path)){item.collected=true;collectBunch();}
  pickups=pickups.filter(item=>!item.collected);
}
function updateItems(dt,pickupPath=null){
  if(elapsed>=nextPickupAt){spawnBunch();nextPickupAt+=17;}
  for(const p of pickups)p.age=(p.age||0)+dt;
  collectBunchPickups(pickupPath);
  for(const p of orbitPeels){
    p.prevX=p.x;p.prevY=p.y;p.t+=dt;
    const radius=28+100*p.t+70*p.t*p.t;p.angle=p.index*TAU/6+p.t*4;
    p.x=player.x+Math.cos(p.angle)*radius;p.y=player.y+Math.sin(p.angle)*radius;
    for(const e of enemies){
      if(e.hp<=0||e.carriedBy!==undefined||e.projectile||p.hits.has(e.id))continue;
      if(segmentDistance(e,p.prevX,p.prevY,p.x,p.y)>(18+(isLargeBanana(e)?30:16)*characterScale()))continue;
      if(e.type!=='durian'&&e.hit>0)continue;
      const before=enemies.length;
      if(e.type!=='durian'&&!hitEnemy(e,false))continue;
      p.hits.set(e.id,elapsed);
      // A split counts as the hit; newborn bananas cannot be hit again by this burst.
      for(let i=before;i<enemies.length;i++)p.hits.set(enemies[i].id,elapsed);
      if(e.hp>0){const angle=Math.atan2(e.y-player.y,e.x-player.x);e.down=0;e.knock=.35;e.kx=Math.cos(angle)*320;e.ky=Math.sin(angle)*320;}
      burst(e.x,e.y,'#c9e6b2',7);
    }
  }
  const exitRadius=Math.hypot(W/2,H/.72)+100;
  orbitPeels=orbitPeels.filter(p=>28+100*p.t+70*p.t*p.t<exitRadius);
}
function drawGroundFrame(frame,width,height){
  const sw=groundSprite.naturalWidth/3,sh=groundSprite.naturalHeight;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(renderSprite(groundSprite,frame),-width/2,-height/2,width,height);
}
function drawBunch(p){
  if(!isInView(p,90))return;
  if(!groundSprite.complete||!groundSprite.naturalWidth){drawBunchVector(p);return;}
  const s=screen(p.x,p.y);ctx.save();ctx.translate(s.x,s.y);
  ellipse(0,10,24,9,'#e6f77d25','#bec781');
  ctx.translate(0,-9+Math.sin(elapsed*4)*3);drawGroundFrame(2,60,60);
  ctx.fillStyle='#e0cea0';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText('香蕉串',0,-38);ctx.restore();
}
function drawBunchVector(p){
  const s=screen(p.x,p.y);ctx.save();ctx.translate(s.x,s.y+Math.sin(elapsed*4)*3);
  ellipse(0,10,25,10,'#e6f77d2b','#c0cb7d');
  ctx.lineJoin='round';ctx.lineWidth=1.7;
  for(let i=0;i<3;i++){ctx.save();ctx.rotate((i-1)*.42);ctx.beginPath();ctx.moveTo(-5,-20);ctx.bezierCurveTo(-14,0,-4,15,13,5);ctx.quadraticCurveTo(19,1,18,-9);ctx.quadraticCurveTo(3,8,-1,-18);ctx.closePath();ctx.fillStyle=['#ecc64d','#ffe076','#f4d15a'][i];ctx.strokeStyle='#806135';ctx.fill();ctx.stroke();ctx.restore();}
  ctx.fillStyle='#758e43';ctx.fillRect(-5,-24,9,8);ctx.fillStyle='#e0cea0';ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillText('香蕉串',0,-33);ctx.restore();
}

function jump(){if(milkPack)return;if(state!=='playing'||isBossWorldFrozen()||special||player.recoil>0||player.down>0||player.z>1||player.jumpLock>0)return;player.vz=350;player.jumpLock=.12;sfx('jump');}
function burst(x,y,color,n=12){for(let i=0;i<n;i++){const a=Math.random()*TAU,s=30+Math.random()*150;particles.push({x,y,z:8,vx:Math.cos(a)*s,vy:Math.sin(a)*s,vz:80+Math.random()*80,life:.4+Math.random()*.3,color});}}
// Slipping never grants damage immunity; the player remains vulnerable while down.
function slip(actor,angle){actor.down=.7;actor.slipCooldown=1.05;const speed=isLargeBanana(actor)?288:480;actor.slipX=Math.cos(angle)*speed;actor.slipY=Math.sin(angle)*speed;if(actor===player){stats.slips++;player.recoil=0;player.downPose='slip';player.padDriftX=player.padDriftY=0;player.stompLandingPending=false;player.giantBoostUntil=0;player.z=0;player.vz=0;combo=0;comboLife=0;sfx('slip');notify('滑倒！小心敵人');}}
function slide(actor,dt){const step=Math.min(dt,actor.down);const decay=Math.exp(-1.5*step),travel=(1-decay)/1.5;actor.x+=actor.slipX*travel;actor.y+=actor.slipY*travel;actor.slipX*=decay;actor.slipY*=decay;actor.down=Math.max(0,actor.down-dt);}
function hurt(reason,source='enemy'){if(state!=='playing'||isBossWorldFrozen()||isGiantCeremony()||(source==='boss'&&isBossCinematic())||invincibleMode||player.inv>0||special)return;player.hp--;player.giantBoostUntil=0;player.padDriftX=player.padDriftY=0;player.stompLandingPending=false;player.recoil=0;player.stompGuard=0;player.downPose='hurt';player.inv=2.5;player.damageInv=2.5;if(player.down<=0){player.down=.5;player.slipX=Math.cos(player.face)*170;player.slipY=Math.sin(player.face)*170;}player.z=0;player.vz=0;combo=0;comboLife=0;shake=.22;burst(player.x,player.y,'#fff2b0');sfx('hurt');notify(reason+' −1 ♥');if(player.hp<=0)finish(false);}
function hitEnemy(e,isStomp){
  if(isBossWorldFrozen()||isGiantCeremony()||e.hp<=0||e.hit>0||e.type==='durian'||e.sliceFlight)return false;
  const originalType=e.type,stompedStack=isStomp&&e.type==='slice'&&(e.stackCount||1)>1;
  if(e.type==='slice'){e.sliceHop=null;e.z=0;}
  e.hp-=isStomp&&e.type==='milk'?e.hp:1;if(e.type==='slice'&&(e.stackCount||1)>1){e.stackCount=e.hp;kills++;if(isStomp)stats.stompKills++;}e.hit=.24;burst(e.x,e.y,bananaColor(e),8);
  if(isStomp){combo=comboLife>0?combo+1:1;comboLife=1.5;stats.maxCombo=Math.max(stats.maxCombo,combo);stats.stompHits++;const gain=combo===1?20:10;const before=charge;charge=Math.min(100,charge+gain);if(Math.floor(charge/100)>Math.floor(before/100))sfx('charge');texts.push({x:e.x,y:e.y,z:60,text:`+${(gain/100).toFixed(1)} 層`,life:.7});sfx('stomp',1+Math.min(combo,10)*.08);}
  if(stompedStack)bounceFromStomp(e);
  if(!isStomp)sfx('hit');
  if(originalType==='thrower'){
    releaseHeldDurian(e);delete e.targetDurian;delete e.throwCooldown;
    e.type='charger';e.hp=1;e.phase='approach';e.phaseTime=0;e.speed=52;
  }else if(originalType==='charger'){
    greenSurfKills++;if(greenSurfKills%3===0)spawnSurfPickup(e);
    const angle=Math.atan2(e.y-player.y,e.x-player.x)+Math.PI/2;
    for(const side of [-1,1]){
      const dx=Math.cos(angle)*side,dy=Math.sin(angle)*side;
      const child=spawn(0,'normal',{x:clamp(e.x+dx*30,-arenaSize+30,arenaSize-30),y:clamp(e.y+dy*30,-arenaSize+30,arenaSize-30)});
      child.hp=2;child.color=bananaColor(child);child.hit=.24;child.knock=.4;child.kx=dx*280;child.ky=dy*280;
    }
    burst(e.x,e.y,ripenessColors[2],14);return true;
  }
  e.color=bananaColor(e);
  if(e.hp<=0){releaseHeldDurian(e);sfx('peel');kills++;if(isStomp)stats.stompKills++;if(originalType!=='slice'&&originalType!=='milk')peels.push({x:e.x,y:e.y,age:0,id:serial++,red:e.type==='thrower',large:isLargeBanana(e)});burst(e.x,e.y,'#f7e88d',14);}
  else{const dx=e.x-player.x,dy=e.y-player.y,d=Math.hypot(dx,dy);const angle=d>1?Math.atan2(dy,dx):player.face;e.knock=isStomp?.4:.2;const speed=isStomp?280:100;e.kx=Math.cos(angle)*speed;e.ky=Math.sin(angle)*speed;}
  return true;
}
function activate(){
  if(state!=='playing'||isBossWorldFrozen()||charge<100||special)return;
  const dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+stick.x;
  const dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+stick.y;
  const dir=Math.hypot(dx,dy)>.1?Math.atan2(dy,dx):player.face;
  player.giantBoostUntil=0;player.padDriftX=player.padDriftY=0;charge-=100;stats.dashes++;player.face=dir;
  special={t:0,duration:1,dx:Math.cos(dir),dy:Math.sin(dir),speed:620,hits:new Set(),trail:[],nextSound:.15};
  player.down=0;player.recoil=0;player.vz=0;player.z=10;
  notify('旋轉衝刺！1 秒無敵突圍');sfx('ultimate');updateHUD();
}
function screen(x,y,z=0){return {x:W/2+x-player.x,y:H*.52+(y-player.y)*.72-z};}
function ellipse(x,y,rx,ry,fill,stroke){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.7;ctx.stroke();}}
function banana(x,y,size,color,face=0,isPlayer=false,damage=false,rotation=0,down=false){ctx.save();ctx.translate(x,y);ctx.rotate(rotation+(down?1.5:0));ctx.scale(size,size);ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-15,-32);ctx.bezierCurveTo(-19,-6,-6,12,18,9);ctx.bezierCurveTo(27,7,31,-1,32,-13);ctx.bezierCurveTo(16,1,-5,-4,-9,-31);ctx.closePath();ctx.fillStyle=color;ctx.strokeStyle='#49344d';ctx.lineWidth=2.3;ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-13,-26);ctx.bezierCurveTo(-9,-5,4,5,23,2);ctx.strokeStyle='#8a6a3b66';ctx.lineWidth=1.3;ctx.stroke();ctx.fillStyle='#67503f';ctx.fillRect(-15,-36,7,7);ctx.fillRect(29,-15,5,5);if(isPlayer){ctx.beginPath();ctx.moveTo(-16,-17);ctx.lineTo(-4,-21);ctx.lineTo(1,-14);ctx.lineTo(-12,-10);ctx.closePath();ctx.fillStyle='#7758b4';ctx.fill();ctx.strokeStyle='#49344d';ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.moveTo(-14,-14);ctx.lineTo(-25,-9);ctx.lineTo(-20,-2);ctx.strokeStyle='#7758b4';ctx.lineWidth=4;ctx.stroke();}if(damage){ctx.beginPath();ctx.moveTo(4,-3);ctx.lineTo(0,2);ctx.lineTo(7,3);ctx.lineTo(3,8);ctx.strokeStyle='#7d445d';ctx.lineWidth=2;ctx.stroke();}ctx.fillStyle='#30283f';ellipse(10,-4,1.7,2.7,'#30283f');ellipse(19,-5,1.7,2.7,'#30283f');ctx.beginPath();ctx.arc(15,0,3,0,Math.PI);ctx.strokeStyle='#30283f';ctx.lineWidth=1.2;ctx.stroke();if(isPlayer){ellipse(0,13,6,3,'#7758b4','#49344d');ellipse(19,13,6,3,'#7758b4','#49344d');}ctx.restore();}
// Front-view sprite trial: preserve the reference face and body proportions.
// A vector fallback keeps the game playable while the local PNG loads.
function drawHero(x,y,size,face=0,rotation=0,down=false){
  const fallSprite=player.downPose==='hurt'?heroHurtSprite:heroSlipSprite;
  if(down&&fallSprite.complete&&fallSprite.naturalWidth){
    // Calibrated to the standing banana torso width; hands and peel do not set body scale.
    const height=96,width=height*fallSprite.naturalWidth/fallSprite.naturalHeight;
    const direction=Math.abs(player.slipX)>1?Math.sign(player.slipX):(Math.cos(face)<-.3?-1:1);
    // Keep the boot contact near the ground anchor as the image size changes.
    ctx.save();ctx.translate(x+5,y-height*.33*size);ctx.scale(size*direction,size);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(renderSprite(fallSprite),-width/2,-height/2,width,height);ctx.restore();return;
  }
  if(!heroSprite.complete||!heroSprite.naturalWidth){drawHeroVector(x,y,size,face,rotation,down);return;}
  const moving=state==='playing'&&(Math.hypot(stick.x,stick.y)>.1||['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(k=>keys.has(k)));
  const stride=moving&&player.z<1&&!down&&!special?Math.sin(elapsed*13):0;
  const height=90,width=height*heroSprite.naturalWidth/heroSprite.naturalHeight;
  ctx.save();ctx.translate(x+5,y-26*size);
  ctx.rotate(rotation+(down?1.42:stride*.035));
  ctx.scale(size*(Math.cos(face)<-.3?-1:1),size);
  ctx.translate(0,-Math.abs(stride)*1.5);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(renderSprite(heroSprite),-width/2,-height/2,width,height);
  ctx.restore();
}
function drawHeroVector(x,y,size,face=0,rotation=0,down=false){
  const moving=state==='playing'&&(Math.hypot(stick.x,stick.y)>.1||['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].some(k=>keys.has(k)));
  const stride=moving&&player.z<1&&!down&&!special?Math.sin(elapsed*15):0;
  const airborne=player.z>1&&!down,back=Math.sin(face)<-.45,side=Math.abs(Math.cos(face))>.6;
  const ink='#503322',scarf='#c34b32';
  ctx.save();ctx.translate(x+5,y);ctx.rotate(rotation+(down?1.42:0));ctx.scale(size*(side&&Math.cos(face)<0?-1:1),size);
  ctx.translate(0,Math.abs(stride)*-1.4);
  ctx.lineCap='round';ctx.lineJoin='round';
  function path(points,fill,stroke=ink,width=1.7){ctx.beginPath();for(const command of points){const [op,...args]=command;ctx[op](...args);}if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
  function roundRect(x,y,w,h,r,fill,stroke=ink){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.6;ctx.stroke();}}
  function boot(x,y,step){ctx.save();ctx.translate(x,y+step);ctx.rotate(airborne?x<0?-.18:.18:step*.035);roundRect(-4,-7,9,12,2,'#f6c64f');roundRect(-6,0,11,12,3,'#785036');roundRect(-9,7,17,9,3,'#6a4531');path([['moveTo',-8,13],['lineTo',7,13]],null,'#3e2b25',2);path([['moveTo',-3,5],['lineTo',3,4]],null,'#bb8d5b',1.3);ctx.restore();}
  // Backpack and rear arm silhouette.
  if(!back){roundRect(side?-22:-16,-20,side?18:33,30,6,'#735039');roundRect(side?-22:-16,-19,side?5:6,28,2,'#a17c4d');}
  // Scarf tails trail behind the silhouette.
  const flutter=Math.sin(elapsed*10)*2;
  path([['moveTo',-12,-15],['bezierCurveTo',-27,-25,-28,-16+flutter,-37,-14+flutter],['lineTo',-29,-12],['lineTo',-31,-7+flutter],['quadraticCurveTo',-20,-4,-12,-11],['closePath']],scarf);
  path([['moveTo',-14,-15],['quadraticCurveTo',-25,-35,-29,-23+flutter],['quadraticCurveTo',-21,-21,-21,-12],['closePath']],'#d86343');
  boot(-9,7,stride*3+(airborne?-3:0));boot(10,7,-stride*3+(airborne?-1:0));
  // Long banana body, with a green stem and warm shaded edge.
  const body=ctx.createLinearGradient(-20,0,20,0);body.addColorStop(0,'#e7ac2f');body.addColorStop(.2,'#ffdc4a');body.addColorStop(.62,'#ffe577');body.addColorStop(1,'#edbd36');
  path([['moveTo',-8,-44],['bezierCurveTo',-23,-35,-22,-3,-17,7],['quadraticCurveTo',-2,18,16,8],['bezierCurveTo',23,-6,18,-35,5,-41],['lineTo',7,-51],['lineTo',-4,-55],['lineTo',-10,-48],['closePath']],body,ink,2);
  path([['moveTo',-8,-44],['lineTo',-10,-48],['lineTo',-4,-55],['lineTo',7,-51],['lineTo',5,-41]],'#b6b544');
  path([['moveTo',-10,-48],['lineTo',-4,-55],['lineTo',7,-51],['lineTo',2,-46],['closePath']],'#805337');
  path([['moveTo',-15,-31],['quadraticCurveTo',-18,-13,-13,-3]],null,'#fff2a0',2.1);
  path([['moveTo',8,-35],['quadraticCurveTo',15,-18,10,7]],null,'#c6912c66',1);
  if(back){
    // Rear view: crossing straps, scarf knot, and the signature banana pack.
    path([['moveTo',-15,-13],['lineTo',-9,9],['moveTo',15,-13],['lineTo',10,9]],null,'#66442f',5);
    path([['moveTo',-17,-17],['quadraticCurveTo',0,-7,18,-17],['lineTo',15,-9],['quadraticCurveTo',0,-2,-15,-10],['closePath']],scarf);
    roundRect(-15,-8,30,29,6,'#765238');roundRect(-12,-5,24,23,4,'#936a43');
    roundRect(-16,-8,32,13,5,'#795233');path([['moveTo',-8,8],['lineTo',-8,18],['moveTo',8,8],['lineTo',8,18]],null,'#b38b56',2);
    path([['moveTo',2,-3],['quadraticCurveTo',9,7,0,9],['quadraticCurveTo',-7,8,-6,3],['quadraticCurveTo',1,8,2,-3],['closePath']],'#f5d35b',ink,.9);
    roundRect(-4,-13,8,5,2,'#5e402e');
  }else{
    // Large white eyes and readable eyebrows remain visible at gameplay scale.
    ctx.save();ctx.translate(side?5:0,0);ctx.scale(side?.78:1,1);
    const expression=down?'surprised':'determined';
    ellipse(-8,-26,6,8,'#fff7df',ink);ellipse(8,-26,6,8,'#fff7df',ink);
    ellipse(-5+(side?1:0),-25,2.9,5,'#3f2b22');ellipse(10,-25,2.9,5,'#3f2b22');
    if(expression==='surprised'){
      path([['moveTo',-13,-38],['quadraticCurveTo',-8,-42,-4,-37],['moveTo',4,-37],['quadraticCurveTo',9,-42,14,-38]],null,ink,3);
      ellipse(1,-13,4,5,'#7e3c32',ink);
    }else{
      path([['moveTo',-14,-36],['lineTo',-3,-32],['moveTo',4,-32],['lineTo',14,-37]],null,ink,3.8);
      path([['moveTo',-4,-15],['quadraticCurveTo',1,-11,6,-16]],null,ink,1.4);
    }ctx.restore();
    // Bandanna covers the shoulders, with a layered triangular front.
    path([['moveTo',-20,-15],['quadraticCurveTo',0,-5,20,-16],['lineTo',17,-5],['lineTo',1,4],['lineTo',-18,-5],['closePath']],scarf,ink,1.8);
    path([['moveTo',-18,-12],['quadraticCurveTo',0,-2,18,-12]],null,'#eb7951',2);
    path([['moveTo',-16,-4],['lineTo',0,1],['lineTo',16,-7]],null,'#903b2a',1.2);
    // Diagonal brown belt and gold banana charm.
    path([['moveTo',-19,3],['quadraticCurveTo',0,5,18,-4],['lineTo',19,3],['quadraticCurveTo',0,13,-18,10],['closePath']],'#785035');
    roundRect(7,1,5,6,1,'#e3bc60');
    path([['moveTo',10,4],['quadraticCurveTo',16,16,6,17],['quadraticCurveTo',0,17,0,12],['quadraticCurveTo',9,16,10,4],['closePath']],'#ffda59',ink,1.1);
  }
  // Bent yellow arms with cuffs and soft white gloves.
  for(const sign of [-1,1]){ctx.save();ctx.scale(sign,1);const swing=down?2:airborne?-5:stride*sign*2;
    path([['moveTo',17,-9],['lineTo',25,-3+swing],['lineTo',21,3+swing]],null,ink,6);
    path([['moveTo',17,-9],['lineTo',25,-3+swing],['lineTo',21,3+swing]],null,'#ffd454',3.4);
    roundRect(17,0+swing,8,5,2,'#f9efdc');
    path([['moveTo',18,3+swing],['bezierCurveTo',13,2+swing,13,8+swing,17,10+swing],['quadraticCurveTo',24,15+swing,27,7+swing],['quadraticCurveTo',27,1+swing,23,2+swing],['closePath']],'#fff7e7',ink,1.4);
    path([['moveTo',20,7+swing],['lineTo',23,9+swing]],null,'#c9baa4',.9);ctx.restore();}
  ctx.restore();
}

function updateEnemyFacing(e){
  const facingTarget=e.type==='thrower'?enemies.find(d=>d.id===e.targetDurian&&d.hp>0):null;
  const dx=(facingTarget||player).x-e.x;
  e.facing ||= dx>=0?1:-1;
  if(e.down>0||e.knock>0||e.projectile||e.carriedBy!==undefined||e.phase==='windup'||(e.type==='charger'&&['aim','dash','brake','turn'].includes(e.phase)))return;
  const threshold=isLargeBanana(e)?36:24;
  if(Math.abs(dx)<threshold)return;
  const next=dx>0?1:-1;
  if(next!==e.facing&&elapsed-(e.lastFacingAt??-Infinity)>=.18){e.facing=next;e.lastFacingAt=elapsed;}
}

function enemyFrameIndex(e){return e.type==='thrower'?3:e.type==='charger'?0:3-clamp(e.hp,1,3);}
function drawEnemyGhost(e,x,y){
  if(!enemySprite.complete||!enemySprite.naturalWidth){banana(x,y,isLargeBanana(e)?2:1,bananaColor(e),0,false,false,0,e.down>0);return;}
  const frame=enemyFrameIndex(e),sw=enemySprite.naturalWidth/4,sh=enemySprite.naturalHeight;
  const scale=isLargeBanana(e)?2:1,h=96*scale,w=h*sw/sh;
  ctx.save();ctx.translate(x+3,y+7);ctx.rotate(e.down>0?1.4:0);
  ctx.scale((e.facing||1)*(e.hit>0?1.1:1),e.hit>0?.8:1);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(renderSprite(enemySprite,frame,scale),-w/2,-81*scale,w,h);ctx.restore();
}

function advanceDurianRoll(e,oldX,oldY,rolling=e.down>0||e.knock>0){
  const dx=e.x-oldX,dy=(e.y-oldY)*.72;
  if(Math.abs(dx)>.001)e.rollFacing=dx>0?1:-1;
  e.rollFacing ||= 1;
  e.rollAngle=rolling?(e.rollAngle||0)+e.rollFacing*Math.hypot(dx,dy)/23:0;
}

function durian(x,y,wobble,facing=1){
  if(!durianSprite.complete||!durianSprite.naturalWidth){durianVector(x,y,wobble);return;}
  ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(wobble)*.045);ctx.scale(facing,1);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const width=96,height=width*durianSprite.naturalHeight/durianSprite.naturalWidth;
  ctx.drawImage(renderSprite(durianSprite),-width/2,-49,width,height);ctx.restore();
}
function durianVector(x,y,wobble){ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(wobble)*.06);ctx.beginPath();for(let i=0;i<28;i++){const a=i/28*TAU,r=i%2?22:29;const x=Math.cos(a)*r,y=Math.sin(a)*r*.9-12;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fillStyle='#899a4f';ctx.strokeStyle='#414635';ctx.lineWidth=2;ctx.fill();ctx.stroke();for(let i=0;i<5;i++){const a=i*1.7;ctx.beginPath();ctx.moveTo(Math.cos(a)*12,Math.sin(a)*12-12);ctx.lineTo(Math.cos(a)*12-3,Math.sin(a)*12-7);ctx.lineTo(Math.cos(a)*12+4,Math.sin(a)*12-7);ctx.strokeStyle='#556431';ctx.stroke();}ellipse(-6,-10,2,3,'#30283f');ellipse(6,-10,2,3,'#30283f');ctx.restore();}
function drawOrbitPeel(p){
  if(!isInView(p,110))return;
  const s=screen(p.x,p.y);ctx.save();ctx.translate(s.x,s.y-2);
  const glow=ctx.createRadialGradient(0,0,12,0,0,43);
  glow.addColorStop(0,'#d9efad44');glow.addColorStop(.65,'#a7dcca55');glow.addColorStop(1,'#a7dcca00');
  ellipse(0,0,43,34,glow);ctx.strokeStyle='#dcebb7aa';ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(0,0,35,26,0,.2,Math.PI*1.1);ctx.stroke();
  ctx.strokeStyle='#c4dfc580';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,40,30,0,Math.PI*1.1,TAU+.1);ctx.stroke();
  ctx.restore();drawPeel(p);
}
function bunchIndicator(p){
  const target=screen(p.x,p.y);
  if(target.x>=0&&target.x<=W&&target.y>=0&&target.y<=H)return null;
  const cx=W/2,cy=H/2,dx=target.x-cx,dy=target.y-cy,margin=36;
  const scale=Math.min((W/2-margin)/Math.max(.001,Math.abs(dx)),(H/2-margin)/Math.max(.001,Math.abs(dy)));
  const marker={x:cx+dx*scale,y:cy+dy*scale};
  // Leave the top-center timer readable, while keeping the arrow aimed at the pickup.
  if(marker.y<=margin+.001&&Math.abs(marker.x-cx)<90)marker.x=clamp(cx+(dx<0?-90:90),margin,W-margin);
  marker.angle=Math.atan2(target.y-marker.y,target.x-marker.x);return marker;
}
function drawBunchIndicators(){
  for(const p of pickups){
    const marker=bunchIndicator(p);if(!marker)continue;
    ctx.save();ctx.translate(marker.x,marker.y);ellipse(0,0,17,17,'#302b25dd','#c9ac64');
    if(groundSprite.complete&&groundSprite.naturalWidth)drawGroundFrame(2,32,32);
    else{ctx.fillStyle='#dfc579';ctx.font='bold 13px sans-serif';ctx.textAlign='center';ctx.fillText('蕉',0,5);}
    ctx.rotate(marker.angle);ctx.beginPath();ctx.moveTo(29,0);ctx.lineTo(20,-6);ctx.lineTo(20,6);ctx.closePath();ctx.fillStyle='#ddc77e';ctx.fill();ctx.restore();
  }
}
function drawPeel(p){
  if(!isInView(p,p.red||p.large?140:70))return;
  if(!groundSprite.complete||!groundSprite.naturalWidth){drawPeelVector(p);return;}
  const s=screen(p.x,p.y);ctx.save();ctx.globalAlpha=1;ctx.translate(s.x,s.y);
  ellipse(0,5,p.red||p.large?44:22,p.red||p.large?12:6,'#48325522');if(p.red)ctx.rotate(p.angle||0);if(p.red||p.large)ctx.scale(2,2);
  if(p.red&&p.slideTime>0){ctx.beginPath();ctx.moveTo(-43,-4);ctx.lineTo(-28,-4);ctx.moveTo(-51,5);ctx.lineTo(-29,5);ctx.strokeStyle='#ed9e9480';ctx.lineWidth=2.5;ctx.stroke();}
  drawGroundFrame(p.red?1:0,62,46);ctx.restore();
}
function drawPeelVector(p){const s=screen(p.x,p.y);ctx.save();ctx.globalAlpha=1;ctx.translate(s.x,s.y);if(p.red||p.large){if(p.red)ctx.rotate(p.angle||0);ctx.scale(2,2);if(p.slideTime>0){ctx.beginPath();ctx.moveTo(-42,-4);ctx.lineTo(-25,-4);ctx.moveTo(-52,5);ctx.lineTo(-27,5);ctx.strokeStyle='#f8b0a9';ctx.lineWidth=3;ctx.stroke();}}ellipse(0,4,21,7,'#5b40751c');ctx.beginPath();ctx.moveTo(0,-10);ctx.quadraticCurveTo(-3,7,-22,6);ctx.quadraticCurveTo(-16,14,-3,6);ctx.lineTo(1,15);ctx.quadraticCurveTo(9,7,4,-2);ctx.quadraticCurveTo(12,12,25,7);ctx.quadraticCurveTo(12,7,3,-11);ctx.closePath();ctx.fillStyle=p.red?'#e66c63':p.age<.5?'#ffffc1':'#f5d874';ctx.strokeStyle='#8f7346';ctx.lineWidth=1.4;ctx.fill();ctx.stroke();ctx.restore();}
function drawFloor(){
  ctx.fillStyle='#625b50';ctx.fillRect(0,0,W,H);
  if(!floorTile.complete||!floorTile.naturalWidth)return;
  const size=768;
  const minX=Math.floor((player.x-W/2-8)/size),maxX=Math.ceil((player.x+W/2+8)/size);
  const minY=Math.floor((player.y-H*.52/.72-8)/size),maxY=Math.ceil((player.y+H*.48/.72+8)/size);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  for(let tx=minX;tx<maxX;tx++)for(let ty=minY;ty<maxY;ty++){
    const a=screen(tx*size,ty*size),b=screen((tx+1)*size,(ty+1)*size);
    const left=Math.floor(a.x*dpr)/dpr,top=Math.floor(a.y*dpr)/dpr;
    const right=Math.floor(b.x*dpr)/dpr,bottom=Math.floor(b.y*dpr)/dpr;
    ctx.save();if(!mutedFloor)ctx.filter='saturate(0.5) brightness(0.56)';ctx.drawImage(mutedFloor||floorTile,left,top,right-left,bottom-top);ctx.restore();
  }
}
function enemyChargeProgress(e){
  if(e.hp<=0||e.down>0||e.knock>0||e.hit>0)return null;
  if(e.type==='thrower'&&e.phase==='windup')return clamp(1-e.phaseTime/.65,0,1);
  if(e.type==='charger'&&e.phase==='aim')return clamp(1-e.phaseTime/.5,0,1);
  if(e.type==='slice'&&e.stackAnchor&&(e.stackCount||1)>1&&!e.sliceFlight){
    return e.stackCount===sliceRules.count?clamp(e.stackTime/sliceRules.charge,0,1):clamp((e.stackTime-e.nextSliceShot+sliceRules.shotInterval)/sliceRules.shotInterval,0,1);
  }
  return null;
}
function drawEnemyCharge(e,u){
  const radius=isLargeBanana(e)?67:43,time=e.type==='charger'?.5-e.phaseTime:e.type==='thrower'?.65-e.phaseTime:e.stackTime,pulse=(Math.sin(time*24)+1)*.5;
  ctx.save();
  ellipse(0,4,radius,12,'#d5aa5c22');
  ctx.strokeStyle=`rgba(235,185,103,${.4+u*.35})`;ctx.lineWidth=2+u;
  ctx.beginPath();ctx.ellipse(0,4,radius*(1.25-u*.3),radius*.28*(1.25-u*.3),0,0,TAU);ctx.stroke();
  for(let i=0;i<6;i++){
    const a=i*TAU/6,r=radius*(1.4-((time*1.8+i/6)%1)*.7),x=Math.cos(a)*r,y=Math.sin(a)*r*.5-20;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(a)*(7+u*7),y-Math.sin(a)*(4+u*4));ctx.stroke();
  }
  if(e.type==='thrower'){
    const x=(e.facing||1)*48;
    ctx.strokeStyle=`rgba(238,180,119,${.45+u*.4})`;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(x,-50,24+u*5,24+u*5,0,0,TAU);ctx.stroke();
    for(let i=0;i<4;i++){const a=i*TAU/4+time*3;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*38,-50+Math.sin(a)*38);ctx.lineTo(x+Math.cos(a)*30,-50+Math.sin(a)*30);ctx.stroke();}
  }
  ellipse(0,4,radius*.78,9,'#edcd881a');ctx.restore();
  // Body compression and a quick shiver reinforce the shared warning ring.
  ctx.translate(Math.sin(time*42)*(1+u)*1.5,-pulse*u*2);ctx.scale(1+u*.05,1-u*.08);
}
function drawEnemyActor(e){
  const p=screen(e.x,e.y),scale=characterScale();ctx.save();ctx.translate(p.x,p.y);ctx.scale(scale,scale);if(e.rise>0)ctx.scale(1,Math.max(.05,1-e.rise/.6));
  ellipse(5,8,isLargeBanana(e)?40:22,isLargeBanana(e)?11:7,'#4b336e26');
  if(e.hit>0)ctx.globalAlpha=.65;
  const charging=enemyChargeProgress(e);if(charging!==null)drawEnemyCharge(e,charging);
  if(e.type==='durian'){ctx.translate(0,-15-(e.z||0));ctx.rotate((e.rollAngle||0)+(e.down>0?1.3:0));ctx.translate(0,15);durian(0,0,0,e.facing||1);}
  else if(e.type==='slice'||e.type==='milk')drawMilkEnemy(e);
  else drawEnemyGhost(e,0,Math.sin(elapsed*5+e.wobble)*2);
  ctx.restore();
}
function playerDamageBlink(){return player.inv>0&&player.damageInv>0&&player.stompGuard<=0&&Math.floor(player.inv*12)%2===0&&!special;}
function drawPlayerActor(){
  if(boxSequence){drawBoxSequence();return;}
  const foot=screen(player.x,player.y),scale=characterScale();ctx.save();ctx.translate(foot.x,foot.y);ctx.scale(scale,scale);
  ellipse(6,9,26,10,'#e8f58b50','#e9f8a7');ellipse(6,9,Math.max(9,21-player.z*.08),7,'#44305735');
  if(player.inv>0&&!special&&(player.damageInv<=0||player.stompGuard>0)){
    ctx.save();ctx.strokeStyle='#cde9c3aa';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(4,-player.z-39,31,46,0,0,TAU);ctx.stroke();ctx.restore();
  }
  ctx.save();if(playerDamageBlink())ctx.globalAlpha=.4;
  if(player.recoil>0&&player.stompGuard>0){ctx.strokeStyle='#d5efb4';ctx.lineWidth=2;for(const x of [-22,27]){ctx.beginPath();ctx.moveTo(x-4,-player.z-19);ctx.lineTo(x,-player.z-27);ctx.lineTo(x+4,-player.z-19);ctx.stroke();}}
  drawMilkPack();
  if(special?.mode==='surf')drawSurfHero();
  else if(special){ellipse(5,-player.z-10,35,32,'#ebf58c44');drawHero(0,-player.z,1.12,player.face,special.t*TAU*3);}
  else drawHero(0,-player.z,1.12,player.face,Math.sin(player.face)*.04,player.down>0);
  ctx.restore();drawMilkAmmo();
  if(scale===1&&!special&&!milkPack&&player.down<=0){ctx.fillStyle='#e4d6af';ctx.font='bold 9px sans-serif';ctx.textAlign='center';ctx.fillText('YOU',6,-player.z-90);}
  ctx.restore();
}
function render(){if(!assetsReady)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);ctx.save();if(shake>0)ctx.translate((Math.random()-.5)*8,(Math.random()-.5)*8);drawFloor();
const edge=screen(-arenaSize,-arenaSize),edge2=screen(arenaSize,arenaSize);ctx.strokeStyle='#948572';ctx.lineWidth=5;ctx.setLineDash([14,12]);ctx.strokeRect(edge.x,edge.y,edge2.x-edge.x,edge2.y-edge.y);ctx.setLineDash([]);
if(state==='intro'){for(const b of [{x:-W*.3,y:30,c:ripenessColors[3]},{x:W*.32,y:85,c:ripenessColors[2]},{x:-W*.24,y:220,c:ripenessColors[1]},{x:W*.23,y:-150,c:ripenessColors[2]}]){const p=screen(b.x,b.y);ellipse(p.x+8,p.y+9,24,8,'#44305722');drawEnemyGhost({x:b.x,hp:b.c===ripenessColors[3]?3:b.c===ripenessColors[2]?2:1,type:'normal',hit:0,down:0},p.x,p.y);} }
drawBossGround();drawGiantGround();peels.forEach(drawPeel);pickups.forEach(drawBunch);surfPickups.forEach(drawSurfPickup);orbitPeels.forEach(drawOrbitPeel);


drawSpawnWarnings();
for(const warning of durianWarnings){if(!isInView(warning,90))continue;const p=screen(warning.x,warning.y);ellipse(p.x,p.y,32,23,'#fff1a055','#845335');ctx.fillStyle='#dbb998';ctx.textAlign='center';ctx.font='bold 23px sans-serif';ctx.fillText('!',p.x,p.y+6);ctx.font='bold 10px sans-serif';ctx.fillText('榴槤來襲',p.x,p.y-34);}

if(special){special.trail.forEach((p,i)=>{if(!isInView(p,40,10))return;const s=screen(p.x,p.y,10);ellipse(s.x,s.y,18,10,`rgba(239,248,139,${i/special.trail.length*.4})`);});}
drawBossRitualBackdrop();
const actors=enemies.filter(e=>e.hp>0&&isInView(e,260+(e.z||0))).map(e=>({y:e.y,draw:()=>drawEnemyActor(e)}));
if(boss)actors.push({y:boss.y,draw:()=>drawBossActor(boss)});for(const clone of bossClones)actors.push({y:clone.y,draw:()=>drawBossActor(clone)});if(boss?.cinematic?.kind==='split'&&!boss.cinematic.spawned)for(const target of boss.cinematic.targets)actors.push({y:target.y,draw:()=>drawBossClonePreview(target)});for(const bottle of milkBottles)if(isInView(bottle,100))actors.push({y:bottle.y,draw:()=>drawMilkPickup(bottle)});addGiantActors(actors);actors.push({y:player.y,draw:drawPlayerActor});actors.sort((a,b)=>a.y-b.y).forEach(a=>a.draw());
drawBossRitualHighlights();drawBossShots();drawMilkEffects();drawGiantEffects();particles.forEach(p=>{if(!isInView(p,10,p.z))return;const s=screen(p.x,p.y,p.z);ctx.globalAlpha=clamp(p.life*2,0,1);ctx.fillStyle=p.color;ctx.fillRect(s.x,s.y,4,4);});ctx.globalAlpha=1;texts.forEach(t=>{if(!isInView(t,100,t.z))return;const s=screen(t.x,t.y,t.z);ctx.globalAlpha=clamp(t.life*2,0,1);ctx.fillStyle='#fbffe0';ctx.strokeStyle='#665080';ctx.lineWidth=3;ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.strokeText(t.text,s.x,s.y);ctx.fillText(t.text,s.x,s.y);});ctx.globalAlpha=1;const grad=ctx.createRadialGradient(W/2,H/2,H*.25,W/2,H/2,Math.max(W,H)*.7);grad.addColorStop(0,'#39271500');grad.addColorStop(1,'#39271522');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);ctx.restore();if(state==='playing'||state==='paused'){drawBunchIndicators();drawSurfIndicators();drawSurfFlights();}}
// Keep moving bucket membership current so collision response preserves pair order.
function separateEnemies(){
  const scale=characterScale(),grid=new Map(),entries=new Array(enemies.length),marks=new Uint32Array(enemies.length),heap=[];let checks=0,stamp=0;
  function relocate(index){
    const entry=entries[index],previous=entry.key,key=locateCollisionCell(entry.actor);if(key===previous)return false;
    if(previous!==undefined){const bucket=grid.get(previous);bucket.delete(index);if(!bucket.size)grid.delete(previous);}
    let bucket=grid.get(key);if(!bucket){bucket=new Set();grid.set(key,bucket);}bucket.add(index);entry.key=key;return true;
  }
  function enqueue(index){
    if(marks[index]===stamp)return;marks[index]=stamp;
    let pos=heap.length;heap.push(index);
    while(pos>0){const parent=(pos-1)>>1;if(heap[parent]<=index)break;heap[pos]=heap[parent];pos=parent;}heap[pos]=index;
  }
  function next(){
    const result=heap[0],last=heap.pop();
    if(heap.length){let pos=0;while(pos*2+1<heap.length){let child=pos*2+1;if(child+1<heap.length&&heap[child+1]<heap[child])child++;if(heap[child]>=last)break;heap[pos]=heap[child];pos=child;}heap[pos]=last;}
    return result;
  }
  function nearby(actor,after){
    for(let x=actor.gridX-1;x<=actor.gridX+1;x++)for(let y=actor.gridY-1;y<=actor.gridY+1;y++){
      const bucket=grid.get(collisionGridKey(x,y));if(bucket)for(const index of bucket)if(index>after)enqueue(index);
    }
  }
  for(let i=0;i<enemies.length;i++){
    const actor=enemies[i];if(actor.hp<=0||actor.sliceFlight||actor.sliceHop||actor.stackAnchor||actor.carriedBy!==undefined||actor.projectile)continue;
    entries[i]={actor,radius:(isLargeBanana(actor)?32:16)*scale};relocate(i);
  }
  for(let i=0;i<entries.length;i++){
    const entry=entries[i];if(!entry)continue;const a=entry.actor;heap.length=0;stamp++;nearby(a,i);
    while(heap.length){
      const j=next(),other=entries[j],b=other.actor;checks++;
      const dx=a.x-b.x,dy=a.y-b.y,squared=dx*dx+dy*dy,separation=entry.radius+other.radius;
      if(squared===0||squared>=separation*separation)continue;
      const d=Math.sqrt(squared),push=separation-d;
      const aRam=a.type==='charger'&&a.phase==='dash'&&b.type!=='durian',bRam=b.type==='charger'&&b.phase==='dash'&&a.type!=='durian';
      if(a.type==='slice'&&a.drinking>0&&!(b.type==='slice'&&b.drinking>0)){b.x-=dx/d*push;b.y-=dy/d*push;}else if(b.type==='slice'&&b.drinking>0&&!(a.type==='slice'&&a.drinking>0)){a.x+=dx/d*push;a.y+=dy/d*push;}else if(aRam&&!bRam){b.x-=dx/d*push;b.y-=dy/d*push;}else if(bRam&&!aRam){a.x+=dx/d*push;a.y+=dy/d*push;}else{a.x+=dx/d*push*.5;a.y+=dy/d*push*.5;b.x-=dx/d*push*.5;b.y-=dy/d*push*.5;}
      relocate(j);if(relocate(i))nearby(a,j);
    }
  }
  return checks;
}
function update(dt){if(state!=='playing'||mobilePlayBlocked)return;if(boxSequence){updateBoxSequence(dt);updateHUD();return;}if(isBossWorldFrozen()){if(isBossEntrance())updateBossEntrance(dt);else if(isGiantEntrance())updateGiantEntrance(dt);else updateBossCinematic(dt);return;}trackBattlePeaks();const playerFrom={x:player.x,y:player.y,z:player.z};const pickupPath={x:player.x,y:player.y,grounded:player.z<=0,dashing:!!special,surfing:special?.mode==='surf'};const oldRate=musicRate();elapsed+=dt;if(!boss&&!giantBattle&&elapsed>=roundDuration()){elapsed=roundDuration();spawnWarnings=[];spawnDueWaves=0;spawnReleaseClock=0;if(milkStage)beginGiantBattle();else startBossBattle();return;}if(milkStage&&!giantBattle&&[30,50].some(t=>elapsed-dt<t&&elapsed>=t))spawnClock=Math.min(spawnClock,smallSpawnInterval());if(oldRate!==musicRate())updateMusicRate();const enemyDt=dt*gameTempo();player.inv=Math.max(0,player.inv-dt);player.damageInv=Math.max(0,(player.damageInv||0)-dt);player.stompGuard=Math.max(0,player.stompGuard-dt);player.jumpLock=Math.max(0,player.jumpLock-dt);player.slipCooldown=Math.max(0,player.slipCooldown-dt);comboLife-=dt;if(comboLife<=0)combo=0;noticeLife-=dt;if(noticeLife<=0)$('notice').textContent='';shake=Math.max(0,shake-dt);
updatePeels(dt);if(giantBattle){updateGiantBattle(dt);if(state!=='playing')return;if(isGiantNameEntrance()){updateHUD();return;}}
let stompPending=false;
let mx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+stick.x,my=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+stick.y;let m=Math.hypot(mx,my);if(m>1){mx/=m;my/=m;}if(m>.1)player.face=Math.atan2(my,mx);
if(special){
  const s=special;s.feedFlash=Math.max(0,(s.feedFlash||0)-dt);const step=Math.min(dt,Math.max(0,s.duration-s.t));s.t=Math.min(s.duration,s.t+dt);if(s.t>=s.nextSound){sfx('whoosh');s.nextSound=s.t+.24;}if(s.mode==='surf')steerSurf(s,mx,my,step);
  const dashFromX=player.x,dashFromY=player.y;
  player.x=clamp(player.x+s.dx*s.speed*step,-arenaSize,arenaSize);player.y=clamp(player.y+s.dy*s.speed*step,-arenaSize,arenaSize);player.z=s.mode==='surf'?0:10;player.face=Math.atan2(s.dy,s.dx);
  if(s.mode==='surf')feedSurf(s,dashFromX,dashFromY);
  collectBunchPickups(pickupPath);collectSurfPickups(pickupPath);
  s.trail.push({x:player.x,y:player.y});if(s.trail.length>24)s.trail.shift();
  if(boss)for(const target of [boss,...bossClones]){
    if(s.hits.has(target)||segmentDistance(target,dashFromX,dashFromY,player.x,player.y)>96*characterScale())continue;
    if(hitBoss(target,false))s.hits.add(target);
    if(state!=='playing'||isBossWorldFrozen())return;
  }
  if(giantBattle&&s.mode!=='surf')for(const g of liveGiants()){
    if(s.hits.has(g)||!giantBodyParts(g).some(p=>p.z<=player.z+60*characterScale()&&p.z+(p.head?101:66)*characterScale()>=player.z-15*characterScale()&&segmentDistance(p,dashFromX,dashFromY,player.x,player.y)<=96*characterScale()))continue;
    if(hitGiant(g,false))s.hits.add(g);
  }
  for(const e of enemies){
    if(e.hp<=0||e.carriedBy!==undefined||(s.mode==='surf'?segmentDistance(e,dashFromX,dashFromY,player.x,player.y):dist(player,e))>((isLargeBanana(e)?96:80)*characterScale()))continue;
    if(s.hits.has(e.id))continue;
    if(e.type!=='durian'&&e.hit>0)continue;
    s.hits.add(e.id);
    if(e.type==='durian'){const dx=e.x-player.x,dy=e.y-player.y,l=Math.hypot(dx,dy)||1;e.kx=dx/l*400;e.ky=dy/l*400;e.knock=.5;burst(e.x,e.y,'#d8e89b');}
    else{const before=enemies.length;hitEnemy(e,false);for(let i=before;i<enemies.length;i++)s.hits.add(enemies[i].id);if(s.mode==='surf'&&e.hp>0){const a=Math.atan2(e.y-player.y,e.x-player.x);e.knock=.35;e.kx=Math.cos(a)*320;e.ky=Math.sin(a)*320;}}
  }
  if(s.t>=s.duration){special=null;player.inv=Math.max(player.inv,.5);player.z=0;player.vz=0;player.slipCooldown=Math.max(player.slipCooldown,s.mode==='surf'?.6:.3);}
}
else if(player.recoil>0){
  const step=Math.min(dt,player.recoil);player.recoil=Math.max(0,player.recoil-dt);
  player.x+=player.recoilX*step;player.y+=player.recoilY*step;
  player.z=Math.max(0,player.z+player.vz*step-415*step*step);player.vz-=830*step;
  if(player.recoil<=0&&player.z<=0){player.z=0;player.vz=0;}
}
else if(player.down>0){slide(player,dt);}
else{player.x+=mx*205*dt;player.y+=my*205*dt;if(player.z>0){player.x+=(player.padDriftX||0)*dt;player.y+=(player.padDriftY||0)*dt;player.padDriftX*=Math.exp(-2.5*dt);player.padDriftY*=Math.exp(-2.5*dt);}const wasZ=player.z;if(milkJetActive())moveMilkJet(dt);else{player.vz-=830*dt;player.z+=player.vz*dt;}
const giantLanding=player.vz<0&&resolveGiantLanding(wasZ,player.z);
if(!giantLanding&&player.vz<0&&wasZ>5&&(player.z<=43||milkStage)&&!tryStompBoss())stompPending=true;
if(player.z<=0&&!stompPending){player.z=0;player.vz=0;player.giantBoostUntil=0;player.padDriftX=player.padDriftY=0;if(wasZ>0&&comboLife<.9){combo=0;comboLife=0;}}}
player.x=clamp(player.x,-arenaSize,arenaSize);player.y=clamp(player.y,-arenaSize,arenaSize);
updateSpawnHeading(player.x-playerFrom.x,player.y-playerFrom.y,dt);
protectStompLanding();
if(isBossWorldFrozen()){updateHUD();return;}
// Pickups protect the player before same-frame contact damage.
collectBunchPickups(pickupPath);
if(milkStage)updateOffscreenSliceRallies();
for(const e of enemies){if(e.hp<=0)continue;const oldX=e.x,oldY=e.y,wasRolling=e.knock>0||e.down>0;if(e.type==='slice')e.sliceFrom={x:e.x,y:e.y,z:e.z||0};e.hit=Math.max(0,e.hit-dt);e.slipCooldown=Math.max(0,(e.slipCooldown||0)-dt);if(e.rise>0)e.rise=Math.max(0,e.rise-dt);if(e.carriedBy!==undefined){continue;}else if(e.projectile){updateThrownDurian(e,enemyDt);}else if(e.knock>0){e.knock-=dt;e.x+=e.kx*dt;e.y+=e.ky*dt;}else if(e.down>0){slide(e,dt);}else if(e.type==='slice'||e.type==='milk'){moveMilkEnemy(e,dt);}else if(e.type==='charger'){updateCharger(e,dt,gameTempo());}else if(e.type==='thrower'){updateThrower(e,dt,gameTempo());}else{const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy)||1;const travel=Math.min(d,enemyWalkSpeed(e)*dt);e.x+=dx/d*travel;e.y+=dy/d*travel;}const bound=arenaSize-(isLargeBanana(e)?52:0);e.x=clamp(e.x,-bound,bound);e.y=clamp(e.y,-bound,bound);if(e.type==='durian'&&!e.projectile)advanceDurianRoll(e,oldX,oldY,wasRolling);updateEnemyFacing(e);}
for(const fruit of enemies){if(fruit.carriedBy===undefined)continue;const owner=enemies.find(e=>e.id===fruit.carriedBy&&e.hp>0);if(owner){fruit.x=owner.x+(owner.facing||1)*48*characterScale();fruit.y=owner.y+8;fruit.z=50;}else{delete fruit.carriedBy;fruit.z=0;}}
// Resolve descending stomps using the same post-movement positions as contact damage.
if(stompPending){
  if(state==='playing'&&player.down<=0&&player.recoil<=0&&player.vz<0){
    const target=enemies.filter(e=>e.hp>0&&e.type!=='durian'&&!e.sliceFlight&&e.hit<=0&&player.z<=43+(e.type==='slice'?(e.z||0):0)&&dist(player,e)<((isLargeBanana(e)?46:30)*characterScale())).sort((a,b)=>dist(player,a)-dist(player,b))[0];
    if(target&&hitEnemy(target,true)&&player.recoil<=0){player.z=43;player.vz=310;player.jumpLock=.1;}
  }
  if(player.z<=0){player.z=0;player.vz=0;player.giantBoostUntil=0;player.padDriftX=player.padDriftY=0;if(comboLife<.9){combo=0;comboLife=0;}}
}
if(milkStage){updateMilkStage(dt,pickupPath);if(state!=='playing')return;}
// Build once after movement and skill hits, before checking all grounded actors.
const peelGrid=buildPeelGrid();
// Grounded actors can be tripped by stationary or fast-moving red peels.
if(!special&&player.z<=0&&player.down<=0&&player.slipCooldown<=0){const p=touchingPeel(player,peelGrid);if(p){if(!p.red){peelGrid.consumed.add(p);peels.splice(peels.indexOf(p),1);}slip(player,p.red&&p.slideTime>0?p.angle:player.face);}}
for(const e of enemies){if(e.hp<=0||e.carriedBy!==undefined||e.projectile||e.down>0||e.knock>0||e.slipCooldown>0)continue;const p=touchingPeel(e,peelGrid);if(p){if(!p.red){peelGrid.consumed.add(p);peels.splice(peels.indexOf(p),1);}slip(e,p.red&&p.slideTime>0?p.angle:Math.atan2(player.y-e.y,player.x-e.x));if(e.type==='charger'){e.phase='approach';e.phaseTime=0;}}}
// Fallen enemies are harmless; the player remains vulnerable while sliding or down.
for(const e of enemies){if(e.hp<=0||e.down>0||special||e.carriedBy!==undefined||e.projectile)continue;if(e.type==='slice'){if(e.hit<=0&&sliceContact(e,playerFrom)){hurt(e.sliceFlight?'被飛射蕉片擊中':'撞到跳躍蕉片');break;}continue;}const d=dist(player,e);if(e.type==='durian'&&d<35*characterScale()){hurt('撞到榴槤');break;}if(e.type!=='durian'&&e.hit<=0&&player.z<18&&d<(isLargeBanana(e)?45:29)*characterScale()){hurt('撞到香蕉');break;}}
if(state!=='playing')return;giantContacts();if(state!=='playing')return;
updateBoss(dt);if(state!=='playing')return;if(!milkStage){if(!boss){updateDurianSchedule();updateChargerSchedule();updateThrowerSchedule();}updateItems(dt,pickupPath);updateSurfItems(dt,pickupPath);}
// Gentle separation keeps targets readable and stops enemies stacking into one hitbox.
separateEnemies();
enemies=enemies.filter(e=>e.hp>0);updateNaturalArrivals(dt);peels.forEach(p=>p.age+=dt);particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vz-=380*dt;p.z+=p.vz*dt;});particles=particles.filter(p=>p.life>0);texts.forEach(t=>{t.life-=dt;t.z+=dt*32;});texts=texts.filter(t=>t.life>0);trackBattlePeaks();updateHUD();}
function finish(win){
  if(state==='over')return;
  trackBattlePeaks();clearMilkJetInput();state='over';$('finalCountdown').hidden=true;syncMusic();endElapsed=0;shake=0;keys.clear();stick.x=stick.y=0;
  $('arena')?.classList.add('ended');$('overlay').classList.add('ending');
  $('endWipe').hidden=false;$('endWipe').style.clipPath='inset(0 0 100% 0)';
  if(win)$('overlay').classList.add('victory');else $('overlay').classList.remove('victory');
  $('overlayTitle').innerHTML=milkStage&&win?'<span class="end-line">香蕉片巨人擊破</span><span class="end-line victory-second">蕉片崛起過關！</span>':win?'<span class="end-line">歷盡千蕉百難</span><span class="end-line victory-second">終成不敗蕉王</span>':'<span class="end-line">天有不測風雲</span><span class="end-line end-line-brick">蕉有旦夕禍福</span>';
  $('overlayText').textContent='';
  $('overlayText').hidden=true;
  const results=[
    ['存活時間',`${Math.floor(elapsed)} 秒`],['場上最多敵人',`${stats.maxEnemies} 隻`],['擊敗總數',`${kills} 根`],
    ['最大連踩',`${stats.maxCombo} 連`],['踩掉香蕉',`${stats.stompKills} 根`],['場上最多蕉皮',`${stats.maxPeels} 片`],
    ['衝刺次數',`${stats.dashes} 次`],['衝浪次數',`${stats.surfs} 次`],['衝浪吸收蕉皮',`${stats.surfPeels} 片`],
    ['撿到香蕉串',`${stats.bunches} 串`],['滑倒次數',`${stats.slips} 次`]
  ];
  $('resultStats').innerHTML=results.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');$('resultStats').hidden=false;
  $('modeOptions').hidden=false;$('start').innerHTML='重新挑戰 <span>↗</span>';$('start').disabled=true;
  $('keyboardStartHint').hidden=false;$('keyboardStartHint').textContent='結算中…稍後可按 SPACE 重新挑戰';$('overlayFoot').textContent='';$('overlay').hidden=false;updateHUD();sfx(win?'win':'lose');
}
function tickEnding(dt){endElapsed=Math.min(2,endElapsed+dt);$('endWipe').style.clipPath=`inset(0 0 ${(1-endElapsed/2)*100}% 0)`;if(endElapsed>=2){$('start').disabled=false;$('keyboardStartHint').textContent='按 SPACE 重新挑戰';}}

function pause(){if(state==='playing'){clearMilkJetInput();$('keyboardStartHint').hidden=true;$('overlayText').hidden=false;$('overlay').classList.add('intro-screen');$('resultStats').hidden=true;state='paused';updateSurfHUD();updateMilkHUD();$('finalCountdown').hidden=true;syncMusic();keys.clear();stick.x=stick.y=0;$('knob').style.transform='';$('overlayTitle').textContent='香蕉休息中';$('overlayText').textContent=characterScale()<1?'左側搖桿移動 · 右側跳踩／衝刺／衝浪':'移動：WASD／方向鍵 · 跳踩：空白鍵 · 衝刺：J · 衝浪：K';$('start').innerHTML='繼續蹦跳 <span>↗</span>';$('overlay').hidden=false;$('pause').textContent='▶';}else if(state==='paused'){$('overlay').classList.remove('intro-screen');state='playing';syncMusic();updateHUD();$('overlay').hidden=true;$('pause').textContent='Ⅱ';canvas.focus();}}
// Mobile sessions require landscape; use native fullscreen where the browser supports it.
let mobilePlayBlocked=false,mobilePlayRequested=false,mobilePlayPending=null;
function mobileViewportStatus(){
  const mobile=characterScale()<1,landscape=(window.innerWidth||W)>(window.innerHeight||H);
  const native=!!document.documentElement?.requestFullscreen&&document.fullscreenEnabled!==false;
  return {mobile,landscape,native,fullscreen:!!document.fullscreenElement};
}
function updateMobileViewport(){
  const view=mobileViewportStatus(),active=mobilePlayRequested&&view.mobile;
  const blocked=active&&(!view.landscape||(view.native&&!view.fullscreen));
  const changed=blocked!==mobilePlayBlocked;mobilePlayBlocked=blocked;
  $('mobileGate').hidden=!blocked;
  $('mobileGateText').textContent=!view.landscape?'請將手機轉為橫向遊玩':'請進入全螢幕繼續遊玩';
  $('mobileFullscreen').hidden=!view.native||view.fullscreen;
  if(blocked){clearMilkJetInput();keys.clear();stick.x=stick.y=0;$('knob').style.transform='';}
  if(changed)syncMusic();
  if(!blocked&&mobilePlayPending){const action=mobilePlayPending;mobilePlayPending=null;action();}
}
async function enterMobilePlay(){
  mobilePlayRequested=true;
  const view=mobileViewportStatus();
  try{if(view.mobile&&view.native&&!view.fullscreen)await document.documentElement.requestFullscreen();}catch{}
  try{if(view.mobile)await window.screen?.orientation?.lock?.('landscape');}catch{}
  updateMobileViewport();resize();
}
function startRequested(){
  if(state==='over'&&endElapsed<2)return;
  const action=()=>state==='paused'?pause():reset();
  if(characterScale()>=1){action();return;}
  unlockAudio();mobilePlayPending=action;enterMobilePlay();
}
$('mobileFullscreen').addEventListener('click',enterMobilePlay);
window.addEventListener('resize',updateMobileViewport);
document.addEventListener('fullscreenchange',updateMobileViewport);
$('loadingRetry').addEventListener('click',loadGameAssets);
$('start').addEventListener('click',startRequested);$('pause').addEventListener('click',pause);$('help').addEventListener('click',()=>{if(state==='playing')pause();else if(state==='intro')notify('踩熟香蕉集氣 · 香蕉皮會滑倒，撞到敵人會扣血');});function setVolume(value){
  const wasSound=sound;
  volumeLevel=clamp(Number(value)||0,0,100)/100;sound=volumeLevel>0;
  if(sound)lastVolumeLevel=volumeLevel;
  $('volume').value=String(Math.round(volumeLevel*100));
  $('volume').setAttribute('aria-valuetext',sound?`${Math.round(volumeLevel*100)}%`:'靜音');
  $('volumeLabel').textContent=sound?`${Math.round(volumeLevel*100)}%`:'靜音';
  $('sound').textContent=sound?'♪':'×';$('sound').setAttribute('aria-label',sound?'靜音':'取消靜音');$('sound').setAttribute('aria-pressed',String(!sound));
  if(audioOutput?.context===audioCtx&&audioOutput){const g=audioOutput.output.gain;g.cancelScheduledValues?.(audioCtx.currentTime);g.setTargetAtTime?.(volumeLevel,audioCtx.currentTime,.015);}
  if(sound)unlockAudio();
  if(wasSound!==sound)syncMusic();
}
$('volume').addEventListener('input',e=>setVolume(e.target.value));
$('volume').addEventListener('pointerdown',()=>keys.clear());
$('sound').addEventListener('click',()=>{setVolume(sound?0:lastVolumeLevel*100);if(state==='playing')canvas.focus();});
function selectDebugStage(){
  if(!debugUnlocked)return;
  const value=$('debugStart').value;
  if(['62','32','12','boss-5','boss-2'].includes(value))$('gameMode').value=value.startsWith('boss-')?'boss':'survival';
}
$('debugStart').addEventListener('change',selectDebugStage);
function handleDebugCode(e){
  if(state!=='intro'||e.repeat||e.target===$('debugStart')||e.target===$('debugInvincible'))return false;
  const letter=/^Key[A-Z]$/.test(e.code||'')?e.code.slice(3).toLowerCase():(e.key||'').toLowerCase();
  if(!/^[a-z]$/.test(letter))return false;
  debugCode=(debugCode+letter).slice(-6);
  if(debugCode==='banana'){debugUnlocked=true;$('debugOptions').hidden=false;selectDebugStage();debugCode='';}
  return true;
}
function gameKey(e){const physical={KeyW:'w',KeyA:'a',KeyS:'s',KeyD:'d',KeyJ:'j',KeyK:'k',KeyP:'p',Space:' ',ArrowUp:'arrowup',ArrowDown:'arrowdown',ArrowLeft:'arrowleft',ArrowRight:'arrowright',Escape:'escape'};return physical[e.code]||(e.key||'').toLowerCase();}
function handleKeyDown(e){
  if(e.metaKey||e.ctrlKey||e.altKey||e.target===$('volume')||e.target===$('sound')||e.target===$('debugStart')||e.target===$('debugInvincible'))return;
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName))return;
  if(handleDebugCode(e)){e.preventDefault();return;}
  const k=gameKey(e);if(!['w','a','s','d','j','k','p',' ','arrowup','arrowdown','arrowleft','arrowright','escape'].includes(k))return;
  if(k===' '&&characterScale()>=1&&(state==='intro'||state==='over')){
    e.preventDefault();if(!e.repeat&&assetsReady&&!$('start').disabled)startRequested();return;
  }
  e.preventDefault();keys.add(k);
  if(!e.repeat){if(k===' ')jump();if(k==='j')activate();if(k==='k')activateSurf();if(k==='p'||k==='escape')pause();}
}
function handleKeyUp(e){keys.delete(gameKey(e));}
window.addEventListener('keydown',handleKeyDown,true);window.addEventListener('keyup',handleKeyUp,true);
canvas.addEventListener('pointerdown',()=>{canvas.focus();unlockAudio();});
window.addEventListener('blur',()=>{keys.clear();if(state==='playing')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause();});
function startMilkJetTouch(e){e.preventDefault();if(state!=='playing'||isBossWorldFrozen())return;milkJetTouch=e.pointerId;$('jumpTouch').setPointerCapture(e.pointerId);jump();}
function releaseMilkJetTouch(e){if(e.pointerId===milkJetTouch)clearMilkJetInput();}
$('jumpTouch').addEventListener('pointerdown',startMilkJetTouch);['pointerup','pointercancel','lostpointercapture'].forEach(event=>$('jumpTouch').addEventListener(event,releaseMilkJetTouch));$('specialTouch').addEventListener('pointerdown',e=>{e.preventDefault();activate();});
$('surfUse').addEventListener('pointerdown',e=>{e.preventDefault();activateSurf();});
function moveStick(e){const b=$('stick').getBoundingClientRect(),dx=e.clientX-b.left-b.width/2,dy=e.clientY-b.top-b.height/2,d=Math.hypot(dx,dy),r=b.width*.3;stick.x=dx/Math.max(r,d);stick.y=dy/Math.max(r,d);$('knob').style.transform=`translate(${stick.x*r}px,${stick.y*r}px)`;}
$('stick').addEventListener('pointerdown',e=>{e.preventDefault();if(stickPointer!==null)return;stickPointer=e.pointerId;$('stick').setPointerCapture(e.pointerId);moveStick(e);});$('stick').addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)moveStick(e);});function releaseStick(e){if(e.pointerId!==stickPointer)return;stickPointer=null;stick.x=stick.y=0;$('knob').style.transform='';}['pointerup','pointercancel','lostpointercapture'].forEach(event=>$('stick').addEventListener(event,releaseStick));
function frame(now){const rawDt=Math.max(0,(now-previous)/1000),dt=Math.min(rawDt,.033);previous=now;if(state==='playing')update(isBossWorldFrozen()?rawDt:dt);else if(state==='over')tickEnding(rawDt);render();requestAnimationFrame(frame);}resize();updateHUD();loadGameAssets();requestAnimationFrame(frame);

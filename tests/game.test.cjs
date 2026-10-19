const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{style:{},hidden:false,classList:{add(){},remove(){}},textContent:'',innerHTML:'',addEventListener(){},setAttribute(){},focus(){},getBoundingClientRect:()=>({width:1000,height:650,left:0,top:0}),setPointerCapture(){}});return elements.get(id);};
const context={console,Math,Set,setTimeout,clearTimeout,Image:class{constructor(){this.complete=true;this.naturalWidth=64;this.naturalHeight=64;}decode(){return Promise.resolve();}},devicePixelRatio:1,document:{getElementById:element,addEventListener(){},createElement:()=>({getContext:()=>({drawImage(){},createRadialGradient(){return {addColorStop(){}};},beginPath(){},ellipse(){},fill(){}})})},window:{addEventListener(){}},ResizeObserver:class{observe(){}},requestAnimationFrame(){}};element('game').getContext=()=>({setTransform(){}});vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../dist/control.js','utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/../dist/boss.js','utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/../dist/surf.js','utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/../dist/milk.js','utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/../dist/entrance.js','utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/../dist/giant.js','utf8'),context);vm.runInContext(fs.readFileSync(__dirname+'/../dist/game.js','utf8'),context);// Combat tests bypass the opening; entrance coverage explicitly calls reset(true).
vm.runInContext('const productionReset=reset;reset=(showEntrance=false)=>productionReset(showEntrance)',context);
const run=s=>vm.runInContext(s,context);
function test(name,body){body();console.log('PASS',name);}
(async()=>{
await run('loadGameAssets()');
test('Main and debug menus use only the independent 蕉片崛起 and 蕉皮末日 entry labels',()=>{
  const html=fs.readFileSync(__dirname+'/../dist/index.html','utf8');
  const options=id=>Array.from(html.match(new RegExp('<select id="'+id+'">([\\s\\S]*?)</select>'))[1].matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g),match=>[match[1],match[2]]);
  assert.deepEqual(options('gameMode'),[['milk','蕉片崛起'],['milk-boss','蕉片崛起 (魔王戰)'],['survival','蕉皮末日'],['boss','蕉皮末日 (魔王戰)']]);
  assert.deepEqual(options('debugStart'),[['62','蕉皮末日: 62s'],['32','蕉皮末日: 32s'],['12','蕉皮末日: 12s'],['boss-5','蕉皮末日 (魔王戰) : 魔王剩 5 血'],['boss-2','蕉皮末日 (魔王戰) : 魔王剩 2 血']]);
  assert.doesNotMatch(html,/試作|試玩|原版|第一關|第二關/i);
});
test('Initial asset loading finishes before opening the main menu',()=>{assert.equal(run('assetsReady'),true);assert.equal(run('state'),'intro');assert.equal(element('start').disabled,false);assert.equal(element('loadingScreen').hidden,true);assert.ok(run('!!mutedFloor'));});
test('Every delivered game image is used, has its PNG source, and is available to the loader',()=>{
  const assets=__dirname+'/../dist/assets/';
  const used=Array.from(run('gameAssets.map(asset=>asset.src.split("/").pop())'));
  assert.equal(new Set(used).size,used.length);
  assert.deepEqual(fs.readdirSync(assets).filter(name=>name.endsWith('.webp')).sort(),used.slice().sort());
  assert.deepEqual(fs.readdirSync(assets+'mobile').sort(),used.slice().sort());
  for(const name of used){assert.ok(fs.statSync(assets+'mobile/'+name).size>0);assert.ok(fs.statSync(assets+name).size>0);assert.ok(fs.statSync(assets+name.replace(/\.webp$/,'.png')).size>0);}
});
test('Asset URLs select one family before loading and the surf icon shares that family',()=>{
  assert.equal(run("gameAssetUrl('assets/floor-tile-v1.webp',true)"),'assets/mobile/floor-tile-v1.webp');
  assert.equal(run("gameAssetUrl('assets/floor-tile-v1.webp',false)"),'assets/floor-tile-v1.webp');
  assert.equal(run('mobileAssetVariant'),false);assert.ok(run("gameAssets.every(asset=>!asset.src.includes('/mobile/'))"));
  assert.equal(element('surfIcon').src,run('gameAssets.find(asset=>asset.image===surfItemSprite).src'));
  const html=fs.readFileSync(__dirname+'/../dist/index.html','utf8');assert.doesNotMatch(html,/<img[^>]+src="assets\/surfboard/);
});
test('Both stages share the original floor palette when switching stages',()=>{
  assert.ok(run('mutedFloor'));
  run("var floorMethods={},floorDraws=[];for(const key of ['save','restore','fillRect','drawImage']){floorMethods[key]=ctx[key];ctx[key]=key==='drawImage'?(image)=>floorDraws.push(image):()=>{}};var originalMilkStage=milkStage");
  try{run('milkStage=false;drawFloor()');assert.ok(run('floorDraws.length>0&&floorDraws.every(image=>image===mutedFloor)'));run('floorDraws=[];milkStage=true;drawFloor()');assert.ok(run('floorDraws.length>0&&floorDraws.every(image=>image===mutedFloor)'));run('floorDraws=[];milkStage=false;drawFloor()');assert.ok(run('floorDraws.every(image=>image===mutedFloor)'));}
  finally{run('milkStage=originalMilkStage;for(const key in floorMethods)ctx[key]=floorMethods[key]');}
});
test('Surf assets load and cache before play alongside the existing art',()=>{
  assert.equal(run('gameAssets.length'),16);assert.ok(run('gameAssets.some(a=>a.image===heroSurfSprite)'));assert.ok(run('gameAssets.some(a=>a.image===surfItemSprite)'));
  assert.equal(run('renderSprite(heroSurfSprite).height'),240);assert.equal(run('renderSprite(surfItemSprite).width'),160);
});
test('Surf requires inventory and rescues a fallen player without spending charge',()=>{
  run('reset();charge=40');assert.equal(run('activateSurf()'),false);assert.equal(run('special'),null);
  run('surfStock=2;player.down=.7;player.recoil=.6;activateSurf()');assert.equal(run('surfStock'),1);assert.equal(run('charge'),40);assert.equal(run('special.mode'),'surf');assert.equal(run('special.duration'),2);assert.equal(run('player.down'),0);assert.equal(run('player.recoil'),0);assert.equal(run('stats.surfs'),1);
  assert.equal(run('activateSurf()'),false);assert.equal(run('surfStock'),1);run('activate()');assert.equal(run('special.mode'),'surf');
});
test('Scheduled boards appear at 15, 45, 75 and 105 seconds and do not repeat in boss fights',()=>{
  run('reset();enemies=[];elapsed=14.9;updateSurfItems(.1,null)');assert.equal(run('surfPickups.length'),0);
  for(const time of [15,45,75,105]){context.surfScheduleTime=time;run('elapsed=surfScheduleTime;updateSurfItems(.1,null)');}
  assert.equal(run('surfPickups.length'),4);assert.equal(run('nextSurfAt'),135);
  run('startBossBattle();elapsed=200;updateSurfItems(.1,null)');assert.equal(run('surfPickups.length'),4);
});
test('Boards persist, enemies cannot collect them, and three is the inventory cap',()=>{
  run("reset();enemies=[];player.x=500;surfPickups=[{id:1,x:0,y:0,age:999}];spawn(0,'normal',{x:0,y:0});updateSurfItems(.1,null)");assert.equal(run('surfPickups.length'),1);assert.equal(run('surfStock'),0);
  run('player.x=0;surfStock=3;updateSurfItems(.1,null)');assert.equal(run('surfPickups.length'),1);
  run('surfStock=2;updateSurfItems(.1,null)');assert.equal(run('surfStock'),3);assert.equal(run('surfPickups.length'),0);
});
test('Boards require landing but can be collected along a surf or dash path',()=>{
  run('reset();enemies=[];spawnSurfPickup({x:0,y:0});player.z=60;updateSurfItems(.1,null)');assert.equal(run('surfStock'),0);
  run('player.z=0;updateSurfItems(.1,null)');assert.equal(run('surfStock'),1);
  run('spawnSurfPickup({x:60,y:0});activateSurf();update(.3)');assert.equal(run('surfStock'),1);assert.equal(run('surfPickups.length'),0);
});
test('Every third defeated large green drops a board and red ripening does not count',()=>{
  run("reset();enemies=[];var redForSurf=spawn(0,'thrower',{x:400,y:0});hitEnemy(redForSurf,false)");assert.equal(run('greenSurfKills'),0);
  run("for(let i=0;i<3;i++){var greenForSurf=spawn(0,'charger',{x:400+i*50,y:0});hitEnemy(greenForSurf,false)}");assert.equal(run('greenSurfKills'),3);assert.equal(run('surfPickups.length'),1);
});
test('Boss health milestones supply one board each exactly once',()=>{
  run("reset();enemies=[];startBossBattle();for(const hp of [7,4,2]){boss.hp=hp;onBossHealthChanged();onBossHealthChanged()}");assert.equal(run('surfPickups.length'),3);
});
test('Surf steers gradually, protects from damage, and leaves brief landing protection',()=>{
  run("reset();enemies=[];spawnClock=999;surfStock=1;activateSurf();keys.add('w');update(.2)");assert.ok(run('special.dy')<-.5);assert.ok(run('special.dx')>0);assert.equal(run('charge'),0);
  run("hurt('surf collision')");assert.equal(run('player.hp'),5);
  run('peels=[];keys.clear();update(1);update(1)');assert.equal(run('special'),null);assert.ok(run('player.inv')>=.35);assert.ok(run('player.slipCooldown')>=.6);
});
test('Surf consumes peels along its path, extends by 0.2 each, and stops at four seconds',()=>{
  run('reset();enemies=[];spawnClock=999;surfStock=1;activateSurf();peels=[{id:11,x:20,y:0,age:1},{id:12,x:35,y:0,age:1}];update(.1)');assert.equal(run('peels.length'),0);assert.equal(run('special.duration'),2.4);
  run('for(let i=0;i<10;i++)peels.push({id:30+i,x:player.x+20,y:player.y,age:1});update(.1)');assert.equal(run('special.duration'),4);
  run('peels=[];update(1);update(1);update(1);update(.8)');assert.equal(run('special'),null);
});
test('Surf fuel counts down, visibly refills on peels, and hides after landing',()=>{
  run('reset();enemies=[];spawnClock=999;surfStock=1;activateSurf()');assert.equal(element('surfGauge').hidden,false);assert.equal(element('surfTime').textContent,'2.0s');assert.equal(element('surfFuel').style.width,'50%');
  run('update(.5)');assert.equal(element('surfTime').textContent,'1.5s');assert.equal(element('surfFuel').style.width,'37.5%');
  run('peels=[{id:81,x:player.x+10,y:player.y,age:1}];update(.1)');assert.equal(element('surfTime').textContent,'1.6s');assert.ok(parseFloat(element('surfFuel').style.width)>37.5);assert.ok(run('special.feedFlash')>0);assert.ok(run("texts.some(t=>t.text==='衝浪 +0.2s')"));
  run('pause()');assert.equal(element('surfGauge').hidden,true);run('pause();peels=[];update(1);update(1)');assert.equal(element('surfGauge').hidden,true);
});
test('Surf preserves reserved ritual peels and consumes ordinary red peels',()=>{
  run('reset();enemies=[];spawnClock=999;surfStock=1;activateSurf();peels=[{id:51,x:20,y:0,age:1,ritual:true},{id:52,x:20,y:0,age:1,summonWave:true},{id:53,x:20,y:0,age:1,red:true}];feedSurf(special,0,0)');assert.equal(run('peels.length'),2);assert.ok(run('peels.every(p=>p.ritual||p.summonWave)'));
});
test('Surf hits each enemy once and pushes survivors away without generating stomp energy',()=>{
  run("reset();enemies=[];spawnClock=999;var surfVictim=spawn(0,'normal',{x:60,y:0});surfVictim.hp=2;surfVictim.speed=0;surfStock=1;activateSurf();update(.1)");assert.equal(run('surfVictim.hp'),1);assert.ok(run('surfVictim.kx')>0);assert.equal(run('charge'),0);assert.equal(run('stats.stompHits'),0);
  run('surfVictim.x=player.x;surfVictim.y=player.y;surfVictim.hit=0;surfVictim.knock=0;update(.01)');assert.equal(run('surfVictim.hp'),1);
});
test('Surf also damages the boss while retaining four-second boss immunity',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=99;boss.x=80;boss.y=0;player.x=0;player.y=0;surfStock=1;activateSurf();update(.1)");assert.equal(run('boss.hp'),9);assert.ok(run('special'));assert.equal(run('player.recoil'),0);assert.ok(run('boss.hit')>3.8);
});
test('K key activates surf, pause freezes it, and restart clears inventory and drops',()=>{
  run("reset();enemies=[];surfStock=2;handleKeyDown({code:'KeyK',key:'k',preventDefault(){}})");assert.equal(run('special.mode'),'surf');assert.equal(run('surfStock'),1);
  run('pause();var surfPausedAt=special.t;update(1)');assert.equal(run('special.t'),run('surfPausedAt'));
  run('pause();spawnSurfPickup();reset()');assert.equal(run('surfStock'),0);assert.equal(run('surfPickups.length'),0);assert.equal(run('special'),null);assert.equal(run('greenSurfKills'),0);
});
test('Surf collects a bunch and a board along the same path, including its final frame',()=>{
  for(const lastFrame of [false,true]){
    context.surfPickupLast=lastFrame;
    run('reset();enemies=[];spawnClock=999;surfStock=1;activateSurf();if(surfPickupLast)special.t=1.99;var collectX=surfPickupLast?3:60;pickups=[{id:91001,x:collectX,y:40,age:99}];surfPickups=[{id:91002,x:collectX,y:40,age:99}];update(surfPickupLast?.02:.2)');
    assert.equal(run('stats.bunches'),1);assert.equal(run('orbitPeels.length'),6);assert.equal(run('surfStock'),1);assert.equal(run('pickups.length'),0);assert.equal(run('surfPickups.length'),0);
  }
});
test('Surf collects crossed pickups before its boss hit starts a frozen cinematic',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=6;boss.x=80;boss.y=0;player.x=0;player.y=0;surfStock=1;activateSurf();pickups=[{id:92001,x:30,y:0,age:1}];surfPickups=[{id:92002,x:30,y:0,age:1}];update(.1)");assert.equal(run('boss.hp'),5);assert.equal(run('isBossCinematic()'),true);assert.equal(run('stats.bunches'),1);assert.equal(run('surfStock'),1);assert.equal(run('orbitPeels.length'),6);
});
test('Bunches never expire and the third spawn replaces only the oldest uncollected bunch',()=>{
  run('reset();enemies=[];nextPickupAt=9999;spawnBunch();var oldestBunch=pickups[0];updateItems(120);spawnBunch();var secondBunch=pickups[1];updateItems(120)');assert.equal(run('pickups.length'),2);assert.ok(run('pickups.includes(oldestBunch)'));assert.ok(run('oldestBunch.age')>=240);
  run('spawnBunch()');assert.equal(run('pickups.length'),2);assert.equal(run('pickups.includes(oldestBunch)'),false);assert.equal(run('pickups[0]===secondBunch'),true);
  run('player.x=pickups[0].x;player.y=pickups[0].y;collectBunchPickups();spawnBunch()');assert.equal(run('pickups.length'),2);
});
test('Large bananas slip sixty percent as far while minions match the player',()=>{
  run("reset();enemies=[];var slipActors=[player,spawn(0,'normal',{x:0,y:0}),spawn(0,'charger',{x:0,y:0}),spawn(0,'thrower',{x:0,y:0})];for(const actor of slipActors){slip(actor,0);slide(actor,.7)}");assert.ok(run('Math.abs(slipActors[1].x-player.x)<1e-8'));assert.ok(run('Math.abs(slipActors[2].x/player.x-.6)<1e-8'));assert.ok(run('Math.abs(slipActors[3].x/player.x-.6)<1e-8'));assert.ok(run('slipActors.every(actor=>actor.down===0)'));
});
test('Joystick travel scales with the enlarged pad and retains full-speed diagonal control',()=>{
  const oldRect=element('stick').getBoundingClientRect;element('stick').getBoundingClientRect=()=>({left:0,top:0,width:136,height:136});
  run('moveStick({clientX:112.2,clientY:68})');assert.ok(Math.abs(run('stick.x')-1)<1e-8);assert.equal(run('stick.y'),0);
  run('moveStick({clientX:120,clientY:120})');assert.ok(Math.abs(run('Math.hypot(stick.x,stick.y)')-1)<1e-8);element('stick').getBoundingClientRect=oldRect;
});
test('Half-health performance protects the boss but permits minion combat',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=6;player.x=boss.x;player.y=boss.y;tryStompBoss();player.inv=0;keys.add('d');var mobileRitualStartX=player.x;var protectedMinion=spawn(0,'normal',{x:player.x+300,y:player.y});protectedMinion.hp=2;protectedMinion.hit=0;var movingEnemyX=protectedMinion.x;update(.2)");
  assert.equal(run('boss.hp'),5);assert.equal(run('isBossWorldFrozen()'),false);assert.ok(run('player.x')>run('mobileRitualStartX'));assert.ok(run('protectedMinion.x')<run('movingEnemyX'));
  run("hurt('ritual immunity','boss')");assert.equal(run('player.hp'),5);assert.equal(run('hitEnemy(protectedMinion,true)'),true);assert.equal(run('protectedMinion.hp'),1);run('boss.hit=0');assert.equal(run('hitBoss(boss,false)'),false);assert.equal(run('boss.hp'),5);
});
test('Both boss rituals allow actual minion collisions, stomps and ultimate hits while protecting boss bodies',()=>{
  for(const hp of [5,1]){
    context.combatRitualHp=hp;
    run("reset();enemies=[];startBossBattle();boss.hp=combatRitualHp;boss.phase='rest';onBossHealthChanged();boss.hit=0;player.inv=0;player.x=600;player.y=600;var ritualEnemy=spawn(0,'normal',{x:600,y:600});ritualEnemy.hit=0;update(.01)");
    assert.equal(run('player.hp'),4);assert.equal(run('isBossCinematic()'),true);assert.equal(run('hitBoss(boss,false)'),false);
    run('player.down=0;player.recoil=0;player.x=600;player.y=600;player.z=50;player.vz=-100;ritualEnemy.x=600;ritualEnemy.y=600;ritualEnemy.hp=2;ritualEnemy.hit=0;update(.1)');assert.equal(run('ritualEnemy.hp'),1);assert.ok(run('player.vz')>0);
    for(const surf of [false,true]){
      context.ritualSurf=surf;
      run("special=null;player.recoil=0;player.down=0;player.x=600;player.y=600;player.face=0;enemies=[];var skillRitualEnemy=spawn(0,'normal',{x:630,y:600});skillRitualEnemy.hp=2;skillRitualEnemy.hit=0;if(ritualSurf){surfStock=1;activateSurf()}else{charge=100;activate()}update(.03)");assert.equal(run('skillRitualEnemy.hp'),1);assert.equal(run('boss.hp'),hp);
    }
    run("special=null;player.inv=0;var ritualClone=spawnBossClone({x:900,y:900});ritualClone.hit=0;hurt('boss contact','boss')");assert.equal(run('player.hp'),4);assert.equal(run('hitBoss(ritualClone,false)'),false);
    run("player.hp=1;hurt('minion finishes player')");assert.equal(run('state'),'over');assert.equal(run('player.hp'),0);
  }
});
test('Descending stomps use enemy positions after movement before contact damage',()=>{
  for(const mobile of [false,true])for(const frame of [1/60,.033]){
    context.landingMobile=mobile;context.landingFrame=frame;
    run("window.matchMedia=()=>({matches:landingMobile});reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=999;boss.x=1000;boss.y=1000;elapsed=120;player.x=0;player.y=0;player.z=6;player.vz=-50;player.inv=0;var enteringBanana=spawn(0,'normal',{x:30*characterScale()+.1,y:0});enteringBanana.hp=1;enteringBanana.speed=160;update(landingFrame)");
    assert.equal(run('player.hp'),5);assert.equal(run('enteringBanana.hp'),0);assert.equal(run('stats.stompHits'),1);assert.equal(run('player.vz'),310);
  }
  run('delete window.matchMedia');
});
test('Moving out of stomp range does not cause a stale-position stomp',()=>{
  run("reset();startBossBattle();boss.phase='rest';boss.time=999;boss.x=1000;boss.y=1000;enemies=[];player.x=0;player.y=0;player.z=6;player.vz=-50;var leavingBanana=spawn(0,'normal',{x:29,y:0});leavingBanana.hp=1;leavingBanana.knock=1;leavingBanana.kx=400;leavingBanana.ky=0;update(.033)");
  assert.equal(run('leavingBanana.hp'),1);assert.equal(run('stats.stompHits'),0);assert.equal(run('player.hp'),5);
});
test('Time-growing small and red banana movement caps at an effective speed of 188',()=>{
  for(const time of [120,240,300,1000]){
    context.cappedTime=time;
    run("reset();startBossBattle();boss.phase='rest';boss.time=999;boss.x=1000;boss.y=-1000;enemies=[];elapsed=cappedTime;var cappedWalker=spawn(0,'normal',{x:900,y:0});var cappedRed=spawn(0,'thrower',{x:-900,y:0});var walkerFrom=cappedWalker.x,redFrom=cappedRed.x;update(.1)");
    assert.ok(run('Math.abs(cappedWalker.x-walkerFrom)')<=18.8+1e-8);assert.ok(run('Math.abs(cappedRed.x-redFrom)')<=18.8+1e-8);assert.ok(run('enemyWalkSpeed(cappedWalker)')<205);
  }
});
test('Yellow summon capacity is shared, preserves unconsumed peels and blocks revival selection',()=>{
  run("reset();startBossBattle();enemies=[];var yellowCapacity=bossYellowLimit();for(let i=0;i<yellowCapacity-4;i++){var yellowAtCap=spawn(0,'normal',{x:800+i,y:800});yellowAtCap.hp=1}peels=[];for(let i=0;i<24;i++)peels.push({id:serial++,x:boss.x+i,y:boss.y,age:1});boss.hp=2;boss.nextClone=Infinity;boss.nextShield=Infinity;boss.nextTeleport=Infinity;boss.move=1;beginBossMove();var capacityCaster=spawnBossClone({x:boss.x,y:boss.y});capacityCaster.nextShield=Infinity;capacityCaster.move=1;beginBossMove(capacityCaster);releaseBossRevival();releaseBossRevival(capacityCaster)");
  assert.equal(run('bossYellowCount()'),run('yellowCapacity'));assert.equal(run('peels.length'),20);assert.equal(run('bossSummon({x:0,y:0})'),false);
  run('boss.move=1;beginBossMove();capacityCaster.move=1;beginBossMove(capacityCaster)');assert.notEqual(run('boss.phase'),'revive');assert.notEqual(run('capacityCaster.phase'),'revive');
  run("boss.hp=1;var previousCapRandom=Math.random;Math.random=()=>.5;beginBossMove();Math.random=previousCapRandom");assert.notEqual(run('boss.phase'),'revive');
  run('enemies[0].hp=0;boss.hp=2;boss.move=1;beginBossMove()');assert.equal(run('boss.phase'),'revive');
});
test('Yellow summon budget follows viewport area and phone sprite scale, capped at sixty',()=>{
  for(const [width,height,mobile,expected] of [[1156,666,false,55],[667,375,true,36],[844,390,true,48],[932,430,true,59],[2000,1200,false,60]]){
    context.budgetWidth=width;context.budgetHeight=height;context.budgetMobile=mobile;
    run('W=budgetWidth;H=budgetHeight;window.matchMedia=()=>({matches:budgetMobile})');assert.equal(run('bossYellowLimit()'),expected);
  }
  run('delete window.matchMedia;resize()');
});
test('Offscreen yellow bananas count toward the budget and resizing does not delete existing enemies',()=>{
  run("reset();startBossBattle();enemies=[];W=1156;H=666;for(let i=0;i<55;i++){var distantYellow=spawn(0,'normal',{x:1200,y:1200});distantYellow.hp=1}var beforeResize=enemies.length;W=800;H=600");
  assert.equal(run('bossYellowLimit()'),34);assert.equal(run('bossSummon({x:0,y:0})'),false);assert.equal(run('enemies.length'),55);
  run('W=2000;H=1200');assert.equal(run('bossYellowLimit()'),60);assert.equal(run('bossSummon({x:0,y:0})'),true);assert.equal(run('bossYellowCount()'),56);
  run('resize()');
});
test('Battle peaks count living offscreen enemies, durians and boss bodies, and retain the maximum',()=>{
  run("reset();enemies=[];stats=freshStats();spawn(0,'normal',{x:1200,y:1200});spawn(0,'durian',{x:-1200,y:-1200});var deadPeakEnemy=spawn(0,'normal',{x:0,y:0});deadPeakEnemy.hp=0;startBossBattle();spawnBossClone({x:300,y:0});spawnBossClone({x:-300,y:0});peels=[{x:0,y:0},{x:1,y:1}];trackBattlePeaks()");
  assert.equal(run('stats.maxEnemies'),5);assert.equal(run('stats.maxPeels'),2);
  run('enemies=[];bossClones=[];peels=[];trackBattlePeaks()');assert.equal(run('stats.maxEnemies'),5);assert.equal(run('stats.maxPeels'),2);
});
test('Fun statistics count player slips and consumed surf peels, reset per game and omit damage',()=>{
  run("reset();enemies=[];stats=freshStats();slip(player,0);var slippingEnemy=spawn(0,'normal',{x:500,y:500});slip(slippingEnemy,0);hurt('first');hurt('blocked');surfStock=1;activateSurf();peels=[{x:player.x,y:player.y,age:1},{x:player.x+1,y:player.y,age:1},{x:player.x,y:player.y,age:1,ritual:true}];feedSurf(special,player.x,player.y)");
  assert.equal(run('stats.slips'),1);assert.equal(run('player.hp'),4);assert.equal(run('stats.surfPeels'),2);
  run('finish(false)');for(const title of ['場上最多敵人','場上最多蕉皮','滑倒次數','衝浪吸收蕉皮'])assert.ok(element('resultStats').innerHTML.includes(title));assert.equal((element('resultStats').innerHTML.match(/<dt>/g)||[]).length,11);assert.ok(!element('resultStats').innerHTML.includes('受到傷害'));
  run('reset()');assert.equal(run('stats.slips'),0);assert.equal(run('stats.surfPeels'),0);assert.equal(run('stats.maxEnemies'),7);
});
test('Insufficient charge cannot activate',()=>{run('reset();charge=99;activate()');assert.equal(run('special'),null);assert.equal(run('charge'),99);});
test('First stomp gives 0.2 and consecutive stomp gives 0.1; unripe banana needs two',()=>{run("reset();enemies=[];const e={id:999,x:0,y:0,hp:2,type:'thick',hit:0,color:'#fff'};hitEnemy(e,true)");assert.equal(run('e.hp'),1);assert.equal(run('charge'),20);run('e.hit=0;hitEnemy(e,true)');assert.equal(run('e.hp'),0);assert.equal(run('charge'),30);assert.equal(run('peels.length'),1);});
test('Enemy damage knocks down and gives immunity',()=>{run("reset();hurt('撞到香蕉')");assert.equal(run('player.hp'),4);assert.equal(run('player.down'),.5);assert.equal(run('player.inv'),2.5);run("hurt('撞到香蕉')");assert.equal(run('player.hp'),4);});
test('Damage immunity blocks another hit until the full 2.5 seconds elapse',()=>{
  run("reset();enemies=[];spawnClock=999;hurt('first hit');update(2.4);hurt('still protected')");assert.equal(run('player.hp'),4);assert.ok(run('player.inv')>0);
  run("update(.11);hurt('protection expired')");assert.equal(run('player.hp'),3);assert.equal(run('player.inv'),2.5);
});
test('Ultimate can rescue knocked-down player and repels durian',()=>{run("reset();charge=100;player.down=.5;enemies=[{id:1000,x:0,y:0,hp:1,type:'durian',hit:0,speed:0,knock:0}];activate();update(.001)");assert.equal(run('player.down'),0);assert.equal(run('player.hp'),5);assert.equal(run('enemies[0].hp'),1);assert.ok(run('enemies[0].knock')>0);});
test('Descending stomp bounces safely above new peel',()=>{run("reset();enemies=[{id:1001,x:0,y:0,hp:1,type:'normal',hit:0,speed:0,knock:0,color:'#fff'}];player.z=44;player.vz=-120;update(.02)");assert.equal(run('kills'),1);assert.equal(run('player.hp'),5);assert.ok(run('player.vz')>0);});
test('Peel causes long slide without damage or immunity',()=>{run('reset();enemies=[];spawnClock=100;peels=[{x:0,y:0,age:1}];update(.01)');assert.equal(run('player.hp'),5);assert.equal(run('player.inv'),0);assert.equal(run('player.down'),.7);run('for(let i=0;i<70;i++)update(.01)');assert.ok(run('player.x')>200);assert.equal(run('player.hp'),5);assert.equal(run('player.down'),0);});
test('Enemy contact during sliding deals damage, then immunity prevents repeats',()=>{run("reset();enemies=[];peels=[{x:0,y:0,age:1}];update(.01);enemies=[{id:2,x:10,y:0,hp:1,type:'normal',hit:0,speed:0,knock:0}];update(.01)");assert.equal(run('player.hp'),4);assert.ok(run('player.inv')>0);assert.ok(run('player.slipX')>400);run('enemies[0].x=player.x;update(.01)');assert.equal(run('player.hp'),4);});
test('Durian contact during sliding also deals damage',()=>{run("reset();enemies=[];slip(player,0);enemies=[{id:2,x:5,y:0,hp:1,type:'durian',hit:0,speed:0,knock:0}];update(.01)");assert.equal(run('player.hp'),4);});
test('Slipping enemies of every type are harmless until they stand up',()=>{
  for(const type of ['normal','charger','thrower','durian']){
    context.slippingEnemyType=type;
    run("reset();enemies=[];spawnClock=999;var fallenContact=spawn(0,slippingEnemyType,{x:0,y:0});slip(fallenContact,0);fallenContact.slipX=fallenContact.slipY=0;update(.2)");
    assert.ok(run('fallenContact.down')>0);assert.equal(run('player.hp'),5);
    run('update(.49)');assert.ok(run('fallenContact.down')>0);assert.equal(run('player.hp'),5);
    run('update(.02)');assert.equal(run('fallenContact.down'),0);assert.equal(run('player.hp'),4);
  }
});
test('An enemy tripped on this frame cannot deal contact damage on that frame',()=>{
  run("reset();enemies=[];spawnClock=999;player.slipCooldown=1;var justTripped=spawn(0,'normal',{x:0,y:0});peels=[{id:88001,x:0,y:0,age:1}];update(.01)");
  assert.ok(run('justTripped.down')>0);assert.equal(run('peels.length'),0);assert.equal(run('player.hp'),5);
});
test('A sliding player remains vulnerable when a fallen enemy gets back up',()=>{
  run("reset();enemies=[];spawnClock=999;var wakingEnemy=spawn(0,'normal',{x:0,y:0});slip(player,0);player.slipX=player.slipY=0;slip(wakingEnemy,0);wakingEnemy.slipX=wakingEnemy.slipY=0;wakingEnemy.down=.1;update(.05)");assert.equal(run('player.hp'),5);assert.ok(run('player.down')>0);
  run('update(.06)');assert.equal(run('wakingEnemy.down'),0);assert.ok(run('player.down')>0);assert.equal(run('player.hp'),4);assert.ok(run('player.inv')>0);
});
test('Every enemy type slips on peels without losing health',()=>{for(const type of ['normal','thick','durian']){run(`reset();player.x=500;spawnClock=100;enemies=[{id:3,x:0,y:0,hp:2,type:'${type}',hit:0,speed:0,knock:0}];peels=[{x:0,y:0,age:1}];update(.01)`);assert.equal(run('enemies[0].down'),.7);run('for(let i=0;i<70;i++)update(.01)');assert.ok(run('enemies[0].x')>200);assert.equal(run('enemies[0].hp'),2);assert.equal(run('enemies[0].down'),0);}});
test('Pause and both results share immediate home navigation and clear the old session',()=>{
  for(const outcome of ['pause',false,true]){
    run('reset()');assert.equal(element('home').hidden,true);
    if(outcome==='pause')run('pause()');else run('finish('+outcome+')');
    assert.equal(element('home').hidden,false);
    run("keys.add('w');stick.x=1;mobilePlayRequested=true;mobilePlayPending=()=>{throw Error('stale mobile start')};returnToMainMenu()");
    assert.equal(run('state'),'intro');assert.equal(element('home').hidden,true);
    assert.equal(element('overlay').hidden,false);assert.equal(element('modeOptions').hidden,false);
    assert.equal(element('resultStats').hidden,true);assert.equal(element('endWipe').hidden,true);
    assert.equal(element('start').disabled,false);assert.equal(run('keys.size'),0);
    assert.equal(run('stick.x'),0);assert.equal(run('enemies.length'),0);
    assert.equal(run('mobilePlayPending'),null);assert.equal(run('mobilePlayRequested'),false);
    assert.equal(run('boss'),null);assert.equal(run('giantBattle'),null);
    run('reset()');assert.equal(run('state'),'playing');
  }
});
test('Home button keeps native keyboard activation without triggering gameplay shortcuts',()=>{
  run('reset();pause()');context.homeKeyEvent={target:element('home'),code:'Space',key:' ',preventDefault(){throw Error('native button key intercepted');}};
  run('handleKeyDown(homeKeyEvent)');assert.equal(run('state'),'paused');assert.equal(run('keys.size'),0);
  run('returnToMainMenu()');
});
test('Pause freezes gameplay and resumes; restart clears state',()=>{run('reset();pause()');assert.equal(run('state'),'paused');run('pause()');assert.equal(run('state'),'playing');run('charge=180;kills=7;reset()');assert.equal(run('charge'),0);assert.equal(run('kills'),0);});
test('Surviving 120 seconds freezes existing minions and starts the boss entrance',()=>{run('reset();elapsed=119.99;var oldMinions=enemies.length;durianWarnings=[{x:0,y:0,at:121}];update(.02)');assert.equal(run('state'),'playing');assert.equal(run('elapsed'),120);assert.equal(run('boss.hp'),10);assert.equal(run('boss.phase'),'entrance');assert.equal(run('boss.time'),3);assert.equal(run('enemies.length'),run('oldMinions'));assert.equal(run('durianWarnings.length'),1);assert.equal(element('gameClock').hidden,true);assert.equal(element('bossHud').hidden,false);});
test('Survival and boss simulation stay finite and capped without automatic victory',()=>{run('reset();for(let i=0;i<8400&&state==="playing";i++){player.inv=2;update(1/60)}');assert.equal(run('state'),'playing');assert.ok(run('boss.hp')>0);assert.ok(run('enemies.length')<=110);assert.ok(run('Number.isFinite(player.x)&&Number.isFinite(player.y)'));});

test('Ripeness advances green to yellow-green to yellow to peel',()=>{run("reset();enemies=[];const ripe={id:7000,x:0,y:0,hp:3,type:'normal',hit:0};");assert.equal(run('bananaColor(ripe)'),run('ripenessColors[3]'));run('hitEnemy(ripe,true)');assert.equal(run('ripe.hp'),2);assert.equal(run('ripe.color'),run('ripenessColors[2]'));run('ripe.hit=0;hitEnemy(ripe,true)');assert.equal(run('ripe.hp'),1);assert.equal(run('ripe.color'),run('ripenessColors[1]'));assert.equal(run('peels.length'),0);run('ripe.hit=0;hitEnemy(ripe,true)');assert.equal(run('peels.length'),1);assert.equal(run('kills'),1);});
test('Spawn colors always represent remaining ripeness hits',()=>{run('reset();for(let i=0;i<200;i++)spawn(100)');assert.ok(run("enemies.every(e=>e.type==='durian'||e.color===ripenessColors[e.hp])"));assert.ok(run('enemies.every(e=>e.hp===1||e.hp===2)'));assert.ok(run('enemies.some(e=>e.hp===2)'));assert.ok(run('enemies.some(e=>e.hp===1)'));});
test('Ending freezes gameplay and wipes top to bottom over two seconds',()=>{run('reset();finish(false)');const frozen=run('JSON.stringify({player,enemies,peels,elapsed})');assert.equal(element('start').disabled,true);assert.equal(element('endWipe').style.clipPath,'inset(0 0 100% 0)');run('tickEnding(1);update(.03)');assert.equal(run('JSON.stringify({player,enemies,peels,elapsed})'),frozen);assert.equal(element('endWipe').style.clipPath,'inset(0 0 50% 0)');assert.equal(element('start').disabled,true);run('tickEnding(1)');assert.equal(element('endWipe').style.clipPath,'inset(0 0 0% 0)');assert.equal(element('start').disabled,false);run('reset()');assert.equal(element('endWipe').hidden,true);assert.equal(run('endElapsed'),0);});
test('Durian warning appears before guaranteed arrival at 10 seconds',()=>{run('reset();enemies=[];elapsed=8.79;updateDurianSchedule()');assert.equal(run('durianWarnings.length'),0);run('elapsed=8.8;updateDurianSchedule()');assert.equal(run('durianWarnings.length'),1);assert.equal(run("enemies.filter(e=>e.type==='durian').length"),0);assert.ok(run('Math.abs(screen(durianWarnings[0].x,durianWarnings[0].y).x-W/2)')>=120);run('elapsed=10;updateDurianSchedule()');assert.equal(run("enemies.filter(e=>e.type==='durian').length"),1);assert.equal(run('durianWarnings.length'),0);});
test('Durian schedule adds later arrivals and resets for a new game',()=>{run('elapsed=nextDurianAt-1.2;updateDurianSchedule()');assert.equal(run('durianWarnings.length'),1);run('elapsed=durianWarnings[0].at;updateDurianSchedule()');assert.equal(run("enemies.filter(e=>e.type==='durian').length"),2);run('reset()');assert.equal(run('nextDurianAt'),10);assert.equal(run('durianWarnings.length'),0);assert.equal(run("enemies.filter(e=>e.type==='durian').length"),0);});
test('Scheduled durians still arrive when the enemy cap is full',()=>{run("reset();enemies=[];for(let i=0;i<110;i++)spawn(400);elapsed=8.8;updateDurianSchedule();elapsed=10;updateDurianSchedule()");assert.equal(run('enemies.length'),110);assert.equal(run("enemies.filter(e=>e.type==='durian').length"),1);});
test('Stomping an unripe banana pushes it away from the player',()=>{run("reset();enemies=[{id:9000,x:10,y:0,hp:3,type:'normal',hit:0,knock:0,speed:0}];player.face=Math.PI;hitEnemy(enemies[0],true)");assert.equal(run('enemies[0].hp'),2);assert.equal(run('enemies[0].knock'),.4);assert.equal(run('enemies[0].kx'),280);run('player.inv=2;for(let i=0;i<40;i++)update(.01)');assert.ok(run('enemies[0].x')>110);});
test('Stomp aim needs a target within 30 units',()=>{run("reset();enemies=[{id:9100,x:35,y:0,hp:1,type:'normal',hit:0,knock:0,speed:0}];player.z=44;player.vz=-120;update(.02)");assert.equal(run('kills'),0);assert.ok(run('player.vz')<0);run("reset();enemies=[{id:9101,x:29,y:0,hp:1,type:'normal',hit:0,knock:0,speed:0}];player.z=44;player.vz=-120;update(.02)");assert.equal(run('kills'),1);assert.ok(run('player.vz')>0);});
test('Sound effects schedule audio safely and respect mute',()=>{let notes=0,resumes=0;const gains=[];class AudioMock{constructor(){this.currentTime=1;this.state='suspended';this.destination={};}resume(){resumes++;this.state='running';return Promise.resolve();}createOscillator(){notes++;return{frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){},disconnect(){}};}createGain(){return{gain:{setValueAtTime(){},exponentialRampToValueAtTime(value){gains.push(value);}},connect(){},disconnect(){}};}}context.window.AudioContext=AudioMock;run("audioCtx=undefined;sound=true;for(const effect of ['jump','stomp','peel','slip','hurt','charge','ultimate','whoosh','hit','warning','start','lose','win'])sfx(effect)");assert.ok(notes>=20);assert.equal(resumes,1);gains.length=0;run('tone(440,.1,"sine",.04)');assert.ok(Math.abs(gains[0]-.12)<1e-9);const before=notes;run("sound=false;sfx('jump')");assert.equal(notes,before);});
test('Red bananas arrive at 20 seconds and reset with each game',()=>{run("reset();enemies=[];elapsed=19.9;updateChargerSchedule()");assert.equal(run('enemies.length'),0);run('elapsed=20;updateChargerSchedule()');assert.equal(run("enemies[0].type"),'charger');assert.equal(run('enemies[0].hp'),1);assert.equal(run('bananaColor(enemies[0])'),run('ripenessColors[3]'));run('reset()');assert.equal(run('nextChargerAt'),20);});
test('Red peel travels 2.4 times the ordinary slide distance and stops',()=>{run('reset();enemies=[];peels=[{x:0,y:0,age:.51,red:true,angle:0,vx:1152,vy:0,slideTime:.7}];const slider={x:0,y:0,down:.7,slipX:480,slipY:0};updatePeels(.7);slide(slider,.7)');assert.ok(Math.abs(run('peels[0].x/slider.x')-2.4)<.0001);assert.equal(run('peels[0].slideTime'),0);const stopped=run('peels[0].x');run('updatePeels(.1)');assert.equal(run('peels[0].x'),stopped);assert.equal(run('peels.length'),1);});
test('Swept red peel trips a grounded player without damage even across a frame',()=>{run('reset();enemies=[];spawnClock=100;peels=[{x:-45,y:0,age:1,red:true,angle:0,vx:1152,vy:0,slideTime:.7}];const sweptPeel=peels[0];update(.07)');assert.ok(run('sweptPeel.x')>26);assert.equal(run('peels.length'),1);assert.ok(run('player.down')>0);assert.equal(run('player.hp'),5);});
test('Airborne or ultimate player avoids moving red peels',()=>{run('reset();enemies=[];peels=[{x:-45,y:0,age:1,red:true,angle:0,vx:1152,vy:0,slideTime:.7}];player.z=60;player.vz=0;update(.07)');assert.equal(run('player.down'),0);run('reset();enemies=[];charge=100;activate();peels=[{x:-45,y:0,age:1,red:true,angle:0,vx:1152,vy:0,slideTime:.7}];update(.07)');assert.equal(run('player.down'),0);assert.equal(run('player.hp'),5);});
test('Red peel also trips enemies along its path',()=>{run("reset();player.y=300;enemies=[{id:9800,x:0,y:0,hp:1,type:'normal',hit:0,speed:0,knock:0}];peels=[{x:-45,y:0,age:1,red:true,angle:0,vx:1152,vy:0,slideTime:.7}];update(.07)");assert.equal(run('enemies[0].down'),.7);assert.equal(run('enemies[0].hp'),1);});
test('Stomping a large green charger splits it into two green small bananas',()=>{run("reset();enemies=[];const interrupted=spawn(0,'charger',{x:0,y:0});interrupted.phase='aim';hitEnemy(interrupted,true)");assert.equal(run('interrupted.hp'),0);assert.equal(run('kills'),0);assert.equal(run('charge'),20);assert.equal(run('peels.length'),0);assert.equal(run("enemies.filter(e=>e.type==='normal'&&e.hp===2).length"),2);assert.equal(run('stats.stompHits'),1);assert.equal(run('stats.stompKills'),0);assert.ok(run("enemies.filter(e=>e.type==='normal').every(e=>e.hit>0&&e.knock>0)"));});


test('Charge caps at one layer and dash spends the whole layer',()=>{run("reset();charge=95;hitEnemy({id:9990,x:0,y:0,hp:1,type:'normal',hit:0},true);updateHUD()");assert.equal(run('charge'),100);assert.equal(element('bar1').style.width,'100%');run('activate()');assert.equal(run('charge'),0);assert.equal(run('special.duration'),1);});
test('Dash follows current keyboard direction and remains locked for one second',()=>{run("reset();enemies=[];spawnClock=100;charge=100;player.face=Math.PI;keys.add('d');activate();update(.5)");assert.equal(run('player.x'),310);assert.ok(Math.abs(run('player.y'))<1e-8);run("keys.clear();keys.add('s');update(.5)");assert.equal(run('player.x'),620);assert.ok(Math.abs(run('player.y'))<1e-8);assert.equal(run('special'),null);assert.equal(run('player.z'),0);run('update(.1)');assert.ok(run('player.y')>20);});
test('Touch diagonal dash has constant speed; idle uses last facing',()=>{run('reset();enemies=[];charge=100;stick.x=1;stick.y=-1;activate();update(.5)');assert.ok(Math.abs(run('Math.hypot(player.x,player.y)')-310)<1e-8);run('reset();enemies=[];charge=100;player.face=-Math.PI/2;activate();update(.5)');assert.ok(Math.abs(run('player.x'))<1e-8);assert.equal(run('player.y'),-310);});
test('Dash hits enemies, repels durian, and ignores peels while invincible',()=>{run("reset();enemies=[];spawnClock=100;charge=100;spawn(0,'normal',{x:31,y:0}).hp=1;spawn(0,'durian',{x:40,y:0});peels=[{x:31,y:0,age:1}];activate();update(.05);hurt('撞到榴槤')");assert.equal(run('player.hp'),5);assert.equal(run('player.down'),0);assert.equal(run('kills'),1);assert.ok(run("enemies.find(e=>e.type==='durian').knock")>0);});
test('Dash stops at arena edge and cannot overshoot its one-second movement',()=>{run('reset();enemies=[];charge=100;player.x=1240;activate();update(.5)');assert.equal(run('player.x'),1250);run('reset();enemies=[];charge=100;activate();update(1.3)');assert.equal(run('player.x'),620);assert.equal(run('special'),null);});
test('Physical WASD works with IME characters and releases cleanly',()=>{run("reset();enemies=[];handleKeyDown({code:'KeyW',key:'ㄊ',repeat:false,preventDefault(){}});update(.1)");assert.ok(run('player.y')<0);run("handleKeyUp({code:'KeyW',key:'Process'})");assert.equal(run('keys.has("w")'),false);});
test('Physical jump, dash, pause and arrows work under a non-Latin input method',()=>{run("reset();enemies=[];handleKeyDown({code:'Space',key:'Process',repeat:false,preventDefault(){}})");assert.ok(run('player.vz')>0);run("charge=100;handleKeyDown({code:'ArrowLeft',key:'ArrowLeft',repeat:false,preventDefault(){}});handleKeyDown({code:'KeyJ',key:'ㄨ',repeat:false,preventDefault(){}});update(.1)");assert.ok(run('player.x')<0);run("handleKeyDown({code:'KeyP',key:'ㄣ',repeat:false,preventDefault(){}})");assert.equal(run('state'),'paused');run("handleKeyDown({code:'KeyW',key:'w',ctrlKey:true,preventDefault(){throw Error('browser shortcut blocked')}})");assert.equal(run('keys.has("w")'),false);});
test('Bunch spawns on schedule and pickup emits exactly six evenly spaced peels',()=>{run('reset();enemies=[];elapsed=17;updateItems(0)');assert.equal(run('pickups.length'),1);run('player.x=pickups[0].x;player.y=pickups[0].y;updateItems(.01)');assert.equal(run('pickups.length'),0);assert.equal(run('orbitPeels.length'),6);assert.ok(run('orbitPeels.every((p,i)=>i===0||Math.abs(p.angle-orbitPeels[i-1].angle-TAU/6)<1e-8)'));assert.equal(run('orbitPeels[1].hits===orbitPeels[0].hits'),true);});
test('Orbit is clockwise, expands with the player, then leaves the viewport',()=>{run('reset();enemies=[];collectBunch();updateItems(.1)');const radius=run('Math.hypot(orbitPeels[0].x-player.x,orbitPeels[0].y-player.y)');const angle=run('orbitPeels[0].angle');run('player.x=100;player.y=200;updateItems(.1)');assert.ok(run('Math.hypot(orbitPeels[0].x-player.x,orbitPeels[0].y-player.y)')>radius);assert.ok(run('orbitPeels[0].angle')>angle);run('updateItems(6)');assert.equal(run('orbitPeels.length'),0);});
test('Qi peels damage bananas once, split large greens, and repel durians away from player',()=>{run("reset();enemies=[];var qiNormal=spawn(0,'normal',{x:20,y:0});qiNormal.hp=2;var qiDurian=spawn(0,'durian',{x:-20,y:0});var qiLarge=spawn(0,'charger',{x:0,y:-20});collectBunch();updateItems(.01)");assert.equal(run('qiNormal.hp'),1);assert.equal(run('qiLarge.hp'),0);assert.equal(run('qiDurian.hp'),1);assert.ok(run('qiNormal.kx*(qiNormal.x-player.x)+qiNormal.ky*(qiNormal.y-player.y)>0'));assert.ok(run('qiDurian.kx*(qiDurian.x-player.x)+qiDurian.ky*(qiDurian.y-player.y)>0'));assert.equal(run('player.hp'),5);assert.equal(run('player.down'),0);assert.equal(run('charge'),0);assert.equal(run('stats.stompHits'),0);assert.equal(run("enemies.filter(e=>e!==qiNormal&&e.type==='normal'&&e.hp===2).length"),2);run('qiNormal.hit=0;elapsed+=2;updateItems(0)');assert.equal(run('qiNormal.hp'),1);});
test('Fresh game clears pickups, orbit effects and pickup schedule',()=>{run('collectBunch();spawnBunch();nextPickupAt=99;reset()');assert.equal(run('pickups.length'),0);assert.equal(run('orbitPeels.length'),0);assert.equal(run('nextPickupAt'),17);});
test('High combos give 0.1 each and record the maximum',()=>{run("reset();enemies=[];for(let i=0;i<8;i++){charge=0;hitEnemy({id:12000+i,x:0,y:0,hp:1,type:'normal',hit:0},true);if(charge!==(i===0?20:10))throw Error('incorrect first or consecutive stomp charge');}");assert.equal(run('stats.maxCombo'),8);assert.equal(run('stats.stompHits'),8);run('slip(player,0)');assert.equal(run('combo'),0);assert.equal(run('stats.maxCombo'),8);});
test('Results distinguish stomp kills from all kills and include activities',()=>{run("reset();enemies=[];hitEnemy({id:12100,x:0,y:0,hp:1,type:'normal',hit:0},true);hitEnemy({id:12101,x:0,y:0,hp:1,type:'normal',hit:0},false);charge=100;activate();collectBunch();elapsed=42;finish(false)");assert.equal(run('stats.stompKills'),1);assert.equal(run('kills'),2);assert.equal(run('stats.dashes'),1);assert.equal(run('stats.bunches'),1);for(const label of ['存活時間','最大連踩','踩掉香蕉','擊敗總數','衝刺次數','撿到香蕉串'])assert.ok(element('resultStats').innerHTML.includes(label));assert.ok(element('resultStats').innerHTML.includes('42 秒'));assert.equal(element('resultStats').hidden,false);});
test('A new round clears all statistics and hides old results',()=>{run('reset()');assert.equal(run('stats.maxCombo+stats.stompKills+stats.stompHits+stats.dashes+stats.bunches'),0);assert.equal(element('resultStats').hidden,true);});

test('Broken combo restores 0.2 charge and nine consecutive stomps fill one layer',()=>{run("reset();enemies=[];for(let i=0;i<9;i++)hitEnemy({id:13000+i,x:0,y:0,hp:1,type:'normal',hit:0},true)");assert.equal(run('charge'),100);run("charge=0;comboLife=0;hitEnemy({id:13010,x:0,y:0,hp:1,type:'normal',hit:0},true);updateHUD()");assert.equal(run('charge'),20);assert.equal(element('bar1').style.width,'20%');run("hitEnemy({id:13011,x:0,y:0,hp:1,type:'normal',hit:0},true);updateHUD()");assert.equal(run('charge'),30);assert.equal(element('bar1').style.width,'30%');});
test('Sliding durian rolls clockwise right, counterclockwise left, and stays still when stopped',()=>{run("reset();enemies=[];const rolling=spawn(0,'durian',{x:0,y:0});rolling.down=.7;rolling.x=23;advanceDurianRoll(rolling,0,0)");assert.equal(run('rolling.rollAngle'),1);assert.equal(run('rolling.rollFacing'),1);run('rolling.x=0;advanceDurianRoll(rolling,23,0)');assert.equal(run('rolling.rollAngle'),0);assert.equal(run('rolling.rollFacing'),-1);run('advanceDurianRoll(rolling,0,0)');assert.equal(run('rolling.rollAngle'),0);run('rolling.y=10;advanceDurianRoll(rolling,0,0)');assert.ok(run('rolling.rollAngle')<0);});
test('Phantom sprite frames map ripeness and red attack variant correctly',()=>{assert.equal(run("enemyFrameIndex({type:'normal',hp:3})"),0);assert.equal(run("enemyFrameIndex({type:'normal',hp:2})"),1);assert.equal(run("enemyFrameIndex({type:'normal',hp:1})"),2);assert.equal(run("enemyFrameIndex({type:'charger',hp:1})"),0);});

test('Durian stays upright while chasing and rolls only while slipping or knocked back',()=>{run("reset();enemies=[];spawnClock=100;const resting=spawn(0,'durian',{x:-200,y:0});update(.1)");assert.ok(run('resting.x')>-200);assert.equal(run('resting.rollAngle'),0);run('slip(resting,0);update(.1)');assert.ok(run('resting.rollAngle')>0);run('resting.down=0;resting.knock=0;update(.1)');assert.equal(run('resting.rollAngle'),0);run('resting.knock=.3;resting.kx=-300;resting.ky=0;update(.1)');assert.ok(run('resting.rollAngle')<0);});

test('A ground peel disappears after the player slips and cannot trip another actor',()=>{run('reset();enemies=[];spawnClock=100;peels=[{x:0,y:0,age:1}];update(.01)');assert.equal(run('peels.length'),0);assert.equal(run('player.down'),.7);run("player.x=500;enemies=[{id:15000,x:0,y:0,hp:1,type:'normal',hit:0,speed:0,knock:0}];update(.01)");assert.ok(!run('enemies[0].down'));});
test('Only one enemy can consume the same ground peel in a frame',()=>{run("reset();player.x=500;spawnClock=100;enemies=[{id:15001,x:0,y:0,hp:1,type:'normal',hit:0,speed:0,knock:0},{id:15002,x:2,y:0,hp:1,type:'normal',hit:0,speed:0,knock:0}];peels=[{x:0,y:0,age:1}];update(.01)");assert.equal(run('peels.length'),0);assert.equal(run('enemies.filter(e=>e.down>0).length'),1);});
test('Jumping over a peel preserves it until a grounded actor uses it',()=>{run('reset();enemies=[];peels=[{x:0,y:0,age:1}];player.z=60;player.vz=0;update(.01)');assert.equal(run('peels.length'),1);assert.equal(run('player.down'),0);run('player.z=0;player.vz=0;update(.01)');assert.equal(run('peels.length'),0);assert.equal(run('player.down'),.7);});
test('Slipping uses peel pose and enemy damage switches to the no-peel hurt pose',()=>{run('reset();slip(player,0)');assert.equal(run('player.downPose'),'slip');assert.equal(run('player.hp'),5);run("hurt('撞到香蕉')");assert.equal(run('player.downPose'),'hurt');assert.equal(run('player.hp'),4);run('player.inv=0;slip(player,0)');assert.equal(run('player.downPose'),'slip');});
test('Fatal damage retains hurt pose in the frozen final scene',()=>{run("reset();player.hp=1;hurt('撞到榴槤')");assert.equal(run('state'),'over');assert.equal(run('player.downPose'),'hurt');assert.ok(run('player.down')>0);});
test('Larger red peel and red banana have matching larger collision footprints',()=>{run('reset();enemies=[];peels=[{x:40,y:0,age:1,red:false}]');assert.equal(run('touchingPeel(player)'),undefined);run('peels[0].red=true');assert.ok(run('!!touchingPeel(player)'));run("reset();enemies=[];spawn(0,'charger',{x:40,y:0});update(.01)");assert.equal(run('player.hp'),4);});
test('Yellow charger spawn intervals are 1.5 times the previous schedule',()=>{run('reset();enemies=[];elapsed=20;updateChargerSchedule()');assert.ok(Math.abs(run('nextChargerAt-20')-(8-20/30)*1.5)<1e-8);run('elapsed=nextChargerAt;updateChargerSchedule()');assert.equal(run("enemies.filter(e=>e.type==='charger').length"),2);});

test('Red peel passes through player and multiple enemies without being consumed',()=>{run("reset();player.inv=2;spawnClock=100;enemies=[{id:16001,x:20,y:0,hp:1,type:'normal',hit:0,speed:0,knock:0},{id:16002,x:55,y:0,hp:1,type:'durian',hit:0,speed:0,knock:0}];peels=[{x:-80,y:0,age:1,red:true,angle:0,vx:1152,vy:0,flightRemaining:200,slideTime:200/1152}];update(.1)");assert.equal(run('player.down'),.7);assert.ok(run('enemies.every(e=>e.down===.7)'));assert.equal(run('peels.length'),1);assert.ok(run('peels[0].slideTime')>0);assert.equal(run('player.hp'),5);});
test('Red peel remains an active ground hazard after finishing flight',()=>{run('enemies=[];updatePeels(1)');assert.equal(run('peels[0].slideTime'),0);assert.equal(run('peels.length'),1);run('player.x=peels[0].x;player.y=peels[0].y;player.down=0;player.slipCooldown=0;player.inv=2;update(.01)');assert.equal(run('player.down'),.7);assert.equal(run('peels.length'),1);});
test('Enemy near the player keeps facing through small left-right jitter',()=>{run("reset();enemies=[];const stable=spawn(0,'normal',{x:-10,y:0});for(let i=0;i<60;i++){stable.x=i%2?-10:10;elapsed+=.02;updateEnemyFacing(stable);if(stable.facing!==1)throw Error('near-player facing flicker');}");});
test('Enemy turns across the dead zone with a minimum turn interval',()=>{run('stable.x=50;elapsed+=1;updateEnemyFacing(stable)');assert.equal(run('stable.facing'),-1);run('stable.x=-50;elapsed+=.05;updateEnemyFacing(stable)');assert.equal(run('stable.facing'),-1);run('elapsed+=.2;updateEnemyFacing(stable)');assert.equal(run('stable.facing'),1);run('stable.down=.7;stable.x=100;elapsed+=1;updateEnemyFacing(stable)');assert.equal(run('stable.facing'),1);});
test('Chasing enemy never overshoots a nearby player',()=>{run("reset();enemies=[];player.inv=2;const close=spawn(0,'normal',{x:-.5,y:0});close.speed=100;update(.03)");assert.equal(run('close.x'),0);run('update(.03)');assert.equal(run('close.x'),0);});
test('Health HUD renders five banana icons with filled and empty health states',()=>{run('reset();player.hp=3;updateHUD()');assert.equal((element('hearts').innerHTML.match(/health-banana filled/g)||[]).length,3);assert.equal((element('hearts').innerHTML.match(/health-banana empty/g)||[]).length,2);});
test('Red banana charges in place for half a second and locks direction',()=>{run("reset();enemies=[];const charger=spawn(0,'charger',{x:-200,y:0});updateCharger(charger,.01)");assert.equal(run('charger.phase'),'aim');assert.equal(run('charger.phaseTime'),.5);run('player.y=100;updateCharger(charger,.49)');assert.equal(run('charger.phase'),'aim');assert.equal(run('charger.x'),-200);assert.equal(run('charger.aim'),0);run('updateCharger(charger,.02)');assert.equal(run('charger.phase'),'dash');assert.equal(run('charger.dashSpeed'),320);});
test('Charging red banana accelerates and reaches the viewport edge before tumbling',()=>{run('updateCharger(charger,.1)');assert.ok(run('charger.dashSpeed')>320);assert.ok(run('charger.x')>-200);assert.equal(run('peels.length'),0);run('for(let i=0;i<100&&["dash","brake"].includes(charger.phase);i++)updateCharger(charger,.05)');assert.equal(run('charger.phase'),'turn');assert.equal(run('charger.x'),436);assert.equal(run('charger.down'),0);assert.equal(run('peels.length'),0);});

test('Red dash stops at each visible viewport edge for desktop and phone widths',()=>{for(const width of [390,1000])for(const direction of [0,Math.PI/2,Math.PI,-Math.PI/2]){context.viewportTestWidth=width;context.viewportTestDirection=direction;run("reset();enemies=[];W=viewportTestWidth;var viewportRed=spawn(0,'charger',{x:0,y:0});viewportRed.phase='dash';viewportRed.dashSpeed=320;viewportRed.aim=viewportTestDirection;for(let i=0;i<100&&['dash','brake'].includes(viewportRed.phase);i++)updateCharger(viewportRed,.03)");assert.equal(run('viewportRed.phase'),'turn');const x=run('screen(viewportRed.x,viewportRed.y).x'),y=run('screen(viewportRed.x,viewportRed.y).y');if(direction===0)assert.ok(Math.abs(x-(width-64))<1e-7);else if(direction===Math.PI)assert.ok(Math.abs(x-64)<1e-7);else if(direction>0)assert.ok(Math.abs(y-(650-32))<1e-7);else assert.ok(Math.abs(y-128)<1e-7);}run('W=1000');});
test('Red dash rams other bananas away without damaging or gaining charge',()=>{run("reset();enemies=[];const rammer=spawn(0,'charger',{x:-100,y:0});rammer.phase='dash';rammer.aim=0;rammer.dashSpeed=600;const rammed=spawn(0,'normal',{x:-30,y:10});const oldHP=rammed.hp;updateCharger(rammer,.1)");assert.ok(run('rammed.knock')>0);assert.ok(run('rammed.kx')>0);assert.ok(run('rammed.ky')>0);assert.equal(run('rammed.hp'),run('oldHP'));assert.equal(run('charge'),0);assert.equal(run('kills'),0);});
test('Red ram catches crossed targets, hits once per dash, and excludes durian',()=>{run("reset();enemies=[];const fastRam=spawn(0,'charger',{x:-200,y:0});fastRam.phase='dash';fastRam.aim=0;fastRam.dashSpeed=960;const crossed=spawn(0,'normal',{x:-100,y:0});const heavy=spawn(0,'durian',{x:-100,y:5});updateCharger(fastRam,.3)");assert.ok(run('crossed.knock')>0);assert.equal(run('heavy.knock'),0);run('crossed.knock=0;ramBananas(fastRam,-200,0)');assert.equal(run('crossed.knock'),0);});
test('Yellow charger turns at viewport edge and charges again without becoming peel',()=>{run("reset();enemies=[];const looping=spawn(0,'charger',{x:430,y:0});looping.phase='dash';looping.aim=0;looping.dashSpeed=320;updateCharger(looping,.1)");assert.equal(run('looping.phase'),'brake');run('updateCharger(looping,.9)');assert.equal(run('looping.phase'),'turn');assert.equal(run('looping.hp'),1);assert.equal(run('peels.length'),0);run('updateCharger(looping,.5)');assert.equal(run('looping.phase'),'turn');run('updateCharger(looping,1.5)');assert.equal(run('looping.phase'),'aim');assert.ok(Math.cos(run('looping.aim'))<0);run('updateCharger(looping,.5)');assert.equal(run('looping.phase'),'dash');assert.equal(run('looping.hp'),1);assert.equal(run('peels.length'),0);});
test('Ultimate splits a large green charger without stomp rewards or a peel',()=>{run('var beforeDashCharge=charge,beforeDashCombo=combo;hitEnemy(looping,false)');assert.equal(run('looping.hp'),0);assert.equal(run('peels.length'),0);assert.equal(run("enemies.filter(e=>e.type==='normal'&&e.hp===2).length"),2);assert.equal(run('charge'),run('beforeDashCharge'));assert.equal(run('combo'),run('beforeDashCombo'));assert.equal(run('stats.stompKills'),0);});
test('New special enemy wave timers start at 10, 20, and 30 seconds',()=>{run('reset()');assert.equal(run('nextDurianAt'),10);assert.equal(run('nextChargerAt'),20);assert.equal(run('nextThrowerAt'),30);run('enemies=[];elapsed=29.99;updateThrowerSchedule()');assert.equal(run('enemies.length'),0);run('elapsed=30;updateThrowerSchedule()');assert.equal(run('enemies[0].type'),'thrower');assert.equal(run('enemyFrameIndex(enemies[0])'),3);assert.equal(run('enemies[0].speed'),(67.5+30*.24)*1.5);assert.equal(run('enemies[0].phase'),'seek');});
test('Red thrower charge feedback grows during windup and ends on release or interruption',()=>{
  run("reset();enemies=[];var readyThrower=spawn(0,'thrower',{x:200,y:0});readyThrower.phase='windup';readyThrower.phaseTime=.65");assert.equal(run('enemyChargeProgress(readyThrower)'),0);
  run('readyThrower.phaseTime=.325');assert.ok(Math.abs(run('enemyChargeProgress(readyThrower)')-.5)<1e-8);
  run("readyThrower.phase='seek'");assert.equal(run('enemyChargeProgress(readyThrower)'),null);
  run("readyThrower.phase='windup';readyThrower.down=.2");assert.equal(run('enemyChargeProgress(readyThrower)'),null);
});
test('Thrower grabs an existing durian, winds up, then throws it toward player',()=>{run("reset();enemies=[];const tosser=spawn(0,'thrower',{x:200,y:0});const ammo=spawn(0,'durian',{x:220,y:0});tosser.throwCooldown=0;updateThrower(tosser,.01)");assert.equal(run('tosser.phase'),'windup');assert.equal(run('ammo.carriedBy'),run('tosser.id'));assert.equal(run('ammo.z'),50);run('updateThrower(tosser,.66)');assert.equal(run('ammo.carriedBy'),undefined);assert.ok(run('!!ammo.projectile'));assert.equal(run('ammo.projectile.toX'),0);assert.equal(run('ammo.projectile.toY'),0);assert.equal(run('enemies.length'),2);assert.equal(run('tosser.phase'),'seek');});
test('Thrown durian can hit player, lands, and remains a normal enemy',()=>{run('updateThrownDurian(ammo,ammo.projectile.duration)');assert.equal(run('player.hp'),4);assert.equal(run('ammo.projectile'),undefined);assert.equal(run('ammo.z'),0);assert.equal(run('ammo.hp'),1);});
test('Defeating a thrower releases held durian instead of deleting it',()=>{run("reset();enemies=[];const owner=spawn(0,'thrower',{x:100,y:0});const held=spawn(0,'durian',{x:110,y:0});owner.throwCooldown=0;updateThrower(owner,.01);hitEnemy(owner,true);owner.hit=0;hitEnemy(owner,true)");assert.equal(run('owner.hp'),0);assert.equal(run('held.carriedBy'),undefined);assert.equal(run('held.z'),0);assert.equal(run('held.hp'),1);});
test('Thrower without available durian walks normally and never charges',()=>{run("reset();enemies=[];const emptyHand=spawn(0,'thrower',{x:300,y:0});updateThrower(emptyHand,1)");assert.equal(run('emptyHand.phase'),'seek');assert.equal(run('emptyHand.x'),198.75);assert.equal(run('emptyHand.dashSpeed'),undefined);});
test('Special enemy spawn intervals shorten as the run advances',()=>{run('reset();enemies=[];elapsed=20;updateChargerSchedule();var earlyYellow=nextChargerAt-20;elapsed=150;nextChargerAt=150;updateChargerSchedule();var lateYellow=nextChargerAt-150;nextDurianAt=150;updateDurianSchedule();var lateDurian=nextDurianAt-150');assert.ok(run('lateYellow<earlyYellow'));assert.ok(run('lateDurian')<5);});

test('Yellow charger decelerates for one second, rests two seconds, then aims',()=>{run("reset();enemies=[];const braking=spawn(0,'charger',{x:136,y:0});braking.phase='dash';braking.aim=0;braking.dashSpeed=600;updateCharger(braking,.1)");assert.equal(run('braking.phase'),'brake');const first=run('braking.x');run('updateCharger(braking,.1)');const second=run('braking.x');run('updateCharger(braking,.1)');assert.ok(run('braking.x')-second<second-first);run('for(let i=0;i<7;i++)updateCharger(braking,.1)');assert.equal(run('braking.phase'),'brake');run('updateCharger(braking,.000001)');assert.equal(run('braking.phase'),'turn');assert.ok(Math.abs(run('braking.x')-436)<1e-6);run('updateCharger(braking,1.99)');assert.equal(run('braking.phase'),'turn');assert.ok(run('hitEnemy(braking,true)'));assert.equal(run('braking.hp'),0);});
test('Thrower seeks durian during cooldown and faces its ammunition instead of player',()=>{run("reset();enemies=[];const seeker=spawn(0,'thrower',{x:200,y:0});const sought=spawn(0,'durian',{x:500,y:0});seeker.throwCooldown=2.8;updateThrower(seeker,.1);updateEnemyFacing(seeker)");assert.ok(run('seeker.x')>200);assert.equal(run('seeker.targetDurian'),run('sought.id'));assert.equal(run('seeker.facing'),1);run("const tempting=spawn(0,'durian',{x:210,y:0});updateThrower(seeker,.1)");assert.equal(run('seeker.targetDurian'),run('sought.id'));run('sought.hp=0;updateThrower(seeker,.1)');assert.equal(run('seeker.targetDurian'),run('tempting.id'));});
test('Thrown durian visibly spins throughout flight and keeps a stable facing',()=>{run("reset();enemies=[];spawnClock=100;const spinningOwner=spawn(0,'thrower',{x:300,y:0});const spinning=spawn(0,'durian',{x:310,y:0});spinningOwner.throwCooldown=0;updateThrower(spinningOwner,.01);updateThrower(spinningOwner,.66);const lockedFacing=spinning.facing;update(.05)");assert.ok(run('!!spinning.projectile'));const angle=run('spinning.rollAngle');assert.ok(Math.abs(angle)>.1);run('player.x=600;update(.05)');assert.ok(Math.abs(run('spinning.rollAngle'))>Math.abs(angle));assert.equal(run('spinning.facing'),run('lockedFacing'));});

test('Red thrower first becomes a large dark green charger, then splits, then small bananas ripen',()=>{run("reset();enemies=[];const evolving=spawn(0,'thrower',{x:200,y:0});const carried=spawn(0,'durian',{x:210,y:0});evolving.throwCooldown=0;updateThrower(evolving,.01);hitEnemy(evolving,true)");assert.equal(run('evolving.type'),'charger');assert.equal(run('evolving.hp'),1);assert.equal(run('evolving.phase'),'approach');assert.equal(run('enemyFrameIndex(evolving)'),0);assert.equal(run('evolving.speed'),52);assert.equal(run('carried.carriedBy'),undefined);assert.equal(run('carried.z'),0);assert.equal(run('peels.length'),0);assert.equal(run('kills'),0);run("evolving.hit=0;hitEnemy(evolving,true);var babies=enemies.filter(e=>e.type==='normal');");assert.equal(run('babies.length'),2);assert.ok(run('babies.every(e=>e.hp===2&&enemyFrameIndex(e)===1)'));run('babies[0].hit=0;hitEnemy(babies[0],true)');assert.equal(run('babies[0].hp'),1);assert.equal(run('enemyFrameIndex(babies[0])'),2);assert.equal(run('peels.length'),0);run('babies[0].hit=0;hitEnemy(babies[0],true)');assert.equal(run('peels.length'),1);assert.equal(run('peels[0].red'),false);assert.equal(run('peels[0].large'),false);assert.equal(run('stats.stompKills'),1);assert.equal(run('kills'),1);});

test('Airborne players cannot collect a bunch until landing',()=>{run('reset();enemies=[];pickups=[{id:18000,x:0,y:0,age:0}];player.z=20;updateItems(.01)');assert.equal(run('pickups.length'),1);assert.equal(run('stats.bunches'),0);run('player.z=0;updateItems(.01)');assert.equal(run('pickups.length'),0);assert.equal(run('orbitPeels.length'),6);});
test('Bunches spawn every 17 seconds just outside the viewport and cycle all four sides',()=>{run('reset();enemies=[];W=1000;H=650;elapsed=16.99;updateItems(0)');assert.equal(run('pickups.length'),0);for(let i=0;i<4;i++){run(`elapsed=${17*(i+1)};updateItems(0)`);const x=run(`screen(pickups.at(-1).x,pickups.at(-1).y).x`),y=run(`screen(pickups.at(-1).x,pickups.at(-1).y).y`);if(i===0)assert.equal(x,-60);if(i===1)assert.equal(x,1060);if(i===2)assert.ok(Math.abs(y+60)<1e-7);if(i===3)assert.ok(Math.abs(y-710)<1e-7);}assert.equal(run('nextPickupAt'),85);});
test('Bunch placement avoids occupied sides and stays inside the arena near map edges',()=>{run('reset();enemies=[];pickups=[{id:18001,x:-600,y:0,age:0}];spawnBunch()');assert.ok(run('pickups[1].x')>500);run('player.x=1200;player.y=1200;pickups=[];nextBunchSide=1;spawnBunch()');assert.equal(run('pickups.length'),1);assert.ok(run('Math.abs(pickups[0].x)<=arenaSize-45&&Math.abs(pickups[0].y)<=arenaSize-45'));assert.ok(run('screen(pickups[0].x,pickups[0].y).x<0||screen(pickups[0].x,pickups[0].y).y<0'));});

test('Background music is an exact 30-second loop with finite, restrained audio levels',()=>{run("var testMusic=createMusicBuffer({createBuffer(channels,length,rate){return {duration:length/rate,sampleRate:rate,data:new Float32Array(length),getChannelData(){return this.data;}}}})");assert.equal(run('testMusic.duration'),30);assert.equal(run('testMusic.data.length'),661500);assert.ok(run('testMusic.data.every(Number.isFinite)'));assert.ok(run('testMusic.data.some(n=>Math.abs(n)>.05)'));assert.ok(run('testMusic.data.every(n=>Math.abs(n)<.3)'));assert.ok(run('Math.abs(testMusic.data[0]-testMusic.data[testMusic.data.length-1])<.02'));});
test('Music starts once, stops on pause/end/mute, and resumes at the game time',()=>{run(`
var musicStarts=[],musicStops=[];
audioCtx={currentTime:100,state:'running',destination:{},
createBuffer:(_c,n,r)=>({duration:n/r,getChannelData:()=>new Float32Array(n)}),
createBufferSource:()=>({connect(){},disconnect(){},start:(...args)=>musicStarts.push(args),stop:(...args)=>musicStops.push(args)}),
createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}})};
musicBuffer=testMusic;sound=true;reset();
`);assert.equal(run('musicStarts.length'),1);assert.equal(run('musicSource.loop'),true);run('elapsed=37;pause()');assert.equal(run('musicStops.length'),1);assert.equal(run('musicSource'),null);run('pause()');assert.equal(run('musicStarts.length'),2);assert.equal(run('musicStarts[1][1]'),7);run('sound=false;syncMusic()');assert.equal(run('musicStops.length'),2);assert.equal(run('musicSource'),null);run('sound=true;syncMusic();finish(false)');assert.equal(run('musicStarts.length'),3);assert.equal(run('musicStops.length'),3);assert.equal(run('musicSource'),null);run('audioCtx=undefined;musicBuffer=null');});
test('Durian release plays its dedicated throw cue',()=>{run("reset();enemies=[];var savedSfx=sfx,heardCues=[];sfx=name=>heardCues.push(name);var audioTosser=spawn(0,'thrower',{x:200,y:0});spawn(0,'durian',{x:210,y:0});audioTosser.throwCooldown=0;updateThrower(audioTosser,.01);updateThrower(audioTosser,.66);sfx=savedSfx");assert.ok(run("heardCues.includes('durianThrow')"));assert.equal(run("heardCues.includes('redDash')"),false);});

test('Dash turns a large red thrower green once per cast and releases its durian',()=>{run("reset();enemies=[];spawnClock=100;const dashBoss=spawn(0,'thrower',{x:70,y:0});const dashAmmo=spawn(0,'durian',{x:75,y:0});dashBoss.throwCooldown=0;updateThrower(dashBoss,.01);charge=100;activate();update(.05)");assert.equal(run('dashBoss.type'),'charger');assert.equal(run('dashBoss.hp'),1);assert.equal(run('dashAmmo.carriedBy'),undefined);assert.equal(run('dashAmmo.z'),0);assert.equal(run('charge'),0);assert.equal(run('combo'),0);assert.equal(run('stats.stompHits'),0);run('dashBoss.hit=0;dashBoss.knock=0;dashBoss.x=player.x;dashBoss.y=player.y;update(.01)');assert.equal(run('dashBoss.hp'),1);assert.equal(run("enemies.filter(e=>e.type==='normal').length"),0);});
test('Dash splits a large green banana without instantly ripening its children',()=>{run("reset();enemies=[];spawnClock=100;const dashGreen=spawn(0,'charger',{x:65,y:0});charge=100;activate();update(.05)");assert.equal(run('dashGreen.hp'),0);assert.equal(run("enemies.filter(e=>e.type==='normal'&&e.hp===2).length"),2);assert.equal(run('peels.length'),0);assert.equal(run('stats.stompHits'),0);assert.equal(run('charge'),0);});

test('Music and effects share a boosted, compressed output without duplicate connections',()=>{run(`
var outputLinks=[],outputGains=[],compressorParams={};
var outputContext={currentTime:0,state:'running',destination:{name:'speakers'},
createGain:()=>({name:'gain',gain:{setValueAtTime(v){outputGains.push(v);},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}},connect(target){outputLinks.push([this,target]);},disconnect(){}}),
createDynamicsCompressor:()=>{var node={name:'compressor',connect(target){outputLinks.push([this,target]);}};for(var key of ['threshold','knee','ratio','attack','release']){let param=key;node[param]={setValueAtTime(v){compressorParams[param]=v;}};}return node;},
createOscillator:()=>({frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},start(){},stop(){},disconnect(){}}),
createBufferSource:()=>({connect(){},start(){},stop(){},disconnect(){}})};
audioCtx=outputContext;audioOutput=null;musicSource=null;sound=true;var sharedOutput=getAudioOutput();getAudioOutput();tone(440);state='playing';musicBuffer=testMusic;syncMusic();
`);assert.equal(run('outputGains[0]'),3);assert.equal(run('compressorParams.threshold'),-12);assert.equal(run('compressorParams.ratio'),8);assert.equal(run("outputLinks.filter(pair=>pair[1]===outputContext.destination).length"),1);assert.equal(run('outputLinks.filter(pair=>pair[1]===sharedOutput).length'),2);run('sound=false;syncMusic();audioCtx=undefined;audioOutput=null;musicBuffer=null;sound=true');});

test('Ground durian hits airborne players at any normal jump height',()=>{for(const height of [20,60,100,120]){run(`reset();enemies=[];spawnClock=100;player.z=${height};spawn(0,'durian',{x:0,y:0}).speed=0;update(.001)`);assert.equal(run('player.hp'),4);assert.equal(run('player.downPose'),'hurt');}});
test('Thrown durian hits airborne players along its swept path regardless of height',()=>{for(const height of [0,70,120]){run(`reset();enemies=[];player.z=${height};var airShot=spawn(0,'durian',{x:-100,y:0});airShot.projectile={t:0,duration:1,startZ:50,fromX:-100,fromY:0,toX:100,toY:0};updateThrownDurian(airShot,1)`);assert.equal(run('player.hp'),4);}});
test('Airborne durian collision still respects lateral dodging and invincibility',()=>{run("reset();enemies=[];spawnClock=100;player.z=100;spawn(0,'durian',{x:80,y:0}).speed=0;update(.001)");assert.equal(run('player.hp'),5);run('enemies[0].x=0;player.inv=1;update(.001)');assert.equal(run('player.hp'),5);run('player.inv=0;charge=100;activate();update(.001)');assert.equal(run('player.hp'),5);run("var missedShot=spawn(0,'durian',{x:-100,y:80});missedShot.projectile={t:0,duration:1,startZ:50,fromX:-100,fromY:80,toX:100,toY:80};special=null;player.z=100;updateThrownDurian(missedShot,1)");assert.equal(run('player.hp'),5);});

test('Volume slider adjusts the shared output, mutes immediately, and restores the previous level',()=>{run("audioCtx=outputContext;audioOutput=null;musicSource=null;musicBuffer=testMusic;state='playing';sound=true;volumeLevel=1;syncMusic();var volumeSource=musicSource,volumeChanges=[];audioOutput.output.gain.setTargetAtTime=v=>volumeChanges.push(v);setVolume(25)");assert.equal(run('volumeLevel'),.25);assert.equal(run('sound'),true);assert.equal(run('musicSource===volumeSource'),true);assert.equal(run('volumeChanges[0]'),.25);assert.equal(element('volumeLabel').textContent,'25%');run('setVolume(0)');assert.equal(run('sound'),false);assert.equal(run('musicSource'),null);assert.equal(run('volumeChanges[1]'),0);assert.equal(element('volumeLabel').textContent,'靜音');run('setVolume(lastVolumeLevel*100)');assert.equal(run('volumeLevel'),.25);assert.equal(run('sound'),true);run('setVolume(100);sound=false;syncMusic();sound=true;audioCtx=undefined;audioOutput=null;musicBuffer=null');});
test('Arrow keys on the volume slider do not control the game',()=>{run("keys.clear();handleKeyDown({target:$('volume'),code:'ArrowLeft',key:'ArrowLeft',preventDefault(){throw Error('range keyboard intercepted');}})");assert.equal(run('keys.size'),0);});


test('Viewport grid excludes crowded cells and retains every tie at the fifth density rank',()=>{
  run("reset();enemies=[];spawnWarnings=[];player.x=0;player.y=0;var gridCells=naturalSpawnCells();var occupiedCell=gridCells[0];for(let i=0;i<4;i++)spawn(0,'normal',occupiedCell)");
  assert.ok(run('naturalSpawnOptions().every(p=>p.col!==occupiedCell.col||p.row!==occupiedCell.row)'));
  assert.ok(run('naturalSpawnOptions().every(p=>p.density===0)'));assert.ok(run('naturalSpawnOptions().length')>5);
  run('var tiedCells=[0,0,1,1,2,2,2,2.5,4].map((density,id)=>({density,id}))');assert.equal(run('lowestDensityCells(tiedCells).length'),7);
  assert.equal(run('lowestDensityCells([{density:3},{density:4}]).length'),0);
  for(const corner of [-1,1]){context.gridCorner=corner;run('player.x=gridCorner*1240;player.y=gridCorner*1240');assert.ok(run('naturalSpawnOptions().length')>0);assert.ok(run('naturalSpawnOptions().every(p=>Math.abs(p.x)<=arenaSize-45&&Math.abs(p.y)<=arenaSize-45&&dist(p,player)>=140)'));}
  run('reset()');
});
test('Both stages change sector probabilities at half time and prefer sparse forward or side cells',()=>{
  for(const mode of ['milk','survival']){
    context.gridMode=mode;run("$('gameMode').value=gridMode;reset();enemies=[];spawnWarnings=[];elapsed=roundDuration()/2-.01;var gridRandom=Math.random");
    try{
      for(const [roll,sector] of [[.1,'front'],[.65,'side'],[.9,'back']]){context.gridRoll=roll;run('Math.random=()=>gridRoll');assert.equal(run('chooseNaturalSpawn().sector'),sector);}
      run('elapsed=roundDuration()/2');assert.equal(run('arrivalSectorWeights().front'),.8);assert.equal(run('arrivalSectorWeights().back'),0);
      for(const [roll,sector] of [[.79,'front'],[.81,'side'],[.99,'side']]){context.gridRoll=roll;run('Math.random=()=>gridRoll');assert.equal(run('chooseNaturalSpawn().sector'),sector);}

    }finally{run('Math.random=gridRandom;reset()');}
  }
  run("$('gameMode').value='survival';reset()");
});
test('Arrival heading uses only displacement in the most recent second including partial samples',()=>{
  run('reset();spawnMotion=[];updateSpawnHeading(100,0,.75);updateSpawnHeading(0,100,.5)');assert.ok(Math.abs(run('spawnHeading.x')-100*2/3)<1e-8);assert.equal(run('spawnHeading.y'),100);
  run('updateSpawnHeading(-20,0,.5)');assert.equal(run('spawnHeading.x'),-20);assert.equal(run('spawnHeading.y'),100);
  run('updateSpawnHeading(-100,0,1)');assert.equal(run('spawnHeading.x'),-100);assert.equal(run('spawnHeading.y'),0);run('reset()');
});
test('Natural arrivals lock their warned point for half a second even when the player moves onto it, and freeze with pause',()=>{
  for(const mode of ['milk','survival']){
    context.arrivalMode=mode;run("$('gameMode').value=arrivalMode;reset();enemies=[];spawnWarnings=[];spawnClock=0;updateNaturalArrivals(.01);var warnedPoint={...spawnWarnings[0]};spawnClock=999");
    assert.equal(run('enemies.length'),0);assert.equal(run('spawnWarnings.length'),1);
    run('updateNaturalArrivals(.49)');assert.equal(run('enemies.length'),0);
    run('updateNaturalArrivals(.02)');assert.equal(run('enemies.length'),1);assert.equal(run('enemies[0].x'),run('warnedPoint.x'));assert.equal(run('enemies[0].y'),run('warnedPoint.y'));
    run('enemies=[];spawnClock=0;updateNaturalArrivals(.01);var lockedArrival={...spawnWarnings[0]};player.x=lockedArrival.x;player.y=lockedArrival.y;spawnClock=999;updateNaturalArrivals(.49)');assert.equal(run('enemies.length'),0);assert.equal(run('spawnWarnings[0].x'),run('lockedArrival.x'));assert.equal(run('spawnWarnings[0].y'),run('lockedArrival.y'));run('updateNaturalArrivals(.02)');assert.equal(run('enemies.length'),1);assert.equal(run('enemies[0].x'),run('lockedArrival.x'));assert.equal(run('enemies[0].y'),run('lockedArrival.y'));
    run('spawnClock=0;updateNaturalArrivals(.01);var pausedArrival=spawnWarnings[0].time;pause();update(1)');assert.equal(run('spawnWarnings[0].time'),run('pausedArrival'));run('pause();reset()');assert.equal(run('spawnWarnings.length'),0);
  }
  run("$('gameMode').value='survival';reset();enemies=[];spawnClock=0;updateNaturalArrivals(.01);elapsed=119.99;update(.02)");assert.equal(run('spawnWarnings.length'),0);assert.ok(run('boss'));
  run('reset()');
});
test('Scheduled waves survive a full population cap and release at most one enemy per half second',()=>{
  run("$('gameMode').value='survival';reset();enemies=[];for(let i=0;i<110;i++)spawn(0,'durian',{x:1000,y:1000});spawnClock=0;updateNaturalArrivals(.01)");assert.equal(run('spawnDueWaves'),1);assert.equal(run('spawnWarnings.length'),0);
  run('spawnClock=999;enemies=[];updateNaturalArrivals(.01)');assert.equal(run('spawnDueWaves'),0);assert.equal(run('spawnWarnings.length'),1);
  run('spawnClock=0;updateNaturalArrivals(.01);spawnClock=999;updateNaturalArrivals(.81)');assert.equal(run('enemies.length'),1);assert.equal(run('spawnWarnings.length'),1);
  run('updateNaturalArrivals(.49)');assert.equal(run('enemies.length'),1);run('updateNaturalArrivals(.02)');assert.equal(run('enemies.length'),2);assert.equal(run('spawnWarnings.length'),0);run('reset()');
});
test('Dense viewports and unavailable preferred directions still provide an arrival location',()=>{
  run("reset();enemies=[];spawnWarnings=[];elapsed=90;var retryCells=naturalSpawnCells();for(const cell of retryCells)for(let i=0;i<4;i++)spawn(0,'normal',cell)");assert.equal(run('naturalSpawnOptions().length'),0);assert.ok(run('chooseNaturalSpawn()'));
  run("enemies=[];spawnHeading={x:1,y:0};player.x=1249;player.y=0");assert.ok(run('chooseNaturalSpawn()'));run('reset()');
});
test('蕉皮末日 recycles the farthest yellow only and never awards combat resources',()=>{
  run("$('gameMode').value='survival';reset();enemies=[];var nearYellow=spawn(0,'normal',{x:300,y:0}),farYellow=spawn(0,'normal',{x:900,y:0});nearYellow.hp=farYellow.hp=1;var protectedTypes=['charger','thrower','durian','milk','slice'];for(const kind of protectedTypes)spawn(0,kind,{x:1200,y:1000});for(let i=0;i<103;i++){var protectedGreen=spawn(0,'normal',{x:1100,y:1000});protectedGreen.hp=2}var recycledKills=kills,recycledCharge=charge,recycledPeels=peels.length,recycledStats=JSON.stringify(stats)");
  assert.equal(run('enemies.length'),110);assert.equal(run('makeRoomForNaturalArrival()'),true);assert.equal(run('enemies.length'),109);assert.ok(run('enemies.includes(nearYellow)'));assert.equal(run('enemies.includes(farYellow)'),false);assert.ok(run('protectedTypes.every(type=>enemies.some(e=>e.type===type))'));assert.equal(run('kills'),run('recycledKills'));assert.equal(run('charge'),run('recycledCharge'));assert.equal(run('peels.length'),run('recycledPeels'));assert.equal(run('JSON.stringify(stats)'),run('recycledStats'));run('reset()');
});
milkTest('蕉片崛起 never reclaims milk enemies and releases reclaimed bottle claims without consuming bottles',()=>{
  run("enemies=[];milkBottles=[];for(let i=0;i<46;i++)spawn(0,'milk',{x:1200,y:1200});var recycleBottle=spawnMilkBottle({x:1000,y:0}),recycleSlice=spawn(0,'slice',{x:1000,y:0});recycleBottle.claimantId=recycleSlice.id;var recycleNear=spawn(0,'slice',{x:200,y:0});var recycleBeforeKills=kills,recycleBeforeCharge=charge");
  assert.equal(run('milkPopulation()'),48);assert.equal(run('makeRoomForNaturalArrival()'),true);assert.equal(run('enemies.includes(recycleSlice)'),false);assert.ok(run('enemies.includes(recycleNear)'));assert.equal(run("enemies.filter(e=>e.type==='milk').length"),46);assert.equal(run('milkBottles.length'),1);assert.equal(run('recycleBottle.claimantId'),undefined);assert.equal(run('kills'),run('recycleBeforeKills'));assert.equal(run('charge'),run('recycleBeforeCharge'));
  run("enemies=[];for(let i=0;i<49;i++)spawn(0,'milk',{x:1200,y:1200});var loneRecyclable=spawn(0,'slice',{x:500,y:0})");assert.equal(run('makeRoomForNaturalArrival()'),false);assert.ok(run('enemies.includes(loneRecyclable)'));assert.equal(run('milkPopulation()'),50);
});
test('Late 蕉皮末日 arrivals spawn one enemy per wave with at least half a second between waves',()=>{
  run("$('gameMode').value='survival';reset();enemies=[];elapsed=110;spawnClock=0;updateNaturalArrivals(.01);spawnClock=999;updateNaturalArrivals(.81)");assert.equal(run('enemies.length'),1);assert.equal(run('smallSpawnInterval()'),.5);run('reset()');
});
test('蕉皮末日 natural spawn attempts slow from 1.2 seconds to a 0.5 second minimum',()=>{for(const time of [0,20,60,100,150,179]){context.rateTime=time;assert.ok(Math.abs(run('smallSpawnInterval(rateTime)')-Math.max(.5,(.9-time*.005)/.75))<1e-10);}run('reset()');assert.equal(run('enemies.length'),7);assert.ok(Math.abs(run('spawnClock')-.4/.75)<1e-10);});
test('Bunch indicators point to all four offscreen sides and disappear when visible or collected',()=>{run('reset();enemies=[];W=1000;H=650');for(const [x,y,edge] of [[-600,0,'left'],[600,0,'right'],[0,-600,'top'],[0,600,'bottom']]){context.indicatorX=x;context.indicatorY=y;run('var marker=bunchIndicator({x:indicatorX,y:indicatorY})');assert.ok(run('marker.x>=36&&marker.x<=W-36&&marker.y>=36&&marker.y<=H-36'));if(edge==='left')assert.equal(run('marker.x'),36);if(edge==='right')assert.equal(run('marker.x'),964);if(edge==='top')assert.equal(run('marker.y'),36);if(edge==='bottom')assert.equal(run('marker.y'),614);}assert.equal(run('bunchIndicator({x:0,y:0})'),null);run('pickups=[{id:19000,x:0,y:0,age:0}];updateItems(0)');assert.equal(run('pickups.length'),0);});
test('Qi peel damage converts a red thrower only once and does not farm charge',()=>{run("reset();enemies=[];var qiRed=spawn(0,'thrower',{x:20,y:0});collectBunch();updateItems(.01)");assert.equal(run('qiRed.type'),'charger');assert.equal(run('qiRed.hp'),1);run('qiRed.hit=0;elapsed+=1;updateItems(0)');assert.equal(run('qiRed.hp'),1);assert.equal(run('charge'),0);assert.equal(run('combo'),0);});

test('Enemy speed switches at 30 seconds remaining without shortening the clock',()=>{run("reset();enemies=[];spawnClock=100;nextDurianAt=200;nextChargerAt=200;nextThrowerAt=200;nextPickupAt=200;elapsed=89.99;keys.add('d');update(.01)");assert.equal(run('gameTempo()'),1.5);assert.equal(run('elapsed'),90);assert.ok(Math.abs(run('player.x')-2.05)<1e-8);assert.equal(element('tempoLabel').textContent,'蕉皮末日');assert.ok(run('spawnClock')>99);run('reset()');assert.equal(run('gameTempo()'),1);assert.equal(element('tempoLabel').textContent,'蕉皮末日');});
test('Enemy locomotion and flight accelerate at 30 seconds remaining while windup stays unchanged',()=>{run("reset();enemies=[];spawnClock=100;nextDurianAt=200;nextChargerAt=200;nextThrowerAt=200;nextPickupAt=200;elapsed=90;var tempoWalker=spawn(0,'normal',{x:500,y:0});tempoWalker.speed=100;var tempoCharger=spawn(0,'charger',{x:-300,y:0});tempoCharger.phase='aim';tempoCharger.phaseTime=.5;var tempoShot=spawn(0,'durian',{x:0,y:300});tempoShot.projectile={t:0,duration:1,startZ:50,fromX:0,fromY:300,toX:500,toY:300};update(.1)");assert.ok(Math.abs(run('tempoWalker.x')-485)<1e-8);assert.ok(Math.abs(run('tempoCharger.phaseTime')-.4)<1e-8);assert.ok(Math.abs(run('tempoShot.projectile.t')-.15)<1e-8);assert.ok(Math.abs(run('elapsed')-90.1)<1e-8);});
test('Special spawn frequency stays unchanged during the final speed boost',()=>{run('reset();enemies=[];elapsed=100;nextChargerAt=100;nextThrowerAt=100;nextDurianAt=100;updateChargerSchedule();updateThrowerSchedule();updateDurianSchedule()');assert.ok(Math.abs(run('nextChargerAt-100')-(8-100/30)*1.5)<1e-8);assert.ok(Math.abs(run('nextThrowerAt-100')-(14-100/25))<1e-8);assert.ok(Math.abs(run('nextDurianAt-100')-(10-100/22))<1e-8);});

test('Ground peels do not expire before being stepped on',()=>{run('reset();enemies=[];spawnClock=1000;nextDurianAt=500;nextChargerAt=500;nextThrowerAt=500;nextPickupAt=500;peels=[{id:22000,x:400,y:0,age:10.9}];for(let i=0;i<200;i++)update(.1)');assert.equal(run('peels.length'),1);assert.ok(run('peels[0].age')>30);run('player.x=400;player.slipCooldown=0;update(.01)');assert.equal(run('peels.length'),0);assert.ok(run('player.down')>0);});
test('Dashing through a bunch emits all six qi peels exactly once',()=>{run('reset();enemies=[];spawnClock=100;pickups=[{id:22001,x:60,y:0,age:0}];charge=100;activate();update(.2)');assert.ok(run('player.x')>100);assert.equal(run('pickups.length'),0);assert.equal(run('stats.bunches'),1);assert.equal(run('orbitPeels.length'),6);run('update(.01)');assert.equal(run('stats.bunches'),1);assert.equal(run('orbitPeels.length'),6);});
test('A dash can collect a bunch on its last frame and normal airborne passing cannot',()=>{run('reset();enemies=[];spawnClock=100;charge=100;activate();special.t=.99;pickups=[{id:22002,x:5,y:0,age:0}];update(.02)');assert.equal(run('special'),null);assert.equal(run('pickups.length'),0);assert.equal(run('orbitPeels.length'),6);run('reset();enemies=[];spawnClock=100;player.z=80;player.vz=0;keys.add("d");pickups=[{id:22003,x:20,y:0,age:0}];update(.1)');assert.equal(run('pickups.length'),1);assert.equal(run('stats.bunches'),0);assert.equal(run('orbitPeels.length'),0);});
test('Enemy bananas and durians cannot eat a bunch',()=>{for(const type of ['normal','charger','thrower','durian']){context.pickupEnemyType=type;run("reset();enemies=[];spawnClock=100;pickups=[{id:22004,x:300,y:0,age:0}];var notCollector=spawn(0,pickupEnemyType,{x:300,y:0});notCollector.speed=0;update(.01)");assert.equal(run('pickups.length'),1);assert.equal(run('stats.bunches'),0);assert.equal(run('orbitPeels.length'),0);}});

test('Music only speeds up to 1.2 at thirty seconds remaining and keeps the final countdown',()=>{run('reset();enemies=[]');assert.equal(run('musicRate(59.99)'),1);assert.equal(run('musicRate(60)'),1);assert.equal(run('musicRate(89.99)'),1);assert.equal(run('musicRate(90)'),1.2);assert.equal(run('musicRate(110)'),1.2);run('elapsed=60;updateHUD()');assert.equal(element('timer').textContent,'01:00');run('elapsed=90;updateHUD()');assert.equal(element('timer').textContent,'00:30');assert.equal(element('finalCountdown').hidden,true);run('elapsed=110;updateHUD()');assert.equal(element('finalCountdown').textContent,'10');assert.equal(element('finalCountdown').hidden,false);run('elapsed=119.9;updateHUD()');assert.equal(element('finalCountdown').textContent,'1');run('pause()');assert.equal(element('finalCountdown').hidden,true);run('pause()');assert.equal(element('finalCountdown').hidden,false);run('finish(true)');assert.equal(element('finalCountdown').hidden,true);});
test('Faster music uses shorter synthesized loops with unity playback rate and matching musical offset',()=>{run(`
var playbackRates=[],tempoStarts=[];
audioCtx={currentTime:123,state:'running',destination:{},
createBuffer:(_channels,length,rate)=>({duration:length/rate,getChannelData:()=>new Float32Array(length)}),
createBufferSource:()=>({playbackRate:{setValueAtTime:v=>playbackRates.push(v)},connect(){},disconnect(){},start:(...args)=>tempoStarts.push(args),stop(){}}),
createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}})};
state='playing';sound=true;elapsed=60;syncMusic();var firstTempoSource=musicSource,firstTempoBuffer=musicSource.buffer;
`);assert.equal(run('playbackRates[0]'),1);assert.equal(run('musicSource.buffer.duration'),30);run('elapsed=90;updateMusicRate()');assert.equal(run('playbackRates[1]'),1);assert.equal(run('musicSource.buffer.duration'),25);assert.equal(run('tempoStarts[1][1]'),0);assert.equal(run('musicSource===firstTempoSource'),false);run('elapsed=65;updateMusicRate()');assert.equal(run('musicSource.buffer===firstTempoBuffer'),true);assert.equal(run('musicOffset(90)'),0);assert.equal(run('musicOffset(100)'),12);run('sound=false;syncMusic();sound=true;audioCtx=undefined;audioOutput=null;musicBuffer=null');});
test('Typing banana reveals debug start options only on the main menu',()=>{run("debugUnlocked=false;debugCode='';state='intro';$('debugOptions').hidden=true;for(const key of 'banan')handleDebugCode({key,code:'Key'+key.toUpperCase()})");assert.equal(run('debugUnlocked'),false);assert.equal(element('debugOptions').hidden,true);run("handleDebugCode({key:'a',code:'KeyA'})");assert.equal(run('debugUnlocked'),true);assert.equal(element('debugOptions').hidden,false);for(const remaining of [62,32,12]){context.debugRemaining=remaining;run("$('debugStart').value=String(debugRemaining);reset()");assert.equal(run('elapsed'),120-remaining);assert.equal(run('state'),'playing');assert.equal(element('debugOptions').hidden,true);assert.ok(run('nextDurianAt')>run('elapsed'));assert.ok(run('nextChargerAt')>run('elapsed'));assert.equal(run('enemies.length'),7);}run("debugUnlocked=false;debugCode='';for(const key of 'banana')handleDebugCode({key,code:'Key'+key.toUpperCase()})");assert.equal(run('debugUnlocked'),false);run("$('debugStart').value='120';reset()");assert.equal(run('elapsed'),0);});

test('All four tempo versions retain the opening bass pitch instead of resampling it higher',()=>{run(`
var measuredBassPitches=[];
for(const tempo of [1,1.2,1.5,2]){
const buffer=createMusicBuffer({createBuffer(_c,n,r){const data=new Float32Array(n);return {duration:n/r,getChannelData:()=>data};}},tempo),data=buffer.getChannelData(0),n=Math.floor(.06*22050);
let bestHz=0,bestPower=0;
for(let hz=90;hz<=140;hz++){let re=0,im=0;for(let i=0;i<n;i++){const sample=data[i]*(.5-.5*Math.cos(TAU*i/(n-1))),angle=TAU*hz*i/22050;re+=sample*Math.cos(angle);im+=sample*Math.sin(angle);}const power=re*re+im*im;if(power>bestPower){bestHz=hz;bestPower=power;}}
measuredBassPitches.push(bestHz);
}
`);assert.ok(run('measuredBassPitches.every(hz=>Math.abs(hz-110)<=1)'));});

test('Victory fanfare lasts three times longer with varied rhythm, melody, and a closing chord',()=>{run("var originalTone=tone,winNotes=[];tone=(...args)=>winNotes.push(args);audioCtx={currentTime:777};sound=true;lastSfx.clear();sfx('win');tone=originalTone;audioCtx=undefined");assert.ok(run('winNotes.length')>=14);assert.ok(Math.abs(run('Math.max(...winNotes.map(n=>(n[4]||0)+n[1]))')-1.86)<1e-8);assert.ok(run('new Set(winNotes.map(n=>n[0])).size')>=8);assert.ok(run('new Set(winNotes.map(n=>n[1])).size')>=4);assert.ok(run('winNotes.filter(n=>n[4]===1.36&&n[1]===.5).length')>=4);});

test('Victory and defeat display distinct couplets',()=>{run('reset();finish(true)');assert.ok(element('overlayTitle').innerHTML.includes('歷盡千蕉百難'));assert.ok(element('overlayTitle').innerHTML.includes('終成不敗蕉王'));assert.equal(element('overlayTitle').innerHTML.includes('蕉有旦夕禍福'),false);run('reset();finish(false)');assert.ok(element('overlayTitle').innerHTML.includes('天有不測風雲'));assert.ok(element('overlayTitle').innerHTML.includes('蕉有旦夕禍福'));assert.equal(element('overlayTitle').innerHTML.includes('終成不敗蕉王'),false);});

test('Invincible mode is enabled only by the unlocked debug checkbox and prevents all damage',()=>{run("debugUnlocked=false;$('debugInvincible').checked=true;reset();hurt('normal damage')");assert.equal(run('invincibleMode'),false);assert.equal(run('player.hp'),4);run("debugUnlocked=true;$('debugStart').value='120';reset();enemies=[];spawnClock=100;spawn(0,'normal',{x:0,y:0});update(.01);hurt('durian damage')");assert.equal(run('invincibleMode'),true);assert.equal(run('player.hp'),5);assert.equal(run('player.down'),0);run("enemies=[];var safeDurian=spawn(0,'durian',{x:-100,y:0});safeDurian.projectile={t:0,duration:1,startZ:50,fromX:-100,fromY:0,toX:100,toY:0};updateThrownDurian(safeDurian,1)");assert.equal(run('player.hp'),5);assert.equal(run('player.inv'),0);});
test('Invincible players can still slip, stomp and win; unchecking restores normal damage',()=>{run("enemies=[];slip(player,0);hitEnemy({id:24001,x:50,y:0,hp:1,type:'normal',hit:0},true)");assert.equal(run('player.down'),.7);assert.equal(run('player.hp'),5);assert.equal(run('charge'),20);run("elapsed=119.99;update(.02);for(let i=0;i<12;i++){boss.hit=0;boss.phase='rest';player.x=boss.x;player.y=boss.y;tryStompBoss();if(isBossCinematic())updateBossCinematic(10);}");assert.equal(run('state'),'over');assert.ok(element('overlayTitle').innerHTML.includes('終成不敗蕉王'));run("$('debugInvincible').checked=false;reset();hurt('normal damage restored')");assert.equal(run('invincibleMode'),false);assert.equal(run('player.hp'),4);run('debugUnlocked=false');});

test('Mobile character scale is 0.7 and narrow or coarse layouts share the same detection',()=>{assert.equal(run('characterScale()'),1);run("window.matchMedia=query=>({matches:query.includes('pointer: coarse')})");assert.equal(run('characterScale()'),.7);run('window.matchMedia=()=>({matches:false})');assert.equal(run('characterScale()'),1);run('delete window.matchMedia');});
test('Mobile enemy collision footprints shrink with sprites',()=>{run("window.matchMedia=()=>({matches:true});reset();enemies=[];spawnClock=100;var smallMobileEnemy=spawn(0,'normal',{x:24,y:0});smallMobileEnemy.speed=0;update(.001)");assert.equal(run('player.hp'),5);run('smallMobileEnemy.x=10;update(.001)');assert.equal(run('player.hp'),4);run('delete window.matchMedia');});


test('Sprite caches include all frames and large variants at DPR-2 resolution',()=>{
  assert.equal(run('renderSprites.size'),15);assert.equal(run('renderSprites.get(enemySprite).size'),8);
  assert.equal(run('renderSprite(enemySprite,0,1).height'),192);assert.equal(run('renderSprite(enemySprite,0,2).height'),384);
  assert.equal(run('renderSprite(groundSprite,2).height'),256);assert.equal(run('renderSprite(bossSprite).height'),410);
  assert.equal(run('renderSprite(heroSprite)===renderSprite(heroSprite)'),true);assert.equal(run('renderSprite(heroSlipSprite)===renderSprite(heroHurtSprite)'),false);
});
test('Viewport culling keeps edge margins and accounts for airborne effects',()=>{
  run('reset();W=1000;H=650');assert.equal(run('isInView({x:0,y:0})'),true);assert.equal(run('isInView({x:570,y:0},100)'),true);
  assert.equal(run('isInView({x:700,y:0},100)'),false);assert.equal(run('isInView({x:0,y:600},40)'),false);assert.equal(run('isInView({x:0,y:600},40,300)'),true);
});
test('An offscreen enemy and unstepped peel remain active instead of being deleted',()=>{
  run("reset();enemies=[];spawnClock=999;var hiddenActor=spawn(0,'normal',{x:1200,y:0});hiddenActor.speed=100;peels=[{id:37000,x:-1200,y:0,age:99}];update(.1)");
  assert.equal(run('enemies.length'),1);assert.ok(run('hiddenActor.x')<1200);assert.equal(run('isInView(hiddenActor,260)'),false);assert.equal(run('peels.length'),1);assert.ok(run('peels[0].age')>99);
});
test('All survival tempos and boss arrangements are ready before play and switch without synthesizing',()=>{
  assert.equal(run('preparedMusic.size'),6);
  run(`var savedMusicGenerator=createMusicBuffer,savedBossMusicGenerator=createBossMusicBuffer;
    createMusicBuffer=()=>{throw Error('unexpected live synthesis')};createBossMusicBuffer=()=>{throw Error('unexpected live boss synthesis')};
    audioCtx={createBuffer(_c,n,r){const data=new Float32Array(n);return {duration:n/r,getChannelData:()=>data};}};musicBuffer=null;musicTempoBuffers.clear();boss=null;
    var cachedTracks=[1,1.2,1.5,2].map(rate=>{elapsed=rate===1?0:rate===1.2?60:rate===1.5?90:110;return currentMusicBuffer();});
    boss={hp:10};var cachedBossTrack=currentBossMusicBuffer();boss.hp=1;var cachedBossFinal=currentBossMusicBuffer();
    var repeatedFinal=currentBossMusicBuffer();
    createMusicBuffer=savedMusicGenerator;createBossMusicBuffer=savedBossMusicGenerator;boss=null;audioCtx=undefined;musicBuffer=null;
  `);
  assert.deepEqual(Array.from(run('cachedTracks.map(track=>track.duration)')),[30,30,25,25]);assert.equal(run('cachedBossTrack.duration'),30);assert.equal(run('cachedBossFinal===repeatedFinal'),true);
});
test('Grid indices update by flooring each axis, including negative cell boundaries',()=>{
  run('var cellActor={x:-.1,y:96};locateCollisionCell(cellActor)');assert.equal(run('cellActor.gridX'),-1);assert.equal(run('cellActor.gridY'),1);
  run('cellActor.x=96;cellActor.y=-96.1;locateCollisionCell(cellActor)');assert.equal(run('cellActor.gridX'),1);assert.equal(run('cellActor.gridY'),-2);
});
test('Peel grids preserve original hit order across neighboring cells and consumed peels',()=>{
  run("reset();peels=[{id:1,x:110,y:0,age:1},{id:2,x:90,y:0,age:1}];var localPeelGrid=buildPeelGrid(),localPeelActor={x:95,y:0,type:'normal'}");assert.equal(run('touchingPeel(localPeelActor,localPeelGrid).id'),1);
  run('localPeelGrid.consumed.add(peels[0])');assert.equal(run('touchingPeel(localPeelActor,localPeelGrid).id'),2);
});
test('A swept peel crossing many cells is found once in the actor neighborhood',()=>{
  run("peels=[{id:3,x:450,y:450,prevX:-450,prevY:-450,age:1,red:true}];var sweepGrid=buildPeelGrid();var sweptGridHit=touchingPeel({x:0,y:0,type:'normal'},sweepGrid)");assert.equal(run('sweptGridHit.id'),3);assert.equal(run('sweepGrid.checks'),1);
});
test('Queries remain correct when another peel index is built between searches',()=>{
  run("peels=[{x:0,y:0,age:1}];var firstIndex=buildPeelGrid();touchingPeel({x:0,y:0},firstIndex);var secondIndex=buildPeelGrid();touchingPeel({x:0,y:0},secondIndex)");assert.ok(run('touchingPeel({x:0,y:0},firstIndex)'));
});
test('Peel grid hits match linear swept collision over randomized desktop and mobile layouts',()=>{
  run(`var linearPeelHit=actor=>peels.find(p=>{
    if(p.ritual||p.summonWave||p.age<=.5)return false;
    const ax=p.prevX??p.x,ay=p.prevY??p.y,dx=p.x-ax,dy=p.y-ay,l=dx*dx+dy*dy,t=l?clamp(((actor.x-ax)*dx+(actor.y-ay)*dy)/l,0,1):0;
    return Math.hypot(actor.x-ax-t*dx,actor.y-ay-t*dy)<16+10*characterScale()+(p.red||p.large?16:0)+(isLargeBanana(actor)?16*characterScale():0);
  });`);
  for(const mobile of [false,true]){context.peelMobile=mobile;run(`window.matchMedia=()=>({matches:peelMobile});var peelSeed=8431;function peelRandom(){peelSeed=(peelSeed*1664525+1013904223)>>>0;return peelSeed/4294967296;}
    for(let layout=0;layout<20;layout++){
      peels=Array.from({length:300},(_,i)=>{const x=(peelRandom()-.5)*2500,y=(peelRandom()-.5)*2500;return {id:i,x,y,prevX:x+(peelRandom()-.5)*700,prevY:y+(peelRandom()-.5)*700,age:i%13===0?.1:1,ritual:i%17===0,summonWave:i%19===0,red:i%5===0,large:i%7===0};});
      const index=buildPeelGrid();for(let i=0;i<80;i++){const actor={x:(peelRandom()-.5)*2500,y:(peelRandom()-.5)*2500,type:i%3===0?'charger':'normal'};if(touchingPeel(actor,index)!==linearPeelHit(actor))throw Error('Peel grid mismatch');}
    }
  `);}
  run('delete window.matchMedia');
});
test('Distributed peel queries avoid scanning the whole field for every enemy',()=>{
  run("peels=Array.from({length:500},(_,i)=>({x:(i%25-12)*100,y:(Math.floor(i/25)-10)*100,age:1}));var distributedIndex=buildPeelGrid();for(let i=0;i<100;i++)touchingPeel({x:(i%10-5)*180,y:(Math.floor(i/10)-5)*180,type:'normal'},distributedIndex)");assert.ok(run('distributedIndex.checks')<2000);
});
test('Ghost fire reuses a DPR-2 glow sprite without creating gradients during drawing',()=>{
  assert.equal(run('bossFireSprite.width'),100);assert.equal(run('bossFireSprite.height'),100);
  run("reset();bossShots=[{x:0,y:0},{x:10,y:10},{x:2000,y:2000}];var cachedFireSprite=bossFireSprite,fireDraws=0,savedFireDraw=ctx.drawImage;ctx.drawImage=()=>fireDraws++;drawBossShots();ctx.drawImage=savedFireDraw");assert.equal(run('fireDraws'),2);assert.equal(run('bossFireSprite===cachedFireSprite'),true);
});
test('Spatial separation matches the previous all-pairs response for dense, sparse and boundary layouts',()=>{
  run("var referenceSeparation=function(){for(let i=0;i<enemies.length;i++)for(let j=i+1;j<enemies.length;j++){const a=enemies[i],b=enemies[j];if(a.hp<=0||b.hp<=0||a.carriedBy!==undefined||b.carriedBy!==undefined||a.projectile||b.projectile)continue;const dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);const separation=(32+(isLargeBanana(a)?16:0)+(isLargeBanana(b)?16:0))*characterScale();if(d>0&&d<separation){const aRam=a.type==='charger'&&a.phase==='dash'&&b.type!=='durian',bRam=b.type==='charger'&&b.phase==='dash'&&a.type!=='durian';const push=separation-d;if(aRam&&!bRam){b.x-=dx/d*push;b.y-=dy/d*push;}else if(bRam&&!aRam){a.x+=dx/d*push;a.y+=dy/d*push;}else{a.x+=dx/d*push*.5;a.y+=dy/d*push*.5;b.x-=dx/d*push*.5;b.y-=dy/d*push*.5;}}}};");
  for(const mobile of [false,true]){
    context.mobileCase=mobile;
    run('window.matchMedia=()=>({matches:mobileCase})');
    for(let sample=0;sample<30;sample++){
      context.layoutSample=sample;
      run(`reset();var sampleSeed=layoutSample+831;function seededLayout(){sampleSeed=(sampleSeed*1664525+1013904223)>>>0;return sampleSeed/4294967296;}
        enemies=Array.from({length:110},(_,i)=>({id:38000+i,hp:i%17===0?0:1,type:i%7===0?'charger':i%11===0?'durian':'normal',phase:i%3===0?'dash':'aim',carriedBy:i%19===0?123:undefined,projectile:i%23===0?{}:undefined,x:(seededLayout()-.5)*(layoutSample%2?200:2400),y:(seededLayout()-.5)*(layoutSample%2?200:2400)}));
        var layout=JSON.stringify(enemies);referenceSeparation();var referencePositions=enemies.map(e=>[e.x,e.y]);enemies=JSON.parse(layout);var gridChecks=separateEnemies();var maxGridError=Math.max(...enemies.map((e,i)=>Math.hypot(e.x-referencePositions[i][0],e.y-referencePositions[i][1])));
      `);
      assert.ok(run('maxGridError')<1e-7,`layout ${sample}, mobile ${mobile}: ${run('maxGridError')}`);
      if(sample%2===0)assert.ok(run('gridChecks')<600);
    }
  }
  run('delete window.matchMedia');
});
test('Boss entrance freezes all world objects and blocks jump, dash and damage',()=>{
  run("reset();player.z=50;player.vz=-30;charge=100;peels=[{x:100,y:80,age:2,red:true,vx:200,vy:0,slideTime:1}];collectBunch();pickups=[{id:36001,x:200,y:200}];elapsed=120;startBossBattle();var frozenEntrance=JSON.stringify({player,enemies,peels,particles,pickups,orbitPeels,elapsed,spawnClock,nextPickupAt,charge,stats});keys.add('d');jump();activate();hurt('blocked during entrance');update(1.5)");
  assert.equal(run('JSON.stringify({player,enemies,peels,particles,pickups,orbitPeels,elapsed,spawnClock,nextPickupAt,charge,stats})'),run('frozenEntrance'));
  assert.equal(run('boss.phase'),'entrance');assert.equal(run('boss.time'),1.5);assert.equal(run('boss.hp'),10);assert.equal(run('tryStompBoss()'),false);
});
test('Boss rises for three seconds, converts every living minion once, poses one second and announces combat',()=>{
  run("reset();enemies=[];spawn(0,'normal',{x:100,y:30});spawn(0,'charger',{x:-100,y:30});spawn(0,'thrower',{x:80,y:30});spawn(0,'durian',{x:-80,y:30});enemies[3].carriedBy=enemies[2].id;peels=[{id:36002,x:400,y:200,age:5}];elapsed=120;startBossBattle();update(2.99)");
  assert.equal(run('enemies.length'),4);assert.equal(run('peels.length'),1);assert.equal(run('boss.phase'),'entrance');assert.equal(element('bossBanner').hidden,true);
  run('update(.02)');assert.equal(run('boss.phase'),'entrance-pose');assert.equal(run('enemies.length'),0);assert.equal(run('peels.length'),5);assert.equal(run('durianWarnings.length'),0);
  assert.equal(run('new Set(peels.map(p=>p.id)).size'),5);assert.equal(run('bossShots.length'),0);
  run('update(.98)');assert.equal(run('boss.phase'),'entrance-pose');assert.equal(element('bossBanner').hidden,true);
  run('update(.02)');assert.equal(run('boss.phase'),'entrance-banner');assert.equal(element('bossBanner').hidden,false);assert.equal(run('peels.length'),5);
  run("keys.add('d');charge=100;activate();jump();update(1)");assert.equal(run('isBossEntrance()'),false);assert.equal(run('boss.phase'),'sea-aim');assert.equal(element('bossBanner').hidden,true);
  assert.equal(run('player.z'),0);assert.equal(run('keys.size'),0);assert.equal(run('charge'),100);assert.equal(run('boss.hp'),10);assert.equal(run('elapsed'),120);assert.ok(run('player.inv')>=2.5);
});
test('Pause freezes the entrance timer and resumes the same stage',()=>{
  run('reset();startBossBattle();update(1);pause();var pausedBossTime=boss.time;update(5)');assert.equal(run('state'),'paused');assert.equal(run('boss.time'),run('pausedBossTime'));
  run('pause();update(.5)');assert.equal(run('boss.phase'),'entrance');assert.equal(run('boss.time'),1.5);
});
test('A large entrance step advances stages exactly once without simulating the frozen world',()=>{
  run('reset();elapsed=120;startBossBattle();var entryEnemyCount=enemies.length;update(5)');assert.equal(run('isBossEntrance()'),false);assert.equal(run('peels.length'),run('entryEnemyCount'));assert.equal(run('enemies.length'),0);assert.equal(run('boss.phase'),'sea-aim');assert.equal(run('boss.time'),1);assert.equal(run('elapsed'),120);
  run('update(.1)');assert.ok(run('elapsed')>120);assert.ok(run('player.inv')<2.5);
});
test('Restart during an entrance removes the banner and all transition state',()=>{
  run('reset();startBossBattle();update(4.1)');assert.equal(element('bossBanner').hidden,false);
  run('reset()');assert.equal(run('boss'),null);assert.equal(element('bossBanner').hidden,true);assert.equal(run('state'),'playing');
});
test('Boss has ten HP, requires clearing final clones, and recoils opposite the player',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='revive';boss.hit=0;player.x=boss.x+10;player.y=boss.y;var bossBeforeX=boss.x,heroBeforeX=player.x;tryStompBoss()");
  assert.equal(run('boss.hp'),9);assert.equal(run('boss.phase'),'stunned');assert.equal(run('boss.hit'),4);
  assert.equal(run('player.down'),0);assert.equal(run('player.z'),43);assert.equal(run('player.vz'),200);assert.equal(run('player.recoil'),.7);assert.ok(run('player.inv')>=1);
  assert.ok(run('boss.kx')<0);assert.ok(run('player.recoilX')>0);assert.equal(run('combo'),0);assert.equal(run('tryStompBoss()'),false);
  run('update(.2)');assert.ok(run('boss.x')<run('bossBeforeX'));assert.ok(run('player.x')>run('heroBeforeX'));assert.equal(run('player.down'),0);
  run("for(let i=0;i<11;i++){boss.hit=0;boss.phase='rest';player.x=boss.x;player.y=boss.y;tryStompBoss();if(isBossCinematic())updateBossCinematic(10);}");
  assert.equal(run('state'),'over');assert.equal(run('boss.hp'),0);assert.ok(element('overlayTitle').innerHTML.includes('終成不敗蕉王'));
});
test('Dash damages the boss once without bouncing or awarding stomp energy',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=99;boss.x=80;boss.y=0;player.x=0;player.y=0;player.face=0;charge=100;activate();update(.05)");
  assert.equal(run('boss.hp'),9);assert.ok(run('boss.hit')>3.9);assert.equal(run('player.recoil'),0);assert.ok(run('special'));assert.equal(run('charge'),0);assert.equal(run('stats.stompHits'),0);
  run('boss.hit=0;boss.knock=0;boss.x=player.x;boss.y=player.y;update(.01)');assert.equal(run('boss.hp'),9);
});
test('Dash swept collision hits the boss between frames and respects immunity and shields',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=99;boss.x=100;boss.y=0;player.x=0;player.y=0;player.face=0;charge=100;activate();update(.4)");assert.equal(run('boss.hp'),9);
  for(const phase of ['shield','rest']){context.blockingBossPhase=phase;run("reset();enemies=[];startBossBattle();boss.phase=blockingBossPhase;boss.time=99;boss.hit=blockingBossPhase==='rest'?4:0;boss.x=80;boss.y=0;player.x=0;player.y=0;player.face=0;charge=100;activate();update(.05)");assert.equal(run('boss.hp'),10);}
});
test('Dash kills clones and can win the final boss phase through original inheritance',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=99;boss.hp=1;boss.x=80;boss.y=0;player.x=0;player.y=0;player.face=0;var dashClone=spawnBossClone({x:400,y:0});dashClone.hit=0;charge=100;activate();update(.05)");assert.equal(run('boss.hp'),1);assert.equal(run('bossClones.length'),0);assert.equal(run('boss.x'),400);assert.equal(run('stats.stompKills'),0);
  run("special=null;boss.hit=0;boss.phase='rest';player.x=320;player.y=0;charge=100;activate();update(.05)");assert.equal(run('boss.hp'),0);assert.equal(run('state'),'over');assert.equal(run('stats.stompHits'),0);
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=99;boss.x=-500;boss.hp=2;player.x=0;player.y=0;player.face=0;spawnBossClone({x:80,y:0}).hit=0;charge=100;activate();update(.05)");assert.equal(run('bossClones.length'),0);assert.equal(run('boss.hp'),2);
});
test('A promoted nearby clone is not damaged again by the same dash snapshot',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=99;boss.hp=1;boss.x=80;boss.y=0;player.x=0;player.y=0;player.face=0;spawnBossClone({x:90,y:0}).hit=0;charge=100;activate();update(.05)");assert.equal(run('boss.hp'),1);assert.equal(run('bossClones.length'),0);assert.equal(run('kills'),1);assert.equal(run('state'),'playing');
});
test('Dash boss hits safely enter health-stage cinematics without spending them moving',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=6;boss.x=80;boss.y=0;player.x=0;player.y=0;player.face=0;charge=100;activate();update(.05)");assert.equal(run('boss.hp'),5);assert.equal(run('isBossCinematic()'),true);assert.ok(run('boss.time')<=6&&run('boss.time')>=5.9);
});
test('Boss cannot be damaged again for four seconds but resumes attacking before immunity ends',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';player.x=boss.x;player.y=boss.y;tryStompBoss();player.inv=99;updateBoss(.7)");
  assert.notEqual(run('boss.phase'),'stunned');assert.ok(run('boss.hit')>3);
  run('updateBoss(3.2);player.x=boss.x;player.y=boss.y');assert.equal(run('tryStompBoss()'),false);assert.equal(run('boss.hp'),9);
  run('updateBoss(.11);player.x=boss.x;player.y=boss.y');assert.equal(run('tryStompBoss()'),true);assert.equal(run('boss.hp'),8);
});
test('Landing on boss launches a standing airborne recoil then restores movement on landing',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='revive';boss.time=3;player.x=boss.x;player.y=boss.y;player.z=48;player.vz=-100;update(.05)");
  assert.equal(run('boss.hp'),9);assert.equal(run('player.z'),43);assert.equal(run('player.vz'),200);assert.equal(run('player.down'),0);assert.ok(run('player.recoil')>0);
  run('update(.1)');assert.equal(run('boss.hp'),9);assert.ok(run('player.z')>43);
  run('for(let i=0;i<40;i++)update(.02)');assert.equal(run('player.recoil'),0);assert.equal(run('player.z'),0);assert.equal(run('player.down'),0);
  run('var afterRecoilX=player.x;keys.add("d");update(.05);keys.clear()');assert.ok(run('player.x')>run('afterRecoilX'));
});
test('Ultimate can interrupt airborne recoil without leaving residual knockback',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';player.x=boss.x;player.y=boss.y;tryStompBoss();charge=100;activate()");assert.equal(run('player.recoil'),0);assert.ok(run('special'));assert.equal(run('player.down'),0);
});
test('Boss knockback stays within arena bounds',()=>{
  run("reset();enemies=[];startBossBattle();boss.x=-arenaSize+132;boss.y=0;boss.phase='rest';player.x=boss.x+10;player.y=0;tryStompBoss();updateBoss(.5)");assert.ok(run('boss.x')>=run('-arenaSize+130'));
});
test('Boss resurrection consumes at most twelve actual peels and creates nothing without them',()=>{
  run("reset();enemies=[];startBossBattle();peels=[];boss.move=1;beginBossMove();updateBoss(3.01)");assert.equal(run('enemies.length'),0);
  run("for(let i=0;i<15;i++)peels.push({id:31000+i,x:boss.x+i,y:boss.y,age:1});boss.move=1;beginBossMove()");assert.equal(run('boss.revivePeels.length'),12);
  run('updateBoss(2.9)');assert.equal(run('enemies.length'),0);run('updateBoss(.11)');assert.equal(run('enemies.length'),12);assert.equal(run('peels.length'),3);assert.ok(run("enemies.every(e=>e.type==='normal'&&e.hp===1)"));
});
test('Boss sea launches three outward peel rings which remain when stopped',()=>{run("reset();enemies=[];startBossBattle();peels=[];boss.move=0;beginBossMove();updateBoss(1.01)");assert.equal(run('boss.phase'),'sea');run('updateBoss(.01);updateBoss(.3);updateBoss(.3)');assert.equal(run('peels.length'),36);const initial=run('dist(peels[0],boss)');run('updatePeels(.2)');assert.ok(run('dist(peels[0],boss)')>initial);run('updatePeels(5)');assert.ok(run('peels.every(p=>!p.bossWave)'));assert.equal(run('peels.length'),36);});
test('Boss and clone ghost fire starts exactly at the staff charge orb on desktop and mobile',()=>{
  for(const mobile of [false,true]){
    context.staffMobile=mobile;
    run("window.matchMedia=()=>({matches:staffMobile});reset();enemies=[];startBossBattle();boss.x=100;boss.y=50;var staffClone=spawnBossClone({x:-200,y:180});bossShots=[]");
    for(const actor of ['boss','staffClone']){
      context.staffActorName=actor;
      run("var staffActor=staffActorName==='boss'?boss:staffClone;staffActor.move=2;staffActor.nextShield=Infinity;beginBossMove(staffActor);var staffPoint=bossFireOrigin(staffActor);var staffScreen=screen(staffPoint.x,staffPoint.y,bossFireZ);var staffFoot=screen(staffActor.x,staffActor.y);bossShots=[];emitBossFire(staffActor,3)");
      assert.ok(run('Math.abs(staffScreen.x-staffFoot.x-46*characterScale())<1e-8'));
      assert.ok(run('Math.abs(staffScreen.y-staffFoot.y+120*characterScale())<1e-8'));
      assert.ok(run('bossShots.every(shot=>shot.x===staffPoint.x&&shot.y===staffPoint.y)'));
      assert.ok(run('Math.abs(Math.atan2(bossShots[1].vy,bossShots[1].vx)-Math.atan2(player.y-staffPoint.y,player.x-staffPoint.x))<1e-8'));
    }
  }
  run('delete window.matchMedia');
});
test('Boss fan fire uses a locked direction and hurts players below the jump apex',()=>{run("reset();enemies=[];startBossBattle();boss.move=2;var savedMoveRandom=Math.random;Math.random=()=>.99;beginBossMove();Math.random=savedMoveRandom;var lockedBossAim=boss.aim;player.inv=99;updateBoss(1.01)");assert.equal(run('bossShots.length'),3);assert.ok(Math.abs(run('Math.atan2(bossShots[1].vy,bossShots[1].vx)')-run('lockedBossAim'))<1e-8);run('player.inv=0;player.z=40;bossShots=[{x:player.x-40,y:player.y,vx:200,vy:0,life:2}];updateBoss(.2)');assert.equal(run('player.hp'),4);assert.equal(run('bossShots.length'),0);});
test('Ghost fire passes under the jump apex but still hits early and late jump heights',()=>{
  for(const height of [0,20,40,57,58,65,80]){
    run(`reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=99;player.inv=0;player.z=${height};bossShots=[{x:player.x-40,y:player.y,vx:200,vy:0,life:2}];updateBoss(.2)`);
    assert.equal(run('player.hp'),height>=58?5:4);assert.equal(run('bossShots.length'),height>=58?1:0);
  }
});
test('Normal jumping has a brief ghost-fire dodge window and returns to vulnerability on descent',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=99;boss.x=600;player.inv=99;jump();var apexFrames=0,jumpFrames=0;for(let i=0;i<60;i++){update(1/60);if(player.z>=bossFireDodgeHeight)apexFrames++;if(player.z>0)jumpFrames++;}player.inv=0;bossShots=[{x:player.x-20,y:player.y,vx:200,vy:0,life:2}];updateBoss(.1)");
  assert.ok(run('apexFrames')>=10);assert.ok(run('apexFrames')<run('jumpFrames'));assert.equal(run('player.z'),0);assert.equal(run('player.hp'),4);
});
test('Low-health boss always charges for a full second before releasing its first row',()=>{
  run("reset();enemies=[];startBossBattle();boss.hp=1;boss.move=2;var savedMoveRandom=Math.random;Math.random=()=>.99;beginBossMove();Math.random=savedMoveRandom;player.inv=99;updateBoss(.99)");
  assert.equal(run('boss.phase'),'fire-aim');assert.equal(run('bossShots.length'),0);run('updateBoss(.02)');assert.equal(run('boss.phase'),'fire');assert.equal(run('bossShots.length'),7);
});
test('Boss battle disables natural enemy spawns and has no countdown limit',()=>{run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=999;boss.x=800;boss.y=800;player.inv=999;nextPickupAt=999;elapsed=200;spawnClock=0;nextDurianAt=0;nextChargerAt=0;nextThrowerAt=0;update(.1)");assert.equal(run('state'),'playing');assert.equal(run('enemies.length'),0);assert.equal(element('finalCountdown').hidden,true);assert.equal(element('gameClock').hidden,true);assert.equal(run('boss.hp'),10);});
test('Debug five-HP entry skips the entrance and immediately plays the half-health ritual',()=>{
  run("debugUnlocked=true;$('gameMode').value='survival';$('debugStart').value='boss-5';reset()");assert.equal(run('boss.hp'),5);assert.equal(run('boss.phase'),'quadrants-cinematic');assert.equal(run('boss.time'),6);assert.equal(run('elapsed'),120);assert.equal(run('enemies.length'),0);assert.ok(run('peels.length')>=12);assert.ok(Number.isFinite(run('boss.nextShield')));assert.ok(Number.isFinite(run('boss.nextTeleport')));assert.equal(run('isBossWorldFrozen()'),false);
  run('updateBossCinematic(6)');assert.equal(run("enemies.filter(e=>e.type==='charger').length"),4);
});
test('Debug two-HP entry starts single-clone summoning and supports original inheritance',()=>{
  run("debugUnlocked=true;$('debugStart').value='boss-2';reset()");assert.equal(run('boss.hp'),2);assert.equal(run('boss.phase'),'clone-aim');assert.equal(run('isBossEntrance()'),false);assert.equal(run("enemies.filter(e=>e.type==='thrower').length"),2);assert.ok(run('boss.stageSeen.has(5)'));
  run('updateBoss(1.01)');assert.equal(run('bossClones.length'),1);run('boss.hit=0;player.x=boss.x;player.y=boss.y;tryStompBoss()');assert.equal(run('boss.hp'),2);assert.equal(run('bossClones.length'),0);
});
test('Boss health shortcuts require the unlocked debug menu',()=>{
  for(const shortcut of ['boss-5','boss-2']){context.bossShortcut=shortcut;run("debugUnlocked=false;$('gameMode').value='survival';$('debugStart').value=bossShortcut;reset()");assert.equal(run('boss'),null);assert.equal(run('elapsed'),0);}
  run("$('debugStart').value='120'");
});
test('Listed debug shortcuts select 蕉皮末日 even when the main menu was on 蕉片崛起',()=>{
  for(const value of ['62','32','12','boss-5','boss-2']){context.debugChoice=value;run("debugUnlocked=true;$('gameMode').value='milk';$('debugStart').value=debugChoice;selectDebugStage();reset()");assert.equal(run('milkStage'),false);assert.equal(run('giantBattle'),null);if(value.startsWith('boss-'))assert.equal(run('boss.hp'),Number(value.slice(5)));else {assert.equal(run('elapsed'),120-Number(value));assert.equal(run('boss'),null);}}
  run("debugUnlocked=false;$('gameMode').value='survival';$('debugStart').value='120';reset()");
});
test('Debug menu can enter the boss battle with peels and a fresh ten-banana health bar',()=>{run("debugUnlocked=true;$('debugStart').value='boss';reset()");assert.equal(run('elapsed'),120);assert.equal(run('boss.hp'),10);assert.equal(run('enemies.length'),7);assert.equal(run('boss.phase'),'entrance');assert.ok(run('peels.length')>=8);assert.equal(element('bossHud').hidden,false);assert.equal((element('bossBananas').innerHTML.match(/class="health-banana/g)||[]).length,10);run("debugUnlocked=false;$('debugStart').value='120';reset()");assert.equal(run('boss'),null);assert.equal(element('bossHud').hidden,true);assert.equal(element('gameClock').hidden,false);});
test('Ghost fire strengthens at every early HP threshold and caps at three rows in two rounds',()=>{
  for(const [hp,count,rows,rounds] of [[10,3,1,1],[9,4,1,1],[8,5,2,1],[7,6,3,1],[6,7,3,2],[1,7,3,2]]){
    run(`reset();enemies=[];startBossBattle();boss.hp=${hp};boss.move=2;var savedMoveRandom=Math.random;Math.random=()=>.99;beginBossMove();Math.random=savedMoveRandom;player.inv=99;var firePlan=bossFirePattern(),warning=boss.time;updateBoss(warning+.001)`);
    assert.equal(run('warning'),1);assert.equal(run('bossShots.length'),count);assert.equal(run('boss.fireRows'),rows*rounds-1);
    run('while(boss.fireRows>0)updateBoss(.02)');assert.equal(run('bossShots.length'),count*rows*rounds);assert.ok(run('boss.firePattern.rows')<=3);assert.ok(run('boss.firePattern.rounds')<=2);
    run('updateBoss(2.7)');assert.equal(run('bossShots.length'),0);
  }
});
test('Stomping cancels pending fire rows without clearing already flying projectiles',()=>{
  run("reset();enemies=[];startBossBattle();boss.hp=4;boss.move=2;var savedMoveRandom=Math.random;Math.random=()=>.99;beginBossMove();Math.random=savedMoveRandom;releaseBossFire();player.x=boss.x;player.y=boss.y;player.inv=99;tryStompBoss();updateBoss(.3)");assert.equal(run('boss.fireRows'),0);assert.equal(run('bossShots.length'),7);assert.equal(run('boss.hp'),3);
});
test('Boss entry replaces the accelerated survival song and stays at unity rate through pause and final HP',()=>{
  run(`var bossSongStarts=[],bossSongStops=[],bossSongRates=[];
    audioCtx={currentTime:10,state:'running',destination:{},createBuffer(_c,n,r){const data=new Float32Array(n);return {duration:n/r,getChannelData:()=>data};},
      createBufferSource:()=>({playbackRate:{setValueAtTime:v=>bossSongRates.push(v)},connect(){},disconnect(){},start:(...args)=>bossSongStarts.push(args),stop:()=>bossSongStops.push(true)}),
      createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},setTargetAtTime(){}},connect(){},disconnect(){}})};
    audioOutput=null;musicBuffer=null;debugUnlocked=false;sound=true;reset();elapsed=119.99;syncMusic();var survivalEndSource=musicSource;
  `);
  assert.equal(run('survivalEndSource.buffer.duration'),25);
  run('update(.02);var dedicatedBossSource=musicSource');
  assert.equal(run('boss.phase'),'entrance');assert.notEqual(run('dedicatedBossSource===survivalEndSource'),true);assert.equal(run('dedicatedBossSource.buffer.duration'),30);
  assert.equal(run('dedicatedBossSource.buffer===currentBossMusicBuffer()'),true);assert.equal(run('musicRate()'),1);assert.ok(run('bossSongStops.length')>=2);
  run('bossElapsed=8;pause();pause()');assert.equal(run('musicSource.buffer===dedicatedBossSource.buffer'),true);assert.equal(run('bossSongStarts.at(-1)[1]'),8);
  run('boss.hp=1;syncMusic()');assert.equal(run('musicSource.buffer.duration'),30);assert.notEqual(run('musicSource.buffer===dedicatedBossSource.buffer'),true);assert.equal(run('musicRate(999)'),1);assert.equal(run('bossSongRates.every(rate=>rate===1)'),true);
  run('sound=false;syncMusic();audioCtx=undefined;audioOutput=null;musicBuffer=null;boss=null;reset()');
});
test('Main menu starts a boss battle without unlocking debug and can return to normal mode',()=>{
  run("debugUnlocked=false;$('gameMode').value='boss';reset()");assert.equal(run('boss.hp'),10);assert.equal(run('elapsed'),120);assert.equal(run('isBossEntrance()'),true);assert.equal(element('modeOptions').hidden,true);
  run("$('gameMode').value='survival';reset()");assert.equal(run('boss'),null);assert.equal(run('elapsed'),0);assert.equal(run('bossClones.length'),0);
});
run(`function seedQuadrantPeels(){peels=[];for(const x of [.25,.75])for(const y of [.25,.75])for(const [dx,dy] of [[-32,20],[32,20],[0,-30]])peels.push({id:serial++,...bossViewportPoint(W*x+dx,H*y+dy),age:1});}`);
test('Seven HP enables a telegraphed teleport to the visible opposite side without moving the player',()=>{
  run("reset();enemies=[];startBossBattle();boss.hp=7;onBossHealthChanged();boss.x=player.x+200;boss.nextTeleport=0;var teleportPlayer=JSON.stringify(player);beginBossMove()");assert.equal(run('boss.phase'),'teleport-aim');
  run('updateBoss(.71)');assert.equal(run('boss.phase'),'rest');assert.ok(run('screen(boss.x,boss.y).x')<run('W/2'));assert.ok(run('dist(boss,player)')>115);assert.equal(run('JSON.stringify(player)'),run('teleportPlayer'));
});
test('Six HP shield charges one second, damages even high jumps for three seconds, and blocks stomps',()=>{
  run("reset();enemies=[];startBossBattle();boss.hp=6;onBossHealthChanged();boss.nextShield=0;boss.x=0;boss.y=0;player.x=70;player.y=0;player.z=65;player.inv=0;beginBossMove();updateBoss(.99)");
  assert.equal(run('boss.phase'),'shield-aim');assert.equal(run('player.hp'),5);run('updateBoss(.02)');assert.equal(run('boss.phase'),'shield');assert.equal(run('player.hp'),4);
  run('player.x=0;player.inv=0');assert.equal(run('tryStompBoss()'),false);assert.equal(run('boss.hp'),6);run('updateBoss(2.9)');assert.equal(run('boss.phase'),'shield');run('updateBoss(.11)');assert.equal(run('boss.phase'),'rest');
});
test('Half-health ritual completes four summons in six seconds without freezing control',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=5;peels=[];onBossHealthChanged();updateBossCinematic(1.8)");assert.equal(run('isBossWorldFrozen()'),false);assert.equal(run('peels.length'),24);assert.ok(run('boss.z')>0);
  run('updateBossCinematic(.8);var shortRitualCenters=boss.cinematic.groups.map(group=>({...group.center}))');assert.equal(run('shortRitualCenters.length'),4);
  run('updateBossCinematic(2)');assert.equal(run("enemies.filter(e=>e.type==='charger').length"),4);assert.equal(run('peels.length'),12);
  run('updateBossCinematic(1.4)');assert.equal(run('isBossCinematic()'),false);assert.equal(run('boss.z'),0);
});
test('Moving during the ritual does not drag summon positions with the camera',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=5;peels=[];onBossHealthChanged();keys.add('d');for(let i=0;i<47;i++)update(.1)");assert.equal(run('boss.cinematic.groups.length'),4);assert.equal(run("enemies.filter(e=>e.type==='charger').length"),4);assert.ok(run('player.x-boss.cinematic.view.x')>400);
});
test('Ritual holds its airborne pose then releases with dimming and synchronized summons',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=5;onBossHealthChanged();updateBossCinematic(1.3);var heldHeight=boss.z,heldLean=bossRitualLean(boss.cinematic.t)");assert.ok(run('bossRitualDim()')>0);assert.equal(run('boss.cinematic.wave'),undefined);
  run('updateBossCinematic(.15)');assert.equal(run('boss.z'),run('heldHeight'));assert.equal(run('bossRitualLean(boss.cinematic.t)'),run('heldLean'));
  run('updateBossCinematic(.16)');assert.equal(run('boss.cinematic.wave.length'),24);assert.ok(run('bossRitualLean(boss.cinematic.t)')>0);
  run('updateBossCinematic(3)');assert.equal(run('boss.cinematic.summoned'),true);assert.equal(run("enemies.filter(e=>e.type==='charger').length"),4);
  run('updateBossCinematic(1.39)');assert.equal(run('bossRitualDim()'),0);assert.equal(run('isBossCinematic()'),false);
});
test('Ritual permits skills and jump input, preserves held movement on landing, then restores damage',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=5;onBossHealthChanged();player.z=0;player.vz=0;jump()");assert.ok(run('player.vz')>0);
  run("updateBossCinematic(5.7);surfStock=1;keys.add('d');activateSurf();update(.31)");assert.equal(run('isBossCinematic()'),false);assert.equal(run('special.mode'),'surf');assert.ok(run('keys.has("d")'));
  run("special=null;player.inv=0;hurt('combat resumed')");assert.equal(run('player.hp'),4);run("var vulnerableMinion=spawn(0,'normal',{x:1000,y:1000});vulnerableMinion.hit=0");assert.equal(run('hitEnemy(vulnerableMinion,false)'),true);
});
test('Four HP seeds all quadrants with a quake before summoning without a cinematic',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=4;peels=[];onBossHealthChanged()");assert.equal(run('peels.length'),24);assert.equal(run('isBossCinematic()'),false);assert.equal(run('boss.rituals.length'),0);
  run('updateBoss(.6)');assert.equal(run('enemies.length'),0);run('updateBoss(.31)');assert.equal(run('boss.rituals.length'),4);run('updateBoss(1.21)');assert.equal(run("enemies.filter(e=>e.type==='charger').length"),4);assert.equal(run('peels.length'),12);assert.ok(run('peels.every(p=>!p.ritual&&!p.summonWave)'));
});
test('Quake supply and reserved ritual peels cannot be stepped on or reused by resurrection',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=4;peels=[];onBossHealthChanged();var airborneSeed=peels[0];peels=[airborneSeed]");assert.equal(run('touchingPeel(airborneSeed)'),undefined);run('boss.move=1;beginBossMove()');assert.equal(run('boss.revivePeels.length'),0);
  run('seedQuadrantPeels();boss.rituals=planQuadrantRituals();var reservedPeel=boss.rituals[0].sources[0];peels=[reservedPeel]');assert.equal(run('touchingPeel(reservedPeel)'),undefined);
  run('boss.move=1;beginBossMove()');assert.equal(run('boss.revivePeels.length'),0);
});
test('Three and two HP each summon two red throwers with two durians per side exactly once',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=3;onBossHealthChanged();onBossHealthChanged()");assert.equal(run("enemies.filter(e=>e.type==='thrower').length"),2);assert.equal(run("enemies.filter(e=>e.type==='durian').length"),4);
  assert.ok(run("enemies.filter(e=>e.type==='thrower').every(red=>enemies.filter(e=>e.type==='durian'&&dist(e,red)<80).length===2)"));
  run('boss.hp=2;onBossHealthChanged()');assert.equal(run("enemies.filter(e=>e.type==='thrower').length"),4);assert.equal(run("enemies.filter(e=>e.type==='durian').length"),8);
});
test('One HP cinematic creates two clones, pauses safely, and all bodies must be stomped',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=2;player.x=boss.x;player.y=boss.y;tryStompBoss()");assert.equal(run('boss.hp'),1);assert.equal(run('isBossCinematic()'),true);assert.equal(run('bossClones.length'),0);
  run('update(1);pause();var splitPause=boss.time;update(3)');assert.equal(run('boss.time'),run('splitPause'));run('pause();update(5)');assert.equal(run('bossClones.length'),2);assert.equal(run('isBossCinematic()'),false);
  run('while(bossClones.length){bossClones[0].hit=0;player.x=bossClones[0].x;player.y=bossClones[0].y;tryStompBoss()}');assert.equal(run('bossClones.length'),0);assert.equal(run('boss.hp'),1);assert.equal(run('state'),'playing');
  run("boss.hit=0;boss.phase='rest';player.x=boss.x;player.y=boss.y;tryStompBoss()");assert.equal(run('boss.hp'),0);assert.equal(run('state'),'over');
});
test('Final HP ritual lasts six seconds with movement, boss immunity and a late clone reveal',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=1;onBossHealthChanged();var splitStartX=player.x;keys.add('d');update(.2)");
  assert.equal(run('boss.cinematic.duration'),6);assert.equal(run('isBossWorldFrozen()'),false);assert.ok(run('player.x')>run('splitStartX'));
  run("player.inv=0;boss.hit=0;hurt('ritual','boss');var splitMinion=spawn(0,'normal',{x:900,y:900});splitMinion.hit=0");assert.equal(run('player.hp'),5);assert.equal(run('hitBoss(boss,false)'),false);assert.equal(run('hitEnemy(splitMinion,false)'),true);
  run('updateBossCinematic(1.2)');assert.ok(run('boss.z')>0);assert.ok(run('bossRitualDim()')>0);assert.equal(run('bossClones.length'),0);
  run('updateBossCinematic(3.1)');assert.equal(run('bossClones.length'),2);assert.equal(run('isBossCinematic()'),true);
  run('updateBossCinematic(1.5)');assert.equal(run('boss.z'),0);assert.equal(run('isBossCinematic()'),false);assert.ok(run('keys.has("d")'));
  run("player.inv=0;hurt('ritual finished')");assert.equal(run('player.hp'),4);
});
test('Stomping the original promotes a random surviving clone and keeps the last HP until all bodies die',()=>{
  run("reset();enemies=[];startBossBattle();boss.hp=1;boss.phase='rest';boss.x=0;boss.y=0;spawnBossClone({x:300,y:0});spawnBossClone({x:-300,y:0});boss.hit=0;player.x=0;player.y=0;tryStompBoss()");assert.equal(run('boss.hp'),1);assert.equal(run('bossClones.length'),1);assert.ok(run('Math.abs(boss.x)')===300);assert.equal(run('state'),'playing');
  run("bossClones[0].hit=0;player.x=bossClones[0].x;player.y=bossClones[0].y;tryStompBoss();boss.hit=0;boss.phase='rest';player.x=boss.x;player.y=boss.y;tryStompBoss()");assert.equal(run('state'),'over');assert.equal(run('boss.hp'),0);
});
test('At two HP a stomp or ultimate transfers the original role without losing shared HP',()=>{
  for(const stomp of [true,false]){
    context.inheritanceStomp=stomp;
    run("reset();enemies=[];startBossBattle();boss.hp=2;boss.phase='rest';boss.x=0;boss.y=0;boss.hit=0;spawnBossClone({x:300,y:0});spawnBossClone({x:-300,y:0});player.x=0;player.y=0;hitBoss(boss,inheritanceStomp)");
    assert.equal(run('boss.hp'),2);assert.equal(run('bossClones.length'),1);assert.equal(run('Math.abs(boss.x)'),300);assert.equal(run('boss.hit'),4);assert.equal(run('state'),'playing');
    run('bossClones[0].hit=0;hitBoss(bossClones[0],inheritanceStomp)');assert.equal(run('bossClones.length'),0);assert.equal(run('boss.hp'),2);
    run("boss.hit=0;boss.phase='rest';hitBoss(boss,inheritanceStomp)");assert.equal(run('boss.hp'),1);assert.equal(run('isBossCinematic()'),true);
    run('updateBossCinematic(6)');assert.equal(run('bossClones.length'),2);
  }
});
test('Two HP summons one clone, one HP summons two, and only the original can summon',()=>{
  run("reset();enemies=[];startBossBattle();boss.hp=2;boss.phase='rest';onBossHealthChanged();player.inv=99;beginBossMove();updateBoss(1.01)");assert.equal(run('bossClones.length'),1);assert.ok(run('boss.nextClone')>run('bossElapsed'));
  run("boss.hp=1;boss.nextClone=0;beginBossMove();updateBoss(1.01)");assert.equal(run('bossClones.length'),2);
  run('for(const clone of bossClones){clone.nextClone=0;beginBossMove(clone)}');assert.ok(run("bossClones.every(c=>c.phase!=='clone-aim')"));
  run('boss.nextClone=0;beginBossMove();spawnBossClone({x:0,y:0});spawnBossCloneBatch()');assert.equal(run('bossClones.length'),2);assert.notEqual(run('boss.phase'),'clone-aim');
});
test('One HP cinematic respects the three-body cap with existing clones',()=>{
  run("reset();enemies=[];startBossBattle();boss.hp=2;boss.phase='rest';spawnBossClone({x:300,y:0});spawnBossClone({x:-300,y:0});boss.hp=1;onBossHealthChanged();updateBossCinematic(6)");assert.equal(run('bossClones.length'),2);
});
test('Hitting the original removes one second of summon charge without resetting its cooldown on inheritance',()=>{
  for(const stomp of [true,false]){
    context.chargeHitStomp=stomp;
    run("reset();startBossBattle();boss.hp=2;boss.phase='rest';boss.nextClone=7;bossElapsed=5;spawnBossClone({x:300,y:0});boss.hit=0;hitBoss(boss,chargeHitStomp)");
    assert.equal(run('boss.nextClone'),8);assert.equal(run('bossSummonCharge().remaining'),3);assert.equal(run('bossClones.length'),0);
    run('spawnBossClone({x:-300,y:0}).hit=0;hitBoss(bossClones[0],chargeHitStomp)');assert.equal(run('boss.nextClone'),8);
  }
  run("boss.hit=0;boss.phase='rest';boss.hp=2;boss.nextClone=2;bossElapsed=10;spawnBossClone({x:300,y:0});hitBoss(boss,false)");assert.equal(run('boss.nextClone'),11);
});
test('Summon gauge reports cooldown, cast windup and capacity separately',()=>{
  run("reset();startBossBattle();boss.phase='rest';boss.hp=2;boss.nextClone=7;bossElapsed=3");assert.equal(run('bossSummonCharge().remaining'),4);
  run('bossElapsed=7;beginBossMove();updateBoss(.4)');assert.ok(Math.abs(run('bossSummonCharge().remaining')-.6)<1e-8);assert.equal(run('bossSummonCharge().casting'),true);
  run('updateBoss(.6);spawnBossCloneBatch()');assert.equal(run('bossSummonCharge().full'),true);
});
test('Final ritual prepares its shield before immunity ends and protects the original for three more seconds',()=>{
  run("reset();startBossBattle();boss.hp=1;onBossHealthChanged();updateBossCinematic(5.2)");assert.equal(run('boss.cinematic.shieldCharging'),true);assert.equal(run('isBossCinematic()'),true);assert.equal(run('hitBoss(boss,false)'),false);
  run('updateBossCinematic(.8)');assert.equal(run('isBossCinematic()'),false);assert.equal(run('boss.phase'),'shield');assert.equal(run('boss.time'),3);assert.equal(run('hitBoss(boss,true)'),false);
  run('bossClones[0].hit=0;hitBoss(bossClones[0],false)');assert.equal(run('bossClones.length'),1);
  run('updateBoss(2.9)');assert.equal(run('boss.phase'),'shield');run('updateBoss(.11)');assert.equal(run('boss.phase'),'rest');run('boss.hit=0');assert.equal(run('hitBoss(boss,false)'),true);
});
test('Summon cooldown is ten seconds and the original relocates away from its new clones',()=>{
  run("reset();startBossBattle();boss.hp=2;boss.phase='rest';boss.nextClone=0;boss.nextShield=Infinity;boss.nextTeleport=Infinity;beginBossMove();updateBoss(1)");
  assert.equal(run('boss.nextClone-bossElapsed'),10);assert.equal(run('bossClones.length'),1);assert.ok(run('dist(boss,bossClones[0])')>250);
  run('boss.hp=1;onBossHealthChanged();updateBossCinematic(4.6);var relocated={x:boss.x,y:boss.y};updateBossCinematic(.7)');assert.equal(run('boss.x'),run('relocated.x'));assert.equal(run('boss.y'),run('relocated.y'));
  run('updateBossCinematic(.7)');assert.equal(run('boss.phase'),'shield');assert.equal(run('boss.nextClone-bossElapsed'),10);
});
test('Later final-HP clone casts teleport and return to normal instead of forcing a shield',()=>{
  for(const hp of [2,1]){
    context.retreatHp=hp;
    run("reset();startBossBattle();boss.hp=retreatHp;boss.phase='rest';boss.nextClone=0;boss.nextShield=Infinity;boss.nextTeleport=Infinity;beginBossMove();updateBoss(1)");
    assert.equal(run('bossClones.length'),hp===1?2:1);assert.equal(run('boss.phase'),'rest');assert.equal(run('boss.time'),.6);assert.ok(run('bossClones.every(c=>dist(c,boss)>200)'));
  }
});
test('Summon readiness preempts an attack and waits at capacity until a clone dies',()=>{
  run("reset();startBossBattle();boss.hp=1;boss.phase='revive';boss.time=3;boss.nextClone=10;bossElapsed=9.99;boss.fireRows=6;updateBoss(.02)");assert.equal(run('boss.phase'),'clone-aim');assert.equal(run('boss.fireRows'),0);
  run('updateBoss(1);boss.phase="fire";boss.time=99;boss.nextClone=bossElapsed;updateBoss(.01)');assert.equal(run('boss.phase'),'fire');assert.equal(run('bossClones.length'),2);
  run('var readyDeadline=boss.nextClone;bossClones[0].hit=0;hitBoss(bossClones[0],true)');assert.equal(run('boss.phase'),'clone-aim');assert.equal(run('boss.time'),1);assert.equal(run('boss.nextClone'),run('readyDeadline'));
  run('bossClones[0].hit=0;hitBoss(bossClones[0],true);updateBoss(1)');assert.equal(run('bossClones.length'),2);assert.equal(run('boss.nextClone-bossElapsed'),10);assert.equal(run('boss.phase'),'rest');
});
test('Final HP randomly selects every eligible normal move including shield and teleport',()=>{
  run("reset();startBossBattle();boss.hp=1;boss.nextClone=Infinity;boss.nextShield=0;boss.nextTeleport=0;var oldMoveRandom=Math.random,chosenMoves=[];for(const value of [.01,.21,.41,.61,.81]){Math.random=()=>value;beginBossMove();chosenMoves.push(boss.phase)}Math.random=oldMoveRandom");
  assert.deepEqual(Array.from(run('chosenMoves')),['sea-aim','revive','fire-aim','shield-aim','teleport-aim']);
});
test('Clone retreat chooses the farthest visible safe point, including between rectangle corners',()=>{
  for(const [width,height] of [[1000,650],[844,390],[390,844]]){
    context.retreatWidth=width;context.retreatHeight=height;
    run("reset();startBossBattle();W=retreatWidth;H=retreatHeight;boss.hp=1;bossClones=[];spawnBossClone(bossViewportPoint(W*.2,H*.3));spawnBossClone(bossViewportPoint(W*.2,H*.8));var retreat=bossCloneRetreatPoint(),retreatScore=Math.min(...bossClones.map(c=>dist(c,retreat)));separateOriginalFromClones()");
    assert.ok(run('(()=>{const p=screen(boss.x,boss.y);return p.x>=0&&p.x<=W&&p.y>=0&&p.y<=H})()'));
    // Compare against a dense grid of the same safe viewport, independently.
    assert.ok(run('(()=>{const scale=characterScale(),top=Math.min(H*.55,210*scale+60);for(let x=0;x<=20;x++)for(let y=0;y<=20;y++){const p=bossViewportPoint(100*scale+(W-200*scale)*x/20,top+(H-35*scale-top)*y/20,130);if(Math.min(...bossClones.map(c=>dist(c,p)))>retreatScore+1e-7)return false;}return true;})()'));
  }
  run('resize()');
});
test('Both ultimates hit bananas and the boss across the widened corridor',()=>{
  for(const surf of [false,true]){
    context.wideSurf=surf;
    run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.time=99;boss.x=20;boss.y=90;player.face=0;var wideMob=spawn(0,'normal',{x:20,y:78});wideMob.hp=2;if(wideSurf){surfStock=1;activateSurf()}else{charge=100;activate()}update(.05)");
    assert.equal(run('boss.hp'),9);assert.equal(run('wideMob.hp'),1);
  }
});
test('Mobile viewport gate blocks portrait and missing supported fullscreen, without consuming game time',()=>{
  run("window.matchMedia=()=>({matches:true});window.innerWidth=390;window.innerHeight=844;mobilePlayRequested=true;updateMobileViewport();reset();var gateElapsed=elapsed;update(1)");assert.equal(run('mobilePlayBlocked'),true);assert.equal(run('elapsed'),run('gateElapsed'));assert.equal(element('mobileGate').hidden,false);
  run('window.innerWidth=844;window.innerHeight=390;updateMobileViewport()');assert.equal(run('mobilePlayBlocked'),false);
  run('document.documentElement={requestFullscreen(){}};document.fullscreenEnabled=true;updateMobileViewport()');assert.equal(run('mobilePlayBlocked'),true);
  run('document.fullscreenElement=document.documentElement;updateMobileViewport()');assert.equal(run('mobilePlayBlocked'),false);
  run('delete document.documentElement;delete document.fullscreenElement;delete document.fullscreenEnabled;delete window.innerWidth;delete window.innerHeight;delete window.matchMedia;mobilePlayRequested=false;updateMobileViewport()');
});
test('Clone batches leave room between all three bodies and avoid a straight surf line',()=>{
  for(const [width,height] of [[1000,650],[390,844]])for(const [x,y] of [[0,0],[150,120],[-150,-120]]){
    context.cloneWidth=width;context.cloneHeight=height;context.cloneX=x;context.cloneY=y;
    run("reset();startBossBattle();W=cloneWidth;H=cloneHeight;player.x=0;player.y=0;boss.x=cloneX;boss.y=cloneY;boss.hp=1;var spread=planBossClones(),bodies=[boss,...spread]");
    assert.equal(run('spread.length'),2);
    assert.ok(run('Math.min(dist(bodies[0],bodies[1]),dist(bodies[0],bodies[2]),dist(bodies[1],bodies[2]))')>180);
    assert.ok(run('Math.abs((spread[0].x-boss.x)*(spread[1].y-boss.y)-(spread[0].y-boss.y)*(spread[1].x-boss.x))/Math.max(...bodies.flatMap(a=>bodies.map(b=>dist(a,b))))')>100);
    assert.ok(run('spread.every(p=>{const s=screen(p.x,p.y);return s.x>=0&&s.x<=W&&s.y>=0&&s.y<=H})'));
  }
  run('resize()');
});
test('One HP fresh batches create two clones and every direct spawn respects the total cap',()=>{
  run("reset();startBossBattle();boss.hp=1;spawnBossCloneBatch();var rejectedClone=spawnBossClone({x:0,y:0});spawnBossCloneBatch()");
  assert.equal(run('bossClones.length'),2);assert.equal(run('rejectedClone'),null);assert.equal(run('planBossClones().length'),0);
});
test('Clones cast the same six rows of ghost fire as the original',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=2;bossShots=[];var caster=spawnBossClone({x:500,y:300});caster.move=2;caster.nextShield=Infinity;beginBossMove(caster)");assert.equal(run('caster.phase'),'fire-aim');assert.equal(run('caster.time'),1);
  run('updateBossClones(1);for(let i=0;i<100;i++)updateBossClones(.015)');assert.equal(run('bossShots.length'),42);assert.ok(run('bossShots.every(s=>Math.abs(s.x-546)<1e-8&&Math.abs(s.y-(300+(bossFireZ-120)/.72))<1e-8)'));
});
test('Clones release all three peel sea rings around their own location',()=>{
  run("bossShots=[];peels=[];caster.phase='rest';caster.time=0;caster.move=0;caster.nextShield=Infinity;updateBossClones(.01);updateBossClones(1);for(let i=0;i<16;i++)updateBossClones(.05)");assert.equal(run('peels.length'),36);assert.ok(run('peels.every(p=>Math.abs(dist(p,caster)-40*characterScale())<1e-7)'));
});
test('Clone revival consumes at most twelve existing peels and cannot reuse another caster material',()=>{
  run("enemies=[];peels=[];for(let i=0;i<15;i++)peels.push({id:serial++,x:caster.x+i,y:caster.y,age:1});caster.move=1;beginBossMove(caster);boss.move=1;boss.x=caster.x;boss.y=caster.y;boss.nextClone=Infinity;beginBossMove();releaseBossRevival();releaseBossRevival(caster)");assert.equal(run('enemies.length'),12);assert.equal(run('peels.length'),3);
});
test('Clone shields charge for one second, protect for three, and hurt airborne players',()=>{
  run("enemies=[];boss.x=-1000;caster.x=300;caster.y=0;caster.nextShield=0;beginBossMove(caster)");assert.equal(run('caster.phase'),'shield-aim');assert.equal(run('caster.time'),1);
  run('player.inv=0;player.stompGuard=0;player.hp=5;player.x=caster.x+80;player.y=caster.y;player.z=70;updateBossClones(1)');assert.equal(run('caster.phase'),'shield');assert.equal(run('caster.time'),3);assert.equal(run('player.hp'),4);
  run('caster.hit=0;player.x=caster.x;player.y=caster.y');assert.equal(run('tryStompBoss()'),false);
});
test('Final phase with repeated clones remains finite during a full minute of battle',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hp=1;boss.nextClone=1;for(let i=0;i<3600;i++){player.inv=99;update(1/60)}");assert.equal(run('state'),'playing');assert.equal(run('bossClones.length'),2);assert.ok(run('bossShots.length')<300);assert.ok(run('bossClones.every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y))'));
});
test('Stomping gives a solid, protected success bounce while damage retains its blink',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='rest';boss.hit=0;player.x=boss.x;player.y=boss.y;tryStompBoss()");assert.equal(run('player.stompGuard'),1);assert.equal(run('playerDamageBlink()'),false);assert.ok(run("texts.some(t=>t.text==='踩中！')"));assert.equal(run('player.down'),0);
  run('boss.x=1000;boss.time=99;for(let i=0;i<20;i++)update(.02)');assert.ok(run('player.inv')>0);assert.equal(run('playerDamageBlink()'),false);
  run("player.inv=0;hurt('actual damage');player.inv=1.7");assert.equal(run('player.stompGuard'),0);assert.equal(run('playerDamageBlink()'),true);
});
test('Shield damage reaches the larger flame perimeter and remains avoidable outside it',()=>{
  run("reset();enemies=[];startBossBattle();boss.phase='shield';boss.time=3;boss.hit=0;player.inv=0;player.x=boss.x+115;player.y=boss.y;updateBoss(.01)");assert.equal(run('player.hp'),4);
  run("player.inv=0;player.x=boss.x+140;updateBoss(.01)");assert.equal(run('player.hp'),4);
});
test('Teleport has a visible 0.3 second windup before the position changes',()=>{
  run("reset();enemies=[];startBossBattle();boss.hp=7;boss.nextTeleport=0;beginBossMove();var beforeTeleportX=boss.x,beforeTeleportY=boss.y;updateBoss(.29)");assert.equal(run('boss.phase'),'teleport-aim');assert.equal(run('boss.x'),run('beforeTeleportX'));assert.equal(run('boss.y'),run('beforeTeleportY'));
  run('updateBoss(.02)');assert.equal(run('boss.phase'),'rest');assert.ok(run('boss.x!==beforeTeleportX||boss.y!==beforeTeleportY'));
});
test('Fire spread stays within a quarter circle and the quake radius exceeds the previous range',()=>{
  run("reset();enemies=[];startBossBattle();boss.hp=6;boss.aim=0;releaseBossFire()");assert.ok(run('Math.atan2(bossShots.at(-1).vy,bossShots.at(-1).vx)-Math.atan2(bossShots[0].vy,bossShots[0].vx)')<=Math.PI/2);
  assert.ok(run('bossSeaRadius()')>run('bossRadius()')*1.4);
});
test('Boss exclusive music and final-health arrangement are distinct 30-second loops',()=>{run("var bossAudioContext={createBuffer(_c,n,r){var data=new Float32Array(n);return{duration:n/r,getChannelData:()=>data};}},bossTrack=createBossMusicBuffer(bossAudioContext,false),bossFinalTrack=createBossMusicBuffer(bossAudioContext,true)");assert.equal(run('bossTrack.duration'),30);assert.equal(run('bossFinalTrack.duration'),30);assert.ok(run('bossTrack.getChannelData(0).every(Number.isFinite)'));assert.ok(run('bossFinalTrack.getChannelData(0).every(Number.isFinite)'));assert.ok(run('bossTrack.getChannelData(0).every(v=>Math.abs(v)<.65)'));assert.ok(run('Math.abs(bossTrack.getChannelData(0)[0]-bossTrack.getChannelData(0).at(-1))<.03'));assert.ok(run('bossTrack.getChannelData(0).some((v,i)=>v!==bossFinalTrack.getChannelData(0)[i])'));});

function milkTest(name,body){test(name,()=>{run("$('gameMode').value='milk';debugUnlocked=false;reset()");try{body();}finally{run("$('gameMode').value='survival';delete window.matchMedia;reset()");}});}
milkTest('Stage HUD and victory retain the formal name instead of development labels',()=>{
  assert.match(element('tempoLabel').textContent,/蕉片崛起/);
  run('enemies=[];elapsed=59.99;update(.02)');assert.ok(run('giantBattle'));assert.equal(run('boss'),null);assert.equal(element('gameClock').hidden,true);
  run('finish(true)');assert.match(element('overlayTitle').innerHTML,/蕉片崛起/);assert.doesNotMatch(element('overlayTitle').innerHTML,/試作|試玩|原版|第一關|第二關/);
  run("$('gameMode').value='survival';reset()");assert.equal(run('giantBattle'),null);assert.match(element('tempoLabel').textContent,/蕉皮末日/);
  run('enemies=[];elapsed=119.99;update(.02)');assert.ok(run('boss'));assert.equal(run('giantBattle'),null);
});
milkTest('蕉片崛起 arrivals build pressure at thirty and fifty seconds independently of 蕉皮末日',()=>{
  for(const [at,min,max] of [[0,2,5],[29.99,2,5],[30,1.5,3],[49.99,1.5,3],[50,.8,1.4],[59,.8,1.4]]){context.densityTime=at;context.densityMin=min;context.densityMax=max;assert.ok(run('Array.from({length:40},()=>smallSpawnInterval(densityTime)).every(t=>t>=densityMin&&t<=densityMax)'));}
  assert.ok(run('spawnClock>=2&&spawnClock<=5'));
  run('enemies=[];milkBottles=[];player.inv=99;elapsed=0;spawnClock=0;update(.01);var scheduledArrival=spawnClock;enemies=[]');assert.ok(run('scheduledArrival>=2&&scheduledArrival<=5'));
  assert.equal(run('spawnWarnings.length'),1);run('update(.49)');assert.equal(run('enemies.length'),0);run('update(.02)');assert.equal(run('milkPopulation()'),3);
  run("$('gameMode').value='survival';reset()");assert.ok(Math.abs(run('smallSpawnInterval(0)')-.9/.75)<1e-8);assert.ok(Math.abs(run('spawnClock')-.4/.75)<1e-8);
});
milkTest('Milk pairs and later supplies stay at least 500 apart, including near arena corners',()=>{
  for(const corner of [0,1200,-1200]){context.milkCorner=corner;run('milkBottles=[];player.x=player.y=milkCorner;spawnMilkPair()');assert.equal(run('milkBottles.length'),2);assert.ok(run('dist(milkBottles[0],milkBottles[1])>=500'));
    run('for(let i=0;i<5;i++)spawnMilkPair()');assert.equal(run('milkBottles.length'),12);assert.ok(run('milkBottles.every((a,i)=>milkBottles.slice(i+1).every(b=>dist(a,b)>=500))'));assert.ok(run('milkBottles.every(b=>Math.abs(b.x)<=arenaSize-50&&Math.abs(b.y)<=arenaSize-50)'));
  }
  assert.ok(500>205*1.5);
});
milkTest('蕉片崛起 starts at sixty seconds, uses slice minions and transitions to its own giant battle',()=>{
  assert.equal(run('roundDuration()'),60);assert.equal(element('timer').textContent,'01:00');assert.equal(run('enemies.length'),2);assert.equal(run('milkPopulation()'),6);assert.ok(run("enemies.every(e=>e.type==='slice'&&e.hp===3&&e.stackCount===3)"));assert.equal(run('milkBottles.length'),2);
  run('enemies=[];spawnClock=999;elapsed=59.99;update(.02)');assert.equal(run('state'),'playing');assert.equal(run('elapsed'),60);assert.equal(run('boss'),null);assert.ok(run('giantBattle'));assert.equal(run('liveGiants().length'),2);
});
milkTest('Rule AI avoids actual swept slice flight and airborne hop contacts without changing damage',()=>{
  for(const motion of ['flight','hop']){
    context.dodgeMotion=motion;
    for(const controlled of [false,true]){
      context.useDodgeAI=controlled;
      run("var dodgeEnv=createSimulation({mode:'milk',seed:7,entrance:false});enemies=[];milkBottles=[];spawnClock=999;nextMilkAt=999;spawnMilkBottle({x:300,y:0});var dodgeEnemy=spawn(0,'slice',{x:dodgeMotion==='flight'?-130:90,y:0});if(dodgeMotion==='flight'){dodgeEnemy.z=20;dodgeEnemy.sliceFlight={t:0,ax:-130,ay:0,bx:170,by:0,startZ:20,duration:300/460};}else{player.z=10;player.vz=200;dodgeEnemy.z=35;dodgeEnemy.sliceHop={t:.18,ax:126,ay:0,bx:0,by:0};}var dodgeAction={x:1};for(var dodgeStep=0;dodgeStep<30;dodgeStep++){if(useDodgeAI&&dodgeStep%6===0)dodgeAction=dodgeEnv.policy(dodgeEnv.observe());dodgeEnv.step(dodgeAction);}var dodgeHp=player.hp;stopSimulation()");
      assert.equal(run('dodgeHp'),controlled?5:4,motion+' controlled='+controlled);
    }
  }
});
milkTest('Milk pickup equips a fuel-limited bottle jet without healing, charge or invulnerability',()=>{
  run('enemies=[];milkBottles=[];player.hp=3;charge=25;spawnMilkBottle({x:0,y:0});updateMilkStage(.01,null)');
  assert.ok(run('milkPack'));assert.equal(run('milkBottles.length'),0);assert.equal(run('player.hp'),3);assert.equal(run('charge'),25);assert.equal(run('player.inv'),0);
  run("hurt('milk pack is not armor')");assert.equal(run('player.hp'),2);
  run('player.down=0;player.z=50;var ammoBefore=milkPack.ammo;updateMilkSpray(.5)');assert.equal(run('milkPack.ammo'),run('ammoBefore'));
  run('player.z=0;special={};updateMilkSpray(.5)');assert.equal(run('milkPack.ammo'),run('ammoBefore'));
  run("special=null;keys.add(' ');updateMilkSpray(8);keys.clear()");assert.equal(run('milkPack'),null);
});
milkTest('Milk pickup uses landing and swept movement, and refills existing inventory',()=>{
  run('enemies=[];milkBottles=[];spawnMilkBottle({x:0,y:0});player.z=60;collectMilkBottles(null)');assert.equal(run('milkPack'),null);
  run('player.z=0;collectMilkBottles(null);spawnMilkBottle({x:0,y:0});collectMilkBottles(null)');assert.equal(run('milkBottles.length'),0);assert.equal(run('milkPack.ammo'),5);
  run('milkPack=null;milkBottles=[];spawnMilkBottle({x:60,y:0});player.x=120;collectMilkBottles({x:0,y:0,grounded:true,dashing:false})');assert.ok(run('milkPack'));assert.equal(run('milkBottles.length'),0);
});
milkTest('Milk jet waits for held input, consumes continuous fuel, refills, and removes empty equipment',()=>{
  run('enemies=[];milkBottles=[];milkDrops=[];milkPack=null;spawnMilkBottle({x:0,y:0});collectMilkBottles(null);updateMilkHUD();updateMilkSpray(1)');assert.equal(run('milkPack.ammo'),5);assert.equal(run('milkDrops.length'),0);assert.equal(element('milkTime').textContent,'100%');
  run("keys.add(' ');updateMilkSpray(.3);updateMilkHUD()");assert.ok(Math.abs(run('milkPack.ammo')-4)<1e-8);assert.equal(element('milkTime').textContent,'80%');
  run("keys.clear();var releasedFuel=milkPack.ammo;updateMilkSpray(1)");assert.equal(run('milkPack.ammo'),run('releasedFuel'));
  run('var refillCooldown=milkPack.emit;spawnMilkBottle({x:0,y:0});collectMilkBottles(null)');assert.equal(run('milkPack.ammo'),5);assert.equal(run('milkPack.emit'),run('refillCooldown'));
  run("keys.add(' ');updateMilkSpray(1.49);updateMilkHUD()");assert.ok(run('milkPack.ammo')>0);run('updateMilkSpray(.01);updateMilkHUD();keys.clear()');assert.equal(run('milkPack'),null);assert.equal(element('milkGauge').hidden,true);
});
milkTest('Keyboard jet lifts and hovers, allows steering, and falls on release without granting immunity',()=>{
  for(const mobile of [false,true]){
    context.jetMobile=mobile;run("window.matchMedia=()=>({matches:jetMobile});reset();enemies=[];milkBottles=[];spawnClock=999;milkPack={ammo:5,emit:0};handleKeyDown({code:'Space',key:' ',preventDefault(){}});keys.add('d');for(let i=0;i<60;i++)update(1/60)");assert.ok(Math.abs(run('player.z')-108*(mobile?.7:1))<1e-8);assert.equal(run('player.vz'),0);assert.ok(run('player.x')>200);assert.equal(run('player.inv'),0);assert.ok(run('milkPack.ammo')<5);
    run("handleKeyUp({code:'Space',key:' '});keys.clear();var landedFuel=milkPack.ammo;for(let i=0;i<60;i++)update(1/60)");assert.equal(run('player.z'),0);assert.equal(run('milkPack.ammo'),run('landedFuel'));
  }
});
milkTest('Slices outrun milk enemies but seek ground bottles instead of gathering around milk enemies',()=>{
  for(const time of [0,30,59]){
    context.sliceSpawnTime=time;run("elapsed=sliceSpawnTime;var fastSlice=spawn(0,'normal',{x:0,y:0})");assert.ok(run('fastSlice.speed')>=110);assert.ok(run('fastSlice.speed')<124);assert.ok(run('fastSlice.speed')>82);
  }
  run("enemies=[];milkBottles=[];player.x=-1000;spawnMilkBottle({x:200,y:0});var movingBottle=spawn(0,'normal',{x:200,y:0});movingBottle.sliceGoal='bottle';movingBottle.sliceBottleId=milkBottles[0].id;updateMilkClaims(1);var chasingSlice=spawn(0,'normal',{x:40,y:0});chasingSlice.speed=110;moveMilkEnemy(chasingSlice,.1)");
  assert.ok(run('chasingSlice.x')<40);assert.equal(run('nearestMilkBottle(chasingSlice)'),null);
  run("spawnMilkBottle({x:40,y:200});chasingSlice.sliceHop=null;chasingSlice.z=0;chasingSlice.sliceGoal='bottle';chasingSlice.sliceBottleId=milkBottles[0].id;chasingSlice.sliceBottleRevision=milkBottleRevision;var seekBefore=chasingSlice.y;moveMilkEnemy(chasingSlice,.1)");assert.ok(run('chasingSlice.y')>run('seekBefore'));assert.ok(run('nearestMilkBottle(chasingSlice)'));
  run('chasingSlice.x=movingBottle.x;chasingSlice.y=movingBottle.y;chasingSlice.sliceHop=null;chasingSlice.z=0;updateMilkClaims(.91)');assert.equal(run('movingBottle.hp'),2);assert.equal(run('chasingSlice.hp'),1);assert.equal(run('kills'),0);
});
milkTest('Jet droplets travel vertically downward and damage only enemies beneath, once per pulse without charge',()=>{
  run("enemies=[];milkBottles=[];milkDrops=[];milkPack=null;player.z=108;var underJet=spawn(0,'slice',{x:0,y:8}),besideJet=spawn(0,'slice',{x:100,y:8});underJet.hp=4;emitPlayerMilkJet()");assert.equal(run('milkDrops.length'),3);assert.ok(run('milkDrops.every(d=>d.jet&&d.vz<0&&d.z>90)'));
  run('updateMilkSpray(.05)');assert.equal(run('underJet.hp'),4);
  run('updateMilkSpray(.25)');assert.equal(run('underJet.hp'),3);assert.equal(run('besideJet.hp'),1);assert.equal(run('charge'),0);assert.equal(run('milkDrops.length'),0);
  run('underJet.hit=0;underJet.knock=0;emitPlayerMilkJet();updateMilkSpray(.3)');assert.equal(run('underJet.hp'),2);
});
milkTest('Touch hold and cancel drive the jet, while pause and skills stop fuel use and restart clears touch state',()=>{
  run("enemies=[];milkBottles=[];spawnClock=999;milkPack={ammo:5,emit:0};startMilkJetTouch({pointerId:17,preventDefault(){}});update(.1)");assert.ok(run('player.z')>0);assert.ok(run('milkPack.ammo')<5);
  run('releaseMilkJetTouch({pointerId:17});var touchFuel=milkPack.ammo;update(.1)');assert.equal(run('milkPack.ammo'),run('touchFuel'));
  run("keys.add(' ');special={mode:'surf'};updateMilkSpray(.5)");assert.equal(run('milkPack.ammo'),run('touchFuel'));
  run("special=null;pause();update(1)");assert.equal(run('milkPack.ammo'),run('touchFuel'));assert.equal(run('milkJetTouch'),null);
  run('pause();reset()');assert.equal(run('milkPack'),null);assert.equal(run('milkJetTouch'),null);
});
milkTest('A single stomp defeats a freshly formed milk enemy, while ordinary damage stays unchanged',()=>{
  run("enemies=[];milkBottles=[];spawnClock=999;player.x=500;spawnMilkBottle({x:0,y:0});var oneStompMilk=spawn(0,'slice',{x:0,y:0});oneStompMilk.sliceGoal='bottle';oneStompMilk.sliceBottleId=milkBottles[0].id;updateMilkClaims(1)");
  assert.equal(run('oneStompMilk.type'),'milk');assert.equal(run('oneStompMilk.hp'),2);
  run('var milkKillsBefore=kills;player.x=0;player.y=0;player.z=44;player.vz=-120;oneStompMilk.hit=0;update(.02)');
  assert.equal(run('oneStompMilk.hp'),0);assert.equal(run('kills'),run('milkKillsBefore+1'));assert.equal(run('stats.stompKills'),1);assert.equal(run('player.hp'),5);assert.ok(run('player.vz')>0);assert.equal(run('peels.length'),0);
  run("var ordinaryMilk=spawn(0,'slice',{x:500,y:0});ordinaryMilk.type='milk';ordinaryMilk.hp=2;hitEnemy(ordinaryMilk,false)");assert.equal(run('ordinaryMilk.hp'),1);
});

milkTest('Slices transform after windup and the player can steal or interrupt the bottle first',()=>{
  run("enemies=[];milkBottles=[];player.x=500;spawnMilkBottle({x:0,y:0});var drinkSlice=spawn(0,'normal',{x:0,y:0});drinkSlice.sliceGoal='bottle';drinkSlice.sliceBottleId=milkBottles[0].id;updateMilkClaims(.4)");assert.equal(run('drinkSlice.type'),'slice');
  run('updateMilkClaims(.51)');assert.equal(run('drinkSlice.type'),'milk');assert.equal(run('drinkSlice.hp'),2);assert.equal(run('milkBottles.length'),0);
  run("enemies=[];milkBottles=[];player.x=0;spawnMilkBottle({x:0,y:0});var stolenSlice=spawn(0,'normal',{x:0,y:0});stolenSlice.drinking=.89;stolenSlice.milkTarget=milkBottles[0].id;updateMilkStage(.02,null)");assert.equal(run('stolenSlice.type'),'slice');assert.ok(run('milkPack'));
  run("milkPack=null;player.x=500;spawnMilkBottle({x:0,y:0});stolenSlice.hp=2;stolenSlice.drinking=.8;stolenSlice.milkTarget=milkBottles[0].id;hitEnemy(stolenSlice,false);updateMilkClaims(.2)");assert.equal(run('stolenSlice.drinking'),0);assert.equal(run('stolenSlice.type'),'slice');
});
milkTest('A ground bottle consumes exactly one slice and the milk enemy never absorbs more or heals',()=>{
  run("enemies=[];milkBottles=[];player.x=500;spawnMilkBottle({x:0,y:0});for(let i=0;i<5;i++){var atomicSlice=spawn(0,'normal',{x:0,y:0});atomicSlice.sliceGoal='bottle';atomicSlice.sliceBottleId=milkBottles[0].id;}updateMilkClaims(1)");
  assert.equal(run("enemies.filter(e=>e.type==='milk').length"),1);assert.equal(run("enemies.find(e=>e.type==='milk').hp"),2);assert.equal(run("enemies.filter(e=>e.hp>0&&e.type==='slice').length"),4);assert.equal(run('kills'),0);assert.equal(run('peels.length'),0);
  run("var fixedMilk=enemies.find(e=>e.type==='milk');fixedMilk.hp=1;updateMilkClaims(2)");assert.equal(run('fixedMilk.hp'),1);assert.equal(run('fixedMilk.speed'),62);assert.equal(run("enemies.filter(e=>e.hp>0&&e.type==='slice').length"),4);
});
milkTest('A bottle admits one slice and nearby incoming slices cannot restack the drinker',()=>{
  run("enemies=[];milkBottles=[];player.x=600;var claimBottle=spawnMilkBottle({x:0,y:0});var claiming=spawn(0,'slice',{x:0,y:0}),competing=spawn(0,'slice',{x:5,y:0});for(const e of [claiming,competing]){e.sliceGoal='bottle';e.sliceBottleId=claimBottle.id;}updateMilkClaims(.3)");assert.equal(run('claiming.drinking'),.3);assert.equal(run('competing.drinking'),0);assert.equal(run('claimBottle.claimantId'),run('claiming.id'));
  run('competing.z=12');assert.equal(run('mergeLandingSlice(competing,20,12)'),false);assert.equal(run('claiming.stackCount||1'),1);
  run('competing.z=0;separateEnemies()');assert.equal(run('claiming.x'),0);assert.ok(run('competing.x')>=32);
  run('updateMilkClaims(.61)');assert.equal(run('claiming.type'),'milk');assert.equal(run('milkBottles.length'),0);assert.equal(run('competing.hp'),1);
});
milkTest('Milk claims release on interruption and finish beside a charging stack under actual updates',()=>{
  run("enemies=[];milkBottles=[];player.x=800;spawnClock=999;var sharedBottle=spawnMilkBottle({x:0,y:0});var claimInterruptedSlice=spawn(0,'slice',{x:0,y:0}),claimReplacementSlice=spawn(0,'slice',{x:5,y:0});for(const e of [claimInterruptedSlice,claimReplacementSlice]){e.sliceGoal='bottle';e.sliceBottleId=sharedBottle.id;}updateMilkClaims(.2);claimInterruptedSlice.knock=.5;updateMilkClaims(.2)");assert.equal(run('claimInterruptedSlice.drinking'),0);assert.equal(run('sharedBottle.claimantId'),run('claimReplacementSlice.id'));
  run('updateMilkClaims(.71)');assert.equal(run('claimReplacementSlice.type'),'milk');
  run("enemies=[];milkBottles=[];var stackBottle=spawnMilkBottle({x:0,y:0});var besideStack=spawnSliceStack(0,{x:10,y:0});var claimPatientSlice=spawn(0,'slice',{x:0,y:0});claimPatientSlice.sliceGoal='bottle';claimPatientSlice.sliceBottleId=stackBottle.id;for(let i=0;i<60&&claimPatientSlice.type==='slice';i++)update(1/60)");assert.equal(run('claimPatientSlice.type'),'milk');assert.equal(run('besideStack.stackCount'),3);
});
milkTest('Milk enemies fire five long-range projectiles that can be jumped',()=>{
  run("enemies=[];milkBottles=[];player.x=500;spawnMilkBottle({x:0,y:0});var firingMilk=spawn(0,'normal',{x:0,y:0});firingMilk.sliceGoal='bottle';firingMilk.sliceBottleId=milkBottles[0].id;updateMilkClaims(1)");
  for(const count of [5]){run("milkDrops=[];firingMilk.milkPhase='aim';firingMilk.milkTime=0;firingMilk.milkAim=0;moveMilkEnemy(firingMilk,1)");assert.equal(run('milkDrops.length'),count);assert.ok(run('milkDrops.every(d=>d.life===3)'));assert.ok(run('Math.abs(milkDrops[2].vx*milkDrops[2].life-720)<1e-8'));}
  run('milkDrops=[];player.x=0;player.y=0;player.inv=0;player.z=60;emitMilkDrop({x:-70,y:0},0,true);updateMilkSpray(.5)');assert.equal(run('player.hp'),5);
  run('milkDrops=[];player.z=0;emitMilkDrop({x:-70,y:0},0,true);updateMilkSpray(.5)');assert.equal(run('player.hp'),4);
});
milkTest('Pause and mobile gate freeze milk ammo, claims and projectiles; restart clears all milk state',()=>{
  run('milkPack={ammo:5,emit:0};emitMilkDrop(player,0);var dropStart=milkDrops[0].x;pause();update(1)');assert.equal(run('milkPack.ammo'),5);assert.equal(run('milkDrops[0].x'),run('dropStart'));assert.equal(element('milkGauge').hidden,true);
  run('pause();mobilePlayBlocked=true;update(1)');assert.equal(run('milkPack.ammo'),5);run('mobilePlayBlocked=false;reset()');assert.equal(run('milkPack'),null);assert.equal(run('milkDrops.length'),0);
  run("$('gameMode').value='survival';reset()");assert.equal(run('milkStage'),false);assert.equal(run('roundDuration()'),120);assert.equal(run('milkBottles.length'),0);assert.ok(run("enemies.every(e=>e.type==='normal')"));
});
milkTest('Stacks charge one second, fire straight at seconds two and three, then release the base to hop',()=>{
  for(const mobile of [false,true]){
    context.salvoMobile=mobile;run("window.matchMedia=()=>({matches:salvoMobile});enemies=[];milkBottles=[];player.x=300;player.y=0;var splittingStack=spawnSliceStack(0,{x:0,y:0});moveMilkEnemy(splittingStack,1)");assert.equal(run('splittingStack.stackCount'),3);assert.equal(run('splittingStack.x'),0);
    run('moveMilkEnemy(splittingStack,.99)');assert.equal(run('enemies.length'),1);
    run('moveMilkEnemy(splittingStack,.01)');assert.equal(run('splittingStack.stackCount'),2);assert.equal(run('milkPopulation()'),3);assert.ok(run('enemies[1].sliceFlight'));assert.equal(run('enemies[1].sliceFlight.startZ'),32);
    assert.ok(run('Math.abs(enemies[1].sliceFlight.bx-(300+201.6*characterScale()))<1e-8'));assert.equal(run('enemies[1].sliceFlight.by'),0);
    run('player.x=0;player.y=300;moveMilkEnemy(splittingStack,.99)');assert.equal(run('enemies.length'),2);
    run('moveMilkEnemy(splittingStack,.01)');assert.equal(run('splittingStack.stackCount'),1);assert.equal(run('enemies.length'),3);assert.ok(run('Math.abs(enemies[2].sliceFlight.by-(300+201.6*characterScale()))<1e-8'));assert.equal(run('enemies[2].sliceFlight.startZ'),16);
    run('player.x=-100;player.y=-100;for(const child of enemies.slice(1))moveMilkEnemy(child,10);moveMilkEnemy(splittingStack,10);spawnMilkBottle({x:0,y:0});updateMilkClaims(2);var anchoredNeighbour=spawn(0,\'slice\',{x:10,y:0});separateEnemies()');assert.ok(run('splittingStack.x')<0);assert.ok(run('splittingStack.y')<0);assert.equal(run('splittingStack.type'),'slice');assert.ok(run('enemies.slice(1,3).every(e=>!e.sliceFlight)'));assert.equal(run('kills'),0);
  }
});
milkTest('New bottles trigger a distance-weighted reroll using the nearest bottle, otherwise targets stay locked',()=>{
  run("enemies=[];milkBottles=[];player.x=-300;var lockedBottle=spawnMilkBottle({x:200,y:0});var goalSlice=spawn(0,'slice',{x:0,y:0});var goalRandom=Math.random;Math.random=()=>.49;sliceGoal(goalSlice);Math.random=goalRandom");assert.equal(run('goalSlice.sliceBottleId'),run('lockedBottle.id'));
  run("var nearerBottle=spawnMilkBottle({x:10,y:0});Math.random=()=>.1;sliceGoal(goalSlice);Math.random=goalRandom");assert.equal(run('goalSlice.sliceBottleId'),run('nearerBottle.id'));
  run("Math.random=()=>.999;sliceGoal(goalSlice);Math.random=goalRandom");assert.equal(run('goalSlice.sliceBottleId'),run('nearerBottle.id'));
  run("milkBottles=milkBottles.filter(b=>b!==nearerBottle);Math.random=()=>.999;sliceGoal(goalSlice);Math.random=goalRandom");assert.equal(run('goalSlice.sliceGoal'),'player');
  run("var newestBottle=spawnMilkBottle({x:2,y:0});Math.random=()=>.1;sliceGoal(goalSlice);Math.random=goalRandom");assert.equal(run('goalSlice.sliceBottleId'),run('newestBottle.id'));
  run("milkBottles=[];var fallbackSlice=spawn(0,'slice',{x:0,y:0});sliceGoal(fallbackSlice);var fallbackBottle=spawnMilkBottle({x:1,y:0});Math.random=()=>.1;sliceGoal(fallbackSlice);Math.random=goalRandom");assert.equal(run('fallbackSlice.sliceGoal'),'bottle');assert.equal(run('fallbackSlice.sliceBottleId'),run('fallbackBottle.id'));
});
milkTest('Nearest bottle supplies the probability denominator and a full failed bottle spawn does not reroll goals',()=>{
  run("enemies=[];milkBottles=[];player.x=8;player.y=0;var nearGoalBottle=spawnMilkBottle({x:2,y:0});spawnMilkBottle({x:80,y:0});var chanceSlice=spawn(0,'slice',{x:0,y:0});var chanceRandom=Math.random;Math.random=()=>.81;sliceGoal(chanceSlice);Math.random=chanceRandom");assert.equal(run('chanceSlice.sliceGoal'),'player');
  run('while(milkBottles.length<milkRules.bottleLimit)spawnMilkBottle({x:500,y:500});sliceGoal(chanceSlice);var oldRevision=milkBottleRevision;var oldGoal=chanceSlice.sliceGoal;var oldBottle=chanceSlice.sliceBottleId');assert.equal(run('spawnMilkBottle({x:0,y:0})'),null);assert.equal(run('milkBottleRevision'),run('oldRevision'));run('sliceGoal(chanceSlice)');assert.equal(run('chanceSlice.sliceGoal'),run('oldGoal'));assert.equal(run('chanceSlice.sliceBottleId'),run('oldBottle'));
});
milkTest('Hopping slices reform two and three layers without duplicating population and release moving bases again',()=>{
  for(const mobile of [false,true]){
    context.mergeMobile=mobile;run("window.matchMedia=()=>({matches:mergeMobile});enemies=[];milkBottles=[];player.x=0;player.y=0;var mergeBase=spawn(0,'slice',{x:0,y:0}),hoppingSlice=spawn(0,'slice',{x:-60,y:0});hoppingSlice.sliceGoal='player';hoppingSlice.speed=100;moveMilkEnemy(hoppingSlice,.315)");assert.ok(run('hoppingSlice.z')>0);assert.ok(run('hoppingSlice.x')>-60);assert.equal(run('mergeBase.stackCount||1'),1);
    run('moveMilkEnemy(hoppingSlice,.21);moveMilkEnemy(hoppingSlice,.06)');assert.equal(run('mergeBase.stackCount'),2);assert.equal(run('mergeBase.hp'),2);assert.equal(run('hoppingSlice.hp'),0);assert.equal(run('milkPopulation()'),2);assert.equal(run('kills'),0);
    run("var secondHopper=spawn(0,'slice',{x:-60,y:0});secondHopper.sliceGoal='player';secondHopper.speed=100;moveMilkEnemy(secondHopper,.315);moveMilkEnemy(secondHopper,.195)");assert.equal(run('mergeBase.stackCount'),3);assert.equal(run('secondHopper.hp'),0);assert.equal(run('milkPopulation()'),3);
    run("var cappedHopper=spawn(0,'slice',{x:0,y:0});cappedHopper.sliceGoal='player';moveMilkEnemy(cappedHopper,.315);moveMilkEnemy(cappedHopper,.315)");assert.equal(run('mergeBase.stackCount'),3);assert.equal(run('cappedHopper.hp'),1);assert.equal(run('milkPopulation()'),4);
    run('player.x=500;moveMilkEnemy(mergeBase,2)');assert.equal(run('mergeBase.stackCount'),2);assert.equal(run('milkPopulation()'),4);
    run('moveMilkEnemy(mergeBase,1);moveMilkEnemy(mergeBase,.1)');assert.equal(run('mergeBase.stackCount'),1);assert.equal(run('mergeBase.stackAnchor'),false);assert.ok(run('mergeBase.sliceHop'));assert.ok(run('mergeBase.x')>0);assert.equal(run('kills'),0);
  }
});
milkTest('Slice target chances use relative distances, including equal and zero-distance cases',()=>{
  for(const [playerDistance,bottleDistance,expectedPlayer] of [[8,2,20],[2,8,80],[5,5,50],[0,5,100],[5,0,0],[0,0,50]]){
    context.playerDistance=playerDistance;context.bottleDistance=bottleDistance;
    run("enemies=[];milkBottles=[];player.x=playerDistance;player.y=0;spawnMilkBottle({x:-bottleDistance,y:0});var weightedSlice=spawn(0,'slice',{x:0,y:0});var weightedRandom=Math.random;var chosenPlayers=0");
    try{run("for(let i=0;i<100;i++){weightedSlice.sliceGoal=null;weightedSlice.sliceBottleId=null;Math.random=()=>(i+.5)/100;sliceGoal(weightedSlice);if(weightedSlice.sliceGoal==='player')chosenPlayers++}");assert.equal(run('chosenPlayers'),expectedPlayer);}
    finally{run('Math.random=weightedRandom');}
  }
});
milkTest('Only landed slices enter bottles, hopping freezes on pause and damage interrupts the hop',()=>{
  run("enemies=[];milkBottles=[];player.x=300;var hopper=spawn(0,'slice',{x:0,y:0});hopper.sliceGoal='player';moveMilkEnemy(hopper,.2);spawnMilkBottle({x:hopper.x,y:hopper.y});updateMilkClaims(1)");assert.equal(run('hopper.type'),'slice');assert.equal(run('hopper.drinking||0'),0);
  run('spawnClock=999;var hopPausedAt=hopper.sliceHop.t;pause();update(1)');assert.equal(run('hopper.sliceHop.t'),run('hopPausedAt'));
  run('pause();hitEnemy(hopper,false)');assert.equal(run('hopper.sliceHop'),null);assert.equal(run('hopper.z'),0);
});
milkTest('Milk supplies start with two and add a pair every ten seconds through the survival phase',()=>{
  assert.equal(run('milkBottles.length'),2);run('enemies=[];player.x=1000;player.y=1000;elapsed=9.99;updateMilkStage(.01,null)');assert.equal(run('milkBottles.length'),2);
  run('elapsed=10;updateMilkStage(.01,null)');assert.equal(run('milkBottles.length'),4);run('updateMilkStage(.01,null)');assert.equal(run('milkBottles.length'),4);
  run('elapsed=20;updateMilkStage(.01,null)');assert.equal(run('milkBottles.length'),6);
  run('elapsed=59;updateMilkStage(.01,null)');assert.equal(run('milkBottles.length'),12);
  run('beginGiantBattle();elapsed=70;updateMilkStage(.01,null)');assert.equal(run('milkBottles.length'),0);
});
milkTest('Straight slice flight locks its overshoot endpoint and uses the original flight speed, including short shots',()=>{
  for(const [at,x] of [[0,300],[30,10],[50,800]]){
    context.straightAt=at;context.straightX=x;run("enemies=[];milkBottles=[];elapsed=straightAt;player.x=straightX;player.y=0;var straightSlice=spawn(0,'slice',{x:0,y:0});launchSliceFlight(straightSlice,32);var straightLocked={...straightSlice.sliceFlight}");
    const distance=run('straightLocked.bx');assert.ok(Math.abs(run('straightLocked.duration')-Math.max(.42,distance/460))<1e-8);
    run('player.x=-500;player.y=500;moveMilkEnemy(straightSlice,straightLocked.duration*.5)');assert.ok(Math.abs(run('straightSlice.x')-distance*.5)<1e-8);assert.equal(run('straightSlice.y'),0);assert.ok(run('straightSlice.z')<100);
    run('moveMilkEnemy(straightSlice,straightLocked.duration*.5+.001)');assert.equal(run('straightSlice.sliceFlight'),null);assert.equal(run('straightSlice.x'),run('straightLocked.bx'));assert.equal(run('straightSlice.z'),0);
  }
});
milkTest('Straight projectiles stay inside the arena, freeze on pause and return to normal bottle seeking on landing',()=>{
  run("enemies=[];milkBottles=[];player.x=1250;player.y=1250;var edgeShot=spawn(0,'slice',{x:1000,y:1000});launchSliceFlight(edgeShot,16)");assert.ok(run('Math.abs(edgeShot.sliceFlight.bx)<=arenaSize-35&&Math.abs(edgeShot.sliceFlight.by)<=arenaSize-35'));
  run('var straightPaused=edgeShot.sliceFlight.t;pause();update(1)');assert.equal(run('edgeShot.sliceFlight.t'),run('straightPaused'));run('pause();moveMilkEnemy(edgeShot,edgeShot.sliceFlight.duration)');assert.equal(run('edgeShot.sliceFlight'),null);
  run("spawnMilkBottle({x:edgeShot.x,y:edgeShot.y});edgeShot.sliceGoal='bottle';edgeShot.sliceBottleId=milkBottles[0].id;edgeShot.sliceBottleRevision=milkBottleRevision;updateMilkClaims(.91)");assert.equal(run('edgeShot.type'),'milk');
});
milkTest('Offscreen player-seeking slices rally into a pillar and resume straight firing without extra enemies or rewards',()=>{
  run("enemies=[];milkBottles=[];spawnClock=999;nextMilkAt=999;player.inv=99;serial=0;var rallyBase=spawn(0,'slice',{x:-800,y:0}),rallyA=spawn(0,'slice',{x:-740,y:0}),rallyB=spawn(0,'slice',{x:-680,y:0});for(const e of enemies)e.sliceGoal='player';updateOffscreenSliceRallies()");assert.equal(run('rallyBase.sliceRallyId'),run('rallyBase.id'));assert.equal(run('rallyA.sliceRallyId'),run('rallyBase.id'));
  run('moveMilkEnemy(rallyA,.1)');assert.ok(run('rallyA.x')< -740);run('moveMilkEnemy(rallyBase,.1)');assert.equal(run('rallyBase.x'),-800);
  run('for(let i=0;i<300&&(rallyBase.stackCount||1)<3;i++)update(1/60)');assert.equal(run('rallyBase.stackCount'),3);assert.equal(run('milkPopulation()'),3);assert.equal(run('kills'),0);assert.equal(run('charge'),0);
  run('moveMilkEnemy(rallyBase,2)');assert.ok(run('enemies.some(e=>e.sliceFlight)'));assert.equal(run('milkPopulation()'),3);
});
milkTest('Visible slices and bottle seekers are not selected, while already selected groups stay locked when the camera moves',()=>{
  run("enemies=[];milkBottles=[];var keptBottle=spawnMilkBottle({x:-750,y:0});var visibleRally=spawn(0,'slice',{x:200,y:0}),bottleRally=spawn(0,'slice',{x:-760,y:0}),outsideRally=spawn(0,'slice',{x:-800,y:0});visibleRally.sliceGoal=outsideRally.sliceGoal='player';bottleRally.sliceGoal='bottle';bottleRally.sliceBottleId=keptBottle.id;bottleRally.sliceBottleRevision=milkBottleRevision;updateOffscreenSliceRallies()");assert.equal(run('visibleRally.sliceRallyId'),null);assert.equal(run('bottleRally.sliceRallyId'),null);assert.equal(run('outsideRally.sliceRallyId'),null);
  run("var secondOutside=spawn(0,'slice',{x:-830,y:0});secondOutside.sliceGoal='player';secondOutside.sliceBottleRevision=milkBottleRevision;outsideRally.sliceGoal='player';outsideRally.sliceBottleRevision=milkBottleRevision;updateOffscreenSliceRallies()");assert.ok(run('outsideRally.sliceRallyId'));run('var chosenRally=outsideRally.sliceRallyId;player.x=-800;updateOffscreenSliceRallies()');assert.equal(run('outsideRally.sliceRallyId'),run('chosenRally'));
});
milkTest('Offscreen rallies reserve one group until firing completes and camera or new bottles cannot unlock it',()=>{
  run("enemies=[];milkBottles=[];elapsed=10;for(let i=0;i<9;i++){const e=spawn(0,'slice',{x:-900-i*30,y:0});e.sliceGoal='player'}updateOffscreenSliceRallies();var firstLockedGroup=sliceRallies[0],firstLockedIds=JSON.stringify(firstLockedGroup.memberIds),lockedBase=enemies.find(e=>e.id===firstLockedGroup.baseId)");assert.equal(run('sliceRallies.length'),1);
  run('player.x=lockedBase.x;spawnMilkBottle({x:lockedBase.x,y:0});updateOffscreenSliceRallies()');assert.equal(run('sliceRallies[0]'),run('firstLockedGroup'));assert.equal(run('JSON.stringify(sliceRallies[0].memberIds)'),run('firstLockedIds'));assert.ok(run('firstLockedGroup.memberIds.every(id=>{const e=enemies.find(e=>e.id===id);return sliceGoal(e)===player})'));assert.ok(run('recyclableNaturalEnemies().every(e=>!firstLockedGroup.memberIds.includes(e.id))'));
  run('for(const id of firstLockedGroup.memberIds){const e=enemies.find(e=>e.id===id);e.x=lockedBase.x;e.y=lockedBase.y;e.z=0;e.sliceHop=null}updateOffscreenSliceRallies()');assert.equal(run('lockedBase.stackCount'),3);assert.equal(run('firstLockedGroup.ready'),true);
  run('moveMilkEnemy(lockedBase,2);updateOffscreenSliceRallies()');assert.equal(run('lockedBase.stackCount'),2);assert.equal(run('sliceRallies[0]'),run('firstLockedGroup'));
  run('moveMilkEnemy(lockedBase,1);updateOffscreenSliceRallies()');assert.equal(run('lockedBase.stackCount'),1);assert.equal(run('sliceRallies.includes(firstLockedGroup)'),false);
});
milkTest('The final ten seconds allow two disjoint locked rallies, while earlier play allows only one',()=>{
  run("enemies=[];milkBottles=[];elapsed=49.99;for(let i=0;i<9;i++){const e=spawn(0,'slice',{x:-900-i*30,y:0});e.sliceGoal='player'}updateOffscreenSliceRallies()");assert.equal(run('sliceRallies.length'),1);
  run('elapsed=50;updateOffscreenSliceRallies()');assert.equal(run('sliceRallies.length'),2);assert.equal(run('new Set(sliceRallies.flatMap(g=>g.memberIds)).size'),6);
  run('updateOffscreenSliceRallies()');assert.equal(run('sliceRallies.length'),2);run('reset()');assert.equal(run('sliceRallies.length'),0);
});
milkTest('Stack hits remove one slice without duplicating health or kill rewards',()=>{
  run('enemies=[];milkBottles=[];var hitStack=spawnSliceStack(0,{x:100,y:0});hitEnemy(hitStack,true)');assert.equal(run('hitStack.hp'),2);assert.equal(run('hitStack.stackCount'),2);assert.equal(run('kills'),1);assert.equal(run('stats.stompKills'),1);assert.equal(run('milkPopulation()'),2);
  run('hitStack.hit=0;hitEnemy(hitStack,false);hitStack.hit=0;hitEnemy(hitStack,false)');assert.equal(run('hitStack.hp'),0);assert.equal(run('kills'),3);assert.equal(run('peels.length'),0);
});
milkTest('Flying slices hurt on contact but cannot be stomped or enter bottles until they land',()=>{
  run("enemies=[];milkBottles=[];spawnClock=999;player.x=0;spawnMilkBottle({x:0,y:0});var airborneSlice=spawn(0,'slice',{x:0,y:0});launchSliceFlight(airborneSlice,0);airborneSlice.sliceFlight.bx=0;airborneSlice.sliceFlight.by=0;updateMilkClaims(1)");assert.equal(run('airborneSlice.type'),'slice');assert.equal(run('hitEnemy(airborneSlice,true)'),false);
  run('milkBottles=[];update(.02)');assert.equal(run('player.hp'),4);
  run('moveMilkEnemy(airborneSlice,airborneSlice.sliceFlight.duration)');assert.equal(run('airborneSlice.sliceFlight'),null);assert.equal(run('hitEnemy(airborneSlice,true)'),true);
});
milkTest('Stack shots and deep-green charger windups share charge feedback only while attacks are preparing',()=>{
  run("enemies=[];var chargedStack=spawnSliceStack(0,{x:300,y:0});chargedStack.stackTime=.5");assert.equal(run('enemyChargeProgress(chargedStack)'),.5);
  run('chargedStack.stackCount=2;chargedStack.stackTime=2.5;chargedStack.nextSliceShot=3');assert.equal(run('enemyChargeProgress(chargedStack)'),.5);
  run('chargedStack.stackCount=1;chargedStack.stackAnchor=false');assert.equal(run('enemyChargeProgress(chargedStack)'),null);
  run("var chargedGreen=spawn(0,'charger',{x:300,y:0});chargedGreen.phase='aim';chargedGreen.phaseTime=.25");assert.equal(run('enemyChargeProgress(chargedGreen)'),.5);
  for(const phase of ['approach','dash','brake','turn']){context.chargePhase=phase;run('chargedGreen.phase=chargePhase');assert.equal(run('enemyChargeProgress(chargedGreen)'),null);}
  for(const flag of ['down','knock','hit']){context.chargeFlag=flag;run("chargedGreen.phase='aim';chargedGreen[chargeFlag]=.2");assert.equal(run('enemyChargeProgress(chargedGreen)'),null);run('chargedGreen[chargeFlag]=0');}
});
test('Rocket spray has a strong low engine body, follows shared output and cleans up its audio nodes',()=>{
  run(`var jetAudioSaved={context:audioCtx,output:audioOutput,sound};var jetCaptured=null,jetDisconnects=0,jetPeak=0,jetConnected=false;
    var jetBus={};audioCtx={currentTime:100,sampleRate:22050,state:'running',
      createBuffer:(_c,n)=>{const data=new Float32Array(n);return {getChannelData:()=>data}},
      createBufferSource:()=>{jetCaptured={connect(){},disconnect(){jetDisconnects++},start(){},stop(){}};return jetCaptured},
      createBiquadFilter:()=>({frequency:{setValueAtTime(){}},connect(){},disconnect(){jetDisconnects++}}),
      createGain:()=>({gain:{setValueAtTime(v){jetPeak=Math.max(jetPeak,v)},exponentialRampToValueAtTime(v){jetPeak=Math.max(jetPeak,v)}},connect(target){jetConnected=target===jetBus},disconnect(){jetDisconnects++}})
    };audioOutput={context:audioCtx,input:jetBus};sound=false;lastSfx.delete('milkJet');sfx('milkJet');`);
  try{
    assert.equal(run('jetCaptured'),null);run("sound=true;sfx('milkJet')");assert.ok(run('jetConnected'));assert.ok(run('jetPeak')>.08);
    run(`var jetData=jetCaptured.buffer.getChannelData(0);var jetAmplitude=f=>{let sin=0,cos=0;for(let i=0;i<jetData.length;i++){const a=2*Math.PI*f*i/22050;sin+=jetData[i]*Math.sin(a);cos+=jetData[i]*Math.cos(a)}return 2*Math.hypot(sin,cos)/jetData.length}`);
    assert.ok(run('jetAmplitude(70)')>.3);assert.ok(run('jetAmplitude(140)')>.1);assert.ok(run('jetAmplitude(3000)')<.04);
    run('jetCaptured.onended()');assert.equal(run('jetDisconnects'),3);
  }finally{run("audioCtx=jetAudioSaved.context;audioOutput=jetAudioSaved.output;sound=jetAudioSaved.sound;lastSfx.delete('milkJet')");}
});
milkTest('Milk thrust keeps a filled water column and splash without a thin stroked center line',()=>{
  run("milkPack={ammo:5,spraying:true};player.z=108;var columnMethods={},columnStrokes=0,columnFills=0;for(const key of ['save','restore','createLinearGradient','beginPath','moveTo','bezierCurveTo','quadraticCurveTo','closePath','fill','stroke','ellipse']){columnMethods[key]=ctx[key];ctx[key]=key==='createLinearGradient'?()=>({addColorStop(){}}):key==='stroke'?()=>columnStrokes++:key==='fill'?()=>columnFills++:()=>{}};");
  try{run('drawPlayerMilkColumn()');assert.equal(run('columnStrokes'),0);assert.ok(run('columnFills')>=6);}finally{run('for(const key in columnMethods)ctx[key]=columnMethods[key]');}
});
milkTest('Player milk pulses request the dedicated spray sound and the fuel bar draws no percentage text',()=>{
  run("milkDrops=[];player.z=108;var savedMilkSfx=sfx;var milkSoundNames=[];sfx=name=>milkSoundNames.push(name);emitPlayerMilkJet();sfx=savedMilkSfx");assert.ok(run("milkSoundNames.includes('milkJet')"));
  run("var gaugeSaved={};var gaugeText=[];var gaugeWidths=[];for(const key of ['save','restore','translate','beginPath','roundRect','fill','fillRect','fillText']){gaugeSaved[key]=ctx[key];ctx[key]=key==='fillText'?(text)=>gaugeText.push(text):key==='fillRect'?(x,y,w,h)=>gaugeWidths.push(w):()=>{};}milkPack={ammo:2.5};drawMilkAmmo();for(const key in gaugeSaved)ctx[key]=gaugeSaved[key]");assert.equal(run('gaugeText.length'),0);assert.ok(run('gaugeWidths.includes(26)'));

});
milkTest('Late minion pressure increases hop distance and reduces rest even at the population cap, without affecting giants',()=>{
  for(const [at,stride,wait] of [[0,60,.5],[30,80,.4],[50,100,.25]]){
    context.pressureAt=at;run("enemies=[];milkBottles=[];elapsed=pressureAt;player.x=1000;player.y=0;var pressureSlice=spawn(0,'slice',{x:0,y:0});pressureSlice.speed=100;pressureSlice.sliceGoal='player';for(let i=0;i<49;i++)spawn(0,'slice',{x:-1000,y:1000});moveMilkEnemy(pressureSlice,.01)");
    assert.equal(run('milkPopulation()'),50);assert.equal(run('pressureSlice.sliceHop.bx'),stride);run('moveMilkEnemy(pressureSlice,.63)');assert.equal(run('pressureSlice.sliceHopWait'),wait);assert.equal(run('sliceRules.hopDuration'),.63);
  }
  run('enemies=[];beginGiantBattle()');assert.equal(run('milkPressure().hopWait'),.5);assert.equal(run('milkPressure().stride'),.6);
});
milkTest('Final ten seconds show the large countdown and hide it during pauses and giant battles',()=>{
  for(const [at,text,hidden] of [[49.99,'',true],[50,'10',false],[55,'5',false],[59.9,'1',false]]){context.finalAt=at;run('elapsed=finalAt;updateHUD()');assert.equal(element('finalCountdown').textContent,text);assert.equal(element('finalCountdown').hidden,hidden);}
  run('pause()');assert.equal(element('finalCountdown').hidden,true);run('pause()');assert.equal(element('finalCountdown').hidden,false);
  run('enemies=[];elapsed=59.99;update(.02);updateHUD()');assert.equal(element('finalCountdown').hidden,true);assert.ok(run('giantBattle'));
});
milkTest('Single slices rest on the ground for 0.5 seconds between hops',()=>{
  run("enemies=[];milkBottles=[];player.x=500;var restingSlice=spawn(0,'slice',{x:0,y:0});restingSlice.sliceGoal='player';restingSlice.speed=100;moveMilkEnemy(restingSlice,.315);moveMilkEnemy(restingSlice,.315);var restX=restingSlice.x");
  assert.equal(run('restingSlice.sliceHop'),null);assert.equal(run('restingSlice.sliceHopWait'),.5);
  run('moveMilkEnemy(restingSlice,.2);moveMilkEnemy(restingSlice,.29)');assert.equal(run('restingSlice.x'),run('restX'));assert.equal(run('restingSlice.z'),0);assert.equal(run('restingSlice.sliceHop'),null);
  run('moveMilkEnemy(restingSlice,.02)');assert.ok(run('restingSlice.sliceHop'));assert.ok(run('restingSlice.x')>run('restX'));
});
milkTest('Single slices visibly prepare during the last 0.2 seconds of their grounded rest and stop on takeoff',()=>{
  run("enemies=[];milkBottles=[];player.x=500;var preparingSlice=spawn(0,'slice',{x:0,y:0});preparingSlice.sliceGoal='player';moveMilkEnemy(preparingSlice,.315);moveMilkEnemy(preparingSlice,.315)");assert.equal(run('sliceHopPreparation(preparingSlice)'),0);
  run('moveMilkEnemy(preparingSlice,.4)');assert.ok(Math.abs(run('sliceHopPreparation(preparingSlice)')-.5)<1e-8);assert.equal(run('preparingSlice.z'),0);
  for(const flag of ['down','knock','hit','drinking']){context.prepFlag=flag;run('preparingSlice[prepFlag]=.1');assert.equal(run('sliceHopPreparation(preparingSlice)'),0);run('preparingSlice[prepFlag]=0');}
  run('moveMilkEnemy(preparingSlice,.11)');assert.ok(run('preparingSlice.sliceHop'));assert.equal(run('sliceHopPreparation(preparingSlice)'),0);
});
milkTest('Single slices hop for 0.63 seconds with a fixed stride, and jumping bodies hurt on contact',()=>{
  run("enemies=[];milkBottles=[];spawnClock=999;player.x=200;var slowHop=spawn(0,'slice',{x:0,y:0});slowHop.sliceGoal='player';slowHop.speed=100;moveMilkEnemy(slowHop,.315)");assert.equal(run('sliceRules.hopDuration'),.63);assert.ok(Math.abs(run('slowHop.z')-48)<1e-8);assert.equal(run('slowHop.sliceHop.bx'),60);run('moveMilkEnemy(slowHop,.315)');assert.equal(run('slowHop.sliceHop'),null);
  run("enemies=[];player.x=0;player.y=0;player.z=0;var bodyHop=spawn(0,'slice',{x:0,y:0});bodyHop.sliceGoal='player';moveMilkEnemy(bodyHop,.315);update(.01)");assert.equal(run('player.hp'),4);run('update(.01)');assert.equal(run('player.hp'),4);
});
milkTest('Straight flying slices sweep contact but respect lateral misses, height and protection',()=>{
  for(const [y,z,inv,expected] of [[0,0,0,4],[80,0,0,5],[0,300,0,5],[0,0,1,5]]){
    context.collisionY=y;context.collisionZ=z;context.collisionInv=inv;run("reset();enemies=[];milkBottles=[];spawnClock=999;player.inv=collisionInv;var crossingSlice=spawn(0,'slice',{x:-120,y:collisionY});crossingSlice.z=collisionZ;crossingSlice.sliceFlight={t:0,duration:.1,ax:-120,ay:collisionY,bx:120,by:collisionY,startZ:collisionZ};update(.1)");assert.equal(run('player.hp'),expected);
  }
});
milkTest('Descending onto a hopping slice still stomps safely before contact damage',()=>{
  run("enemies=[];milkBottles=[];spawnClock=999;player.z=75;player.vz=-100;var stompHop=spawn(0,'slice',{x:0,y:0});stompHop.sliceGoal='player';moveMilkEnemy(stompHop,.315);update(.01)");assert.equal(run('stompHop.hp'),0);assert.equal(run('player.hp'),5);assert.ok(run('player.vz')>0);
});
test('Main menu launches either named independent boss battle without debug and retries 蕉片崛起',()=>{
  run("debugUnlocked=false;$('debugStart').value='120';$('gameMode').value='milk-boss';reset(true)");assert.equal(run('milkStage'),true);assert.equal(run('elapsed'),60);assert.equal(run('liveGiants().length'),2);assert.equal(run('boss'),null);assert.equal(run('boxSequence'),null);assert.equal(run('enemies.length'),0);
  run('reset(true)');assert.equal(run('liveGiants().length'),2);assert.equal(run('giantBattle.clock'),0);
  run("$('gameMode').value='boss';reset(true)");assert.equal(run('milkStage'),false);assert.ok(run('boss'));assert.equal(run('giantBattle'),null);assert.equal(run('boxSequence'),null);
  run("$('gameMode').value='survival';reset()");
});
test('Internal milk-boss shortcut launches 蕉片崛起 giants only when debug is unlocked',()=>{
  for(const mode of ['survival','milk']){
    context.giantDebugMode=mode;run("debugUnlocked=true;$('gameMode').value=giantDebugMode;$('debugStart').value='milk-boss';reset(true)");assert.equal(run('milkStage'),true);assert.equal(run('elapsed'),60);assert.ok(run('giantBattle'));assert.equal(run('liveGiants().length'),2);assert.equal(run('boxSequence'),null);assert.equal(run('enemies.length'),0);assert.equal(run('boss'),null);
  }
  run("debugUnlocked=false;$('gameMode').value='survival';reset()");assert.equal(run('giantBattle'),null);assert.equal(run('milkStage'),false);assert.equal(run('elapsed'),0);run("$('debugStart').value='120';reset()");
});
milkTest('Natural spawning reserves a complete stack and reclaims only enough farthest slices at materialization',()=>{
  run("enemies=[];milkBottles=[];for(let i=0;i<48;i++)spawn(0,'slice',{x:150,y:150});spawnClock=0;elapsed=1;update(.01)");assert.equal(run('milkPopulation()'),48);assert.equal(run('spawnWarnings.length'),1);
  run('spawnClock=999;updateNaturalArrivals(.81)');assert.equal(run('milkPopulation()'),50);assert.equal(run('enemies.at(-1).stackCount'),3);
});
milkTest('Desktop and mobile 蕉片崛起 survive the full sixty-second minion phase',()=>{
  for(const mobile of [false,true]){
    context.milkMobile=mobile;run("window.matchMedia=()=>({matches:milkMobile});reset();invincibleMode=true;for(let i=0;i<3601&&state==='playing';i++)update(1/60)");
    assert.equal(run('state'),'playing');assert.equal(run('boss'),null);assert.ok(run('giantBattle'));assert.ok(run('enemies.length')<=50);assert.ok(run('milkPopulation()')<=50);assert.ok(run('milkBottles.length')<=12);assert.ok(run('milkDrops.length')<100);assert.ok(run('enemies.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y))'));assert.equal(run('pickups.length'),0);assert.equal(run('surfPickups.length'),0);
  }
});

milkTest('蕉片崛起 minion phase transitions to a frozen giant entrance from the first falling parts',()=>{
  run('elapsed=50;enemies=[];spawnClock=999;update(.01)');assert.equal(run("enemies.some(e=>e.type==='hound')"),false);
  run("var formerSlice=spawnSliceStack(0,{x:100,y:0});elapsed=59.99;update(.02)");assert.ok(run('isGiantCeremony()'));assert.equal(run('enemies.length'),0);assert.equal(run('giantBattle.fallen.length'),3);assert.equal(run('milkBottles.length'),0);assert.equal(run('milkDrops.length'),0);
  run("keys.add('d');var assemblyX=player.x;var assemblyMinion=spawn(0,'slice',{x:500,y:500});hurt('assembly');var assemblyTarget=liveGiants()[0];player.giantBoostUntil=99;update(.2)");assert.equal(run('player.x'),run('assemblyX'));assert.equal(run('player.hp'),5);assert.equal(run('hitEnemy(assemblyMinion,true)'),false);assert.equal(run('hitGiant(assemblyTarget)'),false);
  run('keys.clear();update(3.1)');assert.equal(run('isGiantCeremony()'),false);assert.equal(run('assemblyTarget.forming'),false);
});
milkTest('Orbiting pads rotate clockwise, hurt on the ground, and boost descending jumps',()=>{
  run('enemies=[];beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var orbitGiant=liveGiants()[0];orbitGiant.x=0;orbitGiant.y=0;orbitGiant.angle=0;var orbitBefore=giantPads(orbitGiant)[0];updateGiantBattle(.2);var orbitAfter=giantPads(orbitGiant)[0]');assert.ok(run('orbitAfter.y')>run('orbitBefore.y'));
  run('player.x=orbitAfter.x;player.y=orbitAfter.y;player.z=0;player.inv=0;giantContacts()');assert.equal(run('player.hp'),4);
  run('player.down=0;player.z=25;player.vz=-100');assert.equal(run('resolveGiantLanding(35,25)'),true);assert.equal(run('player.vz'),520);assert.ok(run('player.giantBoostUntil')>run('giantBattle.clock'));
});
milkTest('Giant shield cycle is six idle, two charge, two out, one return and one recover seconds',()=>{
  run('enemies=[];beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var attackGiant=liveGiants()[0];attackGiant.x=0;attackGiant.y=0;attackGiant.angle=0;updateGiantAttack(attackGiant,6)');assert.equal(run('attackGiant.attackPhase'),'charge');assert.equal(run('giantPadRadius(attackGiant)'),102);
  run('var chargeAngle=attackGiant.angle;updateGiantAttack(attackGiant,1)');assert.equal(run('attackGiant.attackPhase'),'charge');assert.ok(run('(attackGiant.angle-chargeAngle+TAU)%TAU')>.55);
  run('updateGiantAttack(attackGiant,1)');assert.equal(run('attackGiant.attackPhase'),'out');run('updateGiantAttack(attackGiant,1)');assert.ok(Math.abs(run('giantPadRadius(attackGiant)')-216)<1e-6);assert.ok(run('attackGiant.padSweeps.length')>0);
  run('updateGiantAttack(attackGiant,1)');assert.equal(run('attackGiant.attackPhase'),'return');assert.equal(run('giantPadRadius(attackGiant)'),330);
  run('updateGiantAttack(attackGiant,.5)');assert.ok(Math.abs(run('giantPadRadius(attackGiant)')-216)<1e-6);assert.equal(run('attackGiant.padSweeps.length'),0);
  run('updateGiantAttack(attackGiant,.5)');assert.equal(run('attackGiant.attackPhase'),'recover');assert.equal(run('giantPadRadius(attackGiant)'),102);
  run('updateGiantAttack(attackGiant,1)');assert.equal(run('attackGiant.attackPhase'),'idle');assert.equal(run('attackGiant.attackTime'),0);
});
milkTest('Giant body rises out of view, lands at a fixed viewport site, then shields return continuously',()=>{
  run("enemies=[];beginGiantBattle();updateGiantBattle(4.2);var skyGiant=liveGiants()[0];skyGiant.x=0;skyGiant.y=0;skyGiant.attackPhase='charge';skyGiant.attackTime=1.99;updateGiantAttack(skyGiant,.01);var skySite={...skyGiant.jumpLanding},skyBounds=giantSiteBounds()");
  assert.ok(run('skySite.x>=skyBounds.left&&skySite.x<=skyBounds.right&&skySite.y>=skyBounds.top&&skySite.y<=skyBounds.bottom'));
  run('updateGiantAttack(skyGiant,.7);var skyPose=giantBodyPose(skyGiant)');assert.equal(run('skyPose.x'),run('skySite.x'));assert.ok(run('screen(skyPose.x,skyPose.y,skyPose.z).y')<0);
  run('updateGiantAttack(skyGiant,1.3);var returnPads=giantPads(skyGiant)');assert.equal(run('skyGiant.attackPhase'),'return');assert.equal(run('skyGiant.x'),run('skySite.x'));assert.equal(run('giantBodyPose(skyGiant).z'),0);assert.equal(run('skyGiant.landingImpact'),true);
  assert.ok(run('returnPads.every(p=>Math.abs(Math.hypot(p.x-skyGiant.jumpLaunch.x,p.y-skyGiant.jumpLaunch.y)-330)<1e-7)'));
  run('updateGiantAttack(skyGiant,1)');assert.equal(run('skyGiant.attackPhase'),'recover');assert.equal(run('skyGiant.jumpLaunch'),null);assert.ok(run('giantBodyParts(skyGiant).every(p=>p.x===skyGiant.x&&p.y===skyGiant.y)'));
});
milkTest('Sky-drop roles follow body count: strongest targets the snapshot, weakest retreats and the third is random',()=>{
  run('enemies=[];beginGiantBattle();updateGiantBattle(4.2);formGiant();updateGiantBattle(4.2);var roleGiants=liveGiants();roleGiants[0].hp=2;roleGiants[1].hp=1;roleGiants[2].hp=3;player.x=100;player.y=80;roleGiants.forEach(g=>beginGiantSkyDrop(g));var lockedSite={...roleGiants[2].jumpLanding};var roleBounds=giantSiteBounds()');
  assert.equal(run('roleGiants[2].landingRole'),'chase');assert.equal(run('roleGiants[2].jumpLanding.x'),100);assert.equal(run('roleGiants[2].jumpLanding.y'),80);
  assert.equal(run('roleGiants[1].landingRole'),'retreat');assert.ok(run('[{x:roleBounds.left,y:roleBounds.top},{x:roleBounds.right,y:roleBounds.top},{x:roleBounds.left,y:roleBounds.bottom},{x:roleBounds.right,y:roleBounds.bottom}].every(p=>dist(p,player)<=dist(roleGiants[1].jumpLanding,player)+1e-8)'));
  assert.equal(run('roleGiants[0].landingRole'),'random');assert.ok(run('roleGiants[0].jumpLanding.x>=roleBounds.left&&roleGiants[0].jumpLanding.x<=roleBounds.right&&roleGiants[0].jumpLanding.y>=roleBounds.top&&roleGiants[0].jumpLanding.y<=roleBounds.bottom'));
  run('player.x+=200;player.y+=200');assert.equal(run('roleGiants[2].jumpLanding.x'),100);assert.equal(run('roleGiants[2].jumpLanding.y'),80);
  run('roleGiants[0].hp=3;roleGiants[2].hp=1;roleGiants.forEach(g=>beginGiantSkyDrop(g))');assert.equal(run('roleGiants[0].landingRole'),'chase');assert.equal(run('roleGiants[2].landingRole'),'retreat');
});
milkTest('Equal body counts divide roles by spawn order and a single surviving giant targets the player',()=>{
  run('enemies=[];beginGiantBattle();updateGiantBattle(4.2);var equalGiants=liveGiants();equalGiants.forEach(g=>beginGiantSkyDrop(g))');assert.equal(run('equalGiants[0].landingRole'),'chase');assert.equal(run('equalGiants[1].landingRole'),'retreat');
  run('equalGiants[0].hp=0;beginGiantSkyDrop(equalGiants[1])');assert.equal(run('equalGiants[1].landingRole'),'chase');
});
milkTest('Airborne bodies cannot be hit from the ground, but landed bodies take ultimate before shield assembly finishes',()=>{
  run("enemies=[];milkBottles=[];beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var fallingGiant=liveGiants()[0];fallingGiant.x=fallingGiant.y=0;fallingGiant.attackPhase='out';fallingGiant.attackTime=.8;fallingGiant.jumpLaunch={x:0,y:0};fallingGiant.jumpLanding={x:100,y:80};player.x=100;player.y=80;player.z=0;charge=100;activate();special.speed=0;update(.01)");assert.equal(run('fallingGiant.hp'),3);
  run("special=null;fallingGiant.attackPhase='out';fallingGiant.attackTime=1.99;updateGiantAttack(fallingGiant,.01);player.x=100;player.y=80;player.z=0;player.inv=0;giantContacts()");assert.equal(run('player.hp'),4);
  run('player.down=0;player.inv=0;player.hp=5;player.giantBoostUntil=giantBattle.clock+2.5;player.vz=-100');assert.equal(run('resolveGiantLanding(120,110)'),false);
  run('charge=100;activate();special.speed=0;update(.01)');assert.equal(run('fallingGiant.hp'),2);assert.equal(run('player.hp'),5);
});
milkTest('Only outward shield travel hurts, including swept paths, while return and jumping safely avoid damage',()=>{
  run("enemies=[];beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var dangerGiant=liveGiants()[0];dangerGiant.x=0;dangerGiant.y=0;dangerGiant.angle=0;dangerGiant.attackPhase='out';dangerGiant.attackTime=.7;updateGiantAttack(dangerGiant,.15);var shieldSweep=dangerGiant.padSweeps[0];player.x=(shieldSweep.ax+shieldSweep.bx)/2;player.y=(shieldSweep.ay+shieldSweep.by)/2;player.z=0;player.inv=0;giantContacts()");assert.equal(run('player.hp'),4);
  run('player.inv=0;player.z=140;giantContacts()');assert.equal(run('player.hp'),4);
  run("dangerGiant.attackPhase='return';dangerGiant.attackTime=.5;updateGiantAttack(dangerGiant,.1);var returningShield=giantPads(dangerGiant)[0];player.x=returningShield.x;player.y=returningShield.y;player.z=0;player.inv=0;giantContacts()");assert.equal(run('player.hp'),4);
  run("dangerGiant.attackPhase='out';dangerGiant.attackTime=1.99;updateGiantAttack(dangerGiant,.02);var firstReturnPad=giantPads(dangerGiant)[0];player.x=firstReturnPad.x;player.y=firstReturnPad.y;player.z=0;player.inv=0;giantContacts()");assert.equal(run('dangerGiant.attackPhase'),'return');assert.equal(run('player.hp'),4);
  run("dangerGiant.attackPhase='charge';dangerGiant.attackTime=0;player.x=600;player.y=600;var stillX=dangerGiant.x,stillY=dangerGiant.y;updateGiantBattle(.2)");assert.equal(run('dangerGiant.x'),run('stillX'));assert.equal(run('dangerGiant.y'),run('stillY'));
  run('pause();var frozenAttack=dangerGiant.attackTime;update(2)');assert.equal(run('dangerGiant.attackTime'),run('frozenAttack'));
});
milkTest('Stacked slices and giant heads use the necromancer protected outward bounce without the normal minion rebound overriding it',()=>{
  for(const mobile of [false,true]){
    context.bounceMobile=mobile;run("window.matchMedia=()=>({matches:bounceMobile});reset();enemies=[];milkBottles=[];spawnClock=999;player.z=44;player.vz=-120;var bouncingStack=spawnSliceStack(0,{x:0,y:0});update(.02)");assert.equal(run('bouncingStack.hp'),2);assert.equal(run('player.recoil'),.7);assert.equal(run('player.vz'),200);assert.ok(run('player.inv')>=1);assert.equal(run('playerDamageBlink()'),false);assert.ok(Math.abs(run('Math.hypot(player.recoilX,player.recoilY)')-420*(mobile?.7:1))<1e-8);
    run('var bounceY=player.y;update(.2)');assert.ok(run('player.y')>run('bounceY'));assert.equal(run('player.hp'),5);
    run('reset();enemies=[];beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var bouncingGiant=liveGiants()[0];player.giantBoostUntil=giantBattle.clock+2;hitGiant(bouncingGiant)');assert.equal(run('player.recoil'),.7);assert.equal(run('player.vz'),200);assert.ok(run('player.inv')>=1);assert.equal(run('playerDamageBlink()'),false);
  }
});
milkTest('Electric walls connect shield edges, defeat normal jump and jet heights, and permit boosted clearance',()=>{
  run('enemies=[];beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var wallGiant=liveGiants()[0];wallGiant.x=0;wallGiant.y=0;wallGiant.angle=0;player.x=51;player.y=51;player.z=74;player.inv=0;giantContacts()');assert.equal(run('player.hp'),4);
  run('player.hp=5;player.down=0;player.inv=0;player.z=108;giantContacts()');assert.equal(run('player.hp'),4);
  run('player.hp=5;player.down=0;player.inv=0;player.giantBoostUntil=giantBattle.clock+2;player.z=140;giantContacts()');assert.equal(run('player.hp'),5);
  run("wallGiant.attackPhase='return';wallGiant.attackTime=.5;player.z=0;var wallReturn=giantPads(wallGiant);player.x=(wallReturn[0].x+wallReturn[1].x)/2;player.y=(wallReturn[0].y+wallReturn[1].y)/2;giantContacts()");assert.equal(run('player.hp'),5);
});
milkTest('Light walls vanish during outgoing shields and return, leaving outgoing pad collision active',()=>{
  run("enemies=[];beginGiantBattle();updateGiantBattle(4.2);var lightGiant=liveGiants()[0];lightGiant.x=0;lightGiant.y=0;lightGiant.angle=0;lightGiant.attackPhase='out';lightGiant.attackTime=.7;player.inv=0;player.z=0;var lightPads=giantPads(lightGiant);player.x=(lightPads[0].x+lightPads[1].x)/2;player.y=(lightPads[0].y+lightPads[1].y)/2;giantWallContacts(lightGiant)");assert.equal(run('player.hp'),5);assert.equal(run('giantWallsActive(lightGiant)'),false);
  run('player.x=lightPads[0].x;player.y=lightPads[0].y;giantContacts()');assert.equal(run('player.hp'),4);
  for(const phase of ['idle','charge','recover','return']){context.wallPhase=phase;run('lightGiant.attackPhase=wallPhase');assert.equal(run('giantWallsActive(lightGiant)'),phase!=='return');}
});
milkTest('Ejected body minions spread along three equally separated directions before normal pursuit',()=>{
  run('enemies=[];milkBottles=[];spawnClock=999;beginGiantBattle();updateGiantBattle(4.2);var spreadGiant=liveGiants()[0];player.giantBoostUntil=giantBattle.clock+2;hitGiant(spreadGiant);var spreadPiece=giantBattle.ejections[0];updateGiantEjections(.85);var spreadChildren=enemies.slice();');
  assert.equal(run('spreadChildren.length'),3);
  for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){context.spreadI=i;context.spreadJ=j;assert.ok(Math.abs(run('(spreadChildren[spreadI].kx*spreadChildren[spreadJ].kx+spreadChildren[spreadI].ky*spreadChildren[spreadJ].ky)/(360*360)')+.5)<1e-8);}
  run('player.inv=99;for(let i=0;i<33;i++)update(1/60)');
  assert.ok(run('spreadChildren.every(e=>(e.stackCount||1)===1&&Math.hypot(e.x-spreadPiece.bx,e.y-spreadPiece.by)>220)'));
  assert.ok(run('dist(spreadChildren[0],spreadChildren[1])>390'));
});
milkTest('Larger pads can be stomped while rotating and transfer spin-dependent drift to the airborne player',()=>{
  run('enemies=[];milkBottles=[];spawnClock=999;beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var driftGiant=liveGiants()[0];driftGiant.x=0;driftGiant.y=0;driftGiant.angle=0;player.x=135;player.y=0;player.z=25;player.vz=-100;resolveGiantLanding(35,25);var idleDrift=Math.hypot(player.padDriftX,player.padDriftY)');assert.equal(run('giantRules.padRadius'),36);assert.equal(run('player.vz'),520);assert.ok(run('idleDrift')>0);
  run('var driftY=player.y;update(.1)');assert.ok(run('player.y')>run('driftY'));
  run("driftGiant.attackPhase='charge';driftGiant.attackTime=.8;driftGiant.angle=0;player.x=135;player.y=0;player.z=25;player.vz=-100;resolveGiantLanding(35,25)");assert.ok(run('Math.hypot(player.padDriftX,player.padDriftY)')>run('idleDrift'));assert.ok(run('Math.hypot(player.padDriftX,player.padDriftY)')<=240+1e-8);
});
milkTest('Protected stomp landings refresh half a second of invincibility before same-frame enemy contact',()=>{
  run("enemies=[];milkBottles=[];spawnClock=999;player.z=1;player.vz=-50;player.inv=0;player.stompLandingPending=true;spawn(0,'durian',{x:0,y:0}).speed=0;update(.02)");assert.equal(run('player.z'),0);assert.equal(run('player.hp'),5);assert.equal(run('player.inv'),.5);assert.equal(run('playerDamageBlink()'),false);
  run('update(.49)');assert.equal(run('player.hp'),5);run('update(.02)');assert.equal(run('player.hp'),4);
  run('reset();enemies=[];milkBottles=[];spawnClock=999;bounceFromStomp({x:-100,y:0},116);for(let i=0;i<100&&player.stompLandingPending;i++)update(1/60)');assert.equal(run('player.stompLandingPending'),false);assert.equal(run('player.z'),0);assert.ok(run('player.inv')>=.5-1e-8);
});
milkTest('A normal jump onto a rotating pad can reach and stomp the giant head with real movement physics',()=>{
  run("enemies=[];milkBottles=[];milkPack=null;spawnClock=999;beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var routeGiant=liveGiants()[0];routeGiant.x=0;routeGiant.y=0;routeGiant.angle=0;player.x=168;player.y=0;player.inv=0;player.giantBoostUntil=0;jump();keys.add('a');keys.add('s');for(let i=0;i<18;i++)update(1/60);keys.clear();for(let i=0;i<60&&(player.giantBoostUntil||0)<=giantBattle.clock;i++)update(1/60)");
  assert.ok(run('player.giantBoostUntil')>run('giantBattle.clock'));assert.equal(run('player.hp'),5);
  run("for(let i=0;i<100&&routeGiant.hp===3;i++){var routeDistance=Math.hypot(player.x,player.y);stick.x=routeDistance>20?-player.x/routeDistance:0;stick.y=routeDistance>20?-player.y/routeDistance:0;update(1/60)}stick.x=stick.y=0");assert.equal(run('routeGiant.hp'),2);assert.equal(run('player.hp'),5);
});
milkTest('Higher shield bounce gives extra aiming time and retains head eligibility through descent',()=>{
  run("enemies=[];milkBottles=[];milkPack=null;spawnClock=999;beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var highGiant=liveGiants()[0];highGiant.x=0;highGiant.y=0;highGiant.angle=0;player.x=102;player.y=0;player.z=25;player.vz=-100;resolveGiantLanding(35,25);var highBoostStart=giantBattle.clock;var highPeak=player.z;for(let i=0;i<18;i++){update(1/60);highPeak=Math.max(highPeak,player.z)}");
  assert.ok(run('player.z')>140);assert.ok(run('player.vz')>0);assert.ok(Math.abs(run('player.giantBoostUntil-highBoostStart')-2.5)<1e-8);
  run("for(let i=0;i<100&&highGiant.hp===3;i++){var aimDistance=Math.hypot(player.x,player.y);stick.x=aimDistance>10?-player.x/aimDistance:0;stick.y=aimDistance>10?-player.y/aimDistance:0;update(1/60);highPeak=Math.max(highPeak,player.z)}stick.x=stick.y=0");
  assert.ok(run('highPeak')>180);assert.ok(run('giantBattle.clock-highBoostStart')>.9);assert.equal(run('highGiant.hp'),2);assert.equal(run('player.hp'),5);
});
milkTest('Ultimate is blocked during initial entrance, then damages a giant once per cast without stomp rewards',()=>{
  run('enemies=[];milkBottles=[];milkPack=null;spawnClock=999;beginGiantBattle();var ultimateGiant=liveGiants()[0]');assert.equal(run('hitGiant(ultimateGiant,false)'),false);run('ultimateGiant.hp=3;ultimateGiant.hit=0;giantBattle.ejections=[]');
  run('updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);ultimateGiant.x=0;ultimateGiant.y=0;player.x=-160;player.y=0;player.face=0;charge=100;activate();update(.2)');assert.equal(run('ultimateGiant.hp'),2);assert.equal(run('charge'),0);assert.equal(run('player.recoil'),0);assert.equal(run('stats.stompHits'),0);assert.ok(run('special.hits.has(ultimateGiant)'));
  run('ultimateGiant.hit=0;special.speed=0;update(.1)');assert.equal(run('ultimateGiant.hp'),2);
  run('updateGiantEjections(.85)');assert.ok(run('enemies.every(e=>special.hits.has(e.id))'));assert.equal(run('enemies.length'),3);
});
milkTest('Ultimate still hits a landed reinforcement body before its assembly finishes',()=>{
  run("enemies=[];milkBottles=[];beginGiantBattle();updateGiantBattle(4.2);formGiant({x:0,y:200},false);var assemblingTarget=liveGiants().at(-1);giantBattle.formations.forEach(f=>f.time=1.1);player.x=assemblingTarget.x;player.y=assemblingTarget.y;player.face=0;charge=100;activate();special.speed=0;update(.01)");assert.equal(run('assemblingTarget.forming'),true);assert.equal(run('assemblingTarget.hp'),2);assert.equal(run('player.hp'),5);
});
milkTest('Ultimate can finish a giant, while surfing still cannot damage its body',()=>{
  run('enemies=[];milkBottles=[];milkPack=null;spawnClock=999;beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var surfGiant=liveGiants()[0];surfGiant.x=0;surfGiant.y=0;player.x=-160;player.y=0;player.face=0;surfStock=1;activateSurf();update(.2)');assert.equal(run('surfGiant.hp'),3);
  run('special=null;surfGiant.hp=1;player.x=-160;player.y=0;player.face=0;charge=100;activate();update(.2)');assert.equal(run('surfGiant.hp'),0);assert.equal(run('kills'),1);assert.equal(run('stats.stompKills'),0);
  run('updateGiantEjections(.85);updateGiantBattle(.01)');assert.equal(run('state'),'over');
});
milkTest('Head landing tolerance catches a boosted descent behind the visible head but excludes ground and distant landings',()=>{
  run('enemies=[];milkBottles=[];beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var forgivingGiant=liveGiants()[0];forgivingGiant.x=0;forgivingGiant.y=0;player.x=0;player.y=-55;player.z=115;player.vz=-100;player.giantBoostUntil=giantBattle.clock+2.5');assert.equal(run('resolveGiantLanding(120,115)'),true);assert.equal(run('forgivingGiant.hp'),2);assert.equal(run('player.hp'),5);
  run('forgivingGiant.hit=0;player.recoil=0;player.giantBoostUntil=0;player.vz=-100');assert.equal(run('resolveGiantLanding(85,80)'),false);assert.equal(run('forgivingGiant.hp'),2);
  run('player.giantBoostUntil=giantBattle.clock+2.5;player.y=-80');assert.equal(run('inGiantHeadLanding(forgivingGiant)'),false);assert.equal(run('resolveGiantLanding(85,80)'),false);
});
milkTest('Head requires a fresh pad boost, loses one body per stomp, and ejects three minions per body',()=>{
  run('enemies=[];beginGiantBattle();updateGiantBattle(4.2);giantBattle.giants=giantBattle.giants.slice(0,1);var hpGiant=liveGiants()[0];player.giantBoostUntil=0');assert.equal(run('hitGiant(hpGiant)'),false);
  for(let hit=0;hit<3;hit++){
    run('hpGiant.hit=0;player.giantBoostUntil=giantBattle.clock+2');assert.equal(run('hitGiant(hpGiant)'),true);assert.equal(run('hpGiant.hp'),2-hit);assert.equal(run('hitGiant(hpGiant)'),false);
    run('updateGiantEjections(.86)');assert.equal(run("enemies.filter(e=>e.hp>0&&e.type==='slice').length"),(hit+1)*3);
  }
  run('updateGiantBattle(.01)');assert.equal(run('state'),'over');assert.ok(run('enemies.length')>=9);assert.ok(element('overlayTitle').innerHTML.includes('香蕉片巨人擊破'));
});
milkTest('Two giants open left and right, ten-second single-piece reinforcements preserve old combat and the three-giant cap',()=>{
  run('enemies=[];beginGiantBattle()');assert.equal(run('liveGiants().length'),2);assert.ok(run('liveGiants()[0].x<player.x'));assert.ok(run('liveGiants()[1].x>player.x'));assert.equal(run('giantBattle.formations.length'),2);
  run('updateGiantBattle(4.2);updateGiantBattle(6.8)');assert.equal(run('liveGiants().length'),3);assert.equal(run('giantBattle.formations.length'),1);assert.equal(run('isGiantCeremony()'),false);
  run("var oldCombatGiant=liveGiants()[0],newCombatGiant=liveGiants()[2];oldCombatGiant.attackPhase='idle';oldCombatGiant.attackTime=0;var oldCombatClock=oldCombatGiant.attackTime;player.inv=0;var combatMinion=spawn(0,'slice',{x:600,y:600});hurt('reinforcement combat');player.giantBoostUntil=giantBattle.clock+2");assert.equal(run('player.hp'),4);assert.equal(run('hitEnemy(combatMinion,false)'),true);assert.equal(run('hitGiant(newCombatGiant)'),false);assert.equal(run('hitGiant(oldCombatGiant)'),true);
  run('updateGiantBattle(.2)');assert.ok(run('oldCombatGiant.attackTime')>run('oldCombatClock'));assert.equal(run('newCombatGiant.forming'),true);
  run('updateGiantBattle(3);updateGiantBattle(16.8)');assert.equal(run('liveGiants().length'),3);
  run('giantBattle.formations=[];giantBattle.giants.forEach(g=>g.hp=0);giantBattle.ejections=[];updateGiantBattle(10)');assert.equal(run('state'),'over');assert.equal(run('liveGiants().length'),0);
});
milkTest('Untouched giants get one new body piece every ten seconds and stop at three full giants',()=>{
  run('enemies=[];beginGiantBattle();updateGiantBattle(4.2);updateGiantBattle(6.8);var growingGiant=liveGiants()[2]');assert.equal(run('growingGiant.hp'),1);assert.equal(run('giantBattle.formations[0].parts.filter(p=>p.index<3).length'),1);
  run('updateGiantBattle(10)');assert.equal(run('giantBattle.supplies.length'),1);assert.equal(run('growingGiant.hp'),1);run('updateGiantBattle(1)');assert.equal(run('growingGiant.hp'),2);
  run('updateGiantBattle(9);updateGiantBattle(1)');assert.equal(run('growingGiant.hp'),3);
  run('updateGiantBattle(9)');assert.equal(run('liveGiants().length'),3);assert.equal(run('giantBattle.supplies.length'),0);assert.equal(run('giantBattle.formations.length'),0);assert.ok(run('liveGiants().every(g=>g.hp===3)'));
});
milkTest('Single-piece supply prioritizes the lowest living body count without freezing existing combat',()=>{
  run('enemies=[];beginGiantBattle();updateGiantBattle(4.2);var repairA=liveGiants()[0],repairB=liveGiants()[1];repairA.hp=2;repairB.hp=1;updateGiantBattle(6.8)');assert.equal(run('liveGiants().length'),2);assert.equal(run('giantBattle.supplies[0].g'),run('repairB'));assert.equal(run('isGiantCeremony()'),false);
  run("player.inv=0;hurt('during supply');var repairClock=repairA.attackTime;updateGiantBattle(.2)");assert.equal(run('player.hp'),4);assert.ok(run('repairA.attackTime!==repairClock'));run('updateGiantBattle(.8)');assert.equal(run('repairB.hp'),2);assert.equal(run('repairA.hp'),2);assert.ok(Math.abs(run('repairB.refillUntil-giantBattle.clock')-.7)<1e-8);
  run('repairA.hp=1;giantBattle.clock=19.99;updateGiantBattle(.02)');assert.equal(run('giantBattle.supplies[0].g'),run('repairA'));
  run('repairA.hp=0;updateGiantBattle(1)');assert.equal(run('repairA.hp'),0);assert.equal(run('giantBattle.supplies.length'),0);
});
milkTest('Both boss names last one second and the giant name freezes player actions and world simulation',()=>{
  run("enemies=[];beginGiantBattle();updateGiantBattle(3.2);updateHUD();var titlePlayer=JSON.stringify(player),titleAngle=liveGiants()[0].angle;keys.add('d');charge=100;surfStock=1;jump();activate();activateSurf();hurt('title')");assert.equal(run('bossNameDuration'),1);assert.equal(run('isGiantNameEntrance()'),true);assert.equal(run('special'),null);assert.equal(run('JSON.stringify(player)'),run('titlePlayer'));
  run('update(.99)');assert.equal(element('bossBanner').hidden,false);assert.equal(run('JSON.stringify(player)'),run('titlePlayer'));assert.equal(run('liveGiants()[0].angle'),run('titleAngle'));run('update(.02)');assert.equal(element('bossBanner').hidden,true);assert.equal(run('keys.size'),0);assert.equal(run('giantHintPads().length'),8);
  run("keys.add('d');update(.1)");assert.ok(run('player.x')>0);
  run("$('gameMode').value='boss';reset();updateBossEntrance(4)");assert.equal(run('boss.phase'),'entrance-banner');assert.equal(run('boss.time'),1);run('updateBossEntrance(.99)');assert.equal(element('bossBanner').hidden,false);run('updateBossEntrance(.02)');assert.equal(element('bossBanner').hidden,true);
});
milkTest('Giant title appears once after assembly, freezes on pause and restores the necromancer title after switching',()=>{
  run('enemies=[];beginGiantBattle();updateHUD()');assert.equal(element('bossBanner').hidden,true);
  run('updateGiantBattle(3.4);updateHUD()');assert.equal(element('bossBanner').hidden,false);assert.equal(element('bossBannerTitle').textContent,'進擊的蕉巨');assert.ok(Number(element('bossBanner').style.opacity)>0);
  run('pause();update(1);updateHUD()');assert.equal(element('bossBanner').hidden,false);assert.equal(run('giantBattle.clock'),3.4);run('pause();mobilePlayBlocked=true;update(1)');assert.equal(run('giantBattle.clock'),3.4);
  run('mobilePlayBlocked=false;updateGiantBattle(.81);updateHUD()');assert.equal(element('bossBanner').hidden,true);run('updateGiantBattle(6);updateHUD()');assert.equal(element('bossBanner').hidden,true);
  run("$('gameMode').value='boss';reset();boss.phase='entrance-banner';boss.time=.6;updateHUD()");assert.equal(element('bossBanner').hidden,false);assert.equal(element('bossBannerTitle').textContent,'腐蕉大法師');run('reset()');
});
milkTest('All eight opening pads have upward hints that flash for five seconds and reinforcements do not restart them',()=>{
  run("enemies=[];notify('before giant');beginGiantBattle()");assert.equal(element('notice').textContent,'');assert.equal(run('giantHintActive()'),false);
  run('updateGiantBattle(4.2)');assert.equal(run('giantHintActive()'),true);assert.equal(run('giantHintPads().length'),8);run('var hintBright=giantHintOpacity();giantBattle.clock+=.25;var hintDim=giantHintOpacity();giantBattle.clock-=.25;giantBattle.taught=true');assert.ok(run('hintBright>hintDim*4'));assert.equal(run('giantHintPads().length'),8);assert.equal(element('notice').textContent,'');
  run('updateGiantBattle(4.99)');assert.equal(run('giantHintActive()'),true);run('updateGiantBattle(.02)');assert.equal(run('giantHintActive()'),false);assert.equal(run('giantHintPads().length'),0);
  run('updateGiantBattle(1.8)');assert.equal(run('giantHintActive()'),false);assert.equal(element('notice').textContent,'');
});
milkTest('Giant combat uses only short hit feedback and suppresses central status notices',()=>{
  run("enemies=[];beginGiantBattle();updateGiantBattle(4.2);notify('skill or damage status');texts=[];var silentGiant=liveGiants()[0];hitGiant(silentGiant,false)");assert.equal(element('notice').textContent,'');assert.equal(run('texts.length'),1);assert.equal(run('texts[0].text'),'命中！');assert.equal(run('texts[0].life'),.65);
  run('silentGiant.hit=0;silentGiant.hp=1;hitGiant(silentGiant,false)');assert.ok(run("texts.every(t=>t.text==='命中！')"));assert.equal(element('notice').textContent,'');
  run("reset();notify('normal stage status')");assert.equal(element('notice').textContent,'normal stage status');
});
milkTest('Boss HUD counts elapsed minutes and seconds through pauses and resets, while survival keeps counting down',()=>{
  run('enemies=[];beginGiantBattle();updateHUD()');assert.equal(element('bossTimer').textContent,'00:00');assert.equal(element('gameClock').hidden,true);assert.equal(element('bossHud').hidden,true);
  run('giantBattle.clock=65.9;updateHUD()');assert.equal(element('bossTimer').textContent,'01:05');assert.equal(element('finalCountdown').hidden,true);assert.equal(element('gameClock').hidden,true);assert.equal(element('bossHud').hidden,true);assert.equal(element('bossClock').hidden,false);
  run('pause();update(5);updateHUD()');assert.equal(element('bossTimer').textContent,'01:05');run('pause();mobilePlayBlocked=true;update(5);updateHUD()');assert.equal(element('bossTimer').textContent,'01:05');
  run('mobilePlayBlocked=false;reset();updateHUD()');assert.equal(element('gameClock').hidden,false);assert.equal(element('timer').textContent,'01:00');run("$('gameMode').value='survival';reset();startBossBattle();bossElapsed=72.8;updateHUD()");assert.equal(element('bossTimer').textContent,'01:12');assert.equal(element('bossHud').hidden,false);assert.equal(element('gameClock').hidden,true);assert.equal(element('bossClock').hidden,false);assert.equal(element('finalCountdown').hidden,true);
});
milkTest('Initial giant arrival freezes actions from time zero through assembly and title, while later formations do not',()=>{
  run("enemies=[];keys.add('d');beginGiantBattle();var firstArrivalPlayer=JSON.stringify(player);charge=100;surfStock=1;keys.add('d');jump();activate();activateSurf();hurt('arrival');update(.5)");assert.equal(run('JSON.stringify(player)'),run('firstArrivalPlayer'));assert.equal(run('special'),null);assert.equal(run('isBossWorldFrozen()'),true);assert.equal(run('giantBattle.formations[0].time'),.5);
  run('update(2.7)');assert.equal(run('isGiantCeremony()'),false);assert.equal(run('isGiantNameEntrance()'),true);assert.equal(run('JSON.stringify(player)'),run('firstArrivalPlayer'));run('update(1)');assert.equal(run('isBossWorldFrozen()'),false);assert.equal(run('keys.size'),0);
  run("formGiant({x:500,y:300},false);keys.add('d');update(.1)");assert.ok(run('player.x')>0);assert.equal(run('isBossWorldFrozen()'),false);
});
milkTest('Opening giants leave safe player and shield spacing at every map edge on desktop and mobile',()=>{
  try{
    for(const [width,height,mobile] of [[1000,650,false],[844,390,true],[568,320,true],[390,844,true]])for(const x of [-1250,0,1250])for(const y of [-1250,0,1250]){
      Object.assign(context,{safeWidth:width,safeHeight:height,safeMobile:mobile,safeX:x,safeY:y});
      run("window.matchMedia=()=>({matches:safeMobile});reset();W=safeWidth;H=safeHeight;enemies=[];milkBottles=[];player.x=safeX;player.y=safeY;player.inv=0;beginGiantBattle()");
      assert.equal(run('liveGiants().length'),2);
      assert.ok(run('liveGiants().every(g=>dist(g,player)>=200*characterScale()-1e-7)'));
      assert.ok(run('dist(...liveGiants())>=300*characterScale()-1e-7'));
      assert.ok(run('liveGiants().every(g=>Math.abs(g.x)<=arenaSize-150*characterScale()+1e-7&&Math.abs(g.y)<=arenaSize-150*characterScale()+1e-7)'));
      run('updateGiantEntrance(4.2)');assert.equal(run('player.x'),x);assert.equal(run('player.y'),y);assert.equal(run('player.inv'),.5);
      // Remove the grace period to prove selection itself avoids all contact hazards.
      run('player.inv=0;player.stompGuard=0;giantContacts()');assert.equal(run('player.hp'),5);
      run('for(let i=0;i<40;i++)update(.02)');assert.equal(run('player.hp'),5);
    }
  }finally{run('delete window.matchMedia;resize()');}
});
milkTest('Arrival grace lasts half a second, preserves longer invincibility, and never repeats on reinforcement',()=>{
  run('enemies=[];beginGiantBattle();updateGiantEntrance(4.2)');assert.equal(run('player.inv'),.5);assert.equal(run('player.stompGuard'),.5);assert.equal(run('playerDamageBlink()'),false);
  run("hurt('arrival grace');update(.2)");assert.equal(run('player.hp'),5);assert.ok(Math.abs(run('player.inv')-.3)<1e-8);
  run('player.inv=0;player.stompGuard=0;formGiant({x:500,y:300},false);updateGiantEntrance(.1)');assert.equal(run('player.inv'),0);
  run('reset();enemies=[];player.inv=2;beginGiantBattle();updateGiantEntrance(4.2)');assert.equal(run('player.inv'),2);
});
milkTest('Descending arrival beams apply to both opening giants and new giants, while simple healing keeps its basic glow',()=>{
  run('enemies=[];beginGiantBattle();var beamMethods={beam:drawGiantFormationBeam,slice:drawGiantSlice,supply:drawGiantSupplyGlow,hints:drawGiantHints},arrivalBeams=0,basicGlows=0;drawGiantFormationBeam=()=>arrivalBeams++;drawGiantSlice=()=>{};drawGiantSupplyGlow=()=>basicGlows++;drawGiantHints=()=>{}');
  try{
    run('drawGiantEffects()');assert.equal(run('arrivalBeams'),2);assert.equal(run('basicGlows'),0);
    run('var beamPoseForm=giantBattle.formations[0];beamPoseForm.time=.1');assert.ok(run('giantFormationBeamPose(beamPoseForm).progress')<1);run('beamPoseForm.time=.35');assert.equal(run('giantFormationBeamPose(beamPoseForm).progress'),1);run('beamPoseForm.time=1.91');assert.equal(run('giantFormationBeamPose(beamPoseForm).alpha'),0);
    run('updateGiantBattle(4.2);formGiant({x:500,y:300},false);arrivalBeams=0;drawGiantEffects()');assert.equal(run('arrivalBeams'),1);
    run('giantBattle.formations=[];giantBattle.supplies=[{g:liveGiants()[0],time:.3}];arrivalBeams=0;basicGlows=0;drawGiantEffects()');assert.equal(run('arrivalBeams'),0);assert.equal(run('basicGlows'),1);
  }finally{run('drawGiantFormationBeam=beamMethods.beam;drawGiantSlice=beamMethods.slice;drawGiantSupplyGlow=beamMethods.supply;drawGiantHints=beamMethods.hints');}
});
milkTest('Opening giant parts form separate left and right groups around their own assembly sites',()=>{
  run('enemies=[];beginGiantBattle();var leftGroup=giantBattle.formations[0],rightGroup=giantBattle.formations[1]');
  assert.ok(run('leftGroup.parts.every(p=>p.x<player.x&&p.x===leftGroup.g.x&&p.y===leftGroup.g.y)'));
  assert.ok(run('rightGroup.parts.every(p=>p.x>player.x&&p.x===rightGroup.g.x&&p.y===rightGroup.g.y)'));
  assert.equal(run('leftGroup.parts.length+rightGroup.parts.length'),14);
});
milkTest('Every giant part lands at one shared point before spreading into body layers and shields',()=>{
  run('enemies=[];beginGiantBattle();var assembledForm=giantBattle.formations[0];assembledForm.time=1.1');
  assert.ok(run('assembledForm.parts.every(part=>{const p=giantPartPose(assembledForm,part);return p.x===assembledForm.g.x&&p.y===assembledForm.g.y&&p.z===0})'));
  run('assembledForm.time=2.9');
  assert.ok(run('assembledForm.parts.every(part=>{const p=giantPartPose(assembledForm,part),target=part.index<3?assembledForm.g:giantPads(assembledForm.g)[part.index-3];return Math.abs(p.x-target.x)<1e-8&&Math.abs(p.y-target.y)<1e-8})'));
  assert.ok(Math.abs(run('giantPartPose(assembledForm,assembledForm.parts[2]).z')-68)<1e-8);
});
milkTest('Assembly draws rear shields behind the body and keeps the head visible when parts share one landing point',()=>{
  run('enemies=[];beginGiantBattle();giantBattle.formations=giantBattle.formations.slice(0,1);var depthForm=giantBattle.formations[0];depthForm.time=1.1;var assemblyDraws=[];var originalFormationBeam=drawGiantFormationBeam;drawGiantFormationBeam=()=>{};var originalGiantDraw=drawGiantSlice;drawGiantSlice=(sprite,width,height,x,y,z)=>assemblyDraws.push({width,height,x,y,z});');
  try{
    run('drawGiantEffects()');assert.equal(run('assemblyDraws.length'),7);assert.ok(run('assemblyDraws.slice(0,4).every(p=>p.width===96)'));assert.equal(run('assemblyDraws[6].height'),94);
    for(const angle of [0,1,2,3,4,5]){context.depthAngle=angle;run('depthForm.g.angle=depthAngle;depthForm.time=2.3;assemblyDraws=[];drawGiantEffects();var headDrawIndex=assemblyDraws.findIndex(p=>p.height===94)');assert.ok(run('assemblyDraws.every((p,i)=>p.width!==96||p.y>=depthForm.g.y||i<headDrawIndex)'));}
  }finally{run('drawGiantSlice=originalGiantDraw;drawGiantFormationBeam=originalFormationBeam');}
});
milkTest('Reinforcements maximize distance to the nearest giant within the visible assembly bounds',()=>{
  run('enemies=[];beginGiantBattle();var siteA=liveGiants()[0],siteB=liveGiants()[1];siteA.x=-200;siteA.y=-100;siteB.x=200;siteB.y=-100;var farSite=giantSite(),siteBounds=giantSiteBounds();');
  assert.equal(run('farSite.x'),0);assert.equal(run('farSite.y'),run('siteBounds.bottom'));
  for(const position of [{x:0,y:0},{x:1250,y:1250},{x:-1250,y:-1250}]){
    context.sitePlayerPosition=position;run('player.x=sitePlayerPosition.x;player.y=sitePlayerPosition.y;siteA.x=player.x-150;siteA.y=player.y+50;siteB.x=player.x+180;siteB.y=player.y-90;farSite=giantSite();siteBounds=giantSiteBounds();var siteScore=Math.min(...liveGiants().map(g=>dist(g,farSite)));');
    assert.ok(run('farSite.x>=siteBounds.left&&farSite.x<=siteBounds.right&&farSite.y>=siteBounds.top&&farSite.y<=siteBounds.bottom'));
    assert.ok(run('screen(farSite.x,farSite.y).x>=0&&screen(farSite.x,farSite.y).x<=W&&screen(farSite.x,farSite.y).y>=0&&screen(farSite.x,farSite.y).y<=H'));
    assert.ok(run('Array.from({length:21},(_,i)=>Array.from({length:21},(_,j)=>({x:siteBounds.left+(siteBounds.right-siteBounds.left)*i/20,y:siteBounds.top+(siteBounds.bottom-siteBounds.top)*j/20}))).flat().every(p=>Math.min(...liveGiants().map(g=>dist(g,p)))<=siteScore+1e-7)'));
  }
  run('formGiant();var newSiteForm=giantBattle.formations[2]');assert.ok(run('newSiteForm.parts.every(p=>p.x===newSiteForm.g.x&&p.y===newSiteForm.g.y)'));
});
milkTest('Pause, phone gate and restart preserve or clear giant state, while 蕉皮末日 reaches its own necromancer',()=>{
  run('enemies=[];beginGiantBattle();pause();var giantPausedAt=giantBattle.clock;update(10)');assert.equal(run('giantBattle.clock'),run('giantPausedAt'));
  run('pause();mobilePlayBlocked=true;update(10)');assert.equal(run('giantBattle.clock'),run('giantPausedAt'));
  run('mobilePlayBlocked=false;reset()');assert.equal(run('giantBattle'),null);
  run("$('gameMode').value='survival';reset();enemies=[];elapsed=119.99;update(.02)");assert.ok(run('boss'));assert.equal(run('giantBattle'),null);
});

test('Both normal round entries drop a case before spawning enemies or advancing the clock',()=>{
  for(const mode of ['milk','survival']){
    context.boxTestMode=mode;run("$('gameMode').value=boxTestMode;debugUnlocked=false;reset(true)");assert.equal(run('boxSequence.kind'),'entrance');assert.equal(run('elapsed'),0);assert.equal(run('enemies.length'),0);assert.equal(run('milkBottles.length'),0);
    run("charge=100;surfStock=1;jump();activate();activateSurf();hurt('during entrance');keys.add('d');update(.6)");assert.equal(run('player.hp'),5);assert.equal(run('player.x'),0);assert.equal(run('player.z'),0);assert.equal(run('special'),null);assert.equal(run('surfStock'),1);assert.equal(run('elapsed'),0);
    run('update(1.79)');assert.ok(run('boxSequence'));assert.equal(run('enemies.length'),0);
    run('update(.02)');assert.equal(run('boxSequence'),null);assert.equal(run('enemies.length'),mode==='milk'?2:7);assert.equal(run('elapsed'),0);assert.equal(run('keys.size'),0);assert.equal(run('milkBottles.length'),mode==='milk'?2:0);
    run('update(.1)');assert.ok(run('elapsed')>0);
  }
  run("$('gameMode').value='survival';reset()");
});
test('Entrance holy light reaches the sky and fades completely before the original hero jumps out',()=>{
  run('var launchAt=boxRules.dropDuration+boxRules.launchDelay');assert.ok(Math.abs(run('boxRules.dropDuration')-1.3/1.5)<1e-9);
  for(const offset of [.08,.16,.3,.45]){
    context.lightOffset=offset;run("var lightPose=entrancePose({kind:'entrance',time:boxRules.dropDuration+lightOffset})");assert.equal(run('lightPose.heroAlpha'),0);assert.equal(run('lightPose.open'),offset>=.12?1:0);assert.ok(run('lightPose.beamAlpha')>0);if(offset>=.16)assert.equal(run('lightPose.beamRise'),1);
  }
  run("var emergePose=entrancePose({kind:'entrance',time:launchAt}),endedPose=entrancePose({kind:'entrance',time:boxRules.entranceDuration})");assert.equal(run('emergePose.beamAlpha'),0);assert.equal(run('emergePose.heroAlpha'),1);assert.equal(run('emergePose.open'),1);assert.equal(run('endedPose.heroZ'),0);assert.equal(run('endedPose.caseAlpha'),0);
});
test('Holy light fully conceals the case while its artwork changes from closed to open',()=>{
  for(const delta of [.11,.12,.2,.3]){context.coverDelta=delta;run("var coveredPose=entrancePose({kind:'entrance',time:boxRules.dropDuration+coverDelta})");assert.equal(run('coveredPose.beamCover'),1);}
  run("var revealedPose=entrancePose({kind:'entrance',time:boxRules.dropDuration+.55})");assert.ok(run('revealedPose.beamCover')<1e-8);
});
test('Desktop Space starts and retries once, respects loading, result delay and form controls',()=>{
  run("$('gameMode').value='milk';debugUnlocked=false;state='intro';$('start').disabled=false;var savedShortcutReset=reset;reset=productionReset;var shortcutEvent={code:'Space',key:' ',repeat:false,preventDefault(){}};handleKeyDown(shortcutEvent)");
  assert.equal(run('state'),'playing');assert.ok(run('boxSequence'));assert.equal(run('player.vz'),0);assert.equal(run("keys.has(' ')"),false);
  run('boxSequence.time=.2;handleKeyDown({...shortcutEvent,repeat:true})');assert.equal(run('boxSequence.time'),.2);
  run('finish(false);handleKeyDown(shortcutEvent)');assert.equal(run('state'),'over');assert.equal(run('endElapsed'),0);
  run('tickEnding(2)');assert.ok(element('keyboardStartHint').textContent.includes('SPACE'));run('handleKeyDown({...shortcutEvent,repeat:true})');assert.equal(run('state'),'over');
  run('handleKeyDown(shortcutEvent)');assert.equal(run('state'),'playing');assert.equal(run('boxSequence.time'),0);
  run("boxSequence=null;state='intro';assetsReady=false;handleKeyDown(shortcutEvent)");assert.equal(run('state'),'intro');run("assetsReady=true;handleKeyDown({...shortcutEvent,target:{tagName:'SELECT'}})");assert.equal(run('state'),'intro');
  run('reset=savedShortcutReset;reset()');
});
test('Pause and phone gate freeze case animation, while restarting resets the entrance',()=>{
  run("$('gameMode').value='milk';reset(true);update(.3);pause();update(2)");assert.equal(run('boxSequence.time'),.3);assert.equal(run('elapsed'),0);
  run('pause();mobilePlayBlocked=true;update(2)');assert.equal(run('boxSequence.time'),.3);
  run('mobilePlayBlocked=false;reset(true)');assert.equal(run('boxSequence.time'),0);
  run("$('gameMode').value='survival';reset()");
});
test('Boss and debug entries preserve their existing entrance and skip the falling case',()=>{
  run("$('gameMode').value='boss';reset(true)");assert.equal(run('boxSequence'),null);assert.equal(run('isBossEntrance()'),true);
  run("$('gameMode').value='survival';debugUnlocked=true;$('debugStart').value='32';reset(true)");assert.equal(run('boxSequence'),null);assert.equal(run('elapsed'),88);assert.equal(run('enemies.length'),7);
  run("debugUnlocked=false;$('debugStart').value='120';reset()");
});
test('Both stages continue through thirty seconds remaining without a rest case, healing or charge refill',()=>{
  for(const mode of ['milk','survival']){
    context.noRestMode=mode;
    run("$('gameMode').value=noRestMode;reset();enemies=[];spawnClock=999;nextPickupAt=999;nextSurfAt=999;nextDurianAt=999;nextChargerAt=999;nextThrowerAt=999;elapsed=roundDuration()-30.01;player.hp=2;charge=30;player.inv=99");
    const before=run('elapsed');run('update(.02);update(.7)');
    assert.equal(run('boxSequence'),null);assert.equal(run('player.hp'),2);assert.equal(run('charge'),30);assert.ok(run('elapsed')>before+.7);
    assert.doesNotMatch(element('notice').textContent,/進盒休息|休息完成|香蕉盒降臨/);
  }
  run("$('gameMode').value='survival';reset()");
});

test('Skill exit and banana bunch grant half a second of protection without damage flashing',()=>{
  for(const skill of ['dash','surf']){
    context.exitSkill=skill;run("$('gameMode').value='survival';reset();enemies=[];spawnClock=999;charge=100;surfStock=1;if(exitSkill==='surf')activateSurf();else activate();special.t=special.duration-.001;update(.01)");
    assert.equal(run('special'),null);assert.equal(run('player.inv'),.5);assert.equal(run('playerDamageBlink()'),false);
    run("hurt('protected exit')");assert.equal(run('player.hp'),5);
    run("update(.51);hurt('expired exit')");assert.equal(run('player.hp'),4);assert.equal(run('player.damageInv'),2.5);
  }
  run("reset();enemies=[];spawnClock=999;var pickupThreat=spawn(0,'normal',{x:0,y:0});pickupThreat.speed=0;pickups=[{x:0,y:0,age:0}];update(.01)");
  assert.equal(run('player.hp'),5);assert.equal(run('stats.bunches'),1);assert.equal(run('player.inv'),.5);assert.equal(run('playerDamageBlink()'),false);
  run("player.inv=0;hurt('real damage');collectBunch()");assert.equal(run('player.inv'),2.5);assert.equal(run('player.damageInv'),2.5);
});
milkTest('蕉片崛起 BGM changes only once at thirty seconds remaining',()=>{
  for(const [at,rate] of [[0,1],[15,1],[29.99,1],[30,1.2],[50,1.2],[59,1.2]]){context.bgmTime=at;context.bgmRate=rate;assert.equal(run('musicRate(bgmTime)'),context.bgmRate);}
});


await (async()=>{
run("var savedGroundDecode=groundSprite.decode;assetsReady=false;groundSprite.decode=()=>new Promise(resolve=>{globalThis.releaseImageDecode=resolve;})");
const loading=run('loadGameAssets()');await Promise.resolve();
assert.equal(run('assetsReady'),false);assert.equal(element('start').disabled,true);assert.equal(element('overlay').hidden,true);
run('reset()');assert.equal(run('state'),'loading');
run('releaseImageDecode()');assert.equal(await loading,true);assert.equal(run('assetsReady'),true);run('groundSprite.decode=savedGroundDecode');
console.log('PASS Start remains blocked until the last sprite finishes decoding');
run("var savedEnemyDecode=enemySprite.decode;assetsReady=false;enemySprite.decode=()=>Promise.reject(new Error('test decode failure'))");
assert.equal(await run('loadGameAssets()'),false);assert.equal(run('state'),'load-error');assert.equal(element('start').disabled,true);assert.equal(element('loadingRetry').hidden,false);assert.equal(element('loadingScreen').hidden,false);
run('enemySprite.decode=savedEnemyDecode');assert.equal(await run('loadGameAssets()'),true);assert.equal(run('state'),'intro');assert.equal(element('loadingScreen').hidden,true);assert.equal(element('start').disabled,false);
console.log('PASS Failed image decoding keeps the loading screen open and retry recovers');
})();
})().catch(error=>{console.error(error);process.exitCode=1;});

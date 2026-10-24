'use strict';
const aiReplayEnabled=globalThis.BANANA_FEATURES?.aiReplay===true;
$('aiOptions').hidden=!aiReplayEnabled;$('agentStatus').hidden=!aiReplayEnabled;
for(const id of ['autoAgent','agentSeed','downloadReplay','importReplay','replayBack','replayForward'])$(id).disabled=!aiReplayEnabled;
let replaySeeking=false;
let agentRun=null,lastAgentReplay=null,agentAccumulator=0,sourceDigestPromise=null,agentGeneration=0;
async function browserSimulationDigest(){
  return sourceDigestPromise||=Promise.all(simulationSources.map(async name=>{const url=Array.from(document.scripts).find(script=>script.src&&new URL(script.src).pathname.endsWith('/'+name))?.src||name;const response=await fetch(url,{cache:'force-cache'});if(!response.ok)throw Error('無法讀取模擬版本');return name+'\n'+await response.text();})).then(async texts=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(texts.join('\n')))),n=>n.toString(16).padStart(2,'0')).join('')).catch(error=>{sourceDigestPromise=null;throw error;});
}
function preserveAgentReplay(){if(agentRun?.recording)lastAgentReplay=agentRun.environment.replay();}
function agentMessage(text){$('agentStatus').textContent=aiReplayEnabled?text:'';}
function stopAgentRun(){agentGeneration++;$('replayControls').hidden=true;preserveAgentReplay();agentRun=null;agentAccumulator=0;stopSimulation();agentMessage('');}
async function startControlledGame(){
  stopAgentRun();const generation=agentGeneration;canvas.style.objectFit='';resize();
  lastAgentReplay=null;
  if(!aiReplayEnabled){agentMessage('');reset();return;}
  $('start').disabled=true;
  try{
    const digest=await browserSimulationDigest(),seed=Number($('agentSeed').value);
    if(generation!==agentGeneration)return;
    const environment=createSimulation({mode:$('gameMode').value,seed,width:Math.round(W),height:Math.round(H),mobile:characterScale()<1,record:true,sourceDigest:digest});
    const manual=!$('autoAgent').checked;
    agentRun={environment,recording:true,manual,manualInput:{keys:new Set(),x:0,y:0,jump:false,dash:false,surf:false,touchJet:false},action:{}};agentAccumulator=0;canvas.style.objectFit='contain';resize();agentMessage(manual?'Replay 自動暫存 · P 暫停':'AI 自動操作 · P 暫停');
  }catch(error){if(generation===agentGeneration){agentMessage(error.message);$('start').disabled=false;}}
}
function manualControlsActive(){return aiReplayEnabled&&!!agentRun?.manual&&!!simulationSession?.active;}
function clearManualInput(){if(!agentRun?.manualInput)return;const m=agentRun.manualInput;m.keys.clear();m.x=0;m.y=0;m.jump=false;m.dash=false;m.surf=false;m.touchJet=false;}
function captureManualKey(event,pressed){
  if(!manualControlsActive())return false;
  const k=gameKey(event);
  if(!['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' ','j','k'].includes(k))return false;
  if(event.metaKey||event.ctrlKey||event.altKey||['INPUT','TEXTAREA','SELECT','BUTTON'].includes(event.target?.tagName))return false;
  const m=agentRun.manualInput;
  if(!pressed){m.keys.delete(k);return true;}
  if(state!=='playing')return false;
  event.preventDefault();const edge=!m.keys.has(k)&&!event.repeat;m.keys.add(k);
  if(edge){if(k===' ')m.jump=true;if(k==='j')m.dash=true;if(k==='k')m.surf=true;}return true;
}
function readManualAction(){
  const m=agentRun.manualInput,held=(...names)=>names.some(n=>m.keys.has(n));
  const action={x:m.x+ +held('d','arrowright')- +held('a','arrowleft'),y:m.y+ +held('s','arrowdown')- +held('w','arrowup'),jump:m.jump,jet:held(' ')||m.touchJet,dash:m.dash,surf:m.surf};
  m.jump=false;m.dash=false;m.surf=false;return action;
}
function advanceAgentFrame(dt){
  if(!aiReplayEnabled||!agentRun||!simulationSession?.active)return;
  if(mobilePlayBlocked||replaySeeking)return;
  agentAccumulator+=Math.min(Math.max(0,dt),.25);
  try{
    while(agentAccumulator>=simulationDt&&state==='playing'&&simulationSession.active){
      agentAccumulator-=simulationDt;const run=agentRun;
      if(run.playback){
        if(run.playback.step().done){simulationSession.active=false;state=state==='over'?'over':'paused';agentMessage('Replay 播放完成 · 結果驗證通過');trainingReplayStatus('complete','播放完成 · 結果驗證通過');break;}
      }else{
        if(run.manual)run.action=readManualAction();
        else if(run.environment.steps%6===0)run.action=run.environment.policy(run.environment.observe());
        run.environment.step(run.action);
        if(state==='over'){preserveAgentReplay();simulationSession.active=false;agentMessage((run.manual?'本局已暫存 · ':'AI 結束 · ')+(player.hp>0?'過關':'挑戰失敗'));}
      }
    }
  }catch(error){simulationSession.active=false;state='paused';agentMessage('Replay 錯誤：'+error.message);trainingReplayStatus('error',error.message);}
}
if(aiReplayEnabled)$('downloadReplay').addEventListener('click',()=>{
  preserveAgentReplay();if(!lastAgentReplay){agentMessage('開始遊戲後會自動暫存 Replay，結束後即可下載。');return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify(lastAgentReplay)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`banana-hop-${lastAgentReplay.config.mode}-${lastAgentReplay.config.seed}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
async function playAgentReplay(tape,generation=++agentGeneration){
  validateReplay(tape);const digest=await browserSimulationDigest();
  if(generation!==agentGeneration)return;
  if(tape.sourceDigest!==digest)throw Error('Replay 需要與錄製時相同的遊戲程式版本');
  preserveAgentReplay();const playback=createReplay(tape);lastAgentReplay=tape;agentRun={environment:playback.environment,playback,tape,recording:false};agentAccumulator=0;
  $('replayControls').hidden=false;canvas.style.objectFit='contain';resize();agentMessage('Replay 播放中 · P 暫停');
}
// Seek by replaying the same fixed-step inputs; never skip collision or RNG updates.
async function seekAgentReplay(seconds){
  if(!aiReplayEnabled||!agentRun?.playback||replaySeeking||!Number.isFinite(seconds))return;
  const run=agentRun,generation=agentGeneration,wasPaused=state==='paused'||!simulationSession?.active;
  const target=Math.max(0,Math.min(run.tape.steps,run.environment.steps+Math.round(seconds/simulationDt)));
  const oldSound=sound;replaySeeking=true;sound=false;agentAccumulator=0;
  for(const id of ['replayBack','replayForward'])$(id).disabled=true;
  trainingReplayStatus('seeking','跳轉中…');
  try{
    if(target<run.environment.steps){run.playback=createReplay(run.tape);run.environment=run.playback.environment;}
    state='playing';simulationSession.active=true;
    while(run.environment.steps<target){
      for(let i=0;i<120&&run.environment.steps<target;i++)run.playback.step();
      await new Promise(resolve=>setTimeout(resolve,0));
      if(agentRun!==run||generation!==agentGeneration)return;
    }
    const done=target===run.tape.steps;
    if(done){run.playback.step();simulationSession.active=false;state=state==='over'?'over':'paused';}
    else if(wasPaused){const spraying=milkPack?.spraying;pause();if(milkPack)milkPack.spraying=spraying;}
    agentMessage(done?'Replay 播放完成 · 結果驗證通過':wasPaused?'Replay 已暫停':'Replay 播放中 · P 暫停');
    trainingReplayStatus(done?'complete':wasPaused?'paused':'playing',done?'播放完成 · 結果驗證通過':wasPaused?'已暫停':'播放中');
    resize();
  }catch(error){if(agentRun===run){simulationSession.active=false;state='paused';agentMessage('Replay 錯誤：'+error.message);trainingReplayStatus('error',error.message);}}
  finally{sound=oldSound;replaySeeking=false;agentAccumulator=0;for(const id of ['replayBack','replayForward'])$(id).disabled=!aiReplayEnabled;}
}
if(aiReplayEnabled){$('replayBack').addEventListener('click',()=>seekAgentReplay(-5));$('replayForward').addEventListener('click',()=>seekAgentReplay(5));}
if(aiReplayEnabled)$('importReplay').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;const generation=++agentGeneration;
  try{
    if(file.size>32*1024*1024)throw Error('Replay 檔案過大');
    const tape=JSON.parse(await file.text());if(generation!==agentGeneration)return;
    await playAgentReplay(tape,generation);
  }catch(error){if(generation===agentGeneration)agentMessage(error.message);}finally{event.target.value='';}
});
let trainingReplayName=null;
function trainingReplayStatus(status,message){
  if(trainingReplayName&&typeof window!=='undefined'&&window.parent!==window)window.parent.postMessage({type:'banana-replay-status',name:trainingReplayName,status,message},location.origin);
}
async function playTrainingReplay(name){
  if(!aiReplayEnabled||!(/^[a-f0-9]{24}\.json$/).test(name))return;
  const generation=++agentGeneration;trainingReplayName=name;
  try{
    document.body.classList.add('replay-viewer');trainingReplayStatus('loading','載入 Replay…');
    const response=await fetch('training/api/replays/'+encodeURIComponent(name),{cache:'no-store'});
    if(!response.ok)throw Error(response.status===404?'Replay 已輪替移除，請重新整理清單':'無法讀取 Replay');
    const tape=await response.json();if(!await loadGameAssets())throw Error('遊戲素材載入失敗，請重試');
    if(generation!==agentGeneration)return;await playAgentReplay(tape,generation);
    if(generation===agentGeneration)trainingReplayStatus('playing','播放中 · 使用錄製時的邏輯 viewport');
  }catch(error){if(generation===agentGeneration){agentMessage(error.message);trainingReplayStatus('error',error.message);}}
}
if(aiReplayEnabled&&typeof window!=='undefined'&&typeof location!=='undefined'){
  const name=new URLSearchParams(location.search).get('trainingReplay');
  if(name)playTrainingReplay(name);
  window.addEventListener('blur',()=>{if(trainingReplayName&&simulationSession?.active&&state==='paused')trainingReplayStatus('paused','已暫停');});
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent||!trainingReplayName||event.data?.type!=='banana-replay-control')return;
    if(event.data.action==='seek')seekAgentReplay(event.data.seconds);
    if(replaySeeking)return;
    if(event.data.action==='restart')playTrainingReplay(trainingReplayName);
    if(event.data.action==='pause'&&(state==='playing'||state==='paused')){const desired=event.data.paused!==false;if((state==='playing')===desired)pause();trainingReplayStatus(state,state==='paused'?'已暫停':'播放中');}
  });
}

'use strict';
const aiReplayEnabled=globalThis.BANANA_FEATURES?.aiReplay===true;
$('aiOptions').hidden=!aiReplayEnabled;$('agentStatus').hidden=!aiReplayEnabled;
for(const id of ['autoAgent','agentSeed','recordAgent','downloadReplay','importReplay'])$(id).disabled=!aiReplayEnabled;
let agentRun=null,lastAgentReplay=null,agentAccumulator=0,sourceDigestPromise=null,agentGeneration=0;
async function browserSimulationDigest(){
  return sourceDigestPromise||=Promise.all(simulationSources.map(async name=>{const url=Array.from(document.scripts).find(script=>script.src&&new URL(script.src).pathname.endsWith('/'+name))?.src||name;const response=await fetch(url,{cache:'force-cache'});if(!response.ok)throw Error('無法讀取模擬版本');return name+'\n'+await response.text();})).then(async texts=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(texts.join('\n')))),n=>n.toString(16).padStart(2,'0')).join('')).catch(error=>{sourceDigestPromise=null;throw error;});
}
function preserveAgentReplay(){if(agentRun?.recording)lastAgentReplay=agentRun.environment.replay();}
function agentMessage(text){$('agentStatus').textContent=aiReplayEnabled?text:'';}
function stopAgentRun(){agentGeneration++;preserveAgentReplay();agentRun=null;agentAccumulator=0;stopSimulation();agentMessage('');}
async function startControlledGame(){
  stopAgentRun();const generation=agentGeneration;canvas.style.objectFit='';resize();
  if(!aiReplayEnabled||!$('autoAgent').checked){agentMessage('');reset();return;}
  $('start').disabled=true;
  try{
    const digest=await browserSimulationDigest(),seed=Number($('agentSeed').value);
    if(generation!==agentGeneration)return;
    const environment=createSimulation({mode:$('gameMode').value,seed,width:Math.round(W),height:Math.round(H),mobile:characterScale()<1,record:$('recordAgent').checked,sourceDigest:digest});
    agentRun={environment,recording:$('recordAgent').checked,action:{}};agentAccumulator=0;canvas.style.objectFit='contain';resize();agentMessage('AI 自動操作 · P 暫停');
  }catch(error){if(generation===agentGeneration){agentMessage(error.message);$('start').disabled=false;}}
}
function advanceAgentFrame(dt){
  if(!aiReplayEnabled||!agentRun||!simulationSession?.active)return;
  if(mobilePlayBlocked)return;
  agentAccumulator+=Math.min(Math.max(0,dt),.25);
  try{
    while(agentAccumulator>=simulationDt&&state==='playing'&&simulationSession.active){
      agentAccumulator-=simulationDt;const run=agentRun;
      if(run.playback){
        if(run.playback.step().done){simulationSession.active=false;state=state==='over'?'over':'paused';agentMessage('Replay 播放完成 · 結果驗證通過');trainingReplayStatus('complete','播放完成 · 結果驗證通過');break;}
      }else{
        if(run.environment.steps%6===0)run.action=run.environment.policy(run.environment.observe());
        run.environment.step(run.action);
        if(state==='over'){preserveAgentReplay();simulationSession.active=false;agentMessage('AI 結束 · '+(player.hp>0?'過關':'挑戰失敗'));}
      }
    }
  }catch(error){simulationSession.active=false;state='paused';agentMessage('Replay 錯誤：'+error.message);trainingReplayStatus('error',error.message);}
}
if(aiReplayEnabled)$('downloadReplay').addEventListener('click',()=>{
  preserveAgentReplay();if(!lastAgentReplay){agentMessage('請先勾選「記錄 Replay」執行 AI，或匯入 Replay。');return;}
  const url=URL.createObjectURL(new Blob([JSON.stringify(lastAgentReplay)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=`banana-hop-${lastAgentReplay.config.mode}-${lastAgentReplay.config.seed}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
async function playAgentReplay(tape,generation=++agentGeneration){
  validateReplay(tape);const digest=await browserSimulationDigest();
  if(generation!==agentGeneration)return;
  if(tape.sourceDigest!==digest)throw Error('Replay 需要與錄製時相同的遊戲程式版本');
  preserveAgentReplay();const playback=createReplay(tape);lastAgentReplay=tape;agentRun={environment:playback.environment,playback,recording:false};agentAccumulator=0;
  canvas.style.objectFit='contain';resize();agentMessage('Replay 播放中 · P 暫停');
}
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
    if(event.data.action==='restart')playTrainingReplay(trainingReplayName);
    if(event.data.action==='pause'&&(state==='playing'||state==='paused')){const desired=event.data.paused!==false;if((state==='playing')===desired)pause();trainingReplayStatus(state,state==='paused'?'已暫停':'播放中');}
  });
}

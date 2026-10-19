'use strict';
const $=id=>document.getElementById(id),state={run:null,rows:[],runs:[],source:null,page:0,controller:null,playing:null},pageSize=30;
const seconds=n=>Number(n).toFixed(2)+' 秒',mb=n=>(n/1000000).toFixed(2)+' MB';
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function svg(tag,attrs,text){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))e.setAttribute(key,value);if(text!==undefined)e.textContent=text;return e;}
function stopPlayer(){state.playing=null;$('player').src='about:blank';$('viewer').hidden=true;$('pause').disabled=$('restart').disabled=true;}
function play(row){
  if(!row.replay)return;
  const run=state.runs.find(r=>r.id===state.run);if(run.source_digest!==state.source)return;
  state.playing=row.replay;$('viewer').hidden=false;$('replay-title').textContent='第 '+row.generation+' 代 · '+(row.reason==='baseline'?'初代基準':'突破紀錄');
  $('replay-detail').textContent='評估平均 '+seconds(row.mean)+' · 此段 Replay '+seconds(row.replay_score)+' · '+mb(row.bytes);
  $('play-status').textContent='載入遊戲與 Replay…';$('pause').disabled=$('restart').disabled=true;
  $('player').src='/?trainingReplay='+encodeURIComponent(row.replay);$('viewer').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderChart(){
  const chart=$('chart');chart.replaceChildren();const rows=state.rows;if(!rows.length)return;
  const width=Math.max(360,Math.min(1000,chart.clientWidth));chart.setAttribute('viewBox','0 0 '+width+' 290');
  const left=48,right=width-20,top=20,bottom=242,min=rows[0].generation,max=rows[rows.length-1].generation;
  const x=n=>left+(n-min)/(max-min||1)*(right-left),y=n=>bottom-n/60*(bottom-top);
  for(const value of [0,15,30,45,60]){chart.append(svg('line',{x1:left,x2:right,y1:y(value),y2:y(value),stroke:'#e3e8da'}),svg('text',{x:36,y:y(value)+4,'text-anchor':'end'},value+'s'));}
  chart.append(svg('text',{x:left,y:272},'第 '+min+' 代'),svg('text',{x:right,y:272,'text-anchor':'end'},'第 '+max+' 代'));
  // Preserve all retained milestones; sample other points only for SVG drawing.
  const stride=Math.max(1,Math.ceil(rows.length/1500)),sample=rows.filter((r,i)=>i%stride===0||r.replay||i===rows.length-1);
  for(const [key,color,width] of [['maximum','#b38325',1.5],['mean','#38654a',2.8]])chart.append(svg('polyline',{points:sample.map(r=>x(r.generation)+','+y(r[key])).join(' '),fill:'none',stroke:color,'stroke-width':width,'stroke-linejoin':'round'}));
  const run=state.runs.find(r=>r.id===state.run),compatible=run.source_digest===state.source;
  for(const r of rows.filter(r=>r.replay)){const dot=svg('circle',{cx:x(r.generation),cy:y(r.mean),r:6,fill:r.reason==='baseline'?'#b38325':'#38654a',class:'point',tabindex:compatible?0:-1,role:'button','aria-disabled':String(!compatible),'aria-label':'播放第 '+r.generation+' 代，平均 '+seconds(r.mean)});dot.append(svg('title',{},'第 '+r.generation+' 代 · '+seconds(r.mean)+(compatible?' · 點擊播放':' · 遊戲版本不同')));dot.addEventListener('click',()=>play(r));dot.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();play(r);}});chart.append(dot);}
}
function renderTable(){
  const all=state.rows.filter(r=>!$('saved-only').checked||r.replay).slice().reverse(),pages=Math.max(1,Math.ceil(all.length/pageSize));state.page=Math.min(state.page,pages-1);$('rows').replaceChildren();
  const compatible=state.runs.find(r=>r.id===state.run)?.source_digest===state.source;
  for(const row of all.slice(state.page*pageSize,(state.page+1)*pageSize)){
    const tr=node('tr');for(const text of [row.generation,seconds(row.mean),seconds(row.minimum)+' / '+seconds(row.maximum),Math.round(row.success_rate*100)+'%',row.samples])tr.append(node('td',text));
    const reason=node('td'),label=row.reason==='baseline'?'第一代':row.reason==='breakthrough'?'顯著突破':'分數紀錄';reason.append(node('span',label,'badge '+(row.reason==='baseline'?'baseline':'')));tr.append(reason);
    const action=node('td');if(row.replay){const button=node('button','播放');button.disabled=!compatible;button.setAttribute('aria-label','播放第 '+row.generation+' 代');if(!compatible)button.title='遊戲程式版本不同，請切回錄製時版本';button.addEventListener('click',()=>play(row));const link=node('a','下載');link.href='/training/api/replays/'+encodeURIComponent(row.replay);link.download=row.replay;action.append(button,link);}else action.append(node('span',row.reason==='score-only'?'—':'已輪替移除','removed'));tr.append(action);$('rows').append(tr);
  }
  if(!all.length){const tr=node('tr'),td=node('td','沒有符合的紀錄');td.colSpan=7;tr.append(td);$('rows').append(tr);}
  $('page').textContent=(state.page+1)+' / '+pages;$('previous').disabled=state.page===0;$('next').disabled=state.page===pages-1;
}
function render(data){
  const run=state.runs.find(r=>r.id===state.run);$('empty').hidden=!!run;$('content').hidden=!run;
  $('storage').textContent='Replay '+data.usage.files+' / '+data.usage.maxFiles+' 個 · '+mb(data.usage.bytes)+' / '+mb(data.usage.maxBytes);
  $('storage-fill').style.width=Math.min(100,data.usage.bytes/data.usage.maxBytes*100)+'%';
  if(!run)return;const latest=state.rows[state.rows.length-1];$('generations').textContent=run.generations;$('best').textContent=seconds(run.best);$('latest').textContent=latest?seconds(latest.mean):'—';$('success').textContent=latest?Math.round(latest.success_rate*100)+'%':'—';
  $('run-info').textContent=run.name+' · '+run.trainer+' · 每代 '+run.sample_count+' 場'+(run.source_digest!==state.source?' · 舊版遊戲紀錄，請下載並切回對應程式播放':'');
  $('threshold').textContent='超過上次保留的最佳平均至少 '+run.absolute+' 秒或 '+Math.round(run.relative*100)+'%（取較大者）才保留 Replay。';renderChart();renderTable();
}
async function load(runId=state.run,reset=false){
  state.controller?.abort();const controller=new AbortController();state.controller=controller;$('refresh').disabled=true;
  if(reset){state.rows=[];state.page=0;state.run=runId;stopPlayer();}
  try{
    let data,after=state.rows[state.rows.length-1]?.generation||0;
    do{
      const params=new URLSearchParams({after:String(after)});if(runId)params.set('run',runId);
      const response=await fetch('/training/api/generations?'+params,{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('無法讀取本機訓練紀錄（'+response.status+'）');data=await response.json();if(controller!==state.controller)return;
      state.runs=data.runs;state.source=data.sourceDigest;state.run=data.runId;runId=data.runId;
      if(!state.runs.some(r=>r.id===state.run)){state.rows=[];break;}
      const total=state.runs.find(r=>r.id===state.run).generations;
      if(total<after){state.rows=[];after=0;continue;}
      state.rows.push(...data.generations);after=state.rows[state.rows.length-1]?.generation||0;
    }while(data.generations.length===500||state.rows.length<state.runs.find(r=>r.id===state.run)?.generations);
    const retained=new Set(data.retained);for(const row of state.rows)if(row.replay&&!retained.has(row.replay)){row.replay=null;row.bytes=0;}
    if(document.activeElement!==$('run')){$('run').replaceChildren(...state.runs.map(r=>{const option=node('option',r.name+' · '+r.trainer);option.value=r.id;return option;}));if(!state.runs.length)$('run').append(node('option','尚無紀錄'));$('run').value=state.run||'';}
    render(data);$('sync').textContent='每 3 秒更新 · '+new Date().toLocaleTimeString('zh-TW');
  }catch(error){if(error.name!=='AbortError')$('sync').textContent=error.message;}
  finally{if(controller===state.controller){state.controller=null;$('refresh').disabled=false;}}
}
$('run').addEventListener('change',()=>load($('run').value,true));$('refresh').addEventListener('click',()=>load());$('saved-only').addEventListener('change',()=>{state.page=0;renderTable();});$('previous').addEventListener('click',()=>{state.page--;renderTable();});$('next').addEventListener('click',()=>{state.page++;renderTable();});$('close').addEventListener('click',stopPlayer);
for(const action of ['pause','restart'])$(action).addEventListener('click',()=>$('player').contentWindow.postMessage({type:'banana-replay-control',action,paused:$('pause').textContent!=='繼續'},location.origin));
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('player').contentWindow||event.data?.type!=='banana-replay-status'||event.data.name!==state.playing)return;const {status,message}=event.data;$('play-status').textContent=message;$('pause').disabled=!['playing','paused'].includes(status);$('pause').textContent=status==='paused'?'繼續':'暫停';$('restart').disabled=status==='loading';});
window.addEventListener('resize',()=>{if(state.rows.length)renderChart();});
load();setInterval(()=>{if(!document.hidden&&!state.controller)load();},3000);

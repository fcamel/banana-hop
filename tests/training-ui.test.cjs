'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element{constructor(tag){this.tag=tag;this.children=[];this.checked=false;this.textContent='';this.style={};this.clientWidth=800;}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(){}addEventListener(){}}
const ids=new Map(),document={getElementById(id){if(!ids.has(id))ids.set(id,new Element(id));return ids.get(id);},createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag)};
const source=fs.readFileSync('tools/training/app.js','utf8'),context=vm.createContext({document,AbortController,URLSearchParams});vm.runInContext(source.slice(0,source.indexOf("$('run').addEventListener"))+'\nglobalThis.testUI={state,duration,renderTable,load};',context);
const {state,duration,renderTable}=context.testUI;
assert.equal(duration(null),'—');assert.equal(duration(undefined),'—');assert.equal(duration(0),'0.0 秒');assert.equal(duration(12.34),'12.3 秒');assert.equal(duration(73.4),'1 分 13.4 秒');assert.equal(duration(NaN),'—');assert.equal(duration(119.99),'2 分 0.0 秒');
state.run='test';state.source='same';state.runs=[{id:'test',source_digest:'same'}];state.rows=[{generation:1,mean:20,minimum:10,maximum:30,success_rate:0,samples:4,reason:'baseline',timingSeconds:null},{generation:2,mean:21,minimum:11,maximum:31,success_rate:0,samples:4,reason:'score-only',timingSeconds:{total:73.4,rollout:20,update:50,evaluation:3,save:.4}}];renderTable();const rows=ids.get('rows').children;assert.equal(rows.length,2);assert.equal(rows[0].children.length,8);assert.equal(rows[0].children[1].textContent,'1 分 13.4 秒');assert.ok(rows[0].children[1].title.includes('更新 50.0 秒'));assert.equal(rows[1].children[1].textContent,'—');
state.rows=[];renderTable();assert.equal(ids.get('rows').children[0].children[0].colSpan,8);
assert.ok(fs.readFileSync('tools/training/index.html','utf8').includes('<th>訓練耗時</th>'));
console.log('PASS Training duration UI renders measured timings, unknown and zero durations, phase details and empty tables');

(async()=>{
 const run={id:'test',source_digest:'same',name:'test',trainer:'PPO',generations:1,best:20,sample_count:4};
 const row={generation:1,mean:20,minimum:10,maximum:30,success_rate:0,samples:4,reason:'score-only',timingSeconds:null};
 const base={runs:[run],runId:'test',retained:[],usage:{files:0,maxFiles:100,bytes:0,maxBytes:100000000},sourceDigest:'same'};
 const replies=[{...base,generations:[row],timings:[]},{...base,generations:[],timings:[{generation:1,timingSeconds:{total:73.4}}]}];
 context.fetch=async()=>({ok:true,json:async()=>replies.shift()});
 await context.testUI.load('test',true);assert.equal(state.rows[0].timingSeconds,null);
 await context.testUI.load();assert.equal(state.rows.length,1);assert.equal(state.rows[0].timingSeconds.total,73.4);assert.equal(ids.get('sync').textContent.startsWith('每 3 秒更新'),true,ids.get('sync').textContent);assert.equal(ids.get('rows').children[0].children[1].textContent,'1 分 13.4 秒');
 console.log('PASS Incremental Dashboard refresh fills timing on an already-loaded generation without duplicate rows');
})().catch(e=>{console.error(e);process.exitCode=1;});

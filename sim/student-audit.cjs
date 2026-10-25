'use strict';
const {decode}=require('./visible-baseline.cjs');
function situation(features){
 const {player:p,objects:o}=decode(features),near=o.filter(x=>['slices','milk','drops'].includes(x.kind)&&Math.hypot(x.x,x.y)<180);
 return {phase:p.z<=1?'ground':p.vz>0?'rising':'falling',lowHP:p.hp<=2,fuel:p.fuel>0,bullets:o.some(x=>x.kind==='drops'),flight:o.some(x=>x.kind==='slices'&&x.flight),cluster:near.filter(x=>x.kind!=='drops').length>=4,nearThreat:near.length>0};
}
const key=features=>JSON.stringify(situation(features));
function coverage(rows){const counts={};for(const r of rows){const k=key(r.features);counts[k]=(counts[k]||0)+1;}return counts;}
function summarize(rows){
 const out={};for(const r of rows){for(const group of ['all',r.hits?'hit':'no-hit',r.trainingCount<=5?'sparse':'covered']){const s=out[group]??={decisions:0,seconds:0,hits:0,disagree:0,skillDisagree:0,sparse:0};s.decisions++;s.seconds+=r.duration;s.hits+=r.hits;s.disagree+=+r.disagree;s.skillDisagree+=+(r.choice[0]!==r.teacher[0]);s.sparse+=+(r.trainingCount<=5);}}
 for(const s of Object.values(out)){s.disagreementRate=s.disagree/s.decisions;s.hitsPerSecond=s.seconds?s.hits/s.seconds:0;s.sparseRate=s.sparse/s.decisions;}return out;
}
module.exports={situation,key,coverage,summarize};

'use strict';
const {Random}=require('./ppo.cjs');
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function bootstrap(values){
 if(!values.length||values.some(x=>!Number.isFinite(x)))throw Error('Invalid paired samples');
 const rng=new Random(1749),draws=[];
 for(let i=0;i<4000;i++)draws.push(mean(values.map(()=>values[Math.floor(rng.next()*values.length)])));
 draws.sort((a,b)=>a-b);return {mean:mean(values),ci95:[draws[100],draws[3899]],nSeeds:values.length};
}
function summarize(rows){
 const groups=new Map();for(const r of rows){const key=r.policy+' / '+(r.greedy?'greedy':r.policySeed===null?'deterministic':'sample');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 return [...groups].map(([policy,rs])=>{const seeds=[...new Set(rs.map(r=>r.seed))],perSeed=seeds.map(seed=>mean(rs.filter(r=>r.seed===seed).map(r=>r.summary.gameSeconds)));return {policy,episodes:rs.length,...bootstrap(perSeed),wins:rs.filter(r=>r.success).length,meanHits:mean(rs.map(r=>r.hits)),meanMilk:mean(rs.map(r=>r.items.milkBottles)),min:Math.min(...rs.map(r=>r.summary.gameSeconds)),max:Math.max(...rs.map(r=>r.summary.gameSeconds))};});
}
function paired(rows,policy){const rs=rows.filter(r=>r.policy===policy),seeds=[...new Set(rs.map(r=>r.seed))];return bootstrap(seeds.map(seed=>{const a=rs.filter(r=>r.seed===seed&&r.greedy),b=rs.filter(r=>r.seed===seed&&!r.greedy);if(a.length!==1||!b.length)throw Error('Missing paired evaluation');return a[0].summary.gameSeconds-mean(b.map(r=>r.summary.gameSeconds));}));}
module.exports={bootstrap,summarize,paired};

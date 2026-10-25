'use strict';
// Deterministic round-robin over directions, then evenly spaced rows within
// each bucket. No duplication to make rare skills look more abundant.
function balancedProbe(rows,perSkill=8){
 const result=[];
 for(const skill of [0,6,3,7]){
  const groups=new Map();for(const row of rows)if(row.action[0]===skill&&(skill!==0||row.action[1]!==0)){const d=row.action[1];if(!groups.has(d))groups.set(d,[]);groups.get(d).push(row);}
  const keys=[...groups.keys()].sort((a,b)=>a-b),quotas=new Map(keys.map(k=>[k,0]));let remaining=perSkill;
  while(remaining){let progress=false;for(const k of keys)if(remaining&&quotas.get(k)<groups.get(k).length){quotas.set(k,quotas.get(k)+1);remaining--;progress=true;}if(!progress)throw Error(`Insufficient unique rows for skill ${skill}`);}
  for(const k of keys){const pool=groups.get(k),n=quotas.get(k);for(let i=0;i<n;i++)result.push(pool[Math.floor((i+.5)*pool.length/n)]);}
 }
 if(new Set(result).size!==result.length)throw Error('Duplicated probe rows');return result;
}
module.exports={balancedProbe};

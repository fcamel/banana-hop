'use strict';
// Keep a 50/50 teacher/learner source mix. Reserve modest per-source quotas
// for rare skills, and draw the remainder from that source's full distribution.
function createStratifiedSampler(natural,learner){
 if(!natural.length||!learner.length)throw Error('Both training sources are required');
 const pools=[natural,learner].map(all=>({all,jet:all.filter(r=>r.action[0]===6),evade:all.filter(r=>r.action[0]===3)}));
 return (rng,size=32)=>{
  if(!Number.isInteger(size)||size<16||size%16)throw Error('Batch size must be a positive multiple of 16');
  const batch=[],half=size/2,draw=pool=>pool[Math.floor(rng.next()*pool.length)];
  for(const p of pools){let n=0;for(const [pool,quota]of [[p.jet,half/8],[p.evade,half/4]])if(pool.length)for(let i=0;i<quota;i++){batch.push(draw(pool));n++;}while(n++<half)batch.push(draw(p.all));}
  return batch;
 };
}
module.exports={createStratifiedSampler};

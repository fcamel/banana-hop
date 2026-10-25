'use strict';
function ranking(rows){
 if(rows.some(r=>!Number.isFinite(r.score)||typeof r.positive!=='boolean'))throw Error('Invalid ranking row');
 const n=rows.length,p=rows.filter(r=>r.positive).length,neg=n-p,sorted=rows.slice().sort((a,b)=>b.score-a.score),curve=[{threshold:null,tp:0,fp:0,precision:1,recall:0}],bins=Array.from({length:10},(_,i)=>({lo:i/10,hi:(i+1)/10,count:0,positive:0,scoreSum:0}));
 let tp=0,fp=0,ap=0,aucArea=0;
 for(let i=0;i<n;){let j=i,dp=0,dn=0;while(j<n&&sorted[j].score===sorted[i].score){sorted[j].positive?dp++:dn++;j++;}aucArea+=dn*(tp+dp/2);tp+=dp;fp+=dn;const precision=tp/(tp+fp),recall=p?tp/p:0;ap+=p?dp/p*precision:0;curve.push({threshold:sorted[i].score,tp,fp,precision,recall});i=j;}
 const probability=rows.every(r=>r.score>=0&&r.score<=1);let brier=0;
 if(probability)for(const r of rows){const b=bins[Math.min(9,Math.floor(r.score*10))];b.count++;b.positive+=+r.positive;b.scoreSum+=r.score;brier+=(r.score-(+r.positive))**2;}
 return {rows:n,positive:p,negative:neg,prevalence:n?p/n:null,auc:p&&neg?aucArea/(p*neg):null,averagePrecision:p?ap:null,curve,brier:probability&&n?brier/n:null,bins:probability?bins.map(b=>({...b,meanScore:b.count?b.scoreSum/b.count:null,positiveRate:b.count?b.positive/b.count:null})):null};
}
module.exports={ranking};

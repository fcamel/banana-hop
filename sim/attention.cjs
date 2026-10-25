'use strict';
// CPU entity encoder + masked multi-head self-attention. Only consumes the
// existing visible feature vector; no environment, forecast or RNG access.
const {Network,distribution,policySize,Random}=require('./ppo.cjs');
const {groups,featureCount}=require('./training.cjs');
const {heads}=require('./skills.cjs');
const targetOffset=heads[0]+heads[1],targetEnd=targetOffset+heads[2];
const globalIndices=Array.from({length:policySize+1},(_,i)=>i).filter(i=>i<targetOffset||i>=targetEnd);
const architecture='entity-attention-v1';
const zeros=n=>new Float64Array(n);
function plus(a,b){for(let i=0;i<a.length;i++)a[i]+=b[i];}
class AttentionNetwork{
  constructor(input=featureCount,hidden=32,rng=new Random()){
    if(input!==featureCount||!Number.isInteger(hidden)||hidden<4||hidden%2)throw Error('Attention requires the visible feature contract and an even width >= 4');
    this.architecture=architecture;this.width=hidden;this.headCount=2;this.sizes=[input,hidden,policySize+1];this.parameters=[];this.layers=[];
    const layer=(ins,outs,gain=Math.sqrt(6/(ins+outs)))=>{const w=this.parameters.length;for(let i=0;i<ins*outs;i++)this.parameters.push((rng.next()*2-1)*gain);const b=this.parameters.length;for(let i=0;i<outs;i++)this.parameters.push(0);const l={ins,outs,w,b};this.layers.push(l);return l;};
    this.encoders=[[layer(42,hidden),layer(hidden,hidden)],...groups.map(([, ,width])=>[layer(width,hidden),layer(hidden,hidden)])];
    this.q=layer(hidden,hidden);this.k=layer(hidden,hidden);this.v=layer(hidden,hidden);this.o=layer(hidden,hidden);
    this.ff1=layer(hidden,hidden*2);this.ff2=layer(hidden*2,hidden);
    this.poolQ=layer(hidden,hidden);this.poolK=layer(hidden,hidden);this.poolV=layer(hidden,hidden);this.poolO=layer(hidden,hidden);
    this.actor=layer(hidden,hidden);this.output=layer(hidden,globalIndices.length,.1);
    this.targetQuery=layer(hidden,hidden);this.targetKey=layer(hidden,hidden);
    this.skillEmbedding=this.parameters.length;for(let i=0;i<heads[0]*hidden;i++)this.parameters.push((rng.next()*2-1)*.1);
    this.noneTarget=this.parameters.length;this.parameters.push(0);this.parameters=Float64Array.from(this.parameters);
  }
  linear(l,x){const y=zeros(l.outs),p=this.parameters;for(let j=0;j<l.outs;j++){let z=p[l.b+j];for(let i=0;i<l.ins;i++)z+=p[l.w+j*l.ins+i]*x[i];y[j]=z;}return y;}
  linearBack(l,x,dy,g){const dx=zeros(l.ins),p=this.parameters;for(let j=0;j<l.outs;j++){g[l.b+j]+=dy[j];for(let i=0;i<l.ins;i++){g[l.w+j*l.ins+i]+=dy[j]*x[i];dx[i]+=p[l.w+j*l.ins+i]*dy[j];}}return dx;}
  tanh(x){return x.map(Math.tanh);}
  tanhBack(y,dy){return dy.map((v,i)=>v*(1-y[i]*y[i]));}
  tokens(input){
    if(input.length!==featureCount||!input.every(Number.isFinite))throw Error('Invalid attention observation');
    const tokens=[{group:0,slot:0,x:Float64Array.from([...input.slice(0,32),...input.slice(-10)])}];let offset=32,slot=1;
    for(let g=0;g<groups.length;g++){const [name,count,width]=groups[g],targetable=name!=='drops'&&name!=='warnings';for(let i=0;i<count;i++){if(input[offset]===1)tokens.push({group:g+1,slot:targetable?slot+i:null,x:input.slice(offset,offset+width)});offset+=width;}if(targetable)slot+=count;}
    return tokens;
  }
  sceneForward(baseScene){return {scene:baseScene};}
  sceneBackward(c,dscene){return dscene;}
  forward(input,masks=null,skill=0){
    const d=this.width,h=d/this.headCount,tokens=this.tokens(input),n=tokens.length;
    for(const t of tokens){const e=this.encoders[t.group];t.e1=this.tanh(this.linear(e[0],t.x));t.e=this.tanh(this.linear(e[1],t.e1));t.q=this.linear(this.q,t.e);t.k=this.linear(this.k,t.e);t.v=this.linear(this.v,t.e);t.mix=zeros(d);t.attention=[];}
    for(let i=0;i<n;i++)for(let head=0;head<this.headCount;head++){
      const start=head*h,scores=zeros(n);for(let j=0;j<n;j++){let s=0;for(let k=start;k<start+h;k++)s+=tokens[i].q[k]*tokens[j].k[k];scores[j]=s/Math.sqrt(h);}
      const weights=distribution(scores);tokens[i].attention.push(weights);
      for(let j=0;j<n;j++)for(let k=start;k<start+h;k++)tokens[i].mix[k]+=weights[j]*tokens[j].v[k];
    }
    for(const t of tokens){t.projected=this.linear(this.o,t.mix);t.residual=this.tanh(t.e.map((v,i)=>v+t.projected[i]));t.f1=this.tanh(this.linear(this.ff1,t.residual));t.f2=this.linear(this.ff2,t.f1);t.z=this.tanh(t.residual.map((v,i)=>v+t.f2[i]));t.targetKey=this.linear(this.targetKey,t.z);}
    // Pool the already contextualized tokens, so the scene can use relations
    // learned by the object-to-object block, rather than just raw embeddings.
    const pool={q:this.linear(this.poolQ,tokens[0].z),keys:tokens.map(t=>this.linear(this.poolK,t.z)),values:tokens.map(t=>this.linear(this.poolV,t.z)),mix:zeros(d),weights:[]};
    for(let head=0;head<this.headCount;head++){const start=head*h,scores=zeros(n);for(let j=0;j<n;j++){let score=0;for(let k=start;k<start+h;k++)score+=pool.q[k]*pool.keys[j][k];scores[j]=score/Math.sqrt(h);}const weights=distribution(scores);pool.weights.push(weights);for(let j=0;j<n;j++)for(let k=start;k<start+h;k++)pool.mix[k]+=weights[j]*pool.values[j][k];}
    const pooled=this.linear(this.poolO,pool.mix),baseScene=this.tanh(tokens[0].z.map((v,i)=>v+pooled[i]));
    const extension=this.sceneForward(baseScene,tokens,input),scene=extension.scene;
    const actor=this.tanh(this.linear(this.actor,scene)),global=this.linear(this.output,actor),logits=zeros(policySize+1);
    globalIndices.forEach((at,i)=>{logits[at]=global[i];});
    const cache={tokens,pool,baseScene,extension,scene,actor,activations:[input,logits],skill};this.condition(cache,skill);
    let offset=0;cache.probs=heads.map((size,i)=>{const p=distribution(logits.slice(offset,offset+size),masks?.[i]);offset+=size;return p;});cache.value=logits[policySize]*60;return cache;
  }
  condition(cache,skill){
    if(!Number.isInteger(skill)||skill<0||skill>=heads[0])throw Error('Invalid attention skill');
    const d=this.width,query=this.linear(this.targetQuery,cache.scene),p=this.parameters,logits=cache.activations.at(-1);
    cache.skill=skill;cache.query=this.tanh(query.map((v,i)=>v+p[this.skillEmbedding+skill*d+i]));
    // Absent slots have no token and must not receive probability, even without
    // a caller mask. The explicit canonical no-target slot is always finite.
    logits.fill(-1e9,targetOffset,targetEnd);logits[targetOffset]=p[this.noneTarget];
    for(const t of cache.tokens.slice(1))if(t.slot!==null){let score=0;for(let k=0;k<d;k++)score+=cache.query[k]*t.targetKey[k];logits[targetOffset+t.slot]=score/Math.sqrt(d);}
  }
  headBackward(c,out){return {out};}
  backward(c,out,g){
    const extra=this.headBackward(c,out,g);out=extra.out;
    const d=this.width,h=d/this.headCount,n=c.tokens.length,tokens=c.tokens,dz=tokens.map(()=>zeros(d));
    const dg=Float64Array.from(globalIndices,i=>out[i]);const da=this.linearBack(this.output,c.actor,dg,g),dscene=this.linearBack(this.actor,c.scene,this.tanhBack(c.actor,da),g);
    if(extra.sceneGradient)plus(dscene,extra.sceneGradient);
    g[this.noneTarget]+=out[targetOffset];const dq=zeros(d);
    for(let i=1;i<n;i++){const t=tokens[i];if(t.slot===null)continue;const s=out[targetOffset+t.slot]/Math.sqrt(d),dk=zeros(d);for(let k=0;k<d;k++){dq[k]+=s*t.targetKey[k];dk[k]=s*c.query[k];}plus(dz[i],this.linearBack(this.targetKey,t.z,dk,g));}
    const dquery=this.tanhBack(c.query,dq);for(let k=0;k<d;k++)g[this.skillEmbedding+c.skill*d+k]+=dquery[k];plus(dscene,this.linearBack(this.targetQuery,c.scene,dquery,g));
    const dbase=this.sceneBackward(c,dscene,dz,g,extra),dp=this.tanhBack(c.baseScene,dbase);plus(dz[0],dp);const dpoolMix=this.linearBack(this.poolO,c.pool.mix,dp,g),dpoolQ=zeros(d),dpoolK=tokens.map(()=>zeros(d)),dpoolV=tokens.map(()=>zeros(d));
    for(let head=0;head<this.headCount;head++){const start=head*h,weights=c.pool.weights[head],dw=zeros(n);let average=0;for(let j=0;j<n;j++){for(let k=start;k<start+h;k++){dw[j]+=dpoolMix[k]*c.pool.values[j][k];dpoolV[j][k]+=weights[j]*dpoolMix[k];}average+=weights[j]*dw[j];}for(let j=0;j<n;j++){const ds=weights[j]*(dw[j]-average)/Math.sqrt(h);for(let k=start;k<start+h;k++){dpoolQ[k]+=ds*c.pool.keys[j][k];dpoolK[j][k]+=ds*c.pool.q[k];}}}
    plus(dz[0],this.linearBack(this.poolQ,tokens[0].z,dpoolQ,g));for(let i=0;i<n;i++){plus(dz[i],this.linearBack(this.poolK,tokens[i].z,dpoolK[i],g));plus(dz[i],this.linearBack(this.poolV,tokens[i].z,dpoolV[i],g));}
    const de=tokens.map(()=>zeros(d)),dQ=tokens.map(()=>zeros(d)),dK=tokens.map(()=>zeros(d)),dV=tokens.map(()=>zeros(d)),dm=[];
    for(let i=0;i<n;i++){const t=tokens[i],dr=this.tanhBack(t.z,dz[i]);const df1=this.linearBack(this.ff2,t.f1,dr,g);plus(dr,this.linearBack(this.ff1,t.residual,this.tanhBack(t.f1,df1),g));const dp=this.tanhBack(t.residual,dr);plus(de[i],dp);dm.push(this.linearBack(this.o,t.mix,dp,g));}
    for(let i=0;i<n;i++)for(let head=0;head<this.headCount;head++){
      const start=head*h,weights=tokens[i].attention[head],dw=zeros(n);let average=0;
      for(let j=0;j<n;j++){for(let k=start;k<start+h;k++){dw[j]+=dm[i][k]*tokens[j].v[k];dV[j][k]+=weights[j]*dm[i][k];}average+=weights[j]*dw[j];}
      for(let j=0;j<n;j++){const ds=weights[j]*(dw[j]-average)/Math.sqrt(h);for(let k=start;k<start+h;k++){dQ[i][k]+=ds*tokens[j].k[k];dK[j][k]+=ds*tokens[i].q[k];}}
    }
    for(let i=0;i<n;i++){const t=tokens[i];plus(de[i],this.linearBack(this.q,t.e,dQ[i],g));plus(de[i],this.linearBack(this.k,t.e,dK[i],g));plus(de[i],this.linearBack(this.v,t.e,dV[i],g));const enc=this.encoders[t.group],de1=this.linearBack(enc[1],t.e1,this.tanhBack(t.e,de[i]),g);this.linearBack(enc[0],t.x,this.tanhBack(t.e1,de1),g);}
  }
  sample(...args){return Network.prototype.sample.apply(this,args);}
}
module.exports={AttentionNetwork,architecture};

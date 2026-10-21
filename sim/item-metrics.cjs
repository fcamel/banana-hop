'use strict';
// Node-only counters wrap actual collection/consumption events. They do not
// enter observations, alter reward or infer a pickup from a disappearing item.
function install(){
  globalThis.trainingItemMetrics={milkBottles:0,bunches:0,surfBoards:0,milkJetSeconds:0};
  globalThis.trainingDamageEvents=[];globalThis.trainingActionHistory=[];
  const originalHurt=hurt;
  hurt=function(reason,source='enemy'){
    const before=player.hp,position={x:player.x,y:player.y,z:player.z},result=originalHurt(reason,source);
    if(player.hp<before)trainingDamageEvents.push(JSON.parse(JSON.stringify({reason,source,time:elapsed,hpBefore:before,hpAfter:player.hp,player:position,actions:trainingActionHistory.map(a=>({...a,elapsed:Math.max(0,elapsed-a.startedAt)}))})));
    return result;
  };
  const milk=collectMilkBottles,bunch=collectBunch,surf=collectSurfPickups,spray=updateMilkSpray;
  collectMilkBottles=function(path){const before=milkBottles.length;const result=milk(path);trainingItemMetrics.milkBottles+=before-milkBottles.length;return result;};
  collectBunch=function(){const result=bunch();trainingItemMetrics.bunches++;return result;};
  collectSurfPickups=function(path){const before=surfStock;const result=surf(path);trainingItemMetrics.surfBoards+=surfStock-before;return result;};
  updateMilkSpray=function(dt){const before=milkPack?.ammo||0,result=spray(dt);trainingItemMetrics.milkJetSeconds+=Math.max(0,before-(milkPack?.ammo||0))/milkRules.ammo*milkRules.jetDuration;return result;};
}
function empty(){return {milkBottles:0,bunches:0,surfBoards:0,milkJetSeconds:0};}
function add(total,next){for(const key of Object.keys(total))total[key]+=next[key];return total;}
function damageSummary(events){
  const out={hits:0,hpLost:0,byReason:{},byCurrentSkill:{},byActionSequence:{},byTime:{opening:0,middle:0,final:0}};
  for(const e of events){out.hits++;out.hpLost+=e.hpBefore-e.hpAfter;const names=e.actions.map(a=>a.skill),skill=names.at(-1)||'unassigned',sequence=names.join(' > ');for(const [map,key]of [[out.byReason,e.reason],[out.byCurrentSkill,skill],[out.byActionSequence,sequence]])map[key]=(map[key]||0)+1;out.byTime[e.time<30?'opening':e.time<50?'middle':'final']++;}
  return out;
}
function mergeDamage(total,next){total.hits+=next.hits;total.hpLost+=next.hpLost;for(const field of ['byReason','byCurrentSkill','byActionSequence','byTime'])for(const [key,value]of Object.entries(next[field]))total[field][key]=(total[field][key]||0)+value;return total;}
module.exports={empty,add,damageSummary,mergeDamage,script:`(${install.toString()})();`};

'use strict';
// Node-only counters wrap actual collection/consumption events. They do not
// enter observations, alter reward or infer a pickup from a disappearing item.
function install(){
  globalThis.trainingItemMetrics={milkBottles:0,bunches:0,surfBoards:0,milkJetSeconds:0};
  const milk=collectMilkBottles,bunch=collectBunch,surf=collectSurfPickups,spray=updateMilkSpray;
  collectMilkBottles=function(path){const before=milkBottles.length;const result=milk(path);trainingItemMetrics.milkBottles+=before-milkBottles.length;return result;};
  collectBunch=function(){const result=bunch();trainingItemMetrics.bunches++;return result;};
  collectSurfPickups=function(path){const before=surfStock;const result=surf(path);trainingItemMetrics.surfBoards+=surfStock-before;return result;};
  updateMilkSpray=function(dt){const before=milkPack?.ammo||0,result=spray(dt);trainingItemMetrics.milkJetSeconds+=Math.max(0,before-(milkPack?.ammo||0))/milkRules.ammo*milkRules.jetDuration;return result;};
}
function empty(){return {milkBottles:0,bunches:0,surfBoards:0,milkJetSeconds:0};}
function add(total,next){for(const key of Object.keys(total))total[key]+=next[key];return total;}
module.exports={empty,add,script:`(${install.toString()})();`};

'use strict';
function variant(features,seconds,mode){if(!Number.isFinite(seconds)||seconds<0||seconds>2.5||!['inv','damage','paired'].includes(mode))throw Error('Invalid invulnerability probe');const f=Float64Array.from(features);if(mode!=='damage')f[5]=seconds/2.5;if(mode!=='inv')f[6]=seconds/2.5;return f;}
module.exports={variant};

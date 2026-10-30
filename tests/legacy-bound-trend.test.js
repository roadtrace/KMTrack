const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('    function resetBoundTrend()'),end=html.indexOf('    function updateBoundAutoStatus(',start);
function fixture(){const c={trendLastKm:null,trendLastExpressway:null,trendEstablished:false,MIN_TREND_DELTA_KM:.02,userBound:'',EXPRESSWAY_BOUND_BY_TREND:{NLEX:{increasing:'NB',decreasing:'SB'}},saveBound(){}};vm.createContext(c);vm.runInContext(html.slice(start,end),c);return c;}
const fix=km=>({fresh:true,confirmed:true,uncertain:false,result:{expressway:'NLEX',km}});
test('legacy bound waits for movement, ignores jitter, and follows increasing/decreasing station',()=>{
 const c=fixture();c.applyLegacyBoundTrend(fix(20));assert.equal(c.userBound,'');
 c.applyLegacyBoundTrend(fix(20.005));assert.equal(c.userBound,'');
 c.applyLegacyBoundTrend(fix(20.03));assert.equal(c.userBound,'NB');
 c.applyLegacyBoundTrend(fix(19.99));assert.equal(c.userBound,'SB');
});
test('unconfirmed/stale positions cannot change direction and interchange clears the trend baseline',()=>{
 const c=fixture();c.applyLegacyBoundTrend(fix(20));c.applyLegacyBoundTrend({...fix(21),fresh:false});assert.equal(c.userBound,'');
 c.applyLegacyBoundTrend({...fix(21),uncertain:true});assert.equal(c.userBound,'');
 c.applyLegacyBoundTrend({...fix(null),interchangeLocked:true});assert.equal(c.trendLastKm,null);
 c.applyLegacyBoundTrend(fix(40));assert.equal(c.userBound,'');
 c.applyLegacyBoundTrend(fix(39.97));assert.equal(c.userBound,'SB');
});

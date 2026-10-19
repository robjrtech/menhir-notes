import test from 'node:test';
import assert from 'node:assert/strict';
import {createLogger,sanitizeHost} from '../scripts/log.mjs';

function harness(over={}){
 const lines=[],timers=[];let t=1_700_000_000_000;
 const log=createLogger({
  now:()=>t,
  warn:(...a)=>lines.push(a.join(' ')),
  error:(...a)=>lines.push(a.join(' ')),
  setTimer:(fn,ms)=>{const h={fn,ms};timers.push(h);return h},
  ...over
 });
 return {log,lines,timers,advance:ms=>{t+=ms}};
}
const json=lines=>lines.filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));

const hostIsClean=fn=>!/[^\x20-\x7e]/.test(fn('a\u009bb\u2028c'));
test('control: a sanitizer that only truncates is detected as unsafe, the real one is not',()=>{
 assert.equal(hostIsClean(h=>String(h).slice(0,100)),false);
 assert.equal(hostIsClean(h=>String(h).slice(0,100).replace(/[\x00-\x1f\x7f]/g,'?')),false);
 assert.equal(hostIsClean(sanitizeHost),true);
});
test('host is cut to 100 characters and non-printable characters become ?',()=>{
 for(const c of ['\u009b',' ',' ','\u001b','\n','\u0000','é','\u{1f5ff}'])assert.ok(!/[^\x20-\x7e]/.test(sanitizeHost('a'+c+'b')),JSON.stringify(c));
 assert.equal(sanitizeHost('a b'),'a?b');
 assert.equal(sanitizeHost('h'.repeat(300)).length,100);
 assert.equal(sanitizeHost(undefined),'');
});
test('lines carry allow-listed fields only',()=>{
 const {log,lines}=harness();
 log.logEvent('host_rejected',{status:403,method:'GET',host:'evil"\n{"event":"x"}',body:'SECRET',user:'u',error:'bad name\nwith newline'});
 const j=json(lines);assert.equal(j.length,1);
 assert.deepEqual(Object.keys(j[0]).sort(),['error','event','host','method','status','ts']);
 assert.equal(j[0].error,'Error');assert.equal(j[0].body,undefined);
 assert.ok(!lines[0].split('\n').slice(0,1)[0].includes('\n'));
});
test('method and error names are bounded',()=>{
 const {log,lines}=harness();
 log.logEvent('server_error',{status:500,method:'M'.repeat(100),error:'TypeError'});
 const j=json(lines)[0];assert.equal(j.method.length,16);assert.equal(j.error,'TypeError');
});
test('the first host_rejected in a window prints one ALERT line with no count',()=>{
 const {log,lines}=harness();
 for(let i=0;i<3;i++)log.logEvent('host_rejected',{status:403,method:'GET',host:'x'});
 const alerts=lines.filter(l=>l.startsWith('[menhir] ALERT:'));
 assert.equal(alerts.length,1);assert.ok(!/\d/.test(alerts[0]),alerts[0]);
 assert.equal(json(lines).length,3);
});
test('eleven events give 10 lines plus a suppressed marker',()=>{
 const {log,lines}=harness();
 for(let i=0;i<11;i++)log.logEvent('method_rejected',{status:405,method:'POST'});
 const j=json(lines);assert.equal(j.length,11);
 assert.equal(j.filter(l=>l.suppressed===undefined).length,10);assert.equal(j.at(-1).suppressed,1);
 for(let i=0;i<50;i++)log.logEvent('method_rejected',{status:405,method:'POST'});
 assert.equal(json(lines).length,11);
});
test('when the window closes the true total is printed, even if the burst already stopped',()=>{
 const {log,lines,timers}=harness();
 for(let i=0;i<25;i++)log.logEvent('method_rejected',{status:405,method:'POST'});
 assert.equal(timers.length,1);assert.equal(timers[0].ms,60000);
 timers[0].fn();
 const last=json(lines).at(-1);
 assert.deepEqual([last.event,last.count,last.suppressed],['method_rejected',25,15]);
 // The next event starts a fresh window and the ALERT can fire again.
 log.logEvent('host_rejected',{status:403,host:'x'});log.logEvent('host_rejected',{status:403,host:'x'});
 assert.equal(timers.length,2);
});
test('a window with nothing suppressed prints no total',()=>{
 const {log,lines,timers}=harness();
 log.logEvent('method_rejected',{status:405,method:'POST'});timers[0].fn();
 assert.equal(json(lines).length,1);
});
test('the default timer does not keep the process alive',()=>{
 const {logEvent}=createLogger({warn(){},error(){}});
 logEvent('method_rejected',{status:405,method:'POST'});
});

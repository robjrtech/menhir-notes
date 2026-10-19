import test from 'node:test';
import assert from 'node:assert/strict';
import {localOrigin,canonicalURL} from '../scripts/local-host.mjs';

const P=4419;
test('the canonical host is served and localhost is redirected',()=>{
 assert.equal(localOrigin('127.0.0.1:4419',P),'serve');
 assert.equal(localOrigin('localhost:4419',P),'redirect');
 assert.equal(canonicalURL(P),'http://127.0.0.1:4419/');
});
test('matching is case-insensitive',()=>{
 assert.equal(localOrigin('LOCALHOST:4419',P),'redirect');
 assert.equal(localOrigin('LocalHost:4419',P),'redirect');
});
test('the port is a parameter',()=>{
 assert.equal(localOrigin('127.0.0.1:5000',5000),'serve');
 assert.equal(localOrigin('127.0.0.1:4419',5000),null);
 assert.equal(localOrigin('127.0.0.1:4419',undefined),null);
 assert.equal(localOrigin('127.0.0.1:4419','4419'),null);
});
test('everything else is rejected',()=>{
 for(const h of ['localhost:4174','127.0.0.1:80','attacker.example:4419','127.0.0.1','localhost','localhost.:4419','127.0.0.1.:4419','[::1]:4419','','  ','localhost:4419 ',' localhost:4419','localhost:4419,evil.example','evil.example:4419@localhost:4419','__proto__','constructor','toString','localhost:04419','localhost:+4419','127.1:4419','2130706433:4419','0x7f.0.0.1:4419','0.0.0.0:4419','[::ffff:127.0.0.1]:4419','localhost:4419.','localhost:4419/','127.0.0.1:44190','xn--localhost:4419','localhost%00:4419','localhost:4419\t','evil.example/.localhost:4419'])
  assert.equal(localOrigin(h,P),null,JSON.stringify(h));
 assert.equal(localOrigin(undefined,P),null);
 assert.equal(localOrigin(null,P),null);
 assert.equal(localOrigin(['localhost:4419'],P),null);
});

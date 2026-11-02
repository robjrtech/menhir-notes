import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BRAND} from '../web/brand.js';
import {DEFAULT_VAULT,MAX_VAULTS,vaultStorage,readVaults,checkVaultName,withVault,withName,pickVault,newVaultId} from '../web/vaults.js';
import {makeStores} from './helpers.mjs';

test('the first vault keeps the original storage names, so existing notes open unchanged',()=>{
 assert.deepEqual(vaultStorage(DEFAULT_VAULT.id),{dbName:BRAND.dbName,channel:BRAND.channel,lockName:BRAND.lockName});
});
test('every other vault gets its own database, channel and file lock',()=>{
 const a=vaultStorage('a1'),b=vaultStorage('b2'),first=vaultStorage(DEFAULT_VAULT.id);
 for(const k of ['dbName','channel','lockName']){
  assert.notEqual(a[k],b[k],k);assert.notEqual(a[k],first[k],k);
  assert.ok(a[k].startsWith(BRAND.dbName),k);
 }
 assert.notEqual(a.dbName,BRAND.registryDb);
 assert.notEqual(vaultStorage('s').dbName,BRAND.registryDb,'no id can name the registry');
});
test('an empty or missing registry lists just the first vault',()=>{
 for(const raw of [undefined,null,{},'x',[]])assert.deepEqual(readVaults(raw),[{...DEFAULT_VAULT}]);
});
test('the registry drops malformed and duplicate entries and keeps the order',()=>{
 const list=readVaults([{id:'b',name:'Work'},{id:'B!',name:'Bad id'},{id:'c',name:''},{id:'d',name:'x'.repeat(61)},{id:'b',name:'Again'},null,{id:'e',name:'Home'}]);
 assert.deepEqual(list.map(v=>v.id),['personal','b','e']);
});
test('a stored entry for the first vault renames it but never moves it',()=>{
 const list=readVaults([{id:'b',name:'Work'},{id:'personal',name:'Mine'}]);
 assert.deepEqual(list,[{id:'personal',name:'Mine'},{id:'b',name:'Work'}]);
});
test('the registry is capped at the vault limit',()=>{
 const raw=Array.from({length:MAX_VAULTS+5},(_,i)=>({id:'v'+i,name:'V'+i}));
 assert.equal(readVaults(raw).length,MAX_VAULTS);
});
test('vault names are trimmed, limited and unique regardless of case',()=>{
 const list=readVaults([{id:'b',name:'Work'}]);
 assert.equal(checkVaultName('  Home  ',list),'Home');
 assert.throws(()=>checkVaultName('   ',list),/1–60/);
 assert.throws(()=>checkVaultName('x'.repeat(61),list),/1–60/);
 assert.throws(()=>checkVaultName('work',list),/already has that name/);
 assert.equal(checkVaultName('WORK',list,'b'),'WORK','renaming a vault to itself is fine');
});
test('adding a vault never throws: a duplicate id or a full list leaves the list unchanged',()=>{
 assert.deepEqual(withVault(null,{id:'b',name:'Work'}).map(v=>v.id),['personal','b']);
 assert.equal(withVault([{id:'b',name:'Work'}],{id:'b',name:'Other'}).length,2);
 const full=Array.from({length:MAX_VAULTS},(_,i)=>({id:'v'+i,name:'V'+i}));
 assert.ok(!withVault(full,{id:'new',name:'New'}).some(v=>v.id==='new'));
});
test('renaming touches only the named vault',()=>{
 assert.deepEqual(withName([{id:'b',name:'Work'}],'personal','Mine'),[{id:'personal',name:'Mine'},{id:'b',name:'Work'}]);
});
test('a remembered vault that is not listed falls back to the first vault',()=>{
 const list=readVaults([{id:'b',name:'Work'}]);
 assert.equal(pickVault(list,'b'),'b');
 for(const wanted of ['gone',null,undefined,''])assert.equal(pickVault(list,wanted),'personal');
});
test('new vault ids are valid registry ids',()=>{
 const id=newVaultId('0F8FAD5B-D9CB-469F-A165-70867728950E');
 assert.deepEqual(readVaults([{id,name:'X'}])[1],{id,name:'X'});
 assert.match(newVaultId(),/^[a-z0-9-]+$/);
});
test('two tabs adding vaults at once both keep their vault',async t=>{
 const {stores:[a,b]}=makeStores(t,2);
 await Promise.all([a.updateMeta('vaults',raw=>withVault(raw,{id:'x',name:'X'})),b.updateMeta('vaults',raw=>withVault(raw,{id:'y',name:'Y'}))]);
 assert.deepEqual(readVaults(await a.getMeta('vaults')).map(v=>v.id).sort(),['personal','x','y']);
});
test('control: a read-then-write outside one transaction loses one of the two vaults',async t=>{
 const {stores:[a,b]}=makeStores(t,2);
 const [ra,rb]=await Promise.all([a.getMeta('vaults'),b.getMeta('vaults')]);
 await Promise.all([a.setMeta('vaults',withVault(ra,{id:'x',name:'X'})),b.setMeta('vaults',withVault(rb,{id:'y',name:'Y'}))]);
 assert.equal(readVaults(await a.getMeta('vaults')).length,2);
});

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
test('the app opens the store for the chosen vault and only seeds sample notes in the first one',()=>{
 assert.match(app,/vaultStorage\(vaultId\)[\s\S]{0,80}createStore\(\{ dbName: names\.dbName, channelName: names\.channel \}\)/);
 assert.match(app,/lockName: names\.lockName/);
 assert.match(app,/vaultId === DEFAULT_VAULT\.id \? seedVault\(\) : validateVault\(emptyVault\(\)\)/);
 assert.ok(!app.includes('"Personal space"'),'the vault name comes from the registry');
});
test('switching vaults saves first and refuses while there is a save problem',()=>{
 const src=app.slice(app.indexOf('async function switchVault'),app.indexOf('function vaultMenu'));
 const save=src.indexOf('await flushSave()'),check=src.indexOf('if (dirty || conflict || saveError) throw'),reload=src.indexOf('location.reload()');
 assert.ok(save>0&&check>save&&reload>check,'flush, then check, then reload');
 assert.match(src,/if \(storageDown\)\s*throw/);
});

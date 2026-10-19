import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {createStore,ConflictError,QuotaError,StorageUnavailableError,CorruptVaultError,needsBackupReminder} from '../web/store.js';
import {makeStores,sample,edited} from './helpers.mjs';

// Runs two writers that both start from revision 0 and reports how many succeeded.
async function raceTwoWriters([a,b]){
 const results=await Promise.allSettled([a.save(edited('from A'),0),b.save(edited('from B'),0)]);
 return results;
}
async function assertExactlyOneWins(stores){
 const results=await raceTwoWriters(stores);
 const ok=results.filter(r=>r.status==='fulfilled'),bad=results.filter(r=>r.status==='rejected');
 assert.equal(ok.length,1,'expected exactly one writer to succeed, got '+ok.length);
 assert.equal(bad.length,1);
 assert.ok(bad[0].reason instanceof ConflictError);
}

test('control: a store that skips the revision check fails the two-writer test',async t=>{
 const {factory,dbName}=makeStores(t,0);
 // A naive store: reads nothing, always writes the next revision. Both writers "succeed".
 const naive=()=>({async save(vault,expected){
  const db=await new Promise((res,rej)=>{const r=factory.open(dbName,1);r.onupgradeneeded=()=>{for(const s of ['vault','drafts','meta'])if(!r.result.objectStoreNames.contains(s))r.result.createObjectStore(s)};r.onsuccess=()=>res(r.result);r.onerror=rej});
  return new Promise((res,rej)=>{const tx=db.transaction('vault','readwrite');tx.objectStore('vault').put({revision:expected+1,vault},'current');tx.oncomplete=()=>res(expected+1);tx.onabort=rej});
 }});
 await assert.rejects(()=>assertExactlyOneWins([naive(),naive()]),/expected exactly one writer/);
});

test('first load of an empty database reports empty',async t=>{
 const {stores:[s]}=makeStores(t);
 assert.deepEqual(await s.load(),{status:'empty'});
});
test('save then load round-trips and advances the revision',async t=>{
 const {stores:[s]}=makeStores(t);
 assert.equal(await s.save(sample(),0),1);
 const loaded=await s.load();
 assert.equal(loaded.status,'ok');assert.equal(loaded.revision,1);assert.deepEqual(loaded.vault,sample());
 assert.equal(await s.save(edited('two'),1),2);
 assert.equal((await s.load()).vault.notes[0].body,'two');
 assert.equal(await s.readRevision(),2);
});
test('a second store sees what the first one saved',async t=>{
 const {stores:[a,b]}=makeStores(t,2);
 await a.save(sample(),0);
 assert.equal((await b.load()).revision,1);
});
test('a stale revision gives ConflictError and leaves the stored vault untouched',async t=>{
 const {stores:[s]}=makeStores(t);
 await s.save(sample(),0);await s.save(edited('current'),1);
 for(const stale of [0,1,5])await assert.rejects(()=>s.save(edited('stale '+stale),stale),ConflictError);
 const loaded=await s.load();
 assert.equal(loaded.revision,2);assert.equal(loaded.vault.notes[0].body,'current');
});
test('two stores saving from the same revision: exactly one succeeds',async t=>{
 const {stores}=makeStores(t,2);
 await assertExactlyOneWins(stores);
 const final=await stores[0].load();
 assert.equal(final.revision,1);
 assert.ok(['from A','from B'].includes(final.vault.notes[0].body));
});
test('many concurrent writers: exactly one wins each round',async t=>{
 const {stores}=makeStores(t,5);
 await stores[0].save(sample(),0);
 const results=await Promise.allSettled(stores.map((s,i)=>s.save(edited('w'+i),1)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await stores[0].load()).revision,2);
});
test('invalid vaults and bad revisions are rejected before anything is written',async t=>{
 const {stores:[s]}=makeStores(t);
 await assert.rejects(()=>s.save({version:2},0));
 await assert.rejects(()=>s.save(sample(),-1),TypeError);
 await assert.rejects(()=>s.save(sample(),1.5),TypeError);
 assert.deepEqual(await s.load(),{status:'empty'});
});

test('a stored record that fails validation fails closed and is never overwritten by load',async t=>{
 const {factory,dbName,stores:[s]}=makeStores(t);
 const bad={revision:3,vault:{version:1,folders:[],notes:[],canvas:[]},savedAt:'x'};
 const db=await new Promise((res,rej)=>{const r=factory.open(dbName,1);r.onupgradeneeded=()=>{for(const n of ['vault','drafts','meta'])r.result.createObjectStore(n)};r.onsuccess=()=>res(r.result);r.onerror=rej});
 await new Promise((res,rej)=>{const tx=db.transaction('vault','readwrite');tx.objectStore('vault').put(bad,'current');tx.oncomplete=res;tx.onabort=rej});
 db.close();
 await assert.rejects(()=>s.load(),e=>e instanceof CorruptVaultError&&e.raw.revision===3&&typeof e.reason==='string');
 await assert.rejects(()=>s.load(),CorruptVaultError); // still there, still unread
 // The record is byte-for-byte what we wrote.
 const again=await new Promise((res,rej)=>{const r=factory.open(dbName,1);r.onsuccess=()=>{const q=r.result.transaction('vault').objectStore('vault').get('current');q.onsuccess=()=>{res(q.result);r.result.close()};q.onerror=rej};r.onerror=rej});
 assert.deepEqual(again,bad);
});
test('a record with a missing or invalid revision is corrupt, not empty',async t=>{
 const {factory,dbName,stores:[s]}=makeStores(t);
 const db=await new Promise((res,rej)=>{const r=factory.open(dbName,1);r.onupgradeneeded=()=>{for(const n of ['vault','drafts','meta'])r.result.createObjectStore(n)};r.onsuccess=()=>res(r.result);r.onerror=rej});
 await new Promise((res,rej)=>{const tx=db.transaction('vault','readwrite');tx.objectStore('vault').put({vault:sample()},'current');tx.oncomplete=res;tx.onabort=rej});
 db.close();
 await assert.rejects(()=>s.load(),CorruptVaultError);
});

// A minimal hand-driven IndexedDB stand-in for failure modes the real implementation can't be
// made to produce on demand.
function scriptedDb({onPut}){
 const events=[];
 const db={
  transaction(name){
   const tx={oncomplete:null,onabort:null,error:null,
    abort(){events.push('abort');queueMicrotask(()=>tx.onabort?.())},
    objectStore(){return {
     get(){const r={};queueMicrotask(()=>{r.result=undefined;r.onsuccess?.()});return r},
     put(){
      if(name==='meta'){queueMicrotask(()=>tx.oncomplete?.());return {}}
      events.push('put');onPut(tx,events);return {}
     }
    }}};
   events.push('tx');return tx;
  },
  close(){}
 };
 const idb={open(){const r={};queueMicrotask(()=>{r.result=db;r.onsuccess?.()});return r}};
 return {idb,events};
}
test('a quota failure surfaces as QuotaError',async()=>{
 const {idb}=scriptedDb({onPut:(tx)=>queueMicrotask(()=>{tx.error=new DOMException('full','QuotaExceededError');tx.onabort?.()})});
 const s=createStore({indexedDB:idb,BroadcastChannel:null});
 await assert.rejects(()=>s.save(sample(),0),e=>e instanceof QuotaError&&/Storage is full/.test(e.message));
});
test('the save only resolves after the transaction completes',async()=>{
 let finish;
 const {idb}=scriptedDb({onPut:(tx)=>{finish=()=>tx.oncomplete?.()}});
 const s=createStore({indexedDB:idb,BroadcastChannel:null});
 let settled=false;
 const p=s.save(sample(),0).then(r=>{settled=true;return r});
 await new Promise(r=>setTimeout(r,20));
 assert.ok(finish,'put should have been issued');
 assert.equal(settled,false,'save resolved before oncomplete');
 finish();
 assert.equal(await p,1);
});
test('storage that is missing or fails to open reports StorageUnavailableError',async()=>{
 await assert.rejects(()=>createStore({indexedDB:undefined,BroadcastChannel:null}).load(),StorageUnavailableError);
 const throwing={open(){throw new Error('blocked')}};
 await assert.rejects(()=>createStore({indexedDB:throwing,BroadcastChannel:null}).load(),StorageUnavailableError);
 const failing={open(){const r={};queueMicrotask(()=>r.onerror?.());return r}};
 await assert.rejects(()=>createStore({indexedDB:failing,BroadcastChannel:null}).save(sample(),0),StorageUnavailableError);
 await assert.rejects(()=>createStore({indexedDB:undefined,BroadcastChannel:null}).save(sample(),0),e=>e instanceof StorageUnavailableError&&/can't be saved/.test(e.message));
});

test('the compare-and-set region contains no await, async or promise chaining',()=>{
 const src=readFileSync(new URL('../web/store.js',import.meta.url),'utf8');
 const region=src.slice(src.indexOf('BEGIN-CAS'),src.indexOf('END-CAS'));
 assert.ok(region.length>200,'markers missing');
 const code=region.split('\n').filter(l=>!l.trim().startsWith('//')).join('\n');
 assert.ok(!/\bawait\b|\basync\b|\.then\(|\bPromise\b/.test(code),'non-IndexedDB waiting inside the transaction');
});

test('other tabs are told about a committed save',async t=>{
 const {stores:[a,b]}=makeStores(t,2);
 const seen=[];
 const off=b.onSaved(r=>seen.push(r));
 await a.save(sample(),0);
 await new Promise(r=>setTimeout(r,50));
 off();
 assert.deepEqual(seen,[1]);
});
test('a conflicting save sends no message',async t=>{
 const {stores:[a,b]}=makeStores(t,2);
 await a.save(sample(),0);
 const seen=[];b.onSaved(r=>seen.push(r));
 await assert.rejects(()=>a.save(sample(),0),ConflictError);
 await new Promise(r=>setTimeout(r,50));
 assert.deepEqual(seen,[]);
});

test('meta and drafts: set, get, list, delete, clear',async t=>{
 const {stores:[s]}=makeStores(t);
 assert.equal(await s.getMeta('k'),undefined);
 await s.setMeta('k',{a:1});assert.deepEqual(await s.getMeta('k'),{a:1});
 await s.deleteMeta('k');assert.equal(await s.getMeta('k'),undefined);
 await s.putDraft('draft-a',{vault:sample(),savedAt:'1'});await s.putDraft('draft-b',{vault:sample(),savedAt:'2'});
 assert.deepEqual((await s.listDrafts()).map(d=>d.id).sort(),['draft-a','draft-b']);
 await s.deleteDraft('draft-a');assert.deepEqual((await s.listDrafts()).map(d=>d.id),['draft-b']);
 await s.clearDrafts();assert.deepEqual(await s.listDrafts(),[]);
});
test('saving records when the vault last changed',async t=>{
 const {stores:[s]}=makeStores(t);
 await s.save(sample(),0);
 assert.ok(Number.isFinite(Date.parse(await s.getMeta('lastChangeAt'))));
});

test('backup reminder: shown only for changes more than 7 days after the last backup or first save',()=>{
 const day=86400000,now=Date.parse('2026-02-01T00:00:00Z');
 const iso=d=>new Date(now-d*day).toISOString();
 assert.equal(needsBackupReminder({now,lastBackupAt:iso(10),createdAt:iso(30),lastChangeAt:iso(1)}),true);
 assert.equal(needsBackupReminder({now,lastBackupAt:iso(3),createdAt:iso(30),lastChangeAt:iso(1)}),false);
 assert.equal(needsBackupReminder({now,lastBackupAt:iso(10),createdAt:iso(30),lastChangeAt:iso(12)}),false,'nothing changed since the backup');
 assert.equal(needsBackupReminder({now,createdAt:iso(10),lastChangeAt:iso(1)}),true);
 assert.equal(needsBackupReminder({now,createdAt:iso(2),lastChangeAt:iso(1)}),false);
 assert.equal(needsBackupReminder({now,lastBackupAt:iso(10),createdAt:iso(30),lastChangeAt:iso(1),fileHealthy:true}),false,'a healthy linked file counts as a backup');
 assert.equal(needsBackupReminder({now}),false);
});

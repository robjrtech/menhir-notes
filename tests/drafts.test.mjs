import test from 'node:test';
import assert from 'node:assert/strict';
import {scanDrafts,diffVaults,summarizeDiff,normalize,pendingDrafts,keepDraft,dropDraft} from '../web/drafts.js';
import {makeStores,sample,edited,note,NOW} from './helpers.mjs';

// The same vault with every object's keys in the opposite order.
const reorder=v=>({canvas:v.canvas.map(c=>Object.fromEntries(Object.entries(c).reverse())),notes:v.notes.map(n=>Object.fromEntries(Object.entries(n).reverse())),folders:[...v.folders],version:v.version});
const entry=(id,draft)=>({id,draft});

test('control: comparing JSON strings directly calls a key-reordered copy different',()=>{
 const a=sample(),b=reorder(sample());
 assert.notEqual(JSON.stringify(a),JSON.stringify(b),'the string comparison is order-sensitive, which is the bug being guarded against');
 assert.equal(normalize(a),normalize(b));
});
test('a draft equal to the vault apart from key order is pruned, not offered',()=>{
 const r=scanDrafts([entry('draft-a',{vault:reorder(sample()),savedAt:'2026-01-01T00:00:00.000Z',reason:'save failed'})],sample());
 assert.deepEqual(r.prune,['draft-a']);assert.deepEqual(r.offer,[]);assert.deepEqual(r.invalid,[]);
});
test('a changed draft is offered with a diff and newest first',()=>{
 const r=scanDrafts([
  entry('old',{vault:edited('older'),savedAt:'2026-01-01T00:00:00.000Z'}),
  entry('new',{vault:edited('newer'),savedAt:'2026-03-01T00:00:00.000Z',reason:'replaced by file'})
 ],sample());
 assert.deepEqual(r.offer.map(o=>o.id),['new','old']);
 assert.deepEqual(r.offer[0].diff.changed,['Note one']);
 assert.equal(r.offer[0].reason,'replaced by file');
 assert.equal(summarizeDiff(r.offer[0].diff),'1 changed');
});
test('an invalid or oversized draft is offered for download and never pruned',()=>{
 const bad={version:1,folders:[],notes:[],canvas:[]};
 const big=sample();big.notes=Array.from({length:6},(_,i)=>note('n'+i,{body:'x'.repeat(190000)}));big.canvas=[];
 const r=scanDrafts([entry('bad',{vault:bad,savedAt:'1'}),entry('big',{vault:big,savedAt:'2'})],sample());
 assert.deepEqual(r.invalid.map(i=>i.id),['big','bad']);
 assert.deepEqual(r.prune,[]);assert.deepEqual(r.offer,[]);
 assert.ok(r.invalid.every(i=>i.invalidReason&&i.vault));
});
test('malformed entries are skipped without throwing',()=>{
 const r=scanDrafts([null,undefined,entry('a',null),entry('b','text'),entry('c',{}),entry('d',{vault:'x'}),entry('e',{vault:[]}),{id:'f'}],sample());
 assert.equal(r.skipped.length,8);assert.deepEqual([r.prune,r.offer,r.invalid],[[],[],[]]);
 assert.deepEqual(scanDrafts(undefined,sample()).skipped,[]);
});
test('diffVaults reports added, removed, changed notes, folders and canvas',()=>{
 const a=sample();
 const b=sample();
 b.notes.push(note('two'));b.notes[0].body='changed';b.folders.push('Extra');b.canvas=[];
 const d=diffVaults(a,b);
 assert.deepEqual([d.added,d.changed,d.removed],[['Note two'],['Note one'],[]]);
 assert.deepEqual(d.foldersAdded,['Extra']);assert.equal(d.canvasChanged,true);assert.equal(d.same,false);
 const back=diffVaults(b,a);
 assert.deepEqual([back.removed,back.foldersRemoved],[['Note two'],['Extra']]);
 assert.equal(diffVaults(a,reorder(sample())).same,true);
 assert.equal(summarizeDiff(diffVaults(a,a)),'no differences');
});
test('timestamps alone do not count as a changed note',()=>{
 const b=sample();b.notes[0].updatedAt='2027-01-01T00:00:00.000Z';
 assert.deepEqual(diffVaults(sample(),b).changed,[]);
});

test('storage helpers: pending drafts prunes duplicates, keeps the rest, and a draft is dropped after a good save',async t=>{
 const {stores:[s]}=makeStores(t);
 await keepDraft(s,'same',{revision:1,vault:reorder(sample()),reason:'save failed'});
 await keepDraft(s,'diff',{revision:1,vault:edited('unsaved words'),reason:'save failed'});
 await s.putDraft('broken',{vault:{version:1}});
 await s.putDraft('junk','not a draft');
 const scan=await pendingDrafts(s,sample());
 assert.deepEqual(scan.offer.map(o=>o.id),['diff']);
 assert.deepEqual(scan.invalid.map(o=>o.id),['broken']);
 assert.deepEqual((await s.listDrafts()).map(d=>d.id).sort(),['broken','diff','junk'],'only the duplicate was removed');
 await dropDraft(s,'diff');
 assert.deepEqual((await s.listDrafts()).map(d=>d.id).sort(),['broken','junk']);
 assert.equal(NOW.length>0,true);
});

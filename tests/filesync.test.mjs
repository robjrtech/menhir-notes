import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcile,FileMirror,createMutex,capabilities,serializeVault,sha256Hex,FILE_LIMIT} from '../web/filesync.js';
import {validateVault} from '../web/model.js';
import {makeStores,sample,edited,note} from './helpers.mjs';

// -- mocks ----------------------------------------------------------------------------------
const named=(name,message=name)=>Object.assign(new Error(message),{name});

// Mimics a FileSystemFileHandle. Mock handles live in a Map, never in IndexedDB, because
// fake-indexeddb cannot structured-clone objects that have methods.
function mockHandle({name='vault.json',content='',mtime=1}={}){
 const h={
  name,content,mtime,perm:'granted',grantOnRequest:'granted',gone:false,
  log:[],open:0,maxOpen:0,failWrites:0,failCreate:null,getFileCalls:0,onGetFile:null,
  async queryPermission(){return h.perm},
  async requestPermission(){if(h.perm==='prompt')h.perm=h.grantOnRequest;return h.perm},
  async getFile(){
   h.getFileCalls++;h.onGetFile?.(h.getFileCalls);
   if(h.gone)throw named('NotFoundError');
   if(h.perm==='denied')throw named('NotAllowedError');
   const c=h.content,m=h.mtime;
   return {size:Buffer.byteLength(c),lastModified:m,async text(){return c}};
  },
  async createWritable(){
   if(h.failCreate)throw h.failCreate;
   if(h.perm!=='granted')throw named('NotAllowedError');
   h.log.push('open');h.open++;h.maxOpen=Math.max(h.maxOpen,h.open);
   let pending='',closed=false;
   return {
    async write(s){await new Promise(r=>setImmediate(r));if(h.failWrites>0){h.failWrites--;throw named('WriteError')}pending+=s},
    async close(){await new Promise(r=>setImmediate(r));h.log.push('close');h.content=pending;h.mtime++;closed=true;h.open--},
    async abort(){h.log.push('abort');if(!closed)h.open--}
   };
  },
  external(text){h.content=text;h.mtime+=10}
 };
 return h;
}
function handleStoreFor(handle){
 const map=new Map();if(handle)map.set('h',handle);
 return {get:async()=>map.get('h')??null,set:async x=>{map.set('h',x)},clear:async()=>{map.delete('h')},map};
}
function setup(t,{vault=sample(),handle=mockHandle(),link=true,locks=createMutex()}={}){
 const {stores:[store]}=makeStores(t);
 const order=[];
 const wrapped=Object.create(store);
 for(const m of ['save','putDraft'])wrapped[m]=async(...a)=>{order.push(m);return store[m](...a)};
 const handleStore=handleStoreFor(link?handle:null);
 const states=[],replaced=[];
 const timers=[];
 const mirror=new FileMirror({store:wrapped,handleStore,locks,
  setTimer:(fn,ms)=>{const x={fn,ms};timers.push(x);return x},clearTimer:()=>{},
  onState:s=>states.push(s.kind),onVaultReplaced:(v,r)=>replaced.push([v,r]),id:'t'});
 return {store,wrapped,handle,handleStore,mirror,order,states,replaced,timers};
}
const drafts=async s=>(await s.listDrafts()).map(d=>d.draft);

// -- reconcile: every row of the decision table ---------------------------------------------
const H=(c)=>'hash-'+c;
const file=(over={})=>({tooLarge:false,valid:true,hash:H('file'),canonicalHash:H('file'),...over});
const browser=(over={})=>({revision:3,hash:H('browser'),pristine:false,...over});
const sync=(over={})=>({hash:H('synced'),revision:3,...over});

test('reconcile: first Save always writes',()=>{
 assert.equal(reconcile({first:'save',file:null,browser:browser(),sync:null}),'write');
});
test('reconcile: file unchanged since our last write',()=>{
 assert.equal(reconcile({file:file({hash:H('synced'),canonicalHash:H('x')}),browser:browser({revision:5}),sync:sync()}),'write','browser is ahead');
 assert.equal(reconcile({file:file({hash:H('synced'),canonicalHash:H('x')}),browser:browser({revision:3}),sync:sync()}),'noop','nothing to do');
});
test('reconcile: file changed elsewhere and the browser copy is unchanged: the file wins',()=>{
 assert.equal(reconcile({file:file(),browser:browser({revision:3}),sync:sync()}),'load-file');
});
test('reconcile: file changed elsewhere and the browser copy changed too: conflict',()=>{
 assert.equal(reconcile({file:file(),browser:browser({revision:4}),sync:sync()}),'conflict');
});
test('reconcile: a file that fails validation fails closed; so does one that is too large',()=>{
 assert.equal(reconcile({file:file({valid:false}),browser:browser(),sync:sync()}),'invalid');
 assert.equal(reconcile({file:file({tooLarge:true,valid:false}),browser:browser(),sync:sync()}),'too-large');
 assert.equal(reconcile({first:'open',file:file({valid:false}),browser:browser({pristine:true}),sync:null}),'invalid');
});
test('reconcile: first Open with untouched sample notes loads the file; with real notes it is a conflict',()=>{
 assert.equal(reconcile({first:'open',file:file(),browser:browser({pristine:true}),sync:null}),'load-file');
 assert.equal(reconcile({first:'open',file:file(),browser:browser({pristine:false}),sync:null}),'conflict');
});
test('reconcile: identical content is adopted without any write, whatever the history',()=>{
 const same=file({canonicalHash:H('browser')});
 assert.equal(reconcile({first:'open',file:same,browser:browser(),sync:null}),'adopt');
 assert.equal(reconcile({file:same,browser:browser(),sync:sync()}),'adopt');
 assert.equal(reconcile({file:{...same,hash:H('synced')},browser:browser(),sync:sync()}),'noop');
});
test('reconcile: with no sync history the file is never trusted over real notes',()=>{
 assert.equal(reconcile({file:file(),browser:browser(),sync:null}),'conflict');
 assert.equal(reconcile({file:file(),browser:browser({pristine:true}),sync:null}),'load-file');
});
test('control: a reconcile that trusts the newer lastModified gets the both-changed case wrong',()=>{
 const naive=({file,sync})=>file.lastModified>sync.lastModified?'load-file':'write';
 const bothChanged={file:{...file(),lastModified:200},browser:browser({revision:4}),sync:{...sync(),lastModified:100}};
 assert.equal(reconcile(bothChanged),'conflict');
 assert.notEqual(naive(bothChanged),'conflict','the naive rule silently picks a side, which the real table must not');
});

// -- mirror: normal operation ---------------------------------------------------------------
test('link via Save writes valid backup JSON and records the sync',async t=>{
 const c=setup(t);await c.store.save(sample(),0);
 await c.mirror.link(c.handle,'save');
 assert.equal(c.mirror.state.kind,'synced');
 assert.deepEqual(validateVault(JSON.parse(c.handle.content)),sample());
 const meta=await c.store.getMeta('fileSync');
 assert.equal(meta.revision,1);assert.equal(meta.hash,await sha256Hex(c.handle.content));
 assert.deepEqual(c.handle.log,['open','close']);
});
test('a browser save is mirrored after the delay, and the status goes pending then synced',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 await c.store.save(edited('second'),1);
 c.mirror.notifySaved();
 assert.equal(c.mirror.state.kind,'pending');
 assert.equal(c.timers.at(-1).ms,1500);
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'synced');
 assert.equal(JSON.parse(c.handle.content).notes[0].body,'second');
 assert.equal((await c.store.getMeta('fileSync')).revision,2);
});
test('nothing is written when nothing changed',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 c.handle.log.length=0;
 await c.mirror.flush();
 assert.deepEqual(c.handle.log,[]);assert.equal(c.mirror.state.kind,'synced');
});
test('unlinking forgets the file and stops all file access',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 await c.mirror.unlink();
 const calls=c.handle.getFileCalls;
 c.mirror.notifySaved();await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'unlinked');assert.equal(c.handle.getFileCalls,calls);
 assert.equal(await c.store.getMeta('fileSync'),undefined);
});

// -- mirror: the file changed elsewhere -----------------------------------------------------
async function linkedWithExternal(t,text,{browserEdit=false}={}){
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 if(browserEdit)await c.store.save(edited('browser edit'),1);
 c.handle.external(text);
 return c;
}
test('control: a mirror that writes without checking the file would overwrite an external edit',async t=>{
 // The scenario: the file was edited elsewhere while the browser has a newer save.
 const scenario=async(syncFn)=>{
  const c=await linkedWithExternal(t,serializeVault(edited('written elsewhere')),{browserEdit:true});
  await syncFn(c);
  assert.equal(JSON.parse(c.handle.content).notes[0].body,'written elsewhere','external edit was overwritten');
 };
 await scenario(c=>c.mirror.sync());
 const naive=async c=>{const w=await c.handle.createWritable();await w.write(serializeVault((await c.store.load()).vault));await w.close()};
 await assert.rejects(()=>scenario(naive),/external edit was overwritten/);
});
test('valid external edit with an unchanged browser copy: the file wins and the old copy is kept as a draft first',async t=>{
 const c=await linkedWithExternal(t,serializeVault(edited('from another computer')));
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'synced');
 const ord=c.order.filter(x=>x==='putDraft'||x==='save');
 assert.ok(ord.indexOf('putDraft')>=0&&ord.indexOf('putDraft')<ord.lastIndexOf('save'),'draft must be written before the replacement: '+ord);
 const loaded=await c.store.load();
 assert.equal(loaded.vault.notes[0].body,'from another computer');assert.equal(loaded.revision,2);
 const ds=await drafts(c.store);
 assert.equal(ds.length,1);assert.equal(ds[0].reason,'replaced by file');assert.equal(ds[0].vault.notes[0].body,sample().notes[0].body);
 assert.equal(c.replaced.length,1);assert.equal(c.replaced[0][1],2);
 assert.equal((await c.store.getMeta('fileSync')).revision,2);
});
test('both copies changed: conflict, nothing is written or replaced',async t=>{
 const external=serializeVault(edited('from another computer'));
 const c=await linkedWithExternal(t,external,{browserEdit:true});
 c.handle.log.length=0;
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'conflict');
 assert.equal(c.handle.content,external);assert.deepEqual(c.handle.log,[]);
 assert.equal((await c.store.load()).vault.notes[0].body,'browser edit');
 assert.deepEqual(await drafts(c.store),[]);
 // And a later browser save does not overwrite the file either.
 await c.store.save(edited('browser edit 2'),2);c.mirror.notifySaved();await c.mirror.flush();
 assert.equal(c.handle.content,external);
});
test('conflict, keep this browser: the file copy is saved as a draft before the file is overwritten',async t=>{
 const external=serializeVault(edited('from another computer'));
 const c=await linkedWithExternal(t,external,{browserEdit:true});
 await c.mirror.flush();
 // Record draft/file ordering from the mock side.
 const seen=[];
 const origCreate=c.handle.createWritable.bind(c.handle);
 c.handle.createWritable=async()=>{seen.push({draftsAtOpen:(await c.store.listDrafts()).length});return origCreate()};
 const r=await c.mirror.resolveConflict('keep-browser');
 assert.equal(r.stale,false);
 assert.deepEqual(seen,[{draftsAtOpen:1}],'the draft existed before the file was opened for writing');
 assert.equal(JSON.parse(c.handle.content).notes[0].body,'browser edit');
 assert.equal((await drafts(c.store))[0].vault.notes[0].body,'from another computer');
 assert.equal(c.mirror.state.kind,'synced');
});
test('conflict, use the file: the browser copy is saved as a draft before it is replaced',async t=>{
 const external=serializeVault(edited('from another computer'));
 const c=await linkedWithExternal(t,external,{browserEdit:true});
 await c.mirror.flush();
 c.order.length=0;
 const r=await c.mirror.resolveConflict('use-file');
 assert.equal(r.stale,false);
 assert.deepEqual(c.order,['putDraft','save']);
 assert.equal((await c.store.load()).vault.notes[0].body,'from another computer');
 assert.equal((await drafts(c.store))[0].vault.notes[0].body,'browser edit');
 assert.equal(c.handle.content,external);
 assert.equal(c.replaced.length,1);
});
test('conflict resolution notices when the file changed again and goes back to reconciling',async t=>{
 const c=await linkedWithExternal(t,serializeVault(edited('first external')),{browserEdit:true});
 await c.mirror.flush();
 c.handle.external(serializeVault(edited('second external')));
 const r=await c.mirror.resolveConflict('keep-browser');
 assert.equal(r.stale,true);
 assert.equal(JSON.parse(c.handle.content).notes[0].body,'second external');
 assert.equal(c.mirror.state.kind,'conflict');
});
test('an external edit that is broken JSON fails closed and is never overwritten automatically',async t=>{
 const c=await linkedWithExternal(t,'{"version":1,');
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'invalid');
 await c.store.save(edited('still saving in the browser'),1);c.mirror.notifySaved();await c.mirror.flush();
 assert.equal(c.handle.content,'{"version":1,');
 assert.equal(await c.mirror.fileText(),'{"version":1,');
 assert.equal((await c.store.load()).vault.notes[0].body,'still saving in the browser');
 // Only an explicit choice replaces it.
 await c.mirror.overwriteFile();
 assert.equal(JSON.parse(c.handle.content).notes[0].body,'still saving in the browser');
 assert.equal(c.mirror.state.kind,'synced');
});
test('external edits that are valid JSON but violate the vault rules also fail closed',async t=>{
 const c=await linkedWithExternal(t,JSON.stringify({version:1,folders:[],notes:[],canvas:[]}));
 await c.mirror.flush();assert.equal(c.mirror.state.kind,'invalid');
});
test('a file over the size limit is refused without being read',async t=>{
 const c=await linkedWithExternal(t,'x'.repeat(FILE_LIMIT+10));
 let textCalls=0;
 const orig=c.handle.getFile.bind(c.handle);
 c.handle.getFile=async()=>{const f=await orig();return {...f,async text(){textCalls++;return f.text()}}};
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'too-large');assert.equal(textCalls,0);
});

// -- mirror: permission and file-system failures --------------------------------------------
test('permission not granted in a new session: no file access until Reconnect, then it reconciles',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 await c.store.save(edited('while disconnected'),1);
 c.handle.perm='prompt';c.handle.getFileCalls=0;
 await c.mirror.init();
 assert.equal(c.mirror.state.kind,'needs-permission');assert.equal(c.handle.getFileCalls,0);
 await c.mirror.reconnect();
 assert.equal(c.mirror.state.kind,'synced');
 assert.equal(JSON.parse(c.handle.content).notes[0].body,'while disconnected');
});
test('permission denied on reconnect stays disconnected and the browser keeps saving',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 c.handle.perm='prompt';c.handle.grantOnRequest='denied';
 await c.mirror.reconnect();
 assert.equal(c.mirror.state.kind,'needs-permission');
 assert.equal(await c.store.save(edited('x'),1),2);
});
test('permission revoked mid-session: writing stops and the banner state shows how far behind the file is',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 await c.store.save(edited('a'),1);await c.store.save(edited('b'),2);
 c.handle.perm='denied';c.handle.log.length=0;
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'needs-permission');assert.equal(c.mirror.state.behind,2);
 assert.deepEqual(c.handle.log,[]);
});
test('NotAllowedError from createWritable is reported as a permission problem',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 await c.store.save(edited('a'),1);
 c.handle.failCreate=named('NotAllowedError');
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'needs-permission');
});
test('file moved or deleted: nothing is written to the old path',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 await c.store.save(edited('a'),1);
 c.handle.gone=true;c.handle.log.length=0;
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'missing');assert.deepEqual(c.handle.log,[],'must not recreate the file silently');
 assert.equal((await c.store.load()).vault.notes[0].body,'a');
});
test('a write that throws before close leaves the old file intact; one retry, then a visible error',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 const before=c.handle.content;
 await c.store.save(edited('a'),1);
 c.handle.failWrites=2;c.handle.log.length=0;
 await c.mirror.flush();
 assert.equal(c.handle.content,before);
 assert.deepEqual(c.handle.log,['open','abort','open','abort']);
 assert.equal(c.mirror.state.kind,'error');
 assert.equal(c.handle.open,0);
});
test('a single failed write is retried once and succeeds',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 await c.store.save(edited('a'),1);
 c.handle.failWrites=1;
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'synced');assert.equal(JSON.parse(c.handle.content).notes[0].body,'a');
});
test('a file that changes between the check and the write is not overwritten',async t=>{
 const c=setup(t);await c.store.save(sample(),0);await c.mirror.link(c.handle,'save');
 await c.store.save(edited('browser'),1);
 const external=serializeVault(edited('sneaky external'));
 let fired=false;
 // The change lands on the second read of the next sync, which is the pre-write recheck.
 const baseCalls=c.handle.getFileCalls;
 c.handle.onGetFile=n=>{if(!fired&&n===baseCalls+2){fired=true;c.handle.external(external)}};
 c.handle.log.length=0;
 await c.mirror.flush();
 assert.ok(fired);
 assert.equal(c.handle.content,external,'the external edit survived');
 assert.equal(c.mirror.state.kind,'conflict');
});
test('first Open with the browser holding only sample notes loads the file and keeps the samples as a draft',async t=>{
 const c=setup(t);
 await c.store.save(sample(),0);await c.store.setMeta('seedRevision',1);
 c.handle.external(serializeVault(edited('my real notes')));
 await c.mirror.link(c.handle,'open');
 assert.equal(c.mirror.state.kind,'synced');
 assert.equal((await c.store.load()).vault.notes[0].body,'my real notes');
 assert.equal((await drafts(c.store)).length,1);
 assert.equal(c.replaced.length,1);
});
test('first Open with real notes in the browser raises a conflict instead of choosing',async t=>{
 const c=setup(t);
 await c.store.save(sample(),0);await c.store.save(edited('real work'),1);await c.store.setMeta('seedRevision',1);
 const external=serializeVault(edited('other file'));c.handle.external(external);
 await c.mirror.link(c.handle,'open');
 assert.equal(c.mirror.state.kind,'conflict');assert.equal(c.handle.content,external);
 assert.equal((await c.store.load()).vault.notes[0].body,'real work');
});
test('first Open with an empty browser (data was cleared) restores every note from the file',async t=>{
 const c=setup(t);
 const big=sample();big.notes.push(note('two'),note('three'));
 c.handle.external(serializeVault(big));
 await c.mirror.link(c.handle,'open');
 assert.equal(c.mirror.state.kind,'synced');
 const loaded=await c.store.load();
 assert.equal(loaded.vault.notes.length,3);assert.equal(loaded.revision,1);
});
test('first Open with the same content in both places just records the link',async t=>{
 const c=setup(t);await c.store.save(sample(),0);
 c.handle.external(serializeVault(sample()));c.handle.log.length=0;
 await c.mirror.link(c.handle,'open');
 assert.equal(c.mirror.state.kind,'synced');assert.deepEqual(c.handle.log,[]);
 assert.equal((await c.store.load()).revision,1);
});

// -- ordering and locking -------------------------------------------------------------------
test('two mirrors sharing one lock never interleave their writes',async t=>{
 const locks=createMutex();
 const first=setup(t,{locks});
 await first.store.save(sample(),0);await first.mirror.link(first.handle,'save');
 // A second tab: its own store connection and mirror, same database, same file, same lock.
 const {stores:[other]}=makeStores(t);
 const second=new FileMirror({store:first.store,handleStore:first.handleStore,locks,setTimer:()=>{},clearTimer:()=>{},id:'b'});
 void other;
 for(let rev=1;rev<=4;rev++){
  await first.store.save(edited('rev '+(rev+1)),rev);
  first.handle.log.length=0;
  await Promise.all([first.mirror.sync(),second.sync(),first.mirror.sync(),second.sync()]);
  assert.ok(first.handle.maxOpen<=1,'writes interleaved');
  const opens=first.handle.log.filter(x=>x==='open').length;
  assert.equal(opens,1,'exactly one tab needed to write, got '+opens);
  assert.equal(JSON.parse(first.handle.content).notes[0].body,'rev '+(rev+1));
 }
});
test('control: without the shared lock the same two mirrors do interleave',async t=>{
 const a=setup(t,{locks:{request:(_n,fn)=>fn()}});
 await a.store.save(sample(),0);await a.mirror.link(a.handle,'save');
 const b=new FileMirror({store:a.store,handleStore:a.handleStore,locks:{request:(_n,fn)=>fn()},setTimer:()=>{},clearTimer:()=>{},id:'b'});
 await a.store.save(edited('x'),1);
 // Each mirror serializes itself, so use two independent queues racing.
 await Promise.all([a.mirror.sync(),b.sync()]);
 assert.ok(a.handle.maxOpen>1||a.handle.log.filter(x=>x==='open').length>1,'the harness should be able to see an unlocked double write');
});

// -- feature detection ----------------------------------------------------------------------
test('capabilities reports no file support without the pickers, and file code never runs',async t=>{
 assert.deepEqual(capabilities({}),{save:false,open:false,supported:false});
 assert.equal(capabilities({showSaveFilePicker(){}}).supported,false,'both pickers are required');
 assert.equal(capabilities({showSaveFilePicker(){},showOpenFilePicker(){}}).supported,true);
 assert.equal(capabilities(undefined).supported,false);
 // An unlinked mirror never touches a handle.
 const c=setup(t,{link:false});
 await c.mirror.init();c.mirror.notifySaved();await c.mirror.flush();await c.mirror.sync();
 assert.equal(c.mirror.state.kind,'unlinked');assert.equal(c.timers.length,0);
});
test('the compact file serialization of the largest allowed vault fits under the read limit',async()=>{
 const v=sample();v.notes=Array.from({length:6},(_,i)=>note('n'+i,{body:'x'.repeat(190000)}));v.canvas=[];
 assert.throws(()=>validateVault(v),/1 MB/);
 const ok=sample();ok.notes=Array.from({length:4},(_,i)=>note('n'+i,{body:'y'.repeat(190000)}));ok.canvas=[];
 const clean=validateVault(ok);
 assert.ok(Buffer.byteLength(serializeVault(clean))<=FILE_LIMIT);
});

// -- overwrite of an unreadable file, and the pre-write content check ----------------------
test('overwrite: a file that became valid since the banner is not overwritten',async t=>{
 const c=await linkedWithExternal(t,'{"version":1,');
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'invalid');
 const other=serializeVault(edited('valid, from another computer'));
 c.handle.external(other);              // the file is repaired before the user confirms
 c.handle.log.length=0;
 const r=await c.mirror.overwriteFile();
 assert.equal(r.stale,true);
 assert.equal(c.handle.content,other,'the valid file must survive');
 assert.deepEqual(c.handle.log,[]);
 assert.notEqual(c.mirror.state.kind,'invalid','it is reconciled again');
});
test('overwrite: a file that changed to different broken content also counts as stale',async t=>{
 const c=await linkedWithExternal(t,'{"version":1,');
 await c.mirror.flush();
 c.handle.external('{"different":');
 assert.equal((await c.mirror.overwriteFile()).stale,true);
 assert.equal(c.handle.content,'{"different":');
});
test('overwrite: when the file is still the unreadable one, its text is kept as a draft first',async t=>{
 const c=await linkedWithExternal(t,'{"version":1,');
 await c.mirror.flush();
 const seen=[];
 const orig=c.handle.createWritable.bind(c.handle);
 c.handle.createWritable=async()=>{seen.push((await c.store.listDrafts()).map(d=>d.draft.reason));return orig()};
 assert.deepEqual(await c.mirror.overwriteFile(),{stale:false});
 assert.deepEqual(seen,[['unreadable file replaced']]);
 assert.equal((await drafts(c.store))[0].vault.rawText,'{"version":1,');
 assert.equal(JSON.parse(c.handle.content).notes[0].body,sample().notes[0].body);
});
test('overwrite: a too-large file is not read, and a changed size makes it stale',async t=>{
 const c=await linkedWithExternal(t,'x'.repeat(FILE_LIMIT+10));
 await c.mirror.flush();
 assert.equal(c.mirror.state.kind,'too-large');
 c.handle.external(serializeVault(edited('now fine')));
 assert.equal((await c.mirror.overwriteFile()).stale,true);
});
test('a same-length edit with the same modification time between check and write is not overwritten',async t=>{
 const c=setup(t);await c.store.save(edited('aaaa'),0);await c.mirror.link(c.handle,'save');
 await c.store.save(edited('bbbb'),1);
 const original=c.handle.content;
 const swapped=original.replace('aaaa','zzzz');
 assert.equal(swapped.length,original.length);
 const base=c.handle.getFileCalls;let fired=false;
 // On the recheck (second getFile) the contents change but size and mtime do not.
 c.handle.onGetFile=n=>{if(!fired&&n===base+2){fired=true;c.handle.content=swapped}};
 await c.mirror.flush();
 assert.ok(fired);
 assert.equal(c.handle.content,swapped,'the external same-length edit survived');
 assert.equal(c.mirror.state.kind,'conflict');
});
test('control: comparing only size and modification time misses that same-length edit',()=>{
 const before={size:10,lastModified:5},after={size:10,lastModified:5};
 assert.ok(before.size===after.size&&before.lastModified===after.lastModified,'metadata-only check sees no change');
});

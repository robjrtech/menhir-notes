import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer,FILES} from '../scripts/serve.mjs';
import {art,cardArt,cardLabel,gridTarget,homeModel,plural,ROVING_MIN} from '../web/home.js';

// Golden outputs of the approved card-art algorithm, copied as literals.
const GOLDEN = {
  "Getting started": {"skyTop":[43,145,139],"skyBot":[34,59,114],"sun":[92,219,211],"sunX":25.922701822128147,"sunY":28.850061289034784,"sunR":8.687385693425313,"ridges":[{"pts":[[0,56.1],[10,55],[20,50.6],[30,44.8],[40,40.3],[50,39.2],[60,42],[70,47.4],[80,52.9],[90,56],[100,55.3]],"col":[29,83,79]},{"pts":[[0,73.1],[10,72.4],[20,68.8],[30,63.7],[40,59.3],[50,57.3],[60,58.6],[70,62.6],[80,67.7],[90,71.8],[100,73.2]],"col":[23,57,64]},{"pts":[[0,96.5],[10,97.7],[20,88],[30,75.4],[40,70.4],[50,77],[60,89.9],[70,98.3],[80,95.3],[90,83.3],[100,72.4]],"col":[16,34,45]}]},
  "Daily notes": {"skyTop":[42,114,132],"skyBot":[74,35,112],"sun":[81,188,214],"sunX":75.43973674066365,"sunY":21.761701615527272,"sunR":8.50779260136187,"ridges":[{"pts":[[0,51.5],[10,60.2],[20,60.1],[30,51.2],[40,40.3],[50,35.8],[60,41.1],[70,52.1],[80,60.5],[90,59.7],[100,50.5]],"col":[30,72,82]},{"pts":[[0,55.9],[10,54.5],[20,75.5],[30,75],[40,54],[50,56.5],[60,77.2],[70,72.9],[80,52.5],[90,58.8],[100,78.6]],"col":[23,46,63]},{"pts":[[0,97.1],[10,89.9],[20,79.6],[30,72.5],[40,73],[50,80.8],[60,91.1],[70,97.5],[80,96.1],[90,87.8],[100,77.6]],"col":[17,26,45]}]},
  "Projects": {"skyTop":[127,128,45],"skyBot":[59,117,41],"sun":[206,208,78],"sunX":28.6612825258635,"sunY":26.280975007917732,"sunR":8.303863821551204,"ridges":[{"pts":[[0,49.7],[10,60.5],[20,50.1],[30,36.5],[40,43.3],[50,58.7],[60,55.9],[70,39.8],[80,38.3],[90,54.1],[100,59.7]],"col":[79,80,33]},{"pts":[[0,72.4],[10,57.4],[20,57.5],[30,72.4],[40,73.2],[50,58.3],[60,56.7],[70,71.5],[80,73.9],[90,59.3],[100,56]],"col":[52,62,25]},{"pts":[[0,79.4],[10,67.4],[20,72.1],[30,87.6],[40,94.8],[50,84.8],[60,69.9],[70,68.6],[80,82.5],[90,94.4],[100,89.6]],"col":[31,43,18]}]},
  "Ideas": {"skyTop":[152,75,42],"skyBot":[78,112,31],"sun":[221,126,85],"sunX":41.00666349520907,"sunY":19.28367545688525,"sunR":10.696612977655604,"ridges":[{"pts":[[0,64.2],[10,52.1],[20,39.5],[30,49.4],[40,63.7],[50,56.1],[60,40.6],[70,45.6],[80,62],[90,59.7],[100,42.9]],"col":[85,45,27]},{"pts":[[0,62.7],[10,53.5],[20,56.8],[30,68.8],[40,75.5],[50,69],[60,57],[70,53.4],[80,62.5],[90,73.6],[100,73.8]],"col":[65,45,21]},{"pts":[[0,88.4],[10,90.7],[20,84.5],[30,76.4],[40,75.1],[50,82],[60,89.7],[70,89.9],[80,82.4],[90,75.3],[100,76.1]],"col":[46,39,15]}]},
  "Library": {"skyTop":[141,118,58],"skyBot":[50,109,44],"sun":[201,168,84],"sunX":42.30726019712165,"sunY":24.33434740593657,"sunR":7.917226694524288,"ridges":[{"pts":[[0,41.4],[10,57.5],[20,63.3],[30,49.5],[40,38.2],[50,47.5],[60,62.5],[70,59.2],[80,42.9],[90,39.7],[100,54.8]],"col":[76,65,36]},{"pts":[[0,76.2],[10,65.1],[20,55.5],[30,61],[40,73.8],[50,75.8],[60,64.1],[70,55.3],[80,61.9],[90,74.5],[100,75.2]],"col":[59,57,28]},{"pts":[[0,71.6],[10,79.3],[20,89.8],[30,83.4],[40,72.1],[50,77.2],[60,89.1],[70,85.4],[80,73.1],[90,75.2],[100,87.8]],"col":[38,42,20]}]},
  "Notes": {"skyTop":[138,40,79],"skyBot":[103,71,30],"sun":[218,78,134],"sunX":23.15867166267708,"sunY":17.475895358249545,"sunR":12.471459234133363,"ridges":[{"pts":[[0,61.4],[10,58],[20,49],[30,39.2],[40,33.6],[50,35.3],[60,43.3],[70,53.4],[80,60.4],[90,60.5],[100,53.7]],"col":[84,29,51]},{"pts":[[0,73.6],[10,62.7],[20,56.5],[30,66],[40,74.2],[50,66.5],[60,56.6],[70,62.2],[80,73.3],[90,70.1],[100,58.3]],"col":[65,22,29]},{"pts":[[0,84.9],[10,75.1],[20,75.8],[30,85.8],[40,86.8],[50,77],[60,74.3],[70,83.6],[80,88],[90,79.4],[100,73.6]],"col":[46,18,16]}]},
  "Folder 304 SSSSS": {"skyTop":[158,156,51],"skyBot":[66,112,36],"sun":[216,214,95],"sunX":16.579692396335304,"sunY":35.32867752481252,"sunR":13.94059825502336,"ridges":[{"pts":[[0,39.8],[10,40.4],[20,53.4],[30,58.2],[40,47.3],[50,37.9],[60,44.8],[70,57.1],[80,55.4],[90,42.4],[100,38.6]],"col":[81,81,31]},{"pts":[[0,58],[10,71.3],[20,74.9],[30,64.5],[40,52.6],[50,53.5],[60,66.2],[70,75.3],[80,70],[90,56.5],[100,51.2]],"col":[54,63,24]},{"pts":[[0,74.4],[10,84.4],[20,93.8],[30,97],[40,92.4],[50,82.4],[60,73],[70,69.5],[80,73.9],[90,83.7],[100,93.3]],"col":[32,44,17]}]},
  "Folder 76 YY": {"skyTop":[128,134,39],"skyBot":[32,111,32],"sun":[210,219,87],"sunX":67.18739857897162,"sunY":15.679370478726923,"sunR":10.156901163980365,"ridges":[{"pts":[[0,45.4],[10,52.6],[20,56.4],[30,52.8],[40,45.6],[50,42.1],[60,46],[70,53.2],[80,56.4],[90,52.2],[100,45]],"col":[80,84,29]},{"pts":[[0,61.7],[10,73.5],[20,74.5],[30,63.4],[40,55.7],[50,62.2],[60,73.8],[70,74.2],[80,62.9],[90,55.7],[100,62.7]],"col":[52,65,22]},{"pts":[[0,73.4],[10,76.7],[20,83.3],[30,89.8],[40,93.1],[50,91.5],[60,85.8],[70,78.8],[80,74],[90,73.8],[100,78.2]],"col":[30,46,16]}]},
  "Folder 196 OO": {"skyTop":[152,98,58],"skyBot":[94,104,39],"sun":[206,137,85],"sunX":19.70499388873577,"sunY":33.46240664366633,"sunR":13.576154359383509,"ridges":[{"pts":[[0,60.6],[10,60],[20,55.4],[30,49.1],[40,44.1],[50,42.7],[60,45.7],[70,51.5],[80,57.5],[90,60.7],[100,59.6]],"col":[78,53,34]},{"pts":[[0,54.5],[10,56.5],[20,71.6],[30,75.9],[40,62.4],[50,52.7],[60,62.2],[70,75.8],[80,71.8],[90,56.6],[100,54.4]],"col":[60,49,26]},{"pts":[[0,82.4],[10,76.4],[20,75.7],[30,80.7],[40,88.5],[50,94.1],[60,94.2],[70,88.6],[80,80.8],[90,75.7],[100,76.3]],"col":[43,40,19]}]},
};

test('card art matches the approved algorithm exactly',()=>{
 for(const [name,expected] of Object.entries(GOLDEN))assert.deepEqual(art(name),expected,name);
});
test('card art ignores case and Unicode form, and is stable',()=>{
 assert.deepEqual(art('IDEAS'),art('ideas'));
 assert.deepEqual(art('Café'),art('Café'));
 assert.equal(cardArt('Ideas'),cardArt('Ideas'));
});
test('card art output carries only numbers and hex colours, never the folder name',()=>{
 const a=cardArt('<script>"x";</script> folder');
 assert.match(a.style,/^(--[a-z-]+:(#[0-9a-f]{6}|[\d.]+%);?)+$/);
 assert.equal(a.ridges.length,3);
 for(const r of a.ridges){assert.match(r.d,/^M0 130 L[\d. L-]+ L100 130 Z$/);assert.match(r.fill,/^#[0-9a-f]{6}$/)}
 assert.ok(!/script|folder/.test(JSON.stringify(a)));
});

const note=(id,folder,tags,updatedAt,createdAt=updatedAt,title=id)=>({id,title,folder,tags,body:'',starred:false,updatedAt,createdAt});
const vault=(folders,notes)=>({version:1,folders,notes,canvas:[]});

test('plural',()=>{assert.equal(plural(0,'note'),'0 notes');assert.equal(plural(1,'note'),'1 note');assert.equal(plural(2,'folder'),'2 folders')});

test('homeModel: counts, summary and folder order follow the vault',()=>{
 const m=homeModel(vault(['B','A'],[note('1','A',[],'2026-01-01T00:00:00Z'),note('2','A',[],'2026-01-02T00:00:00Z')]));
 assert.deepEqual(m.folders.map(f=>[f.name,f.count]),[['B',0],['A',2]]);
 assert.equal(m.summary,'2 folders · 2 notes');
 assert.equal(homeModel(vault(['A'],[note('1','A',[],'2026-01-01')])).summary,'1 folder · 1 note');
});
test('homeModel: most-used tag counts notes, folds case, and breaks ties alphabetically',()=>{
 const t='2026-01-01T00:00:00Z';
 const m=homeModel(vault(['A','B','C','D'],[
  note('1','A',['Plan','plan','plan'],t),note('2','A',['PLAN','other'],t),note('3','A',['other'],t),note('4','A',['other'],t),
  note('5','B',['zeta'],t),note('6','B',['Alpha'],t),
  note('7','C',[],t)]));
 assert.equal(m.folders[0].tag,'other');      // 3 notes beat 2 notes
 assert.equal(m.folders[1].tag,'Alpha');      // tie: alphabetical, original spelling kept
 assert.equal(m.folders[2].tag,null);         // no tags
 assert.equal(m.folders[3].tag,null);         // empty folder
 assert.equal(m.folders[3].newest,null);
 const s=homeModel(vault(['A'],[note('1','A',['Plan'],t),note('2','A',['plan'],t),note('3','A',['plan'],t)]));
 assert.equal(s.folders[0].tag,'plan');       // most frequent spelling
});
test('homeModel: newest and recent use parsed dates, not strings, and break ties by createdAt then id',()=>{
 const m=homeModel(vault(['A'],[
  note('a','A',[],'Tue, 03 Feb 2026 10:00:00 GMT'),   // non-ISO, later than the ISO ones
  note('b','A',[],'2026-01-15T00:00:00Z'),
  note('c','A',[],'2026-01-15T00:00:00Z','2026-01-10T00:00:00Z'),
  note('d','A',[],'2026-01-15T00:00:00Z','2026-01-12T00:00:00Z'),
  note('e','A',[],'not a date'),
  note('f','A',[],'2026-01-01T00:00:00Z'),
  note('g','A',[],'2025-12-01T00:00:00Z')]));
 assert.equal(m.folders[0].newest.id,'a');
 assert.deepEqual(m.recent.map(r=>r.id),['a','b','d','c','f']);
 assert.equal(m.recent.length,5);
});
test('homeModel: a note in an unknown folder is ignored for cards but still listed as recent',()=>{
 const m=homeModel(vault(['A'],[note('1','Gone',[],'2026-01-01')]));
 assert.equal(m.folders[0].count,0);assert.equal(m.recent.length,1);
});
test('homeModel: a maximum vault is fast',()=>{
 const folders=Array.from({length:100},(_,i)=>'Folder '+i);
 const notes=Array.from({length:500},(_,i)=>note('n'+i,folders[i%100],Array.from({length:20},(_,k)=>'t'+((i+k)%37)),new Date(2026,0,1+i%300).toISOString()));
 const t=performance.now();const m=homeModel(vault(folders,notes));const ms=performance.now()-t;
 assert.equal(m.folders.length,100);assert.ok(ms<20,ms+' ms');
});

test('cardLabel follows the agreed string',()=>{
 const newest={id:'x',title:'Newest'};
 assert.equal(cardLabel({name:'Ideas',tag:'sparks',count:2,newest}),'Ideas, sparks, 2 notes. Opens newest note: Newest');
 assert.equal(cardLabel({name:'Ideas',tag:'sparks',count:1,newest}),'Ideas, sparks, 1 note. Opens newest note: Newest');
 assert.equal(cardLabel({name:'Ideas',tag:null,count:3,newest}),'Ideas, 3 notes. Opens newest note: Newest');
 assert.equal(cardLabel({name:'Empty',tag:null,count:0,newest:null}),'Empty, 0 notes. Creates a new note');
});

test('gridTarget: row of cards and edges',()=>{
 assert.equal(gridTarget(0,'ArrowLeft',5,5),-1);
 assert.equal(gridTarget(4,'ArrowRight',5,5),-1);
 assert.equal(gridTarget(1,'ArrowRight',5,5),2);
 assert.equal(gridTarget(3,'Home',5,5),0);
 assert.equal(gridTarget(1,'End',5,5),4);
 assert.equal(gridTarget(2,'ArrowDown',5,5),-1);
 assert.equal(gridTarget(2,'a',5,5),-1);
 assert.equal(gridTarget(0,'End',1,1),-1);
});
test('gridTarget: grid with a short last row',()=>{
 // 4 columns, 10 cards: rows are 0-3, 4-7, 8-9
 assert.equal(gridTarget(1,'ArrowDown',4,10),5);
 assert.equal(gridTarget(5,'ArrowUp',4,10),1);
 assert.equal(gridTarget(1,'ArrowUp',4,10),-1);
 assert.equal(gridTarget(6,'ArrowDown',4,10),9);   // nothing below: go to the last card
 assert.equal(gridTarget(9,'ArrowDown',4,10),-1);  // already on the last row
 assert.equal(gridTarget(8,'ArrowDown',4,10),-1);
 assert.equal(gridTarget(9,'ArrowRight',4,10),-1);
 assert.equal(gridTarget(9,'ArrowLeft',4,10),8);
 assert.equal(gridTarget(0,'End',4,10),9);
 assert.equal(gridTarget(0,'ArrowDown',4,0),-1);
});
test('the roving Tab stop starts above 8 folders',()=>{assert.equal(ROVING_MIN,9)});

test('the server hands out /home.js with the JavaScript type, and only at that exact path',async()=>{
 assert.equal(FILES['/home.js'].type,FILES['/app.js'].type);
 const server=createServer({logEvent(){}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const port=server.address().port;
 const get=p=>fetch(`http://127.0.0.1:${port}${p}`);
 try{
  const ok=await get('/home.js');assert.equal(ok.status,200);assert.match(ok.headers.get('content-type'),/javascript/);
  assert.equal(await ok.text(),readFileSync(new URL('../web/home.js',import.meta.url),'utf8'));
  for(const p of ['/HOME.JS','/web/home.js','/home.js/'])assert.equal((await get(p)).status,404,p);
 }finally{server.close()}
});

test('home.js is a pure module: no DOM access',()=>{
 const src=readFileSync(new URL('../web/home.js',import.meta.url),'utf8');
 assert.ok(!/\b(document|window|localStorage|innerHTML)\b/.test(src));
});

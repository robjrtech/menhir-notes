import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVault,safeURL,MAX_BYTES} from '../web/model.js';

const now='2026-01-01T00:00:00.000Z';
const note=(id='one')=>({id,title:'Note '+id,folder:'Notes',body:'# A note\nA thought with [[Note two]].',tags:['ideas'],starred:false,createdAt:now,updatedAt:now});
const sample=()=>({version:1,folders:['Notes'],notes:[note()],canvas:[{id:'one',x:50,y:80}]});

test('a valid vault round-trips unchanged',()=>assert.deepEqual(validateVault(sample()),sample()));

const badVaults=[
 ['unsupported version',v=>v.version=2],['missing folders',v=>v.folders=[]],['duplicate folders',v=>v.folders=['Notes','Notes']],['blank folder',v=>v.folders=[' ']],
 ['duplicate ID',v=>v.notes.push({...v.notes[0],title:'Other'})],['duplicate title',v=>v.notes.push({...v.notes[0],id:'two',title:'NOTE ONE'})],['unsafe ID',v=>v.notes[0].id='<script>'],['blank title',v=>v.notes[0].title=' '],['wikilink title',v=>v.notes[0].title='[[Bad]]'],['unknown folder',v=>v.notes[0].folder='Unknown'],['body wrong type',v=>v.notes[0].body={}],['overlong body',v=>v.notes[0].body='x'.repeat(200001)],['invalid tag',v=>v.notes[0].tags=[null]],['too many tags',v=>v.notes[0].tags=Array(21).fill('x')],['starred wrong type',v=>v.notes[0].starred=1],['invalid timestamp',v=>v.notes[0].updatedAt='not a date'],['unknown canvas ID',v=>v.canvas[0].id='nope'],['duplicate canvas ID',v=>v.canvas.push({...v.canvas[0]})],['canvas coordinate wrong type',v=>v.canvas[0].x='20'],['canvas x outside range',v=>v.canvas[0].x=1151],['canvas negative y',v=>v.canvas[0].y=-1],
 ['too many notes',v=>v.notes=Array.from({length:501},(_,i)=>note('n'+i))],['too many folders',v=>v.folders=Array.from({length:101},(_,i)=>'Folder '+i)],['too many canvas cards',v=>v.canvas=Array(101).fill({id:'one',x:0,y:0})]
];
for(const [label,mutate] of badVaults)test('invalid vault: '+label,()=>{const v=sample();mutate(v);assert.throws(()=>validateVault(v))});
test('non-object input is rejected',()=>{for(const v of [null,undefined,0,'x',[],true])assert.throws(()=>validateVault(v))});

test('a vault over 1 MB is rejected',()=>{
 const v=sample();v.notes=Array.from({length:6},(_,i)=>({...note('n'+i),body:'x'.repeat(190000)}));v.canvas=[];
 assert.throws(()=>validateVault(v),/1 MB/);
});
test('size is measured in bytes, not characters',()=>{
 const v=sample();v.notes=Array.from({length:3},(_,i)=>({...note('n'+i),body:'🪨'.repeat(90000)}));v.canvas=[];
 assert.throws(()=>validateVault(v),/1 MB/);
 assert.equal(MAX_BYTES,1_000_000);
});
test('an empty vault with one folder is valid',()=>{const v={version:1,folders:['Notes'],notes:[],canvas:[]};assert.deepEqual(validateVault(v),v)});
test('unknown fields are stripped and duplicate tags collapsed',()=>{
 const v=sample();v.extra={unsafe:true};v.notes[0].extra='discard';v.notes[0].tags=['ideas','ideas'];
 const clean=validateVault(v);
 assert.equal(clean.extra,undefined);assert.equal(clean.notes[0].extra,undefined);assert.deepEqual(clean.notes[0].tags,['ideas']);
});
test('validation returns detached structures',()=>{
 const v=sample();const clean=validateVault(v);
 clean.notes[0].body='Changed';clean.notes[0].tags.push('new');clean.folders.push('Extra');clean.canvas[0].x=999;
 assert.deepEqual(v,sample());
});
test('key order in the input does not change the validated output',()=>{
 const a=sample();
 const b={canvas:a.canvas,notes:[Object.fromEntries(Object.entries(a.notes[0]).reverse())],folders:a.folders,version:1};
 assert.equal(JSON.stringify(validateVault(a)),JSON.stringify(validateVault(b)));
});
test('script, data and other unsafe link schemes are rejected',()=>{
 for(const url of ['javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,<script>alert(1)</script>','vbscript:msgbox(1)','file:///etc/passwd','//evil.example/path','/relative','not a url'])assert.equal(safeURL(url),null,url);
});
test('http, https and mailto links are accepted',()=>{
 for(const url of ['https://example.com/','http://example.com/a','mailto:hello'+String.fromCharCode(64)+'example.com'])assert.equal(safeURL(url),url);
});

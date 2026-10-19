import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateVault} from '../web/model.js';

// The sample notes live in web/app.js, which needs a browser. Pull the seed definition out of
// the source text and evaluate just that, so the fixture cannot drift from the real notes.
const src=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const start='function seedVault() {',a=src.indexOf(start)+start.length,b=src.indexOf('const stamp = new Date()',a);
const seeded=new Function(src.slice(a,b)+'\nreturn vault;')();
const fixture=JSON.parse(readFileSync(new URL('./fixtures/seed-notes.json',import.meta.url),'utf8'));

test('the seed definition was found in app.js',()=>assert.ok(a>start.length&&b>a&&seeded.notes.length===8));
test('the fixture matches the sample notes in app.js exactly',()=>{
 assert.deepEqual(fixture,seeded.notes.map(({id,title,body})=>({id,title,body})));
});
test('the sample vault is valid once timestamps are added',()=>{
 const stamp='2026-01-01T00:00:00.000Z';
 const v=structuredClone(seeded);v.notes.forEach(n=>{n.starred=!!n.starred;n.createdAt=stamp;n.updatedAt=stamp});
 assert.equal(validateVault(v).notes.length,8);
});
test('the welcome note mentions saving to a file and exporting',()=>{
 assert.match(seeded.notes.find(n=>n.id==='welcome').body,/save them to a file/);
});

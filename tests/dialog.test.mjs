import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {esc} from '../web/markdown.js';

const appSrc=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
const between=(a,b)=>appSrc.slice(appSrc.indexOf(a),appSrc.indexOf(b));
const ib=new Function('esc','icon',between('const ib =','function seedVault')+';return ib')(esc,n=>`<svg data-i="${n}"></svg>`);
const actions=new Function(between('const actions =','function uniqueTitle')+';return actions')();

test('icon buttons render as type="button", so they never submit a dialog form',()=>{
 for(const html of [ib('x','Close dialog','close-modal'),ib('plus','New note','new','right',true)])
  assert.match(html,/^<button type="button" class="icon-button /);
});
test('a dialog has exactly one submit button, the primary action, and Cancel cannot submit',()=>{
 const html=actions('Create note');
 assert.equal(html.match(/<button\b/g).length,2);
 assert.match(html,/<button type="button" class="secondary-button" data-action="close-modal">/);
 assert.equal(html.match(/type="submit"/g).length,1);
 assert.match(html,/<button class="primary-button" type="submit">Create note<\/button>/);
});
test('the dialog header X comes before the form fields, so it only works as type="button"',()=>{
 const src=between('function dialog(','function closeDialog');
 assert.match(src,/<form id="dialog-form"><div class="dialog-head"><h2>[^]*?\$\{ib\("x", "Close dialog", "close-modal"\)\}/);
 assert.match(src,/e\.preventDefault\(\);[^]*?onSubmit/);
});
test('no button template inside a dialog body omits its type',()=>{
 const dialogs=appSrc.slice(appSrc.indexOf('function newNoteDialog'));
 for(const m of dialogs.matchAll(/<button\b[^>]*>/g)){
  const tag=m[0];
  if(/data-add-card|data-note/.test(tag))continue; // search palette results sit outside any form
  assert.match(tag,/\btype="(button|submit)"/,tag);
 }
});
test('dialogs swallow auto-repeated Enter so a held key on the opener cannot submit them',()=>{
 const src=between('function dialog(','function closeDialog');
 assert.match(src,/modal\.onkeydown = \(e\) => \{\s*if \(e\.key === "Enter" && e\.repeat\) e\.preventDefault\(\);\s*\};/);
 assert.doesNotMatch(src,/modal\.onkeydown = null/);
});

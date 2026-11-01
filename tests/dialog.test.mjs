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
test('a dialog opened from inside another keeps the original opener and focuses its first control',()=>{
 const src=between('function dialog(','function closeDialog');
 assert.match(src,/const replacing = modal\.open;/);
 assert.match(src,/if \(!replacing\) lastFocus = document\.activeElement;/);
 assert.doesNotMatch(src,/^\s*lastFocus = document\.activeElement;/m);
 assert.match(src,/if \(replacing\) modal\.querySelector\("button"\)\?\.focus\(\);\s*else modal\.showModal\(\);/);
});
test('the replaced-dialog focus never lands on a submit button, since the Close X always comes first',()=>{
 const src=between('function dialog(','function closeDialog');
 assert.ok(src.indexOf('Close dialog')<src.indexOf('${body}'));
});
test('closing a dialog leaves a hint that render() resolves in the new page, then clears',()=>{
 const close=between('function closeDialog(','const focusNote');
 assert.match(close,/const attr = \["data-action", "data-move-card"\]\.find\(\(a\) => lastFocus\?\.getAttribute\?\.\(a\)\);/);
 assert.match(close,/value && \/\^\[\\w-\]\+\$\/\.test\(value\)\s*\? \{ sel: `\[\$\{attr\}="\$\{value\}"\]`, region: REGIONS\.find\(\(r\) => lastFocus\.closest\(r\)\) \}\s*: \{ sel: LANDING \};/);
 assert.match(close,/queueMicrotask\(\(\) => \(restoreFocus = null\)\)/);
 const render=between('function render(','function tree(');
 assert.match(render,/restoreHomeUi\(ui\);\s*if \(restoreFocus && !focusShown\(restoreFocus\.sel, restoreFocus\.region\)\) focusShown\(LANDING\);\s*restoreFocus = null;/);
 const shown=between('function focusShown(','const LANDING');
 assert.match(shown,/\[\.\.\.\$\("#app"\)\.querySelectorAll\(sel\)\]\.filter\(\(el\) => el\.getClientRects\(\)\.length\)/);
 assert.match(shown,/shown\.find\(\(el\) => region && el\.closest\(region\)\) \|\| shown\[0\];\s*el\?\.focus\(\);\s*return !!el;/);
});
test('deleting a note refocuses the tab of the note now shown, or the empty-state button',()=>{
 const src=between('case "delete":','case "help":');
 assert.match(src,/closeDialog\(\);[^]*?restoreFocus = \{ sel: "\.tab\.active \.label, \.empty button" \};\s*render\(\);/);
});
test('a palette opened over a dialog keeps the dialog opener as the return target',()=>{
 const src=between('function commandPalette(','const input = $("#command-query")');
 assert.match(src,/if \(!modal\.open\) lastFocus = document\.activeElement;/);
 assert.doesNotMatch(src,/^\s*lastFocus = document\.activeElement;/m);
});
test('picking a palette result moves focus into the opened note, whether or not a dialog was under it',()=>{
 const src=between('const node = e.target.closest("[data-note]")','const wiki =');
 assert.match(src,/const picked = modal\.open;\s*if \(picked\) closeDialog\(\);\s*openNote\(node\.dataset\.note\);\s*if \(picked\) \{\s*focusNote\(\);\s*if \(enterDown\) holdEnter\(\);\s*\}/);
 assert.match(appSrc,/const focusNote = \(\) => \(\$\("#editor"\) \|\| \$\("\.note-title"\)\)\?\.focus\(\);/);
 assert.match(appSrc,/<h1 class="note-title" tabindex="-1">/);
});
test('a key-driven palette pick swallows repeated Enter until the key is released',()=>{
 const src=between('function holdEnter(','modal.addEventListener("click"');
 assert.match(src,/e\.key === "Enter" && e\.repeat && e\.preventDefault\(\)/);
 assert.match(src,/addEventListener\("keydown", stop, true\)/);
 assert.match(src,/if \(e\.key !== "Enter"\) return;\s*document\.removeEventListener\("keydown", stop, true\);\s*document\.removeEventListener\("keyup", release\);/);
});
test('the restore hint is built only from a plain action name and is resolved inside #app',()=>{
 assert.match(appSrc,/const REGIONS = \[/);
 assert.doesNotMatch(between('function render(','function tree('),/"#app " \+/);
});
test('only an Enter pick arms holdEnter: Space clicks on keyup, when Enter is not down',()=>{
 assert.match(appSrc,/document\.addEventListener\("keydown", \(e\) => e\.key === "Enter" && \(enterDown = true\), true\);/);
 assert.match(appSrc,/document\.addEventListener\("keyup", \(e\) => e\.key === "Enter" && \(enterDown = false\), true\);/);
 assert.doesNotMatch(appSrc,/e\.detail === 0\) holdEnter/);
 assert.match(appSrc,/window\.addEventListener\("blur", \(\) => \(enterDown = false\)\);/);
});
test('a hint that finds nothing, or no usable opener, falls back to a landing control, never the page',()=>{
 assert.match(appSrc,/const LANDING = '\.tab\.active \.label, \.empty button, \[data-action="home"\]\.active';/);
 const close=between('function closeDialog(','const focusNote');
 assert.doesNotMatch(close,/: null;/);
});
test('a canvas card move returns focus to that card\'s Move button',()=>{
 assert.match(appSrc,/data-move-card="\$\{c\.id\}"/);
 assert.match(between('function closeDialog(','const focusNote'),/"data-move-card"/);
});
test('loading the latest copy and discarding a draft land focus after the banner is redrawn',()=>{
 assert.match(between('case "reload-latest":','case "recover":'),/async \(\) => \{\s*pendingDraft = null;\s*closeDialog\(\);[^]*?await loadVault\(\);\s*focusShown\(LANDING\);/);
 assert.match(between('case "discard-draft":','case "download-raw":'),/renderAlerts\(\);[^]*?focusShown\('\[data-action="recover"\]'\) \|\| focusShown\(LANDING\);/);
});
test('importing notes focuses the last imported note',()=>{
 const src=between('$("#import-file").addEventListener','window.addEventListener("beforeunload"');
 assert.match(src,/openNote\(vault\.notes\.at\(-1\)\.id\);\s*focusNote\(\);/);
});

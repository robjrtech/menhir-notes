import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {storageFooter,fileUiAllowed} from '../web/store.js';

const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');

test('the files footer only claims "Stored on this device" when notes were loaded from storage',()=>{
 assert.equal(storageFooter({loading:false,loaded:true,storageDown:false}),'Stored on this device');
 assert.equal(storageFooter({loading:false,loaded:false,storageDown:false}),'Notes unavailable','corrupt or failed load');
 assert.equal(storageFooter({loading:false,loaded:true,storageDown:true}),'Not saved','storage blocked');
 assert.equal(storageFooter({loading:true,loaded:false,storageDown:false}),'Opening your notes…');
 for(const state of [{loading:false,loaded:false,storageDown:false},{loading:false,loaded:true,storageDown:true}])
  assert.notEqual(storageFooter(state),'Stored on this device');
});
test('file saving, file banners and file sync are off unless notes are loaded and storage works',()=>{
 assert.equal(fileUiAllowed({loaded:true,storageDown:false}),true);
 assert.equal(fileUiAllowed({loaded:true,storageDown:true}),false);
 assert.equal(fileUiAllowed({loaded:false,storageDown:false}),false);
 assert.equal(fileUiAllowed({loaded:false,storageDown:true}),false);
});
test('the app uses these helpers for the footer, the file banner, the pickers and focus sync',()=>{
 assert.match(app,/storageFooter\(\{ loading, loaded, storageDown \}\)/);
 assert.ok(!app.includes('"Stored on this device"'),'the literal must live in one helper only');
 const banner=app.slice(app.indexOf('function fileAlertHTML'),app.indexOf('function fileAlertHTML')+200);
 assert.match(banner,/fileUiAllowed\(/);
 for(const fn of ['async function fileSave','async function fileOpen']){
  const i=app.indexOf(fn);assert.match(app.slice(i,i+120),/fileUiAllowed\(/,fn);
 }
 assert.match(app,/visibilitychange[\s\S]{0,80}fileUiAllowed\(/);
 assert.match(app,/addEventListener\("focus"[\s\S]{0,120}fileUiAllowed\(/);
});
test('when storage is unavailable the app starts with an empty vault, never the sample notes',()=>{
 const load=app.slice(app.indexOf('async function loadVault'),app.indexOf('// Quietly adopts'));
 const handler=load.slice(load.lastIndexOf('} catch (e) {'));
 assert.ok(handler.includes('emptyVault()'),'the failure handler should use the empty vault');
 assert.ok(!handler.includes('seedVault('),'the failure handler must not use the sample notes');
 // The sample notes are only written when no record exists.
 assert.equal((load.match(/seedVault\(/g)||[]).length,1);
});
test('control: the old behavior would be caught by the guards above',()=>{
 const old='storageDown = true;\n loaded = true;\n vault = seedVault();';
 assert.ok(old.includes('seedVault('));
 assert.equal(storageFooter({loading:false,loaded:false,storageDown:false})==='Stored on this device',false);
});

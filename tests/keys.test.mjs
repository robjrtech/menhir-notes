import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isApple,shortcutKeys} from '../web/keys.js';

const key=(o)=>({metaKey:false,ctrlKey:false,altKey:false,shiftKey:false,key:'',code:'',getModifierState:()=>false,...o});

test('Apple devices are recognised from the platform, and others are not',()=>{
 assert.equal(isApple({userAgentData:{platform:'macOS'}}),true);
 assert.equal(isApple({platform:'MacIntel'}),true,'Safari, and iPadOS which reports a Mac');
 assert.equal(isApple({platform:'iPhone'}),true);
 assert.equal(isApple({userAgentData:{platform:'Windows'}}),false);
 assert.equal(isApple({platform:'Linux x86_64'}),false);
 assert.equal(isApple({userAgentData:{platform:'Chrome OS'}}),false);
 assert.equal(isApple({}),false,'nothing known: Ctrl');
});
test('labels use ⌘ and ⌥ on Apple devices and Ctrl and Alt elsewhere',()=>{
 assert.equal(shortcutKeys(true).label('K'),'⌘ K');
 assert.equal(shortcutKeys(true).label('N',true),'⌘ ⌥ N');
 assert.equal(shortcutKeys(false).label('K'),'Ctrl+K');
 assert.equal(shortcutKeys(false).label('N',true),'Ctrl+Alt+N');
});
test('only the platform command key triggers a shortcut',()=>{
 const mac=shortcutKeys(true),pc=shortcutKeys(false);
 assert.equal(mac.isCommand(key({metaKey:true,key:'k'})),true);
 assert.equal(mac.isCommand(key({ctrlKey:true,key:'k'})),false,'Ctrl K deletes to the end of the line on a Mac');
 assert.equal(pc.isCommand(key({ctrlKey:true,key:'k'})),true);
 assert.equal(pc.isCommand(key({metaKey:true,key:'k'})),false,'the Windows key is not a command key');
});
test('new note is the command key with Option or Alt and N, matched by the physical key',()=>{
 const mac=shortcutKeys(true),pc=shortcutKeys(false);
 assert.equal(mac.isNewNote(key({metaKey:true,altKey:true,key:'˜',code:'KeyN'})),true,'Option changes the character');
 assert.equal(mac.isNewNote(key({metaKey:true,key:'n',code:'KeyN'})),false);
 assert.equal(pc.isNewNote(key({ctrlKey:true,altKey:true,key:'n',code:'KeyN'})),true);
 assert.equal(pc.isNewNote(key({ctrlKey:true,altKey:true,shiftKey:true,key:'N',code:'KeyN'})),false);
 assert.equal(pc.isNewNote(key({ctrlKey:true,altKey:true,key:'ń',code:'KeyN',getModifierState:m=>m==='AltGraph'})),false,'AltGr types letters');
});
test('the app shows no fixed ⌘ labels and routes keys through the platform helper',()=>{
 const app=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
 assert.ok(!app.includes('⌘'),'every label comes from keys.label()');
 assert.ok(!app.includes('e.metaKey || e.ctrlKey'));
 assert.match(app,/keys\.isNewNote\(e\)/);
 assert.match(app,/keys\.isCommand\(e\)/);
});

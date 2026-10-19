import {IDBFactory} from 'fake-indexeddb';
import {createStore} from '../web/store.js';

export const NOW='2026-01-01T00:00:00.000Z';
export const note=(id='one',over={})=>({id,title:'Note '+id,folder:'Notes',body:'A thought with [[Note two]].',tags:['ideas'],starred:false,createdAt:NOW,updatedAt:NOW,...over});
export const sample=(over={})=>({version:1,folders:['Notes'],notes:[note()],canvas:[{id:'one',x:50,y:80}],...over});
export const edited=(text)=>{const v=sample();v.notes[0].body=text;return v};

let n=0;
// Each call gives a fresh, isolated database. `peer()` opens a second store on the same one.
export function makeStores(t,count=1){
 const factory=new IDBFactory();
 const dbName='test-'+(n++);
 const stores=Array.from({length:count},()=>createStore({indexedDB:factory,dbName,channelName:dbName}));
 t?.after?.(()=>stores.forEach(s=>s.close()));
 return {factory,dbName,stores};
}

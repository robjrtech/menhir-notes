export const MAX_BYTES = 1_000_000;
export function validateVault(raw) {
  const fail = () => { throw new Error('This vault file is not valid. Import a Menhir Notes backup or Markdown notes.'); };
  if (!raw || raw.version !== 1 || !Array.isArray(raw.notes) || !Array.isArray(raw.folders) || !Array.isArray(raw.canvas)) fail();
  if (raw.notes.length > 500 || raw.folders.length > 100 || raw.canvas.length > 100) throw new Error('This vault exceeds the limit of 500 notes, 100 folders, or 100 canvas cards.');
  const string = (v,max) => typeof v === 'string' && v.length <= max;
  if (!raw.folders.length || raw.folders.some(f=>!string(f,80)||!f.trim()) || new Set(raw.folders).size!==raw.folders.length) fail();
  const ids=new Set(), titles=new Set();
  const notes=raw.notes.map(n=>{
    if (!n || !string(n.id,80) || !/^[a-zA-Z0-9_-]+$/.test(n.id) || ids.has(n.id) || !string(n.title,120) || !n.title.trim() || /[\[\]\r\n]/.test(n.title) || titles.has(n.title.toLowerCase()) || !raw.folders.includes(n.folder) || !string(n.body,200000) || !Array.isArray(n.tags) || n.tags.length>20 || n.tags.some(t=>!string(t,40)||!t.trim()) || typeof n.starred!=='boolean' || !string(n.updatedAt,40) || !Number.isFinite(Date.parse(n.updatedAt)) || !string(n.createdAt,40) || !Number.isFinite(Date.parse(n.createdAt))) fail();
    ids.add(n.id);titles.add(n.title.toLowerCase());
    return {id:n.id,title:n.title,folder:n.folder,body:n.body,tags:[...new Set(n.tags)],starred:n.starred,createdAt:n.createdAt,updatedAt:n.updatedAt};
  });
  const canvasIds=new Set();
  const canvas=raw.canvas.map(c=>{if(!c||!ids.has(c.id)||canvasIds.has(c.id)||!Number.isFinite(c.x)||!Number.isFinite(c.y)||c.x<0||c.x>1150||c.y<0||c.y>850)fail();canvasIds.add(c.id);return{id:c.id,x:c.x,y:c.y}});
  const value={version:1,folders:[...raw.folders],notes,canvas};
  if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_BYTES)throw new Error('Your vault is full (1 MB). Export a backup, then shorten or remove some notes.');
  return value;
}
export function safeURL(value){try{const u=new URL(value);return ['https:','http:','mailto:'].includes(u.protocol)?u.href:null}catch{return null}}
// Folder changes return a new vault and leave the one passed in untouched.
export function renameFolder(vault,from,to){
  const name=String(to??'').trim();
  if(!vault.folders.includes(from))throw new Error('That folder no longer exists.');
  if(!name||name.length>80)throw new Error('Use a folder name of 1–80 characters.');
  if(name!==from&&vault.folders.includes(name))throw new Error('Choose a unique folder name.');
  return {...vault,folders:vault.folders.map(f=>f===from?name:f),notes:vault.notes.map(n=>n.folder===from?{...n,folder:name}:n)};
}
// Removes a folder. Its notes move to `moveTo`, or with `moveTo` null they are deleted along
// with their canvas cards. A vault always keeps at least one folder.
export function deleteFolder(vault,name,moveTo,now=new Date().toISOString()){
  if(!vault.folders.includes(name))throw new Error('That folder no longer exists.');
  if(vault.folders.length===1)throw new Error('A vault needs at least one folder.');
  if(moveTo!==null&&(moveTo===name||!vault.folders.includes(moveTo)))throw new Error('Choose another folder for these notes.');
  const inside=new Set(vault.notes.filter(n=>n.folder===name).map(n=>n.id));
  return {...vault,folders:vault.folders.filter(f=>f!==name),
    notes:moveTo===null?vault.notes.filter(n=>!inside.has(n.id)):vault.notes.map(n=>inside.has(n.id)?{...n,folder:moveTo,updatedAt:now}:n),
    canvas:moveTo===null?vault.canvas.filter(c=>!inside.has(c.id)):vault.canvas};
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BRAND} from '../web/brand.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const read=p=>readFileSync(join(root,p),'utf8');

test('the page title matches the brand module',()=>{
 const title=read('web/index.html').match(/<title>([^<]*)<\/title>/)?.[1];
 assert.equal(title,BRAND.title);
 assert.ok(BRAND.title.startsWith(BRAND.name));
});
test('package name and license holder follow the brand',()=>{
 const pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.name,BRAND.name.toLowerCase().replace(/\s+/g,'-'));
 assert.equal(pkg.private,true);
 for(const field of ['repository','homepage','author','bugs'])assert.equal(pkg[field],undefined,field+' must not be set');
 assert.match(read('LICENSE'),new RegExp('Copyright \\(c\\) 2026 The '+BRAND.name+' authors'));
});
test('every identifier in the brand module is used by the name, not hard-coded elsewhere',()=>{
 assert.match(BRAND.dbName,/^[a-z-]+$/);
 for(const key of ['themeKey','exportPrefix','recoveredDraftFile','vaultFile','lockName','channel'])assert.ok(String(BRAND[key]).startsWith(BRAND.dbName),key);
});

// Earlier names of this project must not appear in any file. They are assembled from pieces
// so that this test does not contain them itself.
const OLD_NAMES=[['li','thic'],['cai','rn']].map(parts=>parts.join(''));
function walk(dir,out=[]){
 for(const name of readdirSync(dir)){
  if(['node_modules','.git'].includes(name))continue;
  const full=join(dir,name),st=statSync(full);
  st.isDirectory()?walk(full,out):out.push(full);
 }
 return out;
}
function findOldNames(files,names=OLD_NAMES,base=root){
 const hits=[];
 for(const f of files){
  const text=/\.(png|ico|jpg|gif|woff2?)$/.test(f)?'':readFileSync(f,'utf8').toLowerCase();
  const path=relative(base,f).toLowerCase();
  for(const n of names)if(text.includes(n)||path.includes(n))hits.push(relative(base,f)+': '+n);
 }
 return hits;
}
test('control: the scan detects a planted name, in contents and in file names',()=>{
 const dir=mkdtempSync(join(tmpdir(),'brand-check-'));
 try{
  const inContent=join(dir,'notes.txt'),inName=join(dir,'x-'+OLD_NAMES[1]+'.txt'),clean=join(dir,'clean.txt');
  writeFileSync(inContent,'a mention of '+OLD_NAMES[0].toUpperCase()+' here');
  writeFileSync(inName,'nothing');writeFileSync(clean,'nothing to see');
  assert.equal(findOldNames([inContent],OLD_NAMES,dir).length,1);
  assert.equal(findOldNames([inName],OLD_NAMES,dir).length,1);
  assert.equal(findOldNames([clean],OLD_NAMES,dir).length,0);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('the old project names appear in no file of the repository',()=>{
 const hits=findOldNames(walk(root));
 assert.deepEqual(hits,[]);
});

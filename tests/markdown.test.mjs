import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as fresh from '../web/markdown.js';
import * as oracle from './fixtures/markdown-oracle.mjs';

const seeds=JSON.parse(readFileSync(new URL('./fixtures/seed-notes.json',import.meta.url),'utf8'));
const time=fn=>{const t=performance.now();const r=fn();return [performance.now()-t,r]};
const best=(fn,runs=3)=>Math.min(...Array.from({length:runs},()=>time(fn)[0]));
function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const ALPHABET=['[',']','(',')','`','*','a','x',':','/','.',' ','\n'];
const randomString=(rand,max=80)=>{const len=Math.floor(rand()*(max+1));let s='';for(let i=0;i<len;i++)s+=ALPHABET[Math.floor(rand()*ALPHABET.length)];return s};

test('control: the reference regex scales quadratically, so the performance tests can detect a regression',()=>{
 // A doubling ratio does not depend on how fast the computer is.
 const small='['.repeat(20000),large='['.repeat(40000);
 const t1=Math.min(time(()=>oracle.inline(small))[0],time(()=>oracle.inline(small))[0]);
 const t2=Math.min(time(()=>oracle.inline(large))[0],time(()=>oracle.inline(large))[0]);
 assert.ok(t2/t1>3,'doubling the input multiplied the reference time by only '+(t2/t1).toFixed(2));
 const rename=best(()=>oracle.renameLinks(small,'a','b'),2);
 assert.ok(rename>0);
});

test('seed fixture holds all 8 seed notes',()=>assert.equal(seeds.length,8));
test('markdown() matches the reference implementation on every seed note',()=>{
 for(const n of seeds)assert.equal(fresh.markdown(n.body),oracle.markdown(n.body),n.title);
});

test('differential: inline() matches the reference regex on 20,000 random strings',()=>{
 const rand=mulberry32(0xC0FFEE);
 for(let i=0;i<20000;i++){const s=randomString(rand);assert.equal(fresh.inline(s),oracle.inline(s),JSON.stringify(s))}
});
test('differential: inline() on longer strings and hand-picked edge cases',()=>{
 const rand=mulberry32(12345);
 for(let i=0;i<3000;i++){const s=randomString(rand,400);assert.equal(fresh.inline(s),oracle.inline(s),JSON.stringify(s))}
 const edges=['','[','[[','[[]]','[[a]]','[[a]','[[a]]]','[[[a]]','[a](b)','[a](b','[a]()','[](b)','[a] (b)','[a](b c)','[a](javascript:alert)','[a](https://x.y/z?q=1)','[a](mailto:b@c.d)','[a](b)(c)','`','``','`a`','`a','``a``','**','***','****','**a**','**a*','*a**','*a*','**a**b*c*','a*b','[[a\nb]]','[a\nb](c)','`a\nb`','*a\nb*','**a\nb**','[a]( b)','[a](b c)','[a](b\uFEFFc)','[x](https://a)[y](https://b)','<script>"&\'','[[a]] and [[b]]','[**a**](b)','[`a`](b)','**[[a]]**','`**a**`','[[a](https://x.y)','[x [y](https://u.v)','[[a]](https://u.v)','[a [[b]] c](https://u.v)','[a[b](https://u.v)'];
 for(const s of edges)assert.equal(fresh.inline(s),oracle.inline(s),JSON.stringify(s));
});
test('differential: renameLinks() matches the reference regex on random strings and titles',()=>{
 const rand=mulberry32(777);const titles=['a','A','x a','','a]','[a','ab','a\nx'];
 for(let i=0;i<20000;i++){
  const s=randomString(rand);const old=titles[Math.floor(rand()*titles.length)];const nu=titles[Math.floor(rand()*titles.length)]+'$&';
  assert.equal(fresh.renameLinks(s,old,nu),oracle.renameLinks(s,old,nu),JSON.stringify([s,old,nu]));
 }
 const edges=['[[a]]','[[A]] [[a]]','[[a]','[[[a]]','[[a\nb]]','[[]]','[[ ]]','[[a]]]]','x[[a]]y[[b]]'];
 for(const s of edges)for(const old of ['a','A','a\nb',' ','b'])assert.equal(fresh.renameLinks(s,old,'N'),oracle.renameLinks(s,old,'N'),JSON.stringify([s,old]));
});
test('a link text cannot contain "[": the scan restarts after the extra bracket',()=>{
 const a='<a href="https://x.y/" target="_blank" rel="noopener noreferrer">a</a>';
 assert.equal(fresh.inline('[[a](https://x.y)'),'['+a);
 assert.equal(fresh.inline('[x [y](https://x.y)'),'[x <a href="https://x.y/" target="_blank" rel="noopener noreferrer">y</a>');
 assert.equal(fresh.inline('[[a]](https://x.y)'),'<button class="wiki-link" data-wiki="a">a</button>(https://x.y)');
 assert.equal(fresh.inline('[a [[b]] c](https://x.y)').includes('data-wiki="b"'),true);
 assert.ok(!fresh.inline('[a [[b]] c](https://x.y)').includes('<a href'));
 assert.equal(fresh.inline('[a](https://x.y)'),a);
 assert.equal(fresh.inline('[a](javascript:alert(1))'),'[a](javascript:alert(1))');
});
test('renameLinks keeps the exact output for typical notes',()=>{
 assert.equal(fresh.renameLinks('See [[Old Name]] and [[other]] and [[old name]].','Old Name','New'),'See [[New]] and [[other]] and [[New]].');
 assert.equal(fresh.renameLinks('no links here','a','b'),'no links here');
});

// Performance at the 200,000-character note limit.
const N=200000;
const mixed=(()=>{const rand=mulberry32(99);let s='';while(s.length<N)s+=ALPHABET[Math.floor(rand()*ALPHABET.length)];return s})();
const inputs={
 '[':'['.repeat(N),'[[':'[['.repeat(N/2),'[a](':'[a]('.repeat(N/4),'[a]':'[a]'.repeat(Math.ceil(N/3)).slice(0,N),'backticks':'`'.repeat(N),'*':'*'.repeat(N),'**':'**'.repeat(N/2),
 '[[a]':'[[a]'.repeat(N/4),'[a](b':'[a](b'.repeat(N/5),'[ then ]':'['.repeat(N/2)+']'.repeat(N/2),'mixed random':mixed
};
for(const [name,input] of Object.entries(inputs)){
 test('performance: inline() under 100 ms on 200k of '+name,()=>{
  assert.equal(input.length,N);
  const ms=best(()=>fresh.inline(input));assert.ok(ms<100,ms.toFixed(0)+' ms');
 });
 test('performance: markdown() under 250 ms on 200k of '+name,()=>{
  const ms=best(()=>fresh.markdown(input));assert.ok(ms<250,ms.toFixed(0)+' ms');
 });
 test('performance: renameLinks() under 100 ms on 200k of '+name,()=>{
  const ms=best(()=>fresh.renameLinks(input,'a','b'));assert.ok(ms<100,ms.toFixed(0)+' ms');
 });
}
test('performance: many lines of brackets (about 200k characters) render quickly',()=>{
 const body=('[[a]] [b](c) **d** `e` *f* ['.repeat(5)+'\n').repeat(1400);
 const ms=best(()=>fresh.markdown(body));assert.ok(ms<250,ms.toFixed(0)+' ms');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8');
const block=re=>{const m=css.match(re);assert.ok(m,'missing block '+re);return m[1]};
const tokens=text=>Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map(m=>[m[1],m[2]]));
const dark=tokens(block(/^:root\s*\{([^}]*)\}/m));
const light={...dark,...tokens(block(/^\.theme-light\s*\{([^}]*)\}/m))};

const rgb=hex=>{let h=hex.slice(1);if(h.length===3)h=[...h].map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255)};
const lin=c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;
const lum=hex=>{const [r,g,b]=rgb(hex).map(lin);return 0.2126*r+0.7152*g+0.0722*b};
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05)};
const themes={dark,light};

test('contrast helper matches known WCAG values',()=>{
 assert.ok(Math.abs(ratio('#000000','#ffffff')-21)<0.01);
 assert.ok(Math.abs(ratio('#7a5bc4','#ffffff')-5.10)<0.02);
 assert.ok(Math.abs(ratio('#8e8c99','#252528')-4.63)<0.02);
});
for(const [name,t] of Object.entries(themes)){
 test(name+': --faint is at least 4.5:1 on page, side and rail',()=>{
  for(const bg of ['page','side','rail'])assert.ok(ratio(t.faint,t[bg])>=4.5,`${name} --faint on --${bg}: ${ratio(t.faint,t[bg]).toFixed(2)}`);
 });
 test(name+': --muted is at least 4.5:1 on page, side and rail',()=>{
  for(const bg of ['page','side','rail'])assert.ok(ratio(t.muted,t[bg])>=4.5,`${name} --muted on --${bg}: ${ratio(t.muted,t[bg]).toFixed(2)}`);
 });
 test(name+': white on --accent and --accent-hover is at least 4.5:1',()=>{
  for(const k of ['accent','accent-hover'])assert.ok(ratio('#ffffff',t[k])>=4.5,`${name} white on --${k}: ${ratio('#ffffff',t[k]).toFixed(2)}`);
 });
 test(name+': --text is at least 4.5:1 on selected, hover and surface (the residual-rule backgrounds)',()=>{
  for(const bg of ['selected','hover','surface'])assert.ok(ratio(t.text,t[bg])>=4.5,`${name} --text on --${bg}`);
 });
}
test('the hover state darkens the button and the old hard-coded hover color is gone',()=>{
 assert.ok(!css.includes('#9779da'));
 assert.match(css,/\.primary-button:hover\s*\{\s*background:\s*var\(--accent-hover\)/);
 assert.ok(lum(dark['accent-hover'])<lum(dark.accent));
});
test('residual pairs: the three --text rules and the focus ring rule exist',()=>{
 for(const sel of ['.tree-item.selected .count','.command-result:focus small','.tree-item:hover .count','.command-result:hover small','.tree-item:not(.selected):hover'])
  assert.ok(css.includes(sel),'missing selector '+sel);
 assert.match(css,/input\[type="checkbox"\]:focus-visible,\s*select:focus-visible\s*\{\s*outline:\s*2px solid var\(--purple\)/);
 assert.match(css,/#save-status\.is-error\s*\{\s*color:\s*var\(--text\)/);
});
test('phone layout uses the status bar and tab height tokens, with 44px touch targets',()=>{
 assert.ok(!/- 27px\)/.test(css)&&!/^\s+bottom: 27px/m.test(css)&&!/height: 27px/.test(css),'hard-coded 27px status bar height remains');
 const phone=css.slice(css.indexOf('@media (max-width: 500px)'));
 assert.match(phone,/--statusbar-h:\s*44px/);assert.match(phone,/--tabs-h:\s*52px/);
 assert.match(phone,/\.icon-button\s*\{\s*min-width:\s*44px;\s*min-height:\s*44px/);
 assert.match(phone,/\.statusbar button\s*\{\s*min-height:\s*44px/);
 assert.match(phone,/\.editor,\s*\.field,\s*select,\s*input\s*\{\s*font-size:\s*16px/);
});

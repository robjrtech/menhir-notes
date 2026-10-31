import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {readFileSync} from 'node:fs';
import {createServer,FILES,CSP,SECURITY_HEADERS,parsePort,DEFAULT_PORT} from '../scripts/serve.mjs';

const events=[];
const server=createServer({logEvent:(e,f)=>events.push([e,f])});
let port;
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));port=server.address().port});
after(()=>new Promise(r=>{server.closeAllConnections?.();server.close(r)}));

function request({path='/',method='GET',host,headers={},body}={}){
 return new Promise((resolve,reject)=>{
  const req=http.request({host:'127.0.0.1',port,path,method,setHost:false,headers:{Host:host??`127.0.0.1:${port}`,...headers},agent:false},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
  });
  req.on('error',reject);
  req.end(body);
 });
}
const HEADERS_EXPECTED={...SECURITY_HEADERS};
function assertHardened(r,label){
 for(const [k,v] of Object.entries(HEADERS_EXPECTED))assert.equal(r.headers[k.toLowerCase()],v,`${label}: ${k}`);
}

test('the CSP is exactly the documented policy',()=>{
 assert.equal(CSP,"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
});
test('the default port is the documented uncommon one',()=>{
 assert.equal(DEFAULT_PORT,4419);
 for(const common of [3000,4173,5173,8000,8080,8443])assert.notEqual(DEFAULT_PORT,common);
 assert.equal(parsePort(undefined),4419);assert.equal(parsePort('5000'),5000);
 for(const bad of ['0','65536','abc','-1','1e3','80 ','08x'])assert.equal(parsePort(bad),null,bad);
});
test('the server serves exactly ten URL paths, nine files, with the right types',async()=>{
 assert.equal(Object.keys(FILES).length,11);
 assert.equal(new Set(Object.values(FILES).map(f=>f.url.href)).size,10);
 for(const [path,f] of Object.entries(FILES)){
  const r=await request({path});
  assert.equal(r.status,200,path);assertHardened(r,path);
  assert.equal(r.headers['content-type'],f.type,path);
  assert.deepEqual(r.body,readFileSync(f.url),path);
 }
});
test('query strings are ignored',async()=>{
 const r=await request({path:'/app.js?x=1#y'});assert.equal(r.status,200);assert.equal(r.headers['content-type'],FILES['/app.js'].type);
});
test('HEAD returns headers and no body',async()=>{
 const r=await request({method:'HEAD'});
 assert.equal(r.status,200);assert.equal(r.body.length,0);assertHardened(r,'HEAD');
 assert.equal(Number(r.headers['content-length']),readFileSync(FILES['/'].url).length);
});
test('hardening headers are on 404, 405, 400, 403 and 308 responses',async()=>{
 const notFound=await request({path:'/nope'});assert.equal(notFound.status,404);assertHardened(notFound,'404');
 const post=await request({method:'POST',body:'x'});assert.equal(post.status,405);assertHardened(post,'405');
 assert.equal(post.headers.allow,'GET, HEAD');assert.equal(post.headers.connection,'close');
 const bad=await request({path:'*',method:'OPTIONS'});assert.equal(bad.status,400);assertHardened(bad,'400');
 const forbidden=await request({host:'evil.example'});assert.equal(forbidden.status,403);assertHardened(forbidden,'403');
 const redirect=await request({host:`localhost:${port}`});assert.equal(redirect.status,308);assertHardened(redirect,'308');
});
test('every other method gets 405 with Allow: GET, HEAD',async()=>{
 for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']){
  const r=await request({method});assert.equal(r.status,405,method);assert.equal(r.headers.allow,'GET, HEAD');
 }
});
test('a malformed request still gets a 400 with hardening headers',async()=>{
 const raw=await new Promise(resolve=>{
  const s=net.connect(port,'127.0.0.1',()=>s.write('GARBAGE\r\n\r\n'));
  let data='';s.on('data',d=>data+=d);s.on('close',()=>resolve(data));
 });
 assert.match(raw,/^HTTP\/1\.1 400/);assert.match(raw,/Content-Security-Policy: default-src 'none'/);assert.match(raw,/X-Frame-Options: DENY/);
});
test('localhost gets a 308 to exactly the canonical URL, never echoing the path',async()=>{
 for(const path of ['/','/app.js','/x?y=1','//evil.example/']){
  const r=await request({host:`LOCALHOST:${port}`,path});
  assert.equal(r.status,308,path);assert.equal(r.headers.location,`http://127.0.0.1:${port}/`,path);
 }
});
test('Host values outside the allow-list get 403 (or 400 for unparseable ones)',async()=>{
 const hosts=['localhost','127.0.0.1','localhost.:PORT','127.0.0.1.:PORT','[::1]:PORT','0.0.0.0:PORT','127.1:PORT','2130706433:PORT','0x7f.0.0.1:PORT','evil.example','evil.example:PORT','evil.example:PORT<at>localhost:PORT','localhost:PORT<at>evil.example','localhost:PORT,evil.example','localhost:0PORT','localhost:+PORT','LOCALHOST.:PORT','xn--localhost:PORT','localhost%00:PORT','localhost:PORT.','localhost:PORT/','[::ffff:127.0.0.1]:PORT','localhost:99999','__proto__','constructor','toString','127.0.0.1:1','a.localhost:PORT','localhost.evil.example:PORT'];
 assert.ok(hosts.length>=25);
 for(const h of hosts){
  const host=h.replaceAll('PORT',String(port)).replaceAll('<at>','@');
  let r;try{r=await request({host})}catch{continue}
  assert.ok([400,403].includes(r.status),`${host} -> ${r.status}`);
  assert.ok(!/<html/i.test(r.body.toString()),host);
 }
 assert.ok(events.some(([e])=>e==='host_rejected'));
});
test('paths cannot escape the fixed map',async()=>{
 for(const path of ['/..%2f..%2fpackage.json','/%2e%2e/package.json','//evil.example','/\\evil','/__proto__','/constructor','/toString','/hasOwnProperty','/index.html/','/APP.JS','/app.js%00','/web/app.js','/../scripts/serve.mjs','/node_modules/fake-indexeddb/package.json','/package.json','/.git/config']){
  const r=await request({path});
  assert.equal(r.status,404,path);assert.equal(r.body.toString(),'Not found',path);
 }
});
test('a request target that does not start with / is rejected',async()=>{
 const raw=await new Promise(resolve=>{
  const s=net.connect(port,'127.0.0.1',()=>s.write(`GET http://127.0.0.1:${port}/app.js HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
  let data='';s.on('data',d=>data+=d);s.on('close',()=>resolve(data));
 });
 assert.match(raw,/^HTTP\/1\.1 400/);
});
test('an internal error returns a generic 500 with hardening headers and logs only the error name',async()=>{
 const ev=[];
 const broken=createServer({files:{'/':{url:new URL('file:///definitely/not/here.html'),type:'text/html'}},logEvent:(e,f)=>ev.push([e,f])});
 await new Promise(r=>broken.listen(0,'127.0.0.1',r));
 const p=broken.address().port;
 const r=await new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port:p,path:'/',setHost:false,headers:{Host:`127.0.0.1:${p}`},agent:false},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:b}))}).on('error',reject));
 broken.close();
 assert.equal(r.status,500);assert.equal(r.body,'Server error');assertHardened(r,'500');
 assert.equal(ev[0][0],'server_error');assert.equal(ev[0][1].error,'Error');
});

// The server must not read request bodies.
const MB=1024*1024;
async function blast(srv,{method='POST',total=64*MB}={}){
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const p=srv.address().port;
 const rssBefore=process.memoryUsage().rss;let peak=rssBefore;
 const sampler=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss)},5);
 const chunk=Buffer.alloc(64*1024,0x61);
 let sent=0,response='';
 await new Promise(resolve=>{
  const s=net.connect(p,'127.0.0.1');
  s.on('data',d=>{if(response.length<2000)response+=d});
  s.on('error',()=>{});
  s.on('close',resolve);
  s.on('connect',async()=>{
   s.write(`${method} / HTTP/1.1\r\nHost: 127.0.0.1:${p}\r\nContent-Length: ${total}\r\n\r\n`);
   while(sent<total&&!s.destroyed){
    const ok=s.write(chunk,()=>{});
    sent+=chunk.length;
    if(!ok)await new Promise(r=>{s.once('drain',r);s.once('close',r)});
   }
   s.end();
  });
 });
 clearInterval(sampler);
 peak=Math.max(peak,process.memoryUsage().rss);
 await new Promise(r=>{srv.closeAllConnections?.();srv.close(r)});
 return {sent,growth:peak-rssBefore,status:Number(response.match(/^HTTP\/1\.1 (\d+)/)?.[1]??0)};
}
const violates=r=>r.sent>=8*MB||r.growth>16*MB;
test('control: a handler that buffers request bodies is detected by the harness',async t=>{
 const buffering=http.createServer(async(req,res)=>{
  const parts=[];for await(const c of req)parts.push(c);
  res.writeHead(405,{Connection:'close'});res.end('no');
 });
 const r=await blast(buffering);
 t.diagnostic(`control: sent ${(r.sent/MB).toFixed(2)} MB, memory growth ${(r.growth/MB).toFixed(2)} MB`);
 assert.ok(violates(r),`harness missed the buffering handler: sent ${(r.sent/MB).toFixed(1)} MB, growth ${(r.growth/MB).toFixed(1)} MB`);
});
test('a 64 MB POST is answered and closed before 8 MB is sent, with under 16 MB of growth',async t=>{
 const r=await blast(createServer({logEvent(){}}));
 t.diagnostic(`sent ${(r.sent/MB).toFixed(2)} MB, memory growth ${(r.growth/MB).toFixed(2)} MB`);
 assert.equal(r.status,405);
 assert.ok(r.sent<8*MB,`sent ${(r.sent/MB).toFixed(1)} MB`);
 assert.ok(r.growth<16*MB,`growth ${(r.growth/MB).toFixed(1)} MB`);
});
test('a GET that carries a large body is answered and closed the same way',async t=>{
 const r=await blast(createServer({logEvent(){}}),{method:'GET'});
 t.diagnostic(`sent ${(r.sent/MB).toFixed(2)} MB, memory growth ${(r.growth/MB).toFixed(2)} MB`);
 assert.equal(r.status,200);assert.ok(!violates(r),`sent ${(r.sent/MB).toFixed(1)} MB, growth ${(r.growth/MB).toFixed(1)} MB`);
});

test('a request with no Host header gets the app\'s 403 with every hardening header',async()=>{
 const raw=await new Promise(resolve=>{
  const s=net.connect(port,'127.0.0.1',()=>s.write('GET / HTTP/1.1\r\nConnection: close\r\n\r\n'));
  let data='';s.on('data',d=>data+=d);s.on('close',()=>resolve(data));
 });
 assert.match(raw,/^HTTP\/1\.1 403/);
 for(const [k,v] of Object.entries(SECURITY_HEADERS))assert.ok(raw.toLowerCase().includes(`${k.toLowerCase()}: ${v.toLowerCase()}`),'missing '+k);
 assert.match(raw,/Forbidden host/);
 assert.ok(events.some(([e,f])=>e==='host_rejected'&&f.host===undefined));
});

test('refusing a request depends on two Node internals; this fails if either disappears',async()=>{
 const seen=[];
 const srv=createServer({logEvent(){}});
 // Runs before the server's own handler, so it sees Node's untouched request and socket.
 srv.prependListener('request',req=>{if(req.method==='POST')seen.push([typeof req._dump,typeof req.socket.destroySoon])});
 await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 const p=srv.address().port;
 const status=await new Promise((resolve,reject)=>{
  const q=http.request({host:'127.0.0.1',port:p,method:'POST',path:'/',setHost:false,headers:{Host:`127.0.0.1:${p}`},agent:false},res=>{res.resume();res.on('end',()=>resolve(res.statusCode))});
  q.on('error',reject);q.end('x');
 });
 srv.closeAllConnections?.();await new Promise(r=>srv.close(r));
 assert.equal(status,405);
 assert.deepEqual(seen,[['function','function']]);
});
test('the deferred close is armed from the response finish event, not only from destroySoon',()=>{
 const src=readFileSync(new URL('../scripts/serve.mjs',import.meta.url),'utf8');
 const body=src.slice(src.indexOf('function refuse('));
 assert.match(body,/res\.once\("finish"/);
 assert.match(body,/socket\.destroy\(\)/);
});

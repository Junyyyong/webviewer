import test from 'node:test';
import assert from 'node:assert/strict';
import {ContentStore,validateManifest,safePath,MAX_FILE,loadMindUrl} from '../site/content-store.js';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto) globalThis.crypto=webcrypto;
globalThis.FileReader=class {async readAsDataURL(blob){this.result='data:;base64,'+Buffer.from(await blob.arrayBuffer()).toString('base64');this.onload();}};
const row={id:'one',name:'<img onerror=alert(1)>',aspect:1,image_path:'media/images/a.png',video_path:'media/videos/a.mp4',mind_index:0};
const manifest={version:1,mind_path:'media/targets.mind',targets:[row]};
test('rejects unsafe asset paths and inconsistent recognition indices',()=>{
 for(const p of ['https://evil/a','media/../config.js','media//x','media/./x','media/a".mp4']) assert.throws(()=>safePath(p));
 assert.equal(validateManifest(manifest),manifest);
 assert.throws(()=>validateManifest({...manifest,targets:[row,{...row,id:'two'}]}));
 assert.throws(()=>validateManifest({...manifest,targets:[{...row,mind_index:2}]}));
 assert.throws(()=>validateManifest({...manifest,mind_path:null}));
});
function harness(failAt) {
 const store=new ContentStore({owner:'Junyyyong',repo:'webviewer'});store.head='old';store.rows=[row];store.files.set('media/images/new.png',new Blob(['image']));store.discard=async()=>{};
 const calls=[];
 store.api=async(path,body,method)=>{
   calls.push({path,body,method}); if(path===failAt) throw new Error('injected failure');
   if(path==='git/ref/heads/main') return {object:{sha:'old'}};
   if(path==='git/commits/old') return {tree:{sha:'base'}};
   return {sha:path==='git/commits'?'new':'sha'+calls.length};
 };return {store,calls};
}
test('publishes media, split mind data, and manifest in one non-force commit',async()=>{
 const {store,calls}=harness(); const buffer=new Uint8Array(MAX_FILE+1); buffer[0]=17;
 await store.publish(buffer);
 const tree=calls.find(c=>c.path==='git/trees').body;
 assert.equal(tree.tree.filter(t=>t.path.endsWith('.mindpart')).length,2);
 const blobs=calls.filter(c=>c.path==='git/blobs');
 const published=JSON.parse(Buffer.from(blobs.at(-1).body.content,'base64').toString());
 assert.equal(published.targets[0].mind_index,0); assert.equal(published.mind_parts.length,2);
 assert.ok(blobs.every(c=>Buffer.from(c.body.content,'base64').length<=MAX_FILE));
 assert.equal(calls.at(-1).path,'git/refs/heads/main');assert.equal(calls.at(-1).body.force,false);
 assert.deepEqual(calls.find(c=>c.path==='git/commits').body.parents,['old']);
});
test('failed uploads do not change the live branch or discard drafts',async()=>{
 const {store,calls}=harness('git/blobs'); let discarded=false;store.discard=async()=>discarded=true;
 await assert.rejects(store.publish(new Uint8Array([1])),/injected/);
 assert.ok(!calls.some(c=>c.path==='git/refs/heads/main'));assert.equal(discarded,false);assert.equal(store.files.size,1);
});
test('concurrent changes are rejected before uploading',async()=>{
 const {store,calls}=harness();store.api=async()=>({object:{sha:'other'}});
 await assert.rejects(store.publish(new Uint8Array([1])),/다른 변경/);assert.equal(calls.length,0);
});
test('split recognition data is reassembled and hash checked',async()=>{
 const savedFetch=globalThis.fetch;globalThis.location={href:'https://example.test/'};
 const bytes=new Uint8Array([1,2,3,4]);const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 globalThis.fetch=async url=>new Response(url.endsWith('one')?bytes.slice(0,2):bytes.slice(2));
 try {
 const m={...manifest,mind_path:null,mind_parts:['media/one','media/two'],mind_sha256:hash};
 const url=await loadMindUrl(m);assert.ok(url.startsWith('blob:')); URL.revokeObjectURL(url);
 await assert.rejects(loadMindUrl({...m,mind_sha256:'bad'}),/무결성/);
 }finally{globalThis.fetch=savedFetch;}
});
test('failed Supabase import leaves existing draft unchanged',async()=>{
 const savedFetch=globalThis.fetch;const {store}=harness();store.save=async()=>{};
 globalThis.fetch=async url=>url.includes('/rest/')?new Response(JSON.stringify([{...row,id:'new',image_path:'images/a.png',video_path:'videos/a.mp4'}])):url.endsWith('.png')?new Response('image'):new Response('missing',{status:404});
 try {await assert.rejects(store.importSupabase({url:'https://source.supabase.co',key:'public'}),/파일 읽기 실패/);assert.equal(store.rows.length,1);assert.equal(store.files.size,1);}
 finally{globalThis.fetch=savedFetch;}
});

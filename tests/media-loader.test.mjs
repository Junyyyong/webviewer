import test from 'node:test';
import assert from 'node:assert/strict';
import {createMediaLoader} from '../site/media-loader.js';
const media=path=>({dataset:{src:path},pause(){},load(){},removeAttribute(){delete this.src;}});
test('loads only recognized media, deduplicates downloads, and evicts old blobs',async()=>{
 let requests=0;const revoked=[];
 const loader=createMediaLoader({fetcher:async()=>{requests++;return new Response('video');},makeUrl:()=>`blob:${requests}`,revokeUrl:url=>revoked.push(url),maxEntries:2});
 const a=media('a'),b=media('b'),c=media('c');
 assert.equal(requests,0);await Promise.all([loader.ensure(a),loader.ensure(a)]);assert.equal(requests,1);
 await loader.ensure(b);await loader.ensure(c);assert.equal(a.src,undefined);assert.deepEqual(revoked,['blob:1']);
 await loader.ensure(c);assert.equal(requests,3);loader.clear();assert.equal(revoked.length,3);
});
test('keeps currently playing media and retries failed fetches',async()=>{
 let fail=true;const active=media('active'),other=media('other');
 const loader=createMediaLoader({fetcher:async()=>new Response('data',{status:fail?500:200}),makeUrl:()=> 'blob:test',revokeUrl:()=>{},maxEntries:1,isProtected:m=>m===active});
 await assert.rejects(loader.ensure(active),/불러오지/);fail=false;await loader.ensure(active);await loader.ensure(other);assert.equal(active.src,'blob:test');assert.equal(other.src,undefined);
});

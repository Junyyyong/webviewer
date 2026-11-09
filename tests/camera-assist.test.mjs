import test from 'node:test';import assert from 'node:assert/strict';
import {requestCamera,improveFocus,selectedTarget,applyZoom,cameraErrorMessage,installCameraAssist} from '../site/camera-assist.js';
test('requests rear 1080p video without audio and falls back only on device/constraint failures',async()=>{
 const calls=[];let count=0;
 const stream=await requestCamera({getUserMedia:async c=>{calls.push(c);if(count++===0)throw Object.assign(new Error(),{name:'OverconstrainedError'});return 'stream';}});
 assert.equal(stream,'stream');assert.equal(calls[0].audio,false);assert.equal(calls[0].video.width.ideal,1920);assert.equal(calls[1].video.width.ideal,1280);
 let denied=0;await assert.rejects(requestCamera({getUserMedia:async()=>{denied++;throw Object.assign(new Error(),{name:'NotAllowedError'});}}));assert.equal(denied,1);
});
test('only requests supported focus and exposure controls, tolerates failure',async()=>{
 let requested;
 const caps={focusMode:['continuous'],exposureMode:['manual']};
 await improveFocus({getCapabilities:()=>caps,applyConstraints:async c=>{requested=c;throw new Error('optional');}});
 assert.deepEqual(requested,{advanced:[{focusMode:'continuous'}]});
});
test('narrows recognition to original mind index and safely clamps zoom',async()=>{
 assert.equal(selectedTarget([{id:'target',mind_index:17}],'target'),17);assert.equal(selectedTarget([],'missing'),-1);
 let requested;const track={getCapabilities:()=>({zoom:{min:1,max:3}}),applyConstraints:async c=>requested=c};
 assert.equal(await applyZoom(track,8),3);assert.equal(requested.advanced[0].zoom,3);await assert.rejects(applyZoom(track,NaN));
 assert.match(cameraErrorMessage({name:'NotAllowedError'}),/권한/);
});
test('installs a camera boundary adapter without replacing the tracker',()=>{
 function System(){}System.prototype._startAR=()=>{};const original=System.prototype._startAR;
 installCameraAssist({systems:{'mindar-image-system':System}});assert.equal(System.prototype._startAR,original);assert.equal(typeof System.prototype._startVideo,'function');
});

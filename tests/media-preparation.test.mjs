import test from 'node:test';import assert from 'node:assert/strict';
import {videoPlan,MIB} from '../site/media-preparation.js';import {inspectPixels} from '../site/target-quality.js';
test('tablet profile retains native 1080p and downsizes 4K without upscaling',()=>{
 const p=videoPlan({width:1920,height:1080,duration:20,size:10*MIB});assert.equal(p.needsConversion,false);assert.equal(p.height,1080);
 const large=videoPlan({width:3840,height:2160,duration:20,size:60*MIB});assert.equal(large.width,1920);assert.equal(large.height,1080);assert.ok(large.estimatedMiB<22);
 const small=videoPlan({width:640,height:480,duration:20,size:MIB});assert.equal(small.width,640);assert.equal(small.height,480);
});
test('portrait videos keep proportions and long videos use a bounded bitrate',()=>{
 const portrait=videoPlan({width:2160,height:3840,duration:20,size:60*MIB});assert.equal(portrait.width,1080);assert.equal(portrait.height,1920);
 const long=videoPlan({width:1920,height:1080,duration:90,size:60*MIB});assert.equal(long.height,720);assert.equal(long.reduced,true);assert.ok(long.estimatedMiB<22);
 assert.throws(()=>videoPlan({width:1920,height:1080,duration:600,size:60*MIB}),/화질/);
});
test('efficient long originals are retained and forced conversions are validated',()=>{
 const p=videoPlan({width:1920,height:1080,duration:1800,size:10*MIB});assert.equal(p.needsConversion,false);assert.equal(p.height,1080);assert.equal(p.estimatedMiB,10);
 assert.throws(()=>videoPlan({width:1920,height:1080,duration:1800,size:10*MIB,force:true}),/화질/);
 assert.throws(()=>videoPlan({width:10,height:10,duration:Infinity,size:1}),/시간/);
});
test('target hints flag blank/low resolution images without claiming an accuracy score',()=>{
 const blank=new Uint8ClampedArray(40*40*4).fill(255);
 const result=inspectPixels(blank,40,40,200,200);assert.equal(result.warnings.length,3);assert.equal(result.contrast,0);assert.equal(result.whiteBorder,100);assert.equal(result.score,undefined);
});

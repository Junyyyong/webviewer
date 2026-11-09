import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validateManifest,MAX_FILE} from '../site/content-store.js';
const root=path.resolve(import.meta.dirname,'..'), site=path.join(root,'site');
const manifest=validateManifest(JSON.parse(fs.readFileSync(path.join(site,'content/manifest.json'))));
const original=JSON.parse(fs.readFileSync(path.join(root,'migration-backup/targets.json')));
const hash=createHash('sha256');
for(const part of manifest.mind_parts) hash.update(fs.readFileSync(path.join(site,part)));
if(hash.digest('hex')!==manifest.mind_sha256) throw new Error('Mind data checksum mismatch');
const originalMind=fs.readFileSync(path.join(root,'migration-backup/targets.mind'));
if(createHash('sha256').update(originalMind).digest('hex')!==manifest.mind_sha256) throw new Error('Original mind data changed');
let bytes=0,videos=0;
for(const r of manifest.targets){
 const old=original.find(o=>o.id===r.id);
 for(const k of ['id','name','aspect','mind_index','created_at']) if(old[k]!==r[k]) throw new Error(`Changed ${r.id} ${k}`);
 for(const k of ['image_path','video_path']){
  const f=path.join(site,r[k]), size=fs.statSync(f).size;
  if(size<=0||size>MAX_FILE) throw new Error('File limit: '+r[k]);bytes+=size;
  if(k==='video_path'&&f.endsWith('.mp4')){
   const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,codec_type,width,height:format=duration','-of','json',f]));
   const source=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,codec_type:format=duration','-of','json',path.join(root,'migration-backup',old.video_path)]));
   if(!probe.streams.some(s=>s.codec_type==='video'&&s.codec_name==='h264')) throw new Error('Not H264');
   if(source.streams.some(s=>s.codec_type==='audio')&&!probe.streams.some(s=>s.codec_type==='audio')) throw new Error('Audio lost');
   if(Math.abs(Number(probe.format.duration)-Number(source.format.duration))>0.5) throw new Error('Duration changed: '+f);
   // Decode the complete file to find corrupt video/audio packets.
   execFileSync('ffmpeg',['-v','error','-nostdin','-i',f,'-f','null','-'],{stdio:['ignore','pipe','pipe']});
   videos++;
  }else{
   const before=fs.readFileSync(path.join(root,'migration-backup',old[k]));
   if(!before.equals(fs.readFileSync(f))) throw new Error('Original image/audio changed');
  }
 }
}
if(original.length!==manifest.targets.length) throw new Error('Missing figures');
console.log(JSON.stringify({figures:manifest.targets.length,decoded_videos:videos,media_MiB:Math.round(bytes/1024**2),original_mind_identical:true}));

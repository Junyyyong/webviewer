"""Prepare a complete local backup for static hosting without changing source files."""
import hashlib,json,pathlib,shutil,subprocess,datetime
ROOT=pathlib.Path(__file__).resolve().parents[1]
backup=ROOT/'migration-backup'; site=ROOT/'site'; limit=25*1024**2
rows=json.loads((backup/'targets.json').read_text()); conversions=[]
for row in rows:
    for key in ('image_path','video_path'):
        src=backup/row[key]; relative='media/'+row[key]
        # Convert all videos to H.264/AAC with web fast-start; keep originals in backup.
        if key=='video_path' and src.suffix.lower() in ('.mp4','.mov','.webm','.mkv'):
            relative=str(pathlib.PurePosixPath(relative).with_suffix('.mp4'))
            dest=site/relative; dest.parent.mkdir(parents=True,exist_ok=True)
            if not dest.exists():
                temp=dest.with_suffix('.tmp.mp4')
                subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(src),'-map','0:v:0','-map','0:a?','-vf',"scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-c:v','libx264','-preset','fast','-crf','26','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart',str(temp)],check=True)
                temp.rename(dest)
            conversions.append({'source':row[key],'output':relative,'original_bytes':src.stat().st_size,'web_bytes':dest.stat().st_size})
            print(f'video {len(conversions)}: {dest.stat().st_size//1024} KiB',flush=True)
        else:
            dest=site/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dest)
        if dest.stat().st_size>limit and key=='video_path':
            duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(src)]))
            bitrate=int((23*1024**2*8/duration-96000)*0.96)
            if bitrate<150000: raise RuntimeError(f'{relative}: video too long for 25MiB')
            temp=dest.with_suffix('.tmp.mp4')
            subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(src),'-map','0:v:0','-map','0:a?','-vf',"scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-c:v','libx264','-preset','fast','-b:v',str(bitrate),'-maxrate',str(bitrate),'-bufsize',str(bitrate*2),'-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart',str(temp)],check=True)
            temp.rename(dest)
            conversions[-1]['web_bytes']=dest.stat().st_size
        if dest.stat().st_size>limit: raise RuntimeError(f'{relative} exceeds 25MiB; source backup intact')
        row[key]=relative
mind=(backup/'targets.mind').read_bytes();parts=[]
for i,offset in enumerate(range(0,len(mind),20*1024**2)):
    relative=f'media/targets-original-{i}.mindpart';(site/relative).write_bytes(mind[offset:offset+20*1024**2]);parts.append(relative)
manifest={'version':1,'published_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mind_path':None,'mind_parts':parts,'mind_sha256':hashlib.sha256(mind).hexdigest(),'targets':rows}
(site/'content').mkdir(exist_ok=True)
(site/'content/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
(backup/'conversions.json').write_text(json.dumps(conversions,indent=2))
print(json.dumps({'figures':len(rows),'files':len(list((site/'media').rglob('*'))),'bytes':sum(p.stat().st_size for p in (site/'media').rglob('*') if p.is_file())}),flush=True)

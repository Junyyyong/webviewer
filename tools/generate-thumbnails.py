"""Generate small gallery previews. Original recognition images are untouched."""
import json, pathlib, subprocess
root=pathlib.Path(__file__).resolve().parents[1]
site=root/'site'; manifest_path=site/'content/manifest.json'
manifest=json.loads(manifest_path.read_text())
total=0
for row in manifest['targets']:
    image=pathlib.PurePosixPath(row['image_path'])
    relative=f'media/thumbnails/{image.stem}.jpg'
    target=site/relative;target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists():
        subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-i',str(site/image),'-vf','scale=640:640:force_original_aspect_ratio=decrease','-frames:v','1','-q:v','4',str(target)],check=True)
    row['thumbnail_path']=relative;total+=target.stat().st_size
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'thumbnails':len(manifest['targets']),'total_KiB':round(total/1024)}))

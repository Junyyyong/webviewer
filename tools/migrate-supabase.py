"""Read-only Supabase export. Never modifies the source project."""
import concurrent.futures, hashlib, json, os, pathlib, urllib.request, urllib.parse
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = 'https://xpclgvzcypzvzgnewcem.supabase.co'
KEY = 'sb_publishable_WM97loHp6QhArMSfRDajpw_Im6An97-'
LIMIT = 25 * 1024 * 1024

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'apikey': KEY}), timeout=120) as res:
        return res.read()

def main():
    backup = ROOT / 'migration-backup'
    backup.mkdir(exist_ok=True)
    rows = json.loads(fetch(SOURCE + '/rest/v1/targets?select=*&order=created_at.asc'))
    (backup / 'targets.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    paths = sorted({r[k] for r in rows for k in ('image_path', 'video_path')} | {'targets.mind'})
    def download(p):
        relative = pathlib.PurePosixPath(p)
        if relative.is_absolute() or '..' in relative.parts: raise ValueError('Unsafe source path')
        data = fetch(SOURCE + '/storage/v1/object/public/media/' + urllib.parse.quote(p, safe='/'))
        target = backup / p
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return {'path': p, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'oversize': len(data) > LIMIT}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        files = list(pool.map(download, paths))
    report = {'count': len(rows), 'files': files, 'total_bytes': sum(f['bytes'] for f in files)}
    (backup / 'report.json').write_text(json.dumps(report, indent=2))
    # Only publish a complete export; never leave a partial manifest.
    oversized = [f for f in files if f['oversize']]
    if oversized:
        print(json.dumps({'count': len(rows), 'total_bytes': report['total_bytes'], 'oversize': oversized}, ensure_ascii=False))
        return
    for item in files:
        p = item['path']
        dest = ROOT / 'site' / 'media' / p
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes((backup / p).read_bytes())
    manifest = {'version': 1, 'published_at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(), 'mind_path': 'media/targets.mind', 'targets': [{**r, 'image_path': 'media/' + r['image_path'], 'video_path': 'media/' + r['video_path']} for r in rows]}
    dest = ROOT / 'site' / 'content'
    dest.mkdir(exist_ok=True)
    (dest / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps({'count': len(rows), 'files': len(files), 'total_bytes': report['total_bytes'], 'oversize': []}))

if __name__ == '__main__': main()
